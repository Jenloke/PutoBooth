import type { PairStatus } from "./pairStore"
import type { StartBlocker } from "./presence"
import type { Presence, Side } from "./protocol"

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "left"/"right" for side-by-side halves, "top"/"bottom" for stacked ones. */
export function sideName(side: Side, sideBySide: boolean): string {
  if (sideBySide) return side === 0 ? "left" : "right"
  return side === 0 ? "top" : "bottom"
}

/** One line under the shutter: what the shared booth is waiting for, or who is where. */
export function boothHint(
  blocker: StartBlocker | null,
  name: string,
  status: PairStatus,
  side: Side,
  sideBySide: boolean
): string {
  switch (blocker) {
    case null:
      return `You're on the ${sideName(side, sideBySide)}, ${name} is on the ${sideName(side === 0 ? 1 : 0, sideBySide)}.`
    case "self-busy":
      return ""
    case "self-camera":
      return `Start your camera to shoot with ${name}.`
    case "partner-missing":
      return status === "reconnecting" ? `Reconnecting to ${name}…` : `Waiting for ${name}…`
    case "partner-away":
      return `${capitalize(name)} is in the gallery.`
    case "partner-review":
      return `${capitalize(name)} is still looking at the photos.`
    case "partner-busy":
      return `Waiting for ${name}…`
    case "partner-camera":
      return `Waiting for ${name}'s camera…`
    case "mismatch":
      return `Getting ${name} ready…`
  }
}

/** Text over the partner's half of the preview, or null when their live video can show. */
export function partnerOverlayText(
  status: PairStatus,
  partner: Presence | null,
  name: string,
  hasVideo: boolean
): { text: string; busy: boolean } | null {
  if (status === "reconnecting") return { text: `Reconnecting to ${name}…`, busy: true }
  if (status !== "connected") return null
  if (!partner) return { text: "Connecting…", busy: true }
  if (partner.screen === "away") return { text: `${capitalize(name)} is in the gallery`, busy: false }
  if (partner.screen === "review") return { text: `${capitalize(name)} is looking at the photos`, busy: false }
  if (!partner.live) return { text: `Waiting for ${name}'s camera…`, busy: true }
  if (!hasVideo) return { text: "Connecting video…", busy: true }
  return null
}
