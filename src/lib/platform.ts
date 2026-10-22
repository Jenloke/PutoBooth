/** Feature and platform detection. Prefer feature checks; UA checks only pick sensible defaults. */

export function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch support gives it away.
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function hasCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function isSecureContextForCamera(): boolean {
  return window.isSecureContext
}

export function hasCameraApi(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function"
}

export function canShareFiles(file: File): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    )
  } catch {
    return false
  }
}

export function hasWakeLock(): boolean {
  return "wakeLock" in navigator
}

/** Asks the browser not to evict our IndexedDB data. Safari may still clear it for unused sites. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
