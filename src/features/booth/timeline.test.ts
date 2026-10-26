import { describe, expect, it } from "vitest"

import {
  CAPTURE_ALLOWANCE_MS,
  FINAL_PAUSE_MS,
  FLASH_LEAD_MS,
  buildTimeline,
  shiftTimeline,
} from "./timeline"

describe("buildTimeline", () => {
  it("schedules a countdown, shutter and capture for each slot", () => {
    const timeline = buildTimeline({ startAt: 1000, indices: [0, 1], countdown: 3, pauseMs: 1500 })
    const [first, second] = timeline.steps

    expect(first).toEqual({
      index: 0,
      ticks: [1000, 2000, 3000],
      shutterAt: 4000,
      captureAt: 4000 + FLASH_LEAD_MS,
    })
    const secondStart = first.captureAt + CAPTURE_ALLOWANCE_MS + 1500
    expect(second.ticks).toEqual([secondStart, secondStart + 1000, secondStart + 2000])
    expect(second.captureAt).toBe(secondStart + 3000 + FLASH_LEAD_MS)
    expect(timeline.endAt).toBe(second.captureAt + CAPTURE_ALLOWANCE_MS + FINAL_PAUSE_MS)
  })

  it("schedules only the slots asked for (a retake)", () => {
    const timeline = buildTimeline({ startAt: 0, indices: [2], countdown: 5, pauseMs: 500 })
    expect(timeline.steps.map((s) => s.index)).toEqual([2])
    expect(timeline.steps[0].ticks).toHaveLength(5)
  })

  it("is empty without slots", () => {
    expect(buildTimeline({ startAt: 50, indices: [], countdown: 3, pauseMs: 0 })).toEqual({ steps: [], endAt: 50 })
  })
})

describe("shiftTimeline", () => {
  it("moves every time by the same amount", () => {
    const timeline = buildTimeline({ startAt: 10_000, indices: [0, 1, 2], countdown: 3, pauseMs: 1000 })
    const shifted = shiftTimeline(timeline, -7_500)
    shifted.steps.forEach((step, i) => {
      const original = timeline.steps[i]
      expect(step.index).toBe(original.index)
      expect(step.ticks).toEqual(original.ticks.map((t) => t - 7_500))
      expect(step.shutterAt).toBe(original.shutterAt - 7_500)
      expect(step.captureAt).toBe(original.captureAt - 7_500)
    })
    expect(shifted.endAt).toBe(timeline.endAt - 7_500)
  })
})
