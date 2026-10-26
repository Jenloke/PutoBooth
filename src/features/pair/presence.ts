import type { Presence } from "./protocol"

/** Why the shared shutter is disabled, from this device's point of view. */
export type StartBlocker =
  | "self-busy"
  | "self-camera"
  | "partner-missing"
  | "partner-away"
  | "partner-review"
  | "partner-busy"
  | "partner-camera"
  /** Both are in the booth but not for the same shot yet (a retake is still being set up). */
  | "mismatch"

/**
 * Whether a synchronized sequence can start now. Both devices must be idle in the booth with
 * a live camera, and aimed at the same thing: a new round, or the same photo of the same session.
 */
export function startBlocker(self: Presence, partner: Presence | null): StartBlocker | null {
  if (self.screen !== "booth" || self.phase !== "idle") return "self-busy"
  if (!self.live) return "self-camera"
  if (!partner) return "partner-missing"
  if (partner.screen === "away") return "partner-away"
  if (partner.screen === "review") return "partner-review"
  if (partner.phase !== "idle") return "partner-busy"
  if (!partner.live) return "partner-camera"
  if (self.retakeIndex !== partner.retakeIndex) return "mismatch"
  if (self.retakeIndex !== null && self.sessionId !== partner.sessionId) return "mismatch"
  return null
}

export function samePresence(a: Presence | null, b: Presence | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.name === b.name &&
    a.screen === b.screen &&
    a.phase === b.phase &&
    a.sessionId === b.sessionId &&
    a.retakeIndex === b.retakeIndex &&
    a.live === b.live &&
    a.mirrored === b.mirrored
  )
}
