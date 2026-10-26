import { useCallback, useEffect, useRef, type RefObject } from "react"
import { toast } from "sonner"

import { captureFrame } from "@/features/camera/captureFrame"
import { uid } from "@/lib/id"
import { useSettings } from "@/store/settings"

import { isShooting, useSession } from "./session"
import { playShutter, playTick } from "./sound"
import { buildTimeline, type Timeline } from "./timeline"

/** The sequence in progress. One booth runs at a time, so this lives at module level. */
let activeRun: AbortController | null = null

/** Stops the running sequence's timers. Resetting the session is the caller's job. */
export function abortRun(): void {
  activeRun?.abort()
  activeRun = null
}

function sleepUntil(time: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = window.setTimeout(resolve, Math.max(0, time - performance.now()))
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

async function runTimeline(
  timeline: Timeline,
  videoRef: RefObject<HTMLVideoElement | null>,
  mirror: boolean,
  signal: AbortSignal
) {
  const session = useSession.getState
  const { sound } = useSettings.getState()

  for (const step of timeline.steps) {
    for (let k = 0; k < step.ticks.length; k++) {
      // Running late (a slow capture, or a start that arrived late): skip numbers already over.
      if (performance.now() >= (step.ticks[k + 1] ?? step.shutterAt)) continue
      await sleepUntil(step.ticks[k], signal)
      const count = step.ticks.length - k
      session().setPhase("countdown", { activeIndex: step.index, count })
      if (sound) playTick(count === 1)
    }

    await sleepUntil(step.shutterAt, signal)
    session().setPhase("capturing", { activeIndex: step.index, count: 0 })
    // The flash shows first so it actually lights faces.
    await sleepUntil(step.captureAt, signal)

    const video = videoRef.current
    if (!video) throw new Error("The camera preview went away")
    const frame = await captureFrame(video, { mirror })
    if (signal.aborted) return
    if (sound) playShutter()
    session().setShot(step.index, {
      id: uid(),
      blob: frame.blob,
      url: URL.createObjectURL(frame.blob),
      width: frame.width,
      height: frame.height,
    })
    session().setPhase("pause", { activeIndex: step.index })
  }

  await sleepUntil(timeline.endAt, signal)
  session().finish()
}

type BoothSessionOptions = {
  /** Called when a sequence ends early: an error, or the booth closing mid-sequence. */
  onAbort?: () => void
}

/**
 * Runs capture sequences: countdown → flash + capture → pause, for each slot (or only the
 * slot being retaken), then review. `start` shoots now on this device; `run` plays a timeline
 * agreed with a shared booth partner. State lives in the session store; this owns the timers.
 */
export function useBoothSession(videoRef: RefObject<HTMLVideoElement | null>, options: BoothSessionOptions = {}) {
  const onAbort = useRef(options.onAbort)
  useEffect(() => {
    onAbort.current = options.onAbort
  })

  const run = useCallback(
    (timeline: Timeline, { mirror }: { mirror: boolean }) => {
      abortRun()
      const controller = new AbortController()
      activeRun = controller

      runTimeline(timeline, videoRef, mirror, controller.signal)
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          useSession.getState().cancel()
          onAbort.current?.()
          toast.error("Couldn't take the photo", {
            description: error instanceof Error ? error.message : undefined,
          })
        })
        .finally(() => {
          if (activeRun === controller) activeRun = null
        })
    },
    [videoRef]
  )

  const start = useCallback(
    ({ mirror }: { mirror: boolean }) => {
      const { phase, retakeIndex, shots } = useSession.getState()
      if (isShooting(phase) || activeRun) return
      const { countdown, pauseSeconds } = useSettings.getState()
      const indices = retakeIndex !== null ? [retakeIndex] : shots.map((_, i) => i)
      run(buildTimeline({ startAt: performance.now(), indices, countdown, pauseMs: pauseSeconds * 1000 }), { mirror })
    },
    [run]
  )

  const cancel = useCallback(() => {
    abortRun()
    if (isShooting(useSession.getState().phase)) useSession.getState().cancel()
  }, [])

  // Leaving the booth mid-sequence (e.g. browser back) cancels it.
  useEffect(
    () => () => {
      const shooting = isShooting(useSession.getState().phase)
      cancel()
      if (shooting) onAbort.current?.()
    },
    [cancel]
  )

  return { start, run, cancel }
}
