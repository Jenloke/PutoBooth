import { create } from "zustand"

import {
  getLayout,
  shotCount,
  type LayoutId,
} from "@/features/layouts/layouts"
import { useSettings } from "@/store/settings"
import { uid } from "@/lib/id"

/** idle → countdown → capturing → pause → … → review */
export type Phase = "idle" | "countdown" | "capturing" | "pause" | "review"

export interface Shot {
  id: string
  /** Full camera frame (JPEG at camera resolution), already mirrored if requested. */
  blob: Blob
  /** Object URL for thumbnails; revoked when the shot is replaced or the session resets. */
  url: string
  width: number
  height: number
}

export interface SessionState {
  /** Also the gallery entry id, so edits update the same entry. */
  id: string
  phase: Phase
  layoutId: LayoutId
  shots: (Shot | null)[]
  /** Slot being shot (countdown/capturing/pause). */
  activeIndex: number | null
  /** Current countdown number. */
  count: number
  /** Set when retaking a single shot from review; cancel returns to review. */
  retakeIndex: number | null
  /** Start shooting as soon as the camera is live (after "Retake"). */
  autoStart: boolean
  /** When the session was shot; printed by the date stamp. */
  takenAt: number
}

interface SessionActions {
  selectLayout: (id: LayoutId) => void
  setPhase: (phase: Phase, patch?: Partial<Pick<SessionState, "activeIndex" | "count">>) => void
  setShot: (index: number, shot: Shot) => void
  finish: () => void
  /** Stops a running sequence. Retakes go back to review; full sessions are discarded. */
  cancel: () => void
  retake: (index: number) => void
  retakeAll: () => void
  startOver: () => void
  clearAutoStart: () => void
  load: (entry: { id: string; layoutId: LayoutId; shots: Shot[]; takenAt: number }) => void
}

export type SessionStore = SessionState & SessionActions

function revokeShots(shots: readonly (Shot | null)[]) {
  for (const shot of shots) if (shot) URL.revokeObjectURL(shot.url)
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
    activeIndex: null,
    count: 0,
    retakeIndex: null,
    autoStart: false,
    takenAt: Date.now(),
  }
}

export function isShooting(phase: Phase): boolean {
  return phase === "countdown" || phase === "capturing" || phase === "pause"
}

export const useSession = create<SessionStore>()((set, get) => ({
  ...freshSession(useSettings.getState().defaultLayout),

  selectLayout: (layoutId) => {
    const { phase, shots, layoutId: current } = get()
    if (layoutId === current) return
    if (phase === "review") {
      // Only layouts with the same shot count can reuse the shots.
      if (shotCount(getLayout(layoutId)) === shots.length) set({ layoutId })
      return
    }
    if (phase !== "idle") return
    revokeShots(shots)
    set({ layoutId, shots: emptyShots(layoutId), retakeIndex: null })
  },

  setPhase: (phase, patch) => set({ phase, ...patch }),

  setShot: (index, shot) => {
    const shots = [...get().shots]
    const previous = shots[index]
    if (previous) URL.revokeObjectURL(previous.url)
    shots[index] = shot
    set({ shots })
  },

  finish: () =>
    set((state) => ({
      phase: "review",
      activeIndex: null,
      count: 0,
      retakeIndex: null,
      autoStart: false,
      takenAt: state.retakeIndex === null ? Date.now() : state.takenAt,
    })),

  cancel: () => {
    const { retakeIndex, shots, layoutId } = get()
    if (retakeIndex !== null && shots.every(Boolean)) {
      set({ phase: "review", activeIndex: null, count: 0, retakeIndex: null, autoStart: false })
      return
    }
    revokeShots(shots)
    set({ phase: "idle", shots: emptyShots(layoutId), activeIndex: null, count: 0, retakeIndex: null, autoStart: false })
  },

  retake: (index) =>
    set({ phase: "idle", retakeIndex: index, autoStart: true, activeIndex: null, count: 0 }),

  retakeAll: () => {
    // A new id: the previous result stays in the gallery as its own entry.
    const { shots, layoutId } = get()
    revokeShots(shots)
    set({ ...freshSession(layoutId), autoStart: true })
  },

  startOver: () => {
    const { shots, layoutId } = get()
    revokeShots(shots)
    set(freshSession(layoutId))
  },

  clearAutoStart: () => set({ autoStart: false }),

  load: (entry) => {
    revokeShots(get().shots)
    set({
      ...freshSession(entry.layoutId),
      id: entry.id,
      phase: "review",
      shots: entry.shots,
      takenAt: entry.takenAt,
    })
  },
}))
