import { useEffect, useRef } from "react"
import { toast } from "sonner"

import type { PairShots, Shot } from "@/features/booth/session"
import type { Design } from "@/features/compose/design"
import { StorageFullError, useGallery, type GalleryMeta } from "@/features/gallery/galleryStore"
import type { LayoutId } from "@/features/layouts/layouts"

import type { CompositeResult } from "./useComposite"

type AutosaveInput = {
  sessionId: string
  layoutId: LayoutId
  shots: readonly (Shot | null)[]
  pair: PairShots | null
  takenAt: number
  design: Design
  printSheet: boolean
  result: CompositeResult | null
  stale: boolean
}

const SAVE_DELAY_MS = 800

/**
 * Keeps the gallery entry for this session in sync with the latest render. Full frames are
 * only rewritten when the shots change; a pending save is flushed when the review closes.
 */
export function useGalleryAutosave(input: AutosaveInput) {
  const { sessionId, layoutId, shots, pair, takenAt, design, printSheet, result, stale } = input
  const savedShots = useRef<string | null>(null)
  const pending = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!result || stale) return
    const ids = (list: readonly (Shot | null)[]) => list.map((s) => s?.id ?? "-").join(",")
    const signature = `${sessionId}:${ids(shots)}:${pair ? ids(pair.shots) : ""}`

    const save = async () => {
      if (pending.current === save) pending.current = null
      const meta: GalleryMeta = {
        id: sessionId,
        takenAt,
        updatedAt: Date.now(),
        layoutId,
        width: result.width,
        height: result.height,
        mime: result.file.type,
        fileName: result.file.name,
        size: result.file.size,
        printSheet,
        thumb: result.thumb,
        ...(pair ? { pair: { side: pair.side, partnerName: pair.partnerName } } : {}),
      }
      const frame = (s: Shot) => ({ blob: s.blob, width: s.width, height: s.height })
      const frames =
        savedShots.current === signature
          ? undefined
          : {
              shots: shots.flatMap((s) => (s ? [frame(s)] : [])),
              partner: pair ? pair.shots.map((s) => (s ? frame(s) : null)) : null,
            }
      try {
        await useGallery.getState().save(meta, { result: result.file, design }, frames)
        if (frames) savedShots.current = signature
      } catch (error) {
        toast.error(error instanceof StorageFullError ? "Storage is full" : "Couldn't save to the gallery", {
          id: "gallery-save",
          description: "Download or share your photos to keep them. Deleting old gallery items frees space.",
        })
      }
    }

    pending.current = save
    const timer = window.setTimeout(() => void save(), SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [sessionId, layoutId, shots, pair, takenAt, design, printSheet, result, stale])

  // Leaving review right after a change still saves it.
  useEffect(
    () => () => {
      void pending.current?.()
    },
    []
  )
}
