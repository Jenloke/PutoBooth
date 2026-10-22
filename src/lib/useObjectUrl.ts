import { useEffect } from "react"

/**
 * One object URL per Blob, shared by every component showing it and revoked a tick after
 * the last one unmounts. The tick lets StrictMode's mount → unmount → mount keep the URL.
 */
const entries = new WeakMap<Blob, { url: string; refs: number }>()

function entryFor(blob: Blob) {
  let entry = entries.get(blob)
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), refs: 0 }
    entries.set(blob, entry)
  }
  return entry
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = blob ? entryFor(blob).url : null

  useEffect(() => {
    if (!blob) return
    const entry = entryFor(blob)
    entry.refs++
    return () => {
      entry.refs--
      window.setTimeout(() => {
        if (entry.refs === 0 && entries.get(blob) === entry) {
          URL.revokeObjectURL(entry.url)
          entries.delete(blob)
        }
      }, 0)
    }
  }, [blob])

  return url
}
