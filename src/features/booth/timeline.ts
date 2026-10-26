/**
 * The schedule of a capture sequence in absolute times (performance.now()). Absolute times
 * keep two devices in step once their clocks are aligned, and keep a slow capture from pushing
 * every later shot back: the runner simply skips countdown numbers that are already over.
 */
export interface TimelineStep {
  /** Slot this step fills. */
  index: number
  /** When each countdown number appears, from the highest down to 1. */
  ticks: readonly number[]
  /** When the shutter fires: flash on, then the frame is grabbed at `captureAt`. */
  shutterAt: number
  captureAt: number
}

export interface Timeline {
  steps: readonly TimelineStep[]
  /** When the sequence hands over to review. */
  endAt: number
}

/** How long the white flash shows before the frame is grabbed, so it actually lights faces. */
export const FLASH_LEAD_MS = 220
/** Typical time to grab and encode a frame; the pause between shots starts after it. */
export const CAPTURE_ALLOWANCE_MS = 250
/** Lets the last thumbnail land in the tray before switching to review. */
export const FINAL_PAUSE_MS = 700

export interface TimelineInput {
  startAt: number
  indices: readonly number[]
  /** Seconds per countdown. */
  countdown: number
  pauseMs: number
}

export function buildTimeline({ startAt, indices, countdown, pauseMs }: TimelineInput): Timeline {
  const steps: TimelineStep[] = []
  let at = startAt
  for (const index of indices) {
    const ticks = Array.from({ length: countdown }, (_, k) => at + k * 1000)
    const shutterAt = at + countdown * 1000
    const captureAt = shutterAt + FLASH_LEAD_MS
    steps.push({ index, ticks, shutterAt, captureAt })
    at = captureAt + CAPTURE_ALLOWANCE_MS + pauseMs
  }
  const last = steps.at(-1)
  return { steps, endAt: last ? last.captureAt + CAPTURE_ALLOWANCE_MS + FINAL_PAUSE_MS : startAt }
}

/** Moves a timeline to another clock (e.g. from the host's clock to this device's). */
export function shiftTimeline(timeline: Timeline, delta: number): Timeline {
  return {
    steps: timeline.steps.map((step) => ({
      index: step.index,
      ticks: step.ticks.map((t) => t + delta),
      shutterAt: step.shutterAt + delta,
      captureAt: step.captureAt + delta,
    })),
    endAt: timeline.endAt + delta,
  }
}
