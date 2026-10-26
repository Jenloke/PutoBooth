import { describe, expect, it } from "vitest"

import { ClockSync } from "./clock"

/** A remote clock running `offset` ms ahead, with one-way delays `up` and `down`. */
function roundTrip(clock: ClockSync, sentAt: number, offset: number, up: number, down: number) {
  const remoteAt = sentAt + up + offset
  clock.add(sentAt, remoteAt, sentAt + up + down)
}

describe("ClockSync", () => {
  it("is unsynced until the first round trip", () => {
    const clock = new ClockSync()
    expect(clock.synced).toBe(false)
    expect(clock.offset).toBeNull()
  })

  it("recovers the offset exactly when delays are symmetric", () => {
    const clock = new ClockSync()
    roundTrip(clock, 1_000, 123_456, 40, 40)
    expect(clock.offset).toBe(123_456)
    expect(clock.rtt).toBe(80)
    expect(clock.toLocal(200_000)).toBe(200_000 - 123_456)
  })

  it("prefers the fastest round trip, which has the least queuing error", () => {
    const clock = new ClockSync()
    roundTrip(clock, 0, -5_000, 300, 20) // slow, lopsided: off by 140 ms
    roundTrip(clock, 1_000, -5_000, 12, 10) // fast: off by 1 ms
    roundTrip(clock, 2_000, -5_000, 150, 30)
    expect(clock.rtt).toBe(22)
    expect(Math.abs(clock.offset! - -5_000)).toBeLessThanOrEqual(1)
  })

  it("ignores impossible or useless samples", () => {
    const clock = new ClockSync()
    clock.add(100, 0, 50) // pong before ping
    clock.add(0, 0, 60_000) // a minute-long round trip
    expect(clock.synced).toBe(false)
  })

  it("forgets old samples", () => {
    const clock = new ClockSync()
    roundTrip(clock, 0, 1_000, 1, 1) // best ever, then pushed out of the window
    for (let i = 1; i <= 8; i++) roundTrip(clock, i * 1_000, 2_000, 30, 30)
    expect(clock.offset).toBe(2_000)
  })
})
