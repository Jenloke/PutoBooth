import { create } from "zustand"

import {
  getLayout,
  shotCount,
  type LayoutId,
} from "@/features/layouts/layouts"
import type { Side } from "@/features/pair/protocol"
import { useSettings } from "@/store/settings"
import { uid } from "@/lib/id"

import type { Timeline } from "./timeline"

/**
 * idle → countdown → capturing → pause → … → review. A shared booth sequence waits in
 * `starting` until the agreed start time.
 */
export type Phase = "idle" | "starting" | "countdown" | "capturing" | "pause" | "review"

export interface Shot {
  id: string
  /** Full camera frame (JPEG at camera resolution), already mirrored if requested. */
  blob: Blob
  /** Object URL for thumbnails; revoked when the shot is replaced or the session resets. */
  url: string
  width: number
  height: number
}

/** Shared booth: the other device's photos. Each slot shows both, one per half. */
export interface PairShots {
  /** The half of each slot this device's photos fill. */
  side: Side
  partnerName: string
  /** The partner's photo for each slot, as they arrive. */
  shots: (Shot | null)[]
}

export interface SessionState {
  /** Also the gallery entry id, so edits update the same entry. In a shared booth, the host's id. */
  id: string
  phase: Phase
  layoutId: LayoutId
  /** This device's photos, one per slot. */
  shots: (Shot | null)[]
  pair: PairShots | null
  /** Slot being shot (countdown/capturing/pause). */
  activeIndex: number | null
  /** Current countdown number. */
  count: number
  /** Set when retaking a single shot from review; cancel returns to review. */
  retakeIndex: number | null
  /** Start shooting as soon as the camera is live (after "Retake"). */
  autoStart: boolean
  /** A synchronized sequence for the booth to run (shared booth), on this device's clock. */
  scheduled: Timeline | null
  /** When the session was shot; printed by the date stamp. */
  takenAt: number
}

export interface JoinRound {
  id: string
  layoutId: LayoutId
  side: Side
  partnerName: string
}

interface SessionActions {
  selectLayout: (id: LayoutId) => void
  setPhase: (phase: Phase, patch?: Partial<Pick<SessionState, "activeIndex" | "count">>) => void
  setShot: (index: number, shot: Shot) => void
  setPartnerShot: (index: number, shot: Shot) => void
  /** Makes this idle session a round of a shared booth: the host's id and layout, both halves. */
  joinRound: (round: JoinRound) => void
  /** Hands a timeline to the booth to run; the phase is `starting` until it does. */
  schedule: (timeline: Timeline) => void
  /** The booth takes the scheduled timeline (once) to run it. */
  takeSchedule: () => Timeline | null
  finish: () => void
  /** Stops a running sequence. Retakes go back to review; full sessions are discarded. */
  cancel: () => void
  retake: (index: number) => void
  /** A new session that starts shooting right away. Shared booths pass the round's id. */
  retakeAll: (id?: string) => void
  startOver: () => void
  clearAutoStart: () => void
  load: (entry: { id: string; layoutId: LayoutId; shots: Shot[]; takenAt: number; pair?: PairShots | null }) => void
}

export type SessionStore = SessionState & SessionActions

function revokeShots(shots: readonly (Shot | null)[]) {
  for (const shot of shots) if (shot) URL.revokeObjectURL(shot.url)
}

function revokeSession({ shots, pair }: Pick<SessionState, "shots" | "pair">) {
  revokeShots(shots)
  if (pair) revokeShots(pair.shots)
}

function emptyShots(layoutId: LayoutId): null[] {
  return Array.from({ length: shotCount(getLayout(layoutId)) }, () => null)
}

function freshSession(layoutId: LayoutId): SessionState {
  return {
    id: uid(),
    phase: "idle",
    layoutId,
    shots: emptyShots(layoutId),
    pair: null,
    activeIndex: null,
    count: 0,
    retakeIndex: null,
    autoStart: false,
    scheduled: null,
    takenAt: Date.now(),
  }
}

/** Each slot's photos in display order: this device's alone, or both halves of a shared booth. */
export function slotShots(
  shots: readonly (Shot | null)[],
  pair: Pick<PairShots, "side" | "shots"> | null
): (Shot | null)[][] {
  if (!pair) return shots.map((shot) => [shot])
  return shots.map((shot, i) => {
    const theirs = pair.shots[i] ?? null
    return pair.side === 0 ? [shot, theirs] : [theirs, shot]
  })
}

/** A sequence is under way (including a shared one waiting for its start time). */
export function isShooting(phase: Phase): boolean {
  return phase === "starting" || phase === "countdown" || phase === "capturing" || phase === "pause"
}

/** Replaces the shot at `index` in a copy of `shots`, revoking the one it replaces. */
function withShot(shots: readonly (Shot | null)[], index: number, shot: Shot): (Shot | null)[] {
  const next = [...shots]
  const previous = next[index]
  if (previous && previous.url !== shot.url) URL.revokeObjectURL(previous.url)
  next[index] = shot
  return next
}

export const useSession = create<SessionStore>()((set, get) => ({
  ...freshSession(useSettings.getState().defaultLayout),

  selectLayout: (layoutId) => {
    const { phase, shots, pair, layoutId: current } = get()
    if (layoutId === current) return
    if (phase === "review") {
      // Only layouts with the same shot count can reuse the shots.
      if (shotCount(getLayout(layoutId)) === shots.length) set({ layoutId })
      return
    }
    if (phase !== "idle") return
    revokeSession({ shots, pair })
    set({
      layoutId,
      shots: emptyShots(layoutId),
      pair: pair && { ...pair, shots: emptyShots(layoutId) },
      retakeIndex: null,
    })
  },

  setPhase: (phase, patch) => set({ phase, ...patch }),

  setShot: (index, shot) => set({ shots: withShot(get().shots, index, shot) }),

  setPartnerShot: (index, shot) => {
    const { pair } = get()
    if (!pair || index < 0 || index >= pair.shots.length) {
      URL.revokeObjectURL(shot.url)
      return
    }
    set({ pair: { ...pair, shots: withShot(pair.shots, index, shot) } })
  },

  joinRound: ({ id, layoutId, side, partnerName }) => {
    revokeSession(get())
    set({
      id,
      layoutId,
      shots: emptyShots(layoutId),
      pair: { side, partnerName, shots: emptyShots(layoutId) },
      retakeIndex: null,
      takenAt: Date.now(),
    })
  },

  schedule: (timeline) => set({ phase: "starting", scheduled: timeline, autoStart: false, activeIndex: null, count: 0 }),

  takeSchedule: () => {
    const { scheduled } = get()
    if (scheduled) set({ scheduled: null })
    return scheduled
  },

  finish: () =>
    set((state) => ({
      phase: "review",
      activeIndex: null,
      count: 0,
      retakeIndex: null,
      autoStart: false,
      scheduled: null,
      takenAt: state.retakeIndex === null ? Date.now() : state.takenAt,
    })),

  cancel: () => {
    const { retakeIndex, shots, pair, layoutId } = get()
    const idle = { activeIndex: null, count: 0, retakeIndex: null, autoStart: false, scheduled: null }
    if (retakeIndex !== null && shots.every(Boolean)) {
      set({ phase: "review", ...idle })
      return
    }
    revokeSession({ shots, pair })
    set({ phase: "idle", shots: emptyShots(layoutId), pair: null, ...idle })
  },

  retake: (index) =>
    set({ phase: "idle", retakeIndex: index, autoStart: true, activeIndex: null, count: 0, scheduled: null }),

  retakeAll: (id) => {
    // A new id: the previous result stays in the gallery as its own entry.
    const { layoutId } = get()
    revokeSession(get())
    set({ ...freshSession(layoutId), ...(id ? { id } : {}), autoStart: true })
  },

  startOver: () => {
    const { layoutId } = get()
    revokeSession(get())
    set(freshSession(layoutId))
  },

  clearAutoStart: () => set({ autoStart: false }),

  load: (entry) => {
    revokeSession(get())
    set({
      ...freshSession(entry.layoutId),
      id: entry.id,
      phase: "review",
      shots: entry.shots,
      pair: entry.pair ?? null,
      takenAt: entry.takenAt,
    })
  },
}))
