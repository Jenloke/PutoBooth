import type { Phase } from "@/features/booth/session"
import { isLayoutId, type LayoutId } from "@/features/layouts/layouts"

/**
 * Messages between the two devices of a shared booth. Control messages are JSON text frames;
 * photo bytes follow a `shot` header as binary chunks (see chunks.ts).
 *
 * The host is authoritative: the guest sends requests (`shoot`, `retake`, `layout`) and the
 * host answers with commands (`prepare`, `start`, `layout`) that both devices apply. Either
 * side may `cancel`. Everything that comes off the wire is validated by `parseMessage`.
 */
export const PROTOCOL_VERSION = 1

export type Role = "host" | "guest"
/** Which half of every photo slot a device fills: 0 = left (or top), 1 = right (or bottom). */
export type Side = 0 | 1

export function sideOf(role: Role): Side {
  return role === "host" ? 0 : 1
}

export type Screen = "booth" | "review" | "away"

/** What a device is doing, sent whenever it changes. */
export interface Presence {
  name: string
  screen: Screen
  phase: Phase
  sessionId: string
  retakeIndex: number | null
  /** The camera is live and unmuted. */
  live: boolean
  /** This device saves its photos mirrored, so its live video is shown mirrored too. */
  mirrored: boolean
}

export type RejectReason = "busy" | "version"

/** Handled by the link itself. */
export type ControlMessage =
  | { t: "hello"; v: number }
  | { t: "reject"; reason: RejectReason }
  | { t: "bye" }
  | { t: "ping"; at: number }
  /** `echo` is the ping's `at`; `at` is the responder's clock when it answered. */
  | { t: "pong"; echo: number; at: number }
  /** Header for a photo; its bytes follow as binary chunks tagged with `transferId`. */
  | ShotHeader

export interface ShotHeader {
  t: "shot"
  transferId: number
  sessionId: string
  index: number
  shotId: string
  width: number
  height: number
  size: number
}

/** Handled by the shared booth. Times are on the host's clock (performance.now()). */
export type AppMessage =
  | { t: "presence"; presence: Presence }
  | { t: "layout"; layoutId: LayoutId }
  | { t: "shoot" }
  /** Guest → host: retake one photo of a session, or all of them (`index: null`, a new round). */
  | { t: "retake"; sessionId: string; index: number | null }
  /** Host → guest: go to the booth for this retake; shooting starts once both are ready. */
  | { t: "prepare"; sessionId: string; retakeIndex: number | null }
  | {
      t: "start"
      sessionId: string
      layoutId: LayoutId
      indices: number[]
      startAt: number
      /** Seconds per photo, and milliseconds between photos (the host's settings). */
      countdown: number
      pauseMs: number
    }
  | { t: "cancel"; sessionId: string }
  /** After (re)connecting: ids of the partner's photos this device already has. */
  | { t: "have"; sessionId: string; shotIds: (string | null)[] }

export type PairMessage = ControlMessage | AppMessage

export const MAX_SLOTS = 12
export const NAME_MAX_LENGTH = 32
/** Photos are sent downscaled (about 2 MP), so this is generous. */
export const MAX_SHOT_BYTES = 8 * 1024 * 1024
const MAX_TEXT_LENGTH = 16 * 1024
const MAX_DIMENSION = 8192
const MAX_COUNTDOWN = 10
const MAX_PAUSE_MS = 10_000

const PHASES: Record<Phase, true> = {
  idle: true,
  starting: true,
  countdown: true,
  capturing: true,
  pause: true,
  review: true,
}
const SCREENS: Record<Screen, true> = { booth: true, review: true, away: true }
const REJECT_REASONS: Record<RejectReason, true> = { busy: true, version: true }

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)
const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)
const isIndex = (v: unknown): v is number => isInt(v, 0, MAX_SLOTS - 1)
const isIndexOrNull = (v: unknown): v is number | null => v === null || isIndex(v)
const isKey = <K extends string>(set: Record<K, true>, v: unknown): v is K =>
  typeof v === "string" && Object.hasOwn(set, v)

/** Trims a display name to one short line of printable text ("" if nothing is left). */
export function cleanName(value: unknown): string {
  if (typeof value !== "string") return ""
  return Array.from(
    value
      .replace(/\p{Cc}|\p{Cf}/gu, "")
      .replace(/\s+/g, " ")
      .trim()
  )
    .slice(0, NAME_MAX_LENGTH)
    .join("")
    .trim()
}

function parsePresence(v: unknown): Presence | null {
  if (!isObj(v)) return null
  const { name, screen, phase, sessionId, retakeIndex, live, mirrored } = v
  if (!isKey(SCREENS, screen) || !isKey(PHASES, phase) || !isId(sessionId)) return null
  if (!isIndexOrNull(retakeIndex) || typeof live !== "boolean" || typeof mirrored !== "boolean") return null
  return { name: cleanName(name), screen, phase, sessionId, retakeIndex, live, mirrored }
}

function parseIndices(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_SLOTS) return null
  if (!v.every(isIndex) || new Set(v).size !== v.length) return null
  return [...v]
}

/** Validates a message from the other device. Anything unexpected is dropped (null). */
export function parseMessage(text: string): PairMessage | null {
  if (text.length > MAX_TEXT_LENGTH) return null
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObj(v)) return null

  switch (v.t) {
    case "hello":
      return isInt(v.v, 0, 1_000_000) ? { t: "hello", v: v.v } : null
    case "reject":
      return isKey(REJECT_REASONS, v.reason) ? { t: "reject", reason: v.reason } : null
    case "bye":
      return { t: "bye" }
    case "ping":
      return isTime(v.at) ? { t: "ping", at: v.at } : null
    case "pong":
      return isTime(v.echo) && isTime(v.at) ? { t: "pong", echo: v.echo, at: v.at } : null
    case "shot": {
      const { transferId, sessionId, index, shotId, width, height, size } = v
      if (!isInt(transferId, 0, 0xffff_ffff) || !isId(sessionId) || !isIndex(index) || !isId(shotId)) return null
      if (!isInt(width, 1, MAX_DIMENSION) || !isInt(height, 1, MAX_DIMENSION) || !isInt(size, 1, MAX_SHOT_BYTES)) {
        return null
      }
      return { t: "shot", transferId, sessionId, index, shotId, width, height, size }
    }
    case "presence": {
      const presence = parsePresence(v.presence)
      return presence ? { t: "presence", presence } : null
    }
    case "layout":
      return isLayoutId(v.layoutId) ? { t: "layout", layoutId: v.layoutId } : null
    case "shoot":
      return { t: "shoot" }
    case "retake":
      return isId(v.sessionId) && isIndexOrNull(v.index)
        ? { t: "retake", sessionId: v.sessionId, index: v.index }
        : null
    case "prepare":
      return isId(v.sessionId) && isIndexOrNull(v.retakeIndex)
        ? { t: "prepare", sessionId: v.sessionId, retakeIndex: v.retakeIndex }
        : null
    case "start": {
      const { sessionId, layoutId, startAt, countdown, pauseMs } = v
      const indices = parseIndices(v.indices)
      if (!isId(sessionId) || !isLayoutId(layoutId) || !indices || !isTime(startAt)) return null
      if (!isInt(countdown, 1, MAX_COUNTDOWN) || !isInt(pauseMs, 0, MAX_PAUSE_MS)) return null
      return { t: "start", sessionId, layoutId, indices, startAt, countdown, pauseMs }
    }
    case "cancel":
      return isId(v.sessionId) ? { t: "cancel", sessionId: v.sessionId } : null
    case "have": {
      const { sessionId, shotIds } = v
      if (!isId(sessionId) || !Array.isArray(shotIds) || shotIds.length > MAX_SLOTS) return null
      if (!shotIds.every((id) => id === null || isId(id))) return null
      return { t: "have", sessionId, shotIds: [...(shotIds as (string | null)[])] }
    }
    default:
      return null
  }
}

export function isControlMessage(message: PairMessage): message is ControlMessage {
  switch (message.t) {
    case "hello":
    case "reject":
    case "bye":
    case "ping":
    case "pong":
    case "shot":
      return true
    default:
      return false
  }
}

/** Connection metadata a guest sends with its connection request. */
export interface ConnectMeta {
  v: number
  /** Stable for this guest across reconnects, so the host can tell a returning guest from a stranger. */
  clientId: string
}

export function parseConnectMeta(v: unknown): ConnectMeta | null {
  if (!isObj(v) || !isInt(v.v, 0, 1_000_000) || !isId(v.clientId)) return null
  return { v: v.v, clientId: v.clientId }
}
