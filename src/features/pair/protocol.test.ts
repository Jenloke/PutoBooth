import { describe, expect, it } from "vitest"

import { startBlocker } from "./presence"
import {
  MAX_SHOT_BYTES,
  NAME_MAX_LENGTH,
  cleanName,
  isControlMessage,
  parseConnectMeta,
  parseMessage,
  type PairMessage,
  type Presence,
} from "./protocol"

const presence: Presence = {
  name: "Alex",
  screen: "booth",
  phase: "idle",
  sessionId: "3f2b1c9e-0d4a-4c7b-9e1f-2a3b4c5d6e7f",
  retakeIndex: null,
  live: true,
  mirrored: true,
}

const roundTrip = (message: PairMessage) => parseMessage(JSON.stringify(message))

describe("parseMessage", () => {
  it("accepts every well-formed message", () => {
    const messages: PairMessage[] = [
      { t: "hello", v: 1 },
      { t: "reject", reason: "busy" },
      { t: "bye" },
      { t: "ping", at: 123.45 },
      { t: "pong", echo: 123.45, at: 99_999.5 },
      { t: "shot", transferId: 7, sessionId: "abc", index: 3, shotId: "s-1", width: 1920, height: 1080, size: 500_000 },
      { t: "presence", presence },
      { t: "layout", layoutId: "grid" },
      { t: "shoot" },
      { t: "retake", sessionId: "abc", index: 2 },
      { t: "retake", sessionId: "abc", index: null },
      { t: "prepare", sessionId: "abc", retakeIndex: null },
      { t: "start", sessionId: "abc", layoutId: "classic", indices: [0, 1, 2, 3], startAt: 5_000.25, countdown: 3, pauseMs: 1500 },
      { t: "cancel", sessionId: "abc" },
      { t: "have", sessionId: "abc", shotIds: ["s-1", null, "s-3", null] },
    ]
    for (const message of messages) expect(roundTrip(message)).toEqual(message)
  })

  it("drops malformed input", () => {
    for (const text of ["", "null", "[]", "42", '"hello"', "{", '{"t":"nope"}', '{"t":"hello"}']) {
      expect(parseMessage(text)).toBeNull()
    }
    expect(parseMessage(JSON.stringify({ t: "ping", at: "soon" }))).toBeNull()
    expect(parseMessage(`{"t":"bye","pad":"${"x".repeat(20_000)}"}`)).toBeNull()
  })

  it("rejects values outside the protocol's limits", () => {
    const bad: unknown[] = [
      { t: "layout", layoutId: "poster" },
      { t: "retake", sessionId: "abc", index: 12 },
      { t: "retake", sessionId: "abc", index: 1.5 },
      { t: "cancel", sessionId: "../../etc" },
      { t: "cancel", sessionId: "x".repeat(65) },
      { t: "shot", transferId: -1, sessionId: "a", index: 0, shotId: "b", width: 1, height: 1, size: 1 },
      { t: "shot", transferId: 1, sessionId: "a", index: 0, shotId: "b", width: 1, height: 1, size: MAX_SHOT_BYTES + 1 },
      { t: "shot", transferId: 1, sessionId: "a", index: 0, shotId: "b", width: 0, height: 1, size: 1 },
      { t: "start", sessionId: "a", layoutId: "classic", indices: [], startAt: 0, countdown: 3, pauseMs: 0 },
      { t: "start", sessionId: "a", layoutId: "classic", indices: [0, 0], startAt: 0, countdown: 3, pauseMs: 0 },
      { t: "start", sessionId: "a", layoutId: "classic", indices: [0], startAt: 0, countdown: 60, pauseMs: 0 },
      { t: "start", sessionId: "a", layoutId: "classic", indices: [0], startAt: 0, countdown: 3, pauseMs: 60_000 },
      { t: "presence", presence: { ...presence, phase: "dancing" } },
      { t: "presence", presence: { ...presence, live: "yes" } },
      { t: "have", sessionId: "a", shotIds: [1, 2] },
    ]
    for (const message of bad) expect(parseMessage(JSON.stringify(message))).toBeNull()
  })

  it("cleans the partner's display name", () => {
    const parsed = roundTrip({ t: "presence", presence: { ...presence, name: "  Al\u0000ex \n\t Q‮  " } })
    expect(parsed).toEqual({ t: "presence", presence: { ...presence, name: "Alex Q" } })
  })

  it("tells control messages from booth messages", () => {
    expect(isControlMessage({ t: "ping", at: 1 })).toBe(true)
    expect(isControlMessage({ t: "shoot" })).toBe(false)
  })
})

describe("cleanName", () => {
  it("limits length without splitting characters", () => {
    expect(cleanName("😀".repeat(40))).toBe("😀".repeat(NAME_MAX_LENGTH))
    expect(cleanName(42)).toBe("")
  })
})

describe("parseConnectMeta", () => {
  it("needs a version and a client id", () => {
    expect(parseConnectMeta({ v: 1, clientId: "abc" })).toEqual({ v: 1, clientId: "abc" })
    expect(parseConnectMeta({ v: 1 })).toBeNull()
    expect(parseConnectMeta(null)).toBeNull()
  })
})

describe("startBlocker", () => {
  const partner: Presence = { ...presence, name: "Sam", mirrored: false }

  it("allows a new round when both are idle in the booth with live cameras", () => {
    expect(startBlocker(presence, partner)).toBeNull()
  })

  it("explains what is missing", () => {
    expect(startBlocker({ ...presence, live: false }, partner)).toBe("self-camera")
    expect(startBlocker({ ...presence, phase: "countdown" }, partner)).toBe("self-busy")
    expect(startBlocker(presence, null)).toBe("partner-missing")
    expect(startBlocker(presence, { ...partner, screen: "away" })).toBe("partner-away")
    expect(startBlocker(presence, { ...partner, screen: "review", phase: "review" })).toBe("partner-review")
    expect(startBlocker(presence, { ...partner, phase: "pause" })).toBe("partner-busy")
    expect(startBlocker(presence, { ...partner, live: false })).toBe("partner-camera")
  })

  it("only retakes the same photo of the same session together", () => {
    const retake = { ...presence, retakeIndex: 1 }
    expect(startBlocker(retake, { ...partner, retakeIndex: 1 })).toBeNull()
    expect(startBlocker(retake, partner)).toBe("mismatch")
    expect(startBlocker(retake, { ...partner, retakeIndex: 1, sessionId: "other" })).toBe("mismatch")
    // A new round doesn't care which fresh session ids the two devices hold yet.
    expect(startBlocker(presence, { ...partner, sessionId: "other" })).toBeNull()
  })
})
