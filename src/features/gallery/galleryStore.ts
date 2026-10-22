import { clear, createStore, delMany, getMany, keys, setMany } from "idb-keyval"
import { create } from "zustand"

import type { Design } from "@/features/compose/design"
import type { LayoutId } from "@/features/layouts/layouts"
import { requestPersistentStorage } from "@/lib/platform"

/**
 * Recent results, on this device only (IndexedDB). Safari may evict data for sites that
 * aren't used for a while, so the UI treats this as a convenience and nudges people to save.
 *
 * Small `meta:` records list the gallery without loading images; `data:` holds the result,
 * `shots:` the full frames (for re-editing).
 */
const db = createStore("photobooth-gallery", "entries")

export interface GalleryMeta {
  id: string
  /** When the photos were taken. */
  takenAt: number
  updatedAt: number
  layoutId: LayoutId
  width: number
  height: number
  mime: string
  fileName: string
  size: number
  printSheet: boolean
  /** Small JPEG for the grid. */
  thumb: Blob
}

export interface GalleryData {
  result: Blob
  design: Design
}

export interface GalleryShot {
  blob: Blob
  width: number
  height: number
}

const metaKey = (id: string) => `meta:${id}`
const dataKey = (id: string) => `data:${id}`
const shotsKey = (id: string) => `shots:${id}`

export async function readGalleryData(id: string) {
  const [data, shots] = await getMany<GalleryData | GalleryShot[] | undefined>([dataKey(id), shotsKey(id)], db)
  return { data: data as GalleryData | undefined, shots: shots as GalleryShot[] | undefined }
}

export class StorageFullError extends Error {}

function rethrow(error: unknown): never {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    throw new StorageFullError("Storage is full")
  }
  throw error
}

interface GalleryStore {
  items: GalleryMeta[]
  loaded: boolean
  refresh: () => Promise<void>
  /** Saves or replaces an entry. Pass `shots` only when they changed (they're large). */
  save: (meta: GalleryMeta, data: GalleryData, shots?: GalleryShot[]) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

let persistRequested = false

export const useGallery = create<GalleryStore>()((set, getState) => ({
  items: [],
  loaded: false,

  refresh: async () => {
    const all = await keys<string>(db)
    const metaKeys = all.filter((k) => typeof k === "string" && k.startsWith("meta:"))
    const metas = (await getMany<GalleryMeta | undefined>(metaKeys, db)).filter(
      (m): m is GalleryMeta => Boolean(m)
    )
    metas.sort((a, b) => b.takenAt - a.takenAt)
    set({ items: metas, loaded: true })
  },

  save: async (meta, data, shots) => {
    const entries: [string, unknown][] = [
      [metaKey(meta.id), meta],
      [dataKey(meta.id), data],
    ]
    if (shots) entries.push([shotsKey(meta.id), shots])
    try {
      await setMany(entries, db)
    } catch (error) {
      rethrow(error)
    }
    const others = getState().items.filter((item) => item.id !== meta.id)
    set({ items: [meta, ...others].sort((a, b) => b.takenAt - a.takenAt) })
    if (!persistRequested) {
      persistRequested = true
      void requestPersistentStorage()
    }
  },

  remove: async (id) => {
    await delMany([metaKey(id), dataKey(id), shotsKey(id)], db)
    set({ items: getState().items.filter((item) => item.id !== id) })
  },

  clearAll: async () => {
    await clear(db)
    set({ items: [] })
  },
}))

