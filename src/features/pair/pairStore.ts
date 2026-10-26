import { toast } from "sonner"
import { create } from "zustand"

import { isShooting, useSession, type SessionState, type Shot } from "@/features/booth/session"
import { buildTimeline, shiftTimeline } from "@/features/booth/timeline"
import { abortRun } from "@/features/booth/useBoothSession"
import { getLayout, shotCount, type LayoutId } from "@/features/layouts/layouts"
import { shrinkToJpeg } from "@/lib/canvas"
import { uid } from "@/lib/id"
import { deviceName } from "@/lib/platform"
import { navigate } from "@/lib/router"
import { useSettings } from "@/store/settings"

import { supportsPeerConnections } from "./config"
import type { LinkError, LinkEvent, PairLink, ReceivedShot } from "./link"
import { samePresence, startBlocker } from "./presence"
import { cleanName, sideOf, type AppMessage, type Presence, type Role } from "./protocol"
import { JOIN_PARAM, parseRoomCode } from "./roomCode"

/**
 * The shared booth: two devices shooting one session, each filling one half of every photo.
 *
 * This store owns the link (loaded on demand, so solo use never downloads PeerJS) and keeps the
 * booth session in step with the partner's. The host decides: when both devices are ready it
 * schedules the sequence on its clock, and both run the same timeline. Each device captures its
 * own half and sends it over; the review and export (customizing included) stay per device.
 */

export type PairStatus = "off" | "connecting" | "waiting" | "connected" | "reconnecting" | "error"
export type PairError = LinkError | "invalid-code"

export interface LocalCamera {
  live: boolean
  /** Photos are saved mirrored (front camera with "Mirror photos" on). */
  mirrored: boolean
  stream: MediaStream | null
}

export interface PairState {
  status: PairStatus
  role: Role | null
  /** The room code: the host's once its room is open, or the one a guest is joining. */
  code: string | null
  error: PairError | null
  /** The partner's name, kept while reconnecting. */
  partnerName: string | null
  /** What the partner is doing; null unless connected. */
  partner: Presence | null
  /** The partner's live camera. */
  remoteStream: MediaStream | null
  /** The next round's layout. Either side may change it; the host's answer wins. */
  layoutId: LayoutId
  /** The session both devices are shooting, set when the host starts or prepares a round. */
  jointId: string | null
  /** This device is on another screen (the gallery). */
  away: boolean
  camera: LocalCamera
  dialogOpen: boolean
  /** The dialog was opened once; it stays mounted so closing animates. */
  dialogLoaded: boolean
}

interface PairActions {
  setDialogOpen: (open: boolean) => void
  host: () => Promise<void>
  join: (code: string) => Promise<void>
  /** Tries the last host or join again after an error. */
  retry: () => void
  leave: () => void
  /** The shared shutter. The host starts once both are ready; a guest asks the host. */
  shoot: () => void
  /** Stops the sequence (or a retake being set up) on both devices. */
  cancel: () => void
  /** Tells the partner a sequence this device already stopped (a failed capture) is off. */
  announceCancel: (sessionId: string) => void
  /** Retakes one photo of the shared session together, or starts a new round (null). */
  retake: (index: number | null) => void
  selectLayout: (id: LayoutId) => void
  setCamera: (camera: LocalCamera) => void
  setAway: (away: boolean) => void
}

export type PairStore = PairState & PairActions

/** Time for the start to reach the guest before the first countdown number. */
const START_LEAD_MS = 800
/** Photos go to the partner at about 2 MP: plenty for half a slot, and quick on any network. */
const SEND_SHORT_EDGE = 1080
const SEND_QUALITY = 0.9

const LINK_RESET = {
  status: "off",
  role: null,
  code: null,
  error: null,
  partnerName: null,
  partner: null,
  remoteStream: null,
  jointId: null,
} satisfies Partial<PairState>

let link: PairLink | null = null
/** Bumped by every host/join/leave, so a slow import can't revive an abandoned attempt. */
let generation = 0
let lastPresence: Presence | null = null
/** The link dropped at some point; the next hello is a reunion. */
let reconnected = false
/** `${sessionId}:${index}` → the id of the photo last sent for that slot. */
const sent = new Map<string, string>()
/** Photos are shrunk and sent one at a time (decoding several 12 MP frames at once can crash iOS). */
let outbox: Promise<unknown> = Promise.resolve()

export function isLinked(status: PairStatus): boolean {
  return status === "connected" || status === "reconnecting"
}

export function partnerLabel(state: Pick<PairState, "partner" | "partnerName">): string {
  return state.partner?.name || state.partnerName || "your partner"
}

function ownName(): string {
  return cleanName(useSettings.getState().displayName) || deviceName()
}

const slotKey = (sessionId: string, index: number) => `${sessionId}:${index}`

/** Idle in the booth with nothing shot: ready for a new round. */
function isFreshIdle(session: SessionState): boolean {
  return session.phase === "idle" && session.retakeIndex === null && session.shots.every((s) => !s)
}

/** A retake being set up (in the booth, not started yet) or a new round waiting to start. */
function isPending(session: SessionState): boolean {
  return session.autoStart || (session.phase === "idle" && session.retakeIndex !== null)
}

function localPresence(): Presence {
  const session = useSession.getState()
  const { away, camera } = usePair.getState()
  return {
    name: ownName(),
    screen: away ? "away" : session.phase === "review" ? "review" : "booth",
    phase: session.phase,
    sessionId: session.id,
    retakeIndex: session.retakeIndex,
    live: camera.live,
    mirrored: camera.mirrored,
  }
}

function publishPresence() {
  if (usePair.getState().status !== "connected" || !link) return
  const presence = localPresence()
  if (!samePresence(presence, lastPresence)) {
    lastPresence = presence
    link.send({ t: "presence", presence })
  }
  maybeAutoStart()
}

/** Stops whatever this device was shooting because the pair broke up. */
function stopShooting() {
  const session = useSession.getState()
  if (isShooting(session.phase)) {
    abortRun()
    session.cancel()
  } else if (session.autoStart) {
    session.clearAutoStart()
  }
}

// Host decisions ----------------------------------------------------------------------------

function maybeAutoStart() {
  const state = usePair.getState()
  if (state.role !== "host" || state.status !== "connected") return
  if (!useSession.getState().autoStart) return
  if (startBlocker(localPresence(), state.partner) === null) hostStart()
}

function hostStart() {
  // Consumed up front: the presence update this triggers must not start a second sequence.
  useSession.getState().clearAutoStart()
  const session = useSession.getState()
  const fresh = session.retakeIndex === null
  const layoutId = fresh ? usePair.getState().layoutId : session.layoutId
  const indices = fresh ? Array.from({ length: shotCount(getLayout(layoutId)) }, (_, i) => i) : [session.retakeIndex!]
  const { countdown, pauseSeconds } = useSettings.getState()
  const message = {
    t: "start",
    sessionId: session.id,
    layoutId,
    indices,
    startAt: performance.now() + START_LEAD_MS,
    countdown,
    pauseMs: Math.round(pauseSeconds * 1000),
  } satisfies AppMessage
  if (link?.send(message)) applyStart(message)
}

function hostPrepare(sessionId: string, index: number | null) {
  if (index === null) {
    const message = { t: "prepare", sessionId: uid(), retakeIndex: null } satisfies AppMessage
    if (applyPrepare(message)) link?.send(message)
    return
  }
  const message = { t: "prepare", sessionId, retakeIndex: index } satisfies AppMessage
  const joint = sessionId === useSession.getState().id && sessionId === usePair.getState().jointId
  if (joint && applyPrepare(message)) link?.send(message)
  else link?.send({ t: "cancel", sessionId })
}

// Applying the host's commands (on both devices) ---------------------------------------------

function applyStart(message: Extract<AppMessage, { t: "start" }>) {
  const session = useSession.getState()
  const state = usePair.getState()
  const reject = () => {
    link?.send({ t: "cancel", sessionId: message.sessionId })
  }
  if (!link || !state.role || session.phase !== "idle") {
    reject()
    return
  }

  if (session.retakeIndex === null) {
    if (message.indices.length !== shotCount(getLayout(message.layoutId))) {
      reject()
      return
    }
    session.joinRound({
      id: message.sessionId,
      layoutId: message.layoutId,
      side: sideOf(state.role),
      partnerName: state.partner?.name || state.partnerName || "",
    })
  } else if (session.id !== message.sessionId || message.indices.join() !== String(session.retakeIndex)) {
    reject()
    return
  }

  usePair.setState({ jointId: message.sessionId })
  const timeline = buildTimeline(message)
  const delta = link.toLocalTime(0)
  useSession.getState().schedule(delta === 0 ? timeline : shiftTimeline(timeline, delta))
}

/** Sets up a retake (or a new round) to start once both devices are ready. */
function applyPrepare(message: Extract<AppMessage, { t: "prepare" }>): boolean {
  const session = useSession.getState()
  if (isShooting(session.phase)) return false
  if (message.retakeIndex === null) {
    session.retakeAll(message.sessionId)
    usePair.setState({ jointId: message.sessionId })
  } else {
    const ok =
      session.id === message.sessionId &&
      session.pair !== null &&
      message.retakeIndex < session.shots.length &&
      session.shots.every(Boolean)
    if (!ok) return false
    session.retake(message.retakeIndex)
  }
  if (usePair.getState().away) navigate("/")
  return true
}

function applyRemoteCancel(sessionId: string) {
  const session = useSession.getState()
  if (session.id !== sessionId || !(isShooting(session.phase) || isPending(session))) return
  abortRun()
  session.cancel()
  toast(`${partnerLabel(usePair.getState())} stopped the photos`)
}

function setJointLayout(layoutId: LayoutId) {
  usePair.setState({ layoutId })
  reconcileLayout()
}

/** An idle booth always shows the next round's layout. */
function reconcileLayout() {
  const { status, layoutId } = usePair.getState()
  if (!isLinked(status)) return
  const session = useSession.getState()
  if (isFreshIdle(session) && session.layoutId !== layoutId) session.selectLayout(layoutId)
}

// Photos -------------------------------------------------------------------------------------

function sendShot(sessionId: string, index: number, shot: Shot) {
  const key = slotKey(sessionId, index)
  sent.set(key, shot.id)
  const current = link
  const forget = () => {
    if (sent.get(key) === shot.id) sent.delete(key)
  }
  outbox = outbox
    .then(async () => {
      if (!current || current !== link) return forget()
      const small = await shrinkToJpeg(shot, SEND_SHORT_EDGE, SEND_QUALITY)
      const ok = await current.sendShot(
        { sessionId, index, shotId: shot.id, width: small.width, height: small.height },
        small.blob
      )
      if (!ok) forget()
    })
    .catch(forget)
}

/** Sends this device's new photos of the shared session as they're taken. */
function sendNewShots(session: SessionState) {
  const { status, jointId } = usePair.getState()
  if (status !== "connected" || session.id !== jointId || !session.pair) return
  session.shots.forEach((shot, index) => {
    if (shot && sent.get(slotKey(session.id, index)) !== shot.id) sendShot(session.id, index, shot)
  })
}

/** After a reconnect: sends whatever the partner is missing. */
function resendMissing(sessionId: string, theirCopies: readonly (string | null)[]) {
  const session = useSession.getState()
  if (session.id !== sessionId || !session.pair) return
  session.shots.forEach((shot, index) => {
    if (!shot) return
    if (theirCopies[index] === shot.id) sent.set(slotKey(sessionId, index), shot.id)
    else sendShot(sessionId, index, shot)
  })
}

function receiveShot(shot: ReceivedShot) {
  const session = useSession.getState()
  if (session.id !== shot.sessionId || !session.pair) return
  session.setPartnerShot(shot.index, {
    id: shot.shotId,
    blob: shot.blob,
    url: URL.createObjectURL(shot.blob),
    width: shot.width,
    height: shot.height,
  })
}

// Link events --------------------------------------------------------------------------------

function onMessage(message: AppMessage) {
  const state = usePair.getState()
  const host = state.role === "host"
  switch (message.t) {
    case "presence": {
      const first = state.partner === null
      usePair.setState({ partner: message.presence, partnerName: message.presence.name || state.partnerName })
      if (first) {
        const name = partnerLabel({ partner: message.presence, partnerName: state.partnerName })
        toast.success(reconnected ? `Back with ${name}` : `Connected with ${name}`, { id: "pair-status" })
      }
      maybeAutoStart()
      return
    }
    case "layout":
      setJointLayout(message.layoutId)
      // The host answers a guest's choice with the result, so both settle on the same layout.
      if (host) link?.send({ t: "layout", layoutId: usePair.getState().layoutId })
      return
    case "shoot":
      if (host && startBlocker(localPresence(), state.partner) === null) hostStart()
      return
    case "retake":
      if (host) hostPrepare(message.sessionId, message.index)
      return
    case "prepare":
      if (!host && !applyPrepare(message)) link?.send({ t: "cancel", sessionId: message.sessionId })
      return
    case "start":
      if (!host) applyStart(message)
      return
    case "cancel":
      applyRemoteCancel(message.sessionId)
      return
    case "have":
      resendMissing(message.sessionId, message.shotIds)
      return
  }
}

function onConnected() {
  const state = usePair.getState()
  const session = useSession.getState()
  const layoutId = state.role === "host" && isFreshIdle(session) ? session.layoutId : state.layoutId
  usePair.setState({ status: "connected", error: null, layoutId })
  lastPresence = null
  if (state.role === "host") link?.send({ t: "layout", layoutId })
  reconcileLayout()
  publishPresence()
  if (session.pair) {
    link?.send({ t: "have", sessionId: session.id, shotIds: session.pair.shots.map((s) => s?.id ?? null) })
  }
}

function onInterrupted() {
  usePair.setState({ status: "reconnecting", partner: null, remoteStream: null })
  lastPresence = null
  reconnected = true
  if (isShooting(useSession.getState().phase)) {
    stopShooting()
    toast("Photos cancelled", { description: `The connection to ${partnerLabel(usePair.getState())} dropped.` })
  }
}

function onLinkEvent(event: LinkEvent) {
  switch (event.type) {
    case "waiting":
      usePair.setState({ status: "waiting", code: event.code })
      return
    case "connected":
      onConnected()
      return
    case "interrupted":
      onInterrupted()
      return
    case "partner-left": {
      const name = partnerLabel(usePair.getState())
      endLink()
      usePair.setState(LINK_RESET)
      toast(`${name} left the shared booth`, { id: "pair-status" })
      return
    }
    case "failed": {
      const state = usePair.getState()
      const wasPaired = isLinked(state.status)
      endLink()
      usePair.setState({ ...LINK_RESET, status: "error", error: event.error, role: state.role, code: state.code })
      if (wasPaired) {
        toast.error(`Lost the connection to ${partnerLabel(state)}`, {
          id: "pair-status",
          description: "Your photos are still here.",
          action: { label: "Reconnect", onClick: () => usePair.getState().retry() },
        })
      }
      return
    }
    case "message":
      onMessage(event.message)
      return
    case "shot":
      receiveShot(event.shot)
      return
    case "remote-stream":
      usePair.setState({ remoteStream: event.stream })
      return
  }
}

function endLink() {
  generation++
  link?.close()
  link = null
  lastPresence = null
  reconnected = false
  sent.clear()
  stopShooting()
}

async function openLink(role: Role, code: string | null) {
  endLink()
  const gen = generation
  if (!supportsPeerConnections()) {
    usePair.setState({ ...LINK_RESET, status: "error", error: "unsupported", role, code })
    return
  }
  usePair.setState({ ...LINK_RESET, status: "connecting", role, code, layoutId: useSession.getState().layoutId })
  try {
    const { PairLink } = await import("./link")
    if (gen !== generation) return
    const emit = (event: LinkEvent) => {
      if (link === instance) onLinkEvent(event)
    }
    const instance = role === "host" ? PairLink.host(emit) : PairLink.join(code!, emit)
    link = instance
    instance.setLocalStream(usePair.getState().camera.stream)
  } catch {
    // The PeerJS chunk didn't load (offline before it was cached).
    if (gen === generation) usePair.setState({ status: "error", error: "network" })
  }
}

export const usePair = create<PairStore>()((set, get) => ({
  ...LINK_RESET,
  layoutId: useSession.getState().layoutId,
  away: false,
  camera: { live: false, mirrored: false, stream: null },
  dialogOpen: false,
  dialogLoaded: false,

  setDialogOpen: (dialogOpen) => set({ dialogOpen, dialogLoaded: get().dialogLoaded || dialogOpen }),

  host: () => openLink("host", null),

  join: async (input) => {
    const code = parseRoomCode(input)
    if (!code) {
      endLink()
      set({ ...LINK_RESET, status: "error", error: "invalid-code", role: "guest" })
      return
    }
    await openLink("guest", code)
  },

  retry: () => {
    const { role, code } = get()
    if (role === "guest" && code) void get().join(code)
    else void get().host()
  },

  leave: () => {
    endLink()
    set(LINK_RESET)
  },

  shoot: () => {
    const { status, role, partner } = get()
    if (status !== "connected" || startBlocker(localPresence(), partner) !== null) return
    if (role === "host") hostStart()
    else link?.send({ t: "shoot" })
  },

  cancel: () => {
    const session = useSession.getState()
    const notify = isShooting(session.phase) || isPending(session)
    abortRun()
    session.cancel()
    if (notify) link?.send({ t: "cancel", sessionId: session.id })
  },

  announceCancel: (sessionId) => {
    link?.send({ t: "cancel", sessionId })
  },

  retake: (index) => {
    const { status, role } = get()
    if (status !== "connected") return
    const { id } = useSession.getState()
    if (role === "host") hostPrepare(id, index)
    else link?.send({ t: "retake", sessionId: id, index })
  },

  selectLayout: (layoutId) => {
    if (!isLinked(get().status)) {
      useSession.getState().selectLayout(layoutId)
      return
    }
    setJointLayout(layoutId)
    link?.send({ t: "layout", layoutId })
  },

  setCamera: (camera) => {
    const previous = get().camera
    if (previous.live === camera.live && previous.mirrored === camera.mirrored && previous.stream === camera.stream) {
      return
    }
    set({ camera })
    if (previous.stream !== camera.stream) link?.setLocalStream(camera.stream)
    publishPresence()
  },

  setAway: (away) => {
    if (get().away === away) return
    set({ away })
    publishPresence()
  },
}))

useSession.subscribe((state, previous) => {
  if (state.shots !== previous.shots) sendNewShots(state)
  if (
    state.phase !== previous.phase ||
    state.id !== previous.id ||
    state.retakeIndex !== previous.retakeIndex ||
    state.autoStart !== previous.autoStart
  ) {
    publishPresence()
  }
  reconcileLayout()
})

useSettings.subscribe((state, previous) => {
  if (state.displayName !== previous.displayName) publishPresence()
})

/** Opens the join flow for an invite link (`/?join=CODE`) and removes the code from the URL. */
export function consumeJoinLink(): void {
  const url = new URL(window.location.href)
  const raw = url.searchParams.get(JOIN_PARAM)
  if (raw === null) return
  url.searchParams.delete(JOIN_PARAM)
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`)
  usePair.getState().setDialogOpen(true)
  void usePair.getState().join(raw)
}
