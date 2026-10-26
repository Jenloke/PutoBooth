import { useEffect, useMemo, useRef, useState } from "react"

import { slotShots, type PairShots, type Shot } from "@/features/booth/session"
import type { Design } from "@/features/compose/design"
import { renderComposite, renderPrintSheet } from "@/features/compose/renderComposite"
import { mimeFor, resultFileName } from "@/features/export/export"
import { isStrip, type LayoutSpec } from "@/features/layouts/layouts"
import {
  canvasToBlob,
  context2d,
  createCanvas,
  decodeImage,
  freeCanvas,
  type DecodedImage,
} from "@/lib/canvas"
import type { ExportFormat } from "@/store/settings"

export interface CompositeParams {
  layout: LayoutSpec
  shots: readonly (Shot | null)[]
  /** Shared booth: the partner's photos, drawn beside this device's in every slot. */
  pair: Pick<PairShots, "side" | "shots"> | null
  design: Design
  takenAt: number
  logo: Blob | null
  format: ExportFormat
  quality: number
  printSheet: boolean
}

export interface CompositeResult {
  /** Identifies the inputs this result was rendered from. */
  key: string
  /** Ready to share: navigator.share must get a File synchronously inside the tap. */
  file: File
  url: string
  width: number
  height: number
  /** Small JPEG for the gallery grid. */
  thumb: Blob
}

const THUMB_SIZE = 480
const DEBOUNCE_MS = 150

/** Decoded shots and logo, reused across re-renders while the user tweaks the design. */
class DecodeCache {
  private images = new Map<string, Promise<DecodedImage>>()
  private logos = new WeakMap<Blob, Promise<DecodedImage>>()

  shot(shot: Shot) {
    let image = this.images.get(shot.id)
    if (!image) {
      image = decodeImage(shot.blob)
      this.images.set(shot.id, image)
    }
    return image
  }

  logo(blob: Blob) {
    let image = this.logos.get(blob)
    if (!image) {
      image = decodeImage(blob)
      this.logos.set(blob, image)
    }
    return image
  }

  /** Frees decoded frames for shots that were replaced (retakes), once `after` settles. */
  keep(ids: Set<string>, after: Promise<unknown> = Promise.resolve()) {
    for (const [id, image] of this.images) {
      if (ids.has(id)) continue
      this.images.delete(id)
      // A render in flight may still be drawing it.
      void after.then(() => image).then((img) => img.close(), () => {})
    }
  }

  dispose(after?: Promise<unknown>) {
    this.keep(new Set(), after)
  }
}

async function makeThumb(canvas: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, THUMB_SIZE / Math.max(canvas.width, canvas.height))
  const thumb = createCanvas(canvas.width * scale, canvas.height * scale)
  try {
    context2d(thumb).drawImage(canvas, 0, 0, thumb.width, thumb.height)
    return await canvasToBlob(thumb, "image/jpeg", 0.8)
  } finally {
    freeCanvas(thumb)
  }
}

async function compose(params: CompositeParams, key: string, cache: DecodeCache): Promise<CompositeResult> {
  const { layout, shots, pair, design, takenAt, logo, format, quality } = params
  const sheet = params.printSheet && isStrip(layout)
  const slots = await Promise.all(
    slotShots(shots, pair).map((parts) => Promise.all(parts.map((shot) => (shot ? cache.shot(shot) : null))))
  )
  const logoImage = logo && design.showLogo ? await cache.logo(logo) : null

  let canvas = await renderComposite({
    layout,
    slots,
    design,
    date: new Date(takenAt),
    logo: logoImage,
  })
  try {
    if (sheet) {
      const strip = canvas
      canvas = renderPrintSheet(strip)
      freeCanvas(strip)
    }
    const mime = mimeFor(format)
    const [blob, thumb] = await Promise.all([
      canvasToBlob(canvas, mime, format === "jpeg" ? quality : undefined),
      makeThumb(canvas),
    ])
    const file = new File([blob], resultFileName(layout, takenAt, format, sheet), {
      type: mime,
      lastModified: takenAt,
    })
    return { key, file, url: URL.createObjectURL(file), width: canvas.width, height: canvas.height, thumb }
  } finally {
    freeCanvas(canvas)
  }
}

/** Identifies a render: any change here means the current result is stale. */
function compositeKey(p: CompositeParams): string {
  return JSON.stringify([
    p.layout.id,
    p.shots.map((s) => s?.id ?? null),
    p.pair ? [p.pair.side, p.pair.shots.map((s) => s?.id ?? null)] : null,
    p.design,
    p.takenAt,
    // A new logo is always a new Blob; size + type tells them apart without hashing.
    p.design.showLogo && p.logo ? `${p.logo.size}:${p.logo.type}` : null,
    p.format,
    p.format === "jpeg" ? p.quality : null,
    p.printSheet && isStrip(p.layout),
  ])
}

/**
 * Renders the export image whenever the inputs change (debounced). The review shows exactly
 * this image, so the preview is the export.
 */
export function useComposite(params: CompositeParams) {
  const { layout, shots, pair, design, takenAt, logo, format, quality, printSheet } = params
  const [cache] = useState(() => new DecodeCache())
  const [result, setResult] = useState<CompositeResult | null>(null)
  const [error, setError] = useState<{ key: string; error: Error } | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const rendered = useRef(false)

  const inputs = useMemo(
    () => ({ layout, shots, pair, design, takenAt, logo, format, quality, printSheet }),
    [layout, shots, pair, design, takenAt, logo, format, quality, printSheet]
  )
  const key = useMemo(() => compositeKey(inputs), [inputs])

  useEffect(() => {
    const ids = [...inputs.shots, ...(inputs.pair?.shots ?? [])].flatMap((s) => (s ? [s.id] : []))
    cache.keep(new Set(ids), queue.current)

    let cancelled = false
    const run = async () => {
      // One render at a time; a newer request waits and the stale one is dropped.
      await queue.current
      if (cancelled) return
      const job = compose(inputs, key, cache)
      queue.current = job.catch(() => {})
      try {
        const next = await job
        if (cancelled) URL.revokeObjectURL(next.url)
        else {
          rendered.current = true
          setResult(next)
        }
      } catch (e) {
        if (!cancelled) setError({ key, error: e instanceof Error ? e : new Error(String(e)) })
      }
    }
    const timer = window.setTimeout(run, rendered.current ? DEBOUNCE_MS : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [inputs, key, cache])

  // Each result owns an object URL; revoke it once it's replaced or the review closes.
  useEffect(() => {
    const url = result?.url
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [result])

  useEffect(() => () => cache.dispose(queue.current), [cache])

  return {
    result,
    /** True while the shown result doesn't match the current inputs yet. */
    stale: result?.key !== key,
    error: error?.key === key ? error.error : null,
  }
}
