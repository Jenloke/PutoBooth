import { useEffect } from "react"

import { hasWakeLock } from "@/lib/platform"

/** Keeps the screen on while `active`. Re-acquired after the page comes back; failures ignored. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !hasWakeLock()) return
    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return
      try {
        const lock = await navigator.wakeLock.request("screen")
        if (disposed) void lock.release().catch(() => {})
        else sentinel = lock
      } catch {
        // Not allowed (low battery, iOS Home Screen quirks, …): the screen may dim, that's all.
      }
    }

    // The browser releases the lock whenever the page is hidden.
    const onVisibility = () => void acquire()
    void acquire()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", onVisibility)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
