import { del, get, set } from "idb-keyval"
import { create } from "zustand"

import { canvasToBlob, context2d, createCanvas, decodeImage, freeCanvas } from "@/lib/canvas"

const LOGO_KEY = "photobooth:logo"
/** Logos are drawn at most ~0.5 in tall at 300 DPI; 1024 px is plenty and keeps memory low. */
const MAX_LOGO_SIZE = 1024

interface LogoStore {
  /** PNG with transparency preserved, persisted in IndexedDB so events keep their branding. */
  blob: Blob | null
  loaded: boolean
  load: () => Promise<void>
  setFromFile: (file: File) => Promise<void>
  clear: () => Promise<void>
}

async function normalizeLogo(file: File): Promise<Blob> {
  const image = await decodeImage(file)
  try {
    const scale = Math.min(1, MAX_LOGO_SIZE / Math.max(image.width, image.height))
    const canvas = createCanvas(image.width * scale, image.height * scale)
    try {
      context2d(canvas).drawImage(image.source, 0, 0, canvas.width, canvas.height)
      return await canvasToBlob(canvas, "image/png")
    } finally {
      freeCanvas(canvas)
    }
  } finally {
    image.close()
  }
}

export const useLogo = create<LogoStore>()((setState, getState) => ({
  blob: null,
  loaded: false,
  load: async () => {
    if (getState().loaded) return
    try {
      const blob = await get<Blob>(LOGO_KEY)
      setState({ blob: blob instanceof Blob ? blob : null, loaded: true })
    } catch {
      setState({ loaded: true })
    }
  },
  setFromFile: async (file) => {
    const blob = await normalizeLogo(file)
    setState({ blob, loaded: true })
    try {
      await set(LOGO_KEY, blob)
    } catch {
      // Still used for this visit.
    }
  },
  clear: async () => {
    setState({ blob: null })
    try {
      await del(LOGO_KEY)
    } catch {
      // Nothing to clean up.
    }
  },
}))
