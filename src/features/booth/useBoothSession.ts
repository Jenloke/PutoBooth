import { useCallback, useEffect, useRef, type RefObject } from "react"
import { toast } from "sonner"

import { captureFrame } from "@/features/camera/captureFrame"
import { uid } from "@/lib/id"
import { useSettings } from "@/store/settings"

import { isShooting, useSession } from "./session"
import { playShutter, playTick } from "./sound"

/** How long the white flash shows before the frame is grabbed, so it actually lights faces. */
const FLASH_LEAD_MS = 220
/** Lets the last thumbnail land in the tray before switching to review. */
const FINAL_PAUSE_MS = 700

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}

/** Resolves after the browser has painted the current state (e.g. the flash). */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

async function runSequence(
  indices: number[],
  videoRef: RefObject<HTMLVideoElement | null>,
  mirror: boolean,
  signal: AbortSignal
) {
  const session = useSession.getState
  const { countdown, pauseSeconds, flash, sound } = useSettings.getState()

  for (let i = 0; i < indices.length; i++) {
    const index = indices[i]
    for (let n: number = countdown; n >= 1; n--) {
      session().setPhase("countdown", { activeIndex: index, count: n })
      if (sound) playTick(n === 1)
      await sleep(1000, signal)
    }

    session().setPhase("capturing", { activeIndex: index, count: 0 })
    await afterPaint()
    if (flash) await sleep(FLASH_LEAD_MS, signal)

    const video = videoRef.current
    if (!video) throw new Error("The camera preview went away")
    const frame = await captureFrame(video, { mirror })
    if (signal.aborted) return
    if (sound) playShutter()
    session().setShot(index, {
      id: uid(),
      blob: frame.blob,
      url: URL.createObjectURL(frame.blob),
      width: frame.width,
      height: frame.height,
    })

    session().setPhase("pause", { activeIndex: index })
    const last = i === indices.length - 1
    await sleep(last ? FINAL_PAUSE_MS : pauseSeconds * 1000, signal)
  }
  session().finish()
}

/**
 * Runs the capture sequence: countdown → flash + capture → pause, for each slot (or only the
 * slot being retaken), then review. State lives in the session store; this owns the timers.
 */
export function useBoothSession(videoRef: RefObject<HTMLVideoElement | null>) {
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    ({ mirror }: { mirror: boolean }) => {
      const { phase, retakeIndex, shots } = useSession.getState()
      if (isShooting(phase)) return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const indices = retakeIndex !== null ? [retakeIndex] : shots.map((_, i) => i)

      runSequence(indices, videoRef, mirror, controller.signal)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          useSession.getState().cancel()
          toast.error("Couldn't take the photo", {
            description: error instanceof Error ? error.message : undefined,
          })
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null
        })
    },
    [videoRef]
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (isShooting(useSession.getState().phase)) useSession.getState().cancel()
  }, [])

  // Leaving the booth mid-sequence (e.g. browser back) cancels it.
  useEffect(() => cancel, [cancel])

  return { start, cancel }
}
