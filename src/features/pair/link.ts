import { Peer, type DataConnection, type MediaConnection, type PeerError } from "peerjs"

import { uid } from "@/lib/id"

import { TransferAssembler, encodeFrames } from "./chunks"
import { ClockSync } from "./clock"
import { peerOptions } from "./config"
import {
  PROTOCOL_VERSION,
  isControlMessage,
  parseConnectMeta,
  parseMessage,
  type AppMessage,
  type ConnectMeta,
  type ControlMessage,
  type PairMessage,
  type Role,
  type ShotHeader,
} from "./protocol"
import { generateRoomCode, guestPeerId, hostPeerId } from "./roomCode"

/**
 * The connection between the two devices of a shared booth, over WebRTC via PeerJS:
 *
 * - the host registers its room code as its peer id; the guest connects to it;
 * - one reliable, ordered data channel carries JSON messages and photo chunks;
 * - each device sends its camera to the other as a one-way video call (live preview);
 * - pings measure the clock offset (for synchronized countdowns) and detect a dead link;
 * - a guest that loses the link keeps retrying; the host keeps the room open for it.
 *
 * Everything PeerJS-specific stays in this file.
 */

export type LinkError = "unsupported" | "network" | "not-found" | "busy" | "version" | "lost"

export interface ReceivedShot {
  sessionId: string
  index: number
  shotId: string
  width: number
  height: number
  blob: Blob
}

export type LinkEvent =
  /** Host: the room is open (under `code`) and nobody is connected. */
  | { type: "waiting"; code: string }
  /** Both sides said hello (and the guest has measured the clock offset). */
  | { type: "connected" }
  /** The link dropped without a goodbye; it's being restored. */
  | { type: "interrupted" }
  | { type: "partner-left" }
  /** Terminal: the link is closed. */
  | { type: "failed"; error: LinkError }
  | { type: "message"; message: AppMessage }
  | { type: "shot"; shot: ReceivedShot }
  | { type: "remote-stream"; stream: MediaStream | null }

type ShotMeta = Omit<ShotHeader, "t" | "transferId" | "size">

const PING_BURST = 5
const PING_BURST_MS = 250
const PING_MS = 2_000
/** No message for this long means the link is dead, even if WebRTC hasn't noticed yet. */
const SILENCE_MS = 10_000
/** How long a guest looks for the room before saying it doesn't exist. */
const JOIN_TIMEOUT_MS = 30_000
/** How long a dropped pair tries to find each other again (the guest retries, the host waits). */
const RECONNECT_TIMEOUT_MS = 120_000
const ATTEMPT_TIMEOUT_MS = 15_000
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 3_000, 5_000]
const MAX_CODE_ATTEMPTS = 5
/** Photos queue behind each other; the next waits until the channel has mostly drained. */
const DRAINED_BYTES = 256 * 1024
const BYE_FLUSH_MS = 250
/** The live preview only needs to show poses: about 540p at up to 1 Mbit/s. */
const PREVIEW_SHORT_EDGE = 540
const PREVIEW_MAX_BITRATE = 1_000_000

/** Every PeerJS error type we react to; the rest are only logged by PeerJS. */
type PeerErrorType =
  | "browser-incompatible"
  | "disconnected"
  | "invalid-id"
  | "invalid-key"
  | "network"
  | "peer-unavailable"
  | "ssl-unavailable"
  | "server-error"
  | "socket-error"
  | "socket-closed"
  | "unavailable-id"
  | "webrtc"

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

function videoSender(call: MediaConnection | null): RTCRtpSender | null {
  return call?.peerConnection?.getSenders().find((s) => s.track?.kind === "video" || s.track === null) ?? null
}

/** Caps the preview's resolution and bitrate once the call is negotiated (encodings exist). */
function limitPreview(call: MediaConnection, track: MediaStreamTrack) {
  const pc = call.peerConnection
  if (!pc) return
  const apply = () => {
    const sender = videoSender(call)
    if (!sender) return
    const params = sender.getParameters()
    const encoding = params.encodings?.[0]
    if (!encoding) return
    const { width = 0, height = 0 } = track.getSettings()
    const shortEdge = Math.min(width, height)
    encoding.maxBitrate = PREVIEW_MAX_BITRATE
    encoding.scaleResolutionDownBy = shortEdge > PREVIEW_SHORT_EDGE ? shortEdge / PREVIEW_SHORT_EDGE : 1
    sender.setParameters(params).catch(() => {
      // Not supported here: the browser picks the resolution.
    })
  }
  if (pc.connectionState === "connected") {
    apply()
    return
  }
  const onChange = () => {
    if (pc.connectionState !== "connected") return
    pc.removeEventListener("connectionstatechange", onChange)
    apply()
  }
  pc.addEventListener("connectionstatechange", onChange)
}

export class PairLink {
  readonly role: Role
  private code: string
  private readonly clientId = uid()
  private readonly emit: (event: LinkEvent) => void
  private peer: Peer
  private everOpened = false
  private codeAttempts = 1
  private signalFailures = 0
  private signalTimer: number | undefined

  /** The open connection to the partner. */
  private conn: DataConnection | null = null
  /** Guest: a connection attempt that hasn't opened yet. */
  private pending: DataConnection | null = null
  /** Host: the guest we're paired with, so a returning guest can replace its dead connection. */
  private partnerClientId: string | null = null
  private helloReceived = false
  private announced = false
  private everConnected = false
  private closed = false

  private readonly clock = new ClockSync()
  private readonly assembler = new TransferAssembler<ShotHeader>()
  private nextTransferId = 1
  private sendQueue: Promise<unknown> = Promise.resolve()
  private lastHeard = 0
  private pingTimer: number | undefined

  private retryTimer: number | undefined
  private attemptTimer: number | undefined
  /** Host: gives up on a guest that dropped and didn't come back. */
  private lostTimer: number | undefined
  private retries = 0
  private retryDeadline = 0

  private localStream: MediaStream | null = null
  private outgoing: MediaConnection | null = null
  private incoming: MediaConnection | null = null

  private constructor(role: Role, code: string, emit: (event: LinkEvent) => void) {
    this.role = role
    this.code = code
    this.emit = emit
    this.retryDeadline = performance.now() + JOIN_TIMEOUT_MS
    this.peer = this.createPeer()
    window.addEventListener("online", this.onWake)
    document.addEventListener("visibilitychange", this.onWake)
  }

  /** Opens a room under a fresh code (reported by the `waiting` event). */
  static host(emit: (event: LinkEvent) => void): PairLink {
    return new PairLink("host", generateRoomCode(), emit)
  }

  static join(code: string, emit: (event: LinkEvent) => void): PairLink {
    return new PairLink("guest", code, emit)
  }

  /** Converts a time on the host's clock to this device's clock (identity on the host). */
  toLocalTime(hostTime: number): number {
    return this.role === "host" ? hostTime : this.clock.toLocal(hostTime)
  }

  send(message: PairMessage): boolean {
    const conn = this.conn
    if (!conn?.open) return false
    void conn.send(JSON.stringify(message))
    return true
  }

  /** Sends a photo: a header, then its bytes in frames. Photos go one at a time, in order. */
  sendShot(meta: ShotMeta, blob: Blob): Promise<boolean> {
    const job = this.sendQueue.then(async () => {
      const conn = this.conn
      if (!conn?.open) return false
      const data = new Uint8Array(await blob.arrayBuffer())
      if (conn !== this.conn || !conn.open) return false
      const transferId = this.nextTransferId++ >>> 0
      void conn.send(JSON.stringify({ t: "shot", transferId, ...meta, size: data.byteLength } satisfies ShotHeader))
      for (const frame of encodeFrames(transferId, data)) void conn.send(frame)
      await this.drained(conn)
      return conn.open
    })
    this.sendQueue = job.catch(() => {})
    return job
  }

  /** The camera stream to show the partner; null stops the preview. */
  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream
    this.syncOutgoingCall()
  }

  /** Leaves: tells the partner, then tears everything down. */
  close(): void {
    if (this.closed) return
    const sentBye = this.send({ t: "bye" })
    this.teardown()
    // Destroying closes the peer connection at once, which would drop the goodbye.
    const peer = this.peer
    if (sentBye) window.setTimeout(() => peer.destroy(), BYE_FLUSH_MS)
    else peer.destroy()
  }

  // Signaling ------------------------------------------------------------------------------

  private createPeer(): Peer {
    const id = this.role === "host" ? hostPeerId(this.code) : guestPeerId(this.clientId)
    const peer = new Peer(id, peerOptions())
    peer.on("open", () => this.onPeerOpen(peer))
    peer.on("connection", (conn) => this.onIncomingConnection(conn))
    peer.on("call", (call) => this.onIncomingCall(call))
    peer.on("disconnected", () => this.onSignalingLost(peer))
    peer.on("error", (error) => this.onPeerError(peer, error))
    return peer
  }

  private onPeerOpen(peer: Peer) {
    if (this.closed || peer !== this.peer) return
    this.everOpened = true
    this.signalFailures = 0
    if (this.role === "host") {
      if (!this.everConnected) this.emit({ type: "waiting", code: this.code })
    } else if (!this.conn && !this.pending && this.retryTimer === undefined) {
      this.connectToHost()
    }
  }

  private onPeerError(peer: Peer, error: PeerError<string>) {
    if (this.closed || peer !== this.peer) return
    switch (error.type as PeerErrorType) {
      case "unavailable-id":
        // Someone else's room has this code (or our old id is still registered).
        if (this.role === "host" && !this.everOpened && this.codeAttempts < MAX_CODE_ATTEMPTS) {
          this.codeAttempts++
          this.code = generateRoomCode()
          // Swap first: destroy() emits events synchronously, and only the current peer counts.
          this.peer = this.createPeer()
          peer.destroy()
        } else if (!this.everOpened) {
          this.fail("network")
        }
        return
      case "peer-unavailable":
        // Guest: the room isn't there (yet, or any more). The host keeps it open, so try again.
        if (this.role === "guest") this.retry()
        return
      case "webrtc":
        if (this.role === "guest" && !this.conn) this.retry()
        return
      case "browser-incompatible":
        this.fail("unsupported")
        return
      case "disconnected":
        this.onSignalingLost(peer)
        return
      default:
        // Network trouble before we ever reached the server is fatal; later it's a reconnect.
        if (!this.everOpened) this.fail("network")
    }
  }

  /** The signaling server dropped us. Open P2P links survive; reconnect for new ones. */
  private onSignalingLost(peer: Peer) {
    if (this.closed || peer !== this.peer || peer.destroyed) return
    window.clearTimeout(this.signalTimer)
    const wait = Math.min(15_000, 1_000 * 2 ** this.signalFailures++)
    this.signalTimer = window.setTimeout(() => this.reconnectSignaling(), wait)
  }

  private reconnectSignaling() {
    const peer = this.peer
    if (this.closed || peer.destroyed || !peer.disconnected) return
    try {
      peer.reconnect()
    } catch {
      this.onSignalingLost(peer)
    }
  }

  /** Coming back to the app (iOS freezes background pages) or back online: catch up at once. */
  private onWake = () => {
    if (this.closed || document.visibilityState === "hidden") return
    if (this.peer.disconnected) this.reconnectSignaling()
    if (this.role === "guest" && !this.conn && this.retryTimer !== undefined) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = undefined
      this.attemptConnection()
    }
  }

  // Guest: connecting ---------------------------------------------------------------------

  private connectToHost() {
    if (this.closed) return
    this.pending?.close()
    const meta: ConnectMeta = { v: PROTOCOL_VERSION, clientId: this.clientId }
    const conn = this.peer.connect(hostPeerId(this.code), { reliable: true, serialization: "raw", metadata: meta })
    if (!conn) return // Disconnected from signaling: the reconnect will try again.
    this.pending = conn
    this.wire(conn)
    window.clearTimeout(this.attemptTimer)
    this.attemptTimer = window.setTimeout(() => {
      if (this.pending !== conn) return
      this.pending = null
      conn.close()
      this.retry()
    }, ATTEMPT_TIMEOUT_MS)
  }

  private attemptConnection() {
    if (this.peer.disconnected) this.reconnectSignaling()
    else this.connectToHost()
  }

  private retry() {
    if (this.closed || this.conn || this.retryTimer !== undefined) return
    if (performance.now() > this.retryDeadline) {
      this.fail(this.everConnected ? "lost" : "not-found")
      return
    }
    const wait = RETRY_DELAYS_MS[Math.min(this.retries++, RETRY_DELAYS_MS.length - 1)]
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined
      this.attemptConnection()
    }, wait)
  }

  // Host: accepting -----------------------------------------------------------------------

  private onIncomingConnection(conn: DataConnection) {
    if (this.closed || this.role !== "host") {
      conn.close()
      return
    }
    const meta = parseConnectMeta(conn.metadata)
    if (!meta) {
      conn.close()
      return
    }
    const reason =
      meta.v !== PROTOCOL_VERSION
        ? "version"
        : this.partnerAlive() && meta.clientId !== this.partnerClientId
          ? "busy"
          : null
    if (reason) {
      conn.on("open", () => {
        void conn.send(JSON.stringify({ t: "reject", reason } satisfies ControlMessage))
        window.setTimeout(() => conn.close(), BYE_FLUSH_MS)
      })
      return
    }
    // The same guest coming back, or a new one after the last one went quiet: take over.
    if (this.conn) this.dropConnection()
    this.partnerClientId = meta.clientId
    this.wire(conn)
  }

  private partnerAlive(): boolean {
    return Boolean(this.conn?.open) && performance.now() - this.lastHeard < SILENCE_MS
  }

  // Data connection -----------------------------------------------------------------------

  private wire(conn: DataConnection) {
    conn.on("open", () => this.onOpen(conn))
    conn.on("data", (data) => this.onData(conn, data))
    conn.on("close", () => this.onConnectionClosed(conn))
    conn.on("error", () => {
      // A close event follows.
    })
  }

  private onOpen(conn: DataConnection) {
    if (this.closed) {
      conn.close()
      return
    }
    if (this.pending === conn) {
      this.pending = null
      window.clearTimeout(this.attemptTimer)
    }
    this.conn = conn
    this.helloReceived = false
    this.announced = false
    this.clock.reset()
    this.assembler.clear()
    this.lastHeard = performance.now()
    this.send({ t: "hello", v: PROTOCOL_VERSION })
    this.startPings(conn)
  }

  private onData(conn: DataConnection, data: unknown) {
    if (conn !== this.conn) return
    this.lastHeard = performance.now()
    if (typeof data === "string") {
      const message = parseMessage(data)
      if (!message) return
      if (isControlMessage(message)) this.onControl(message)
      else this.emit({ type: "message", message })
    } else if (data instanceof ArrayBuffer) {
      const done = this.assembler.push(data)
      if (!done) return
      const { sessionId, index, shotId, width, height } = done.meta
      const blob = new Blob([done.data], { type: "image/jpeg" })
      this.emit({ type: "shot", shot: { sessionId, index, shotId, width, height, blob } })
    }
  }

  private onControl(message: ControlMessage) {
    switch (message.t) {
      case "hello":
        if (message.v !== PROTOCOL_VERSION) {
          this.fail("version")
          return
        }
        this.helloReceived = true
        this.announceIfReady()
        return
      case "reject":
        this.fail(message.reason)
        return
      case "bye":
        this.teardown()
        this.peer.destroy()
        this.emit({ type: "partner-left" })
        return
      case "ping":
        this.send({ t: "pong", echo: message.at, at: performance.now() })
        return
      case "pong":
        this.clock.add(message.echo, message.at, performance.now())
        this.announceIfReady()
        return
      case "shot":
        this.assembler.begin(message)
        return
    }
  }

  /** Connected once hello went both ways; a guest also waits for its first clock sample. */
  private announceIfReady() {
    if (this.announced || !this.helloReceived) return
    if (this.role === "guest" && !this.clock.synced) return
    this.announced = true
    this.everConnected = true
    this.retries = 0
    window.clearTimeout(this.lostTimer)
    this.emit({ type: "connected" })
    this.syncOutgoingCall()
  }

  private startPings(conn: DataConnection) {
    window.clearTimeout(this.pingTimer)
    let sent = 0
    const tick = () => {
      if (conn !== this.conn || !conn.open) return
      if (performance.now() - this.lastHeard > SILENCE_MS) {
        conn.close() // Runs the close path below.
        return
      }
      this.send({ t: "ping", at: performance.now() })
      sent++
      this.pingTimer = window.setTimeout(tick, sent < PING_BURST ? PING_BURST_MS : PING_MS)
    }
    tick()
  }

  private onConnectionClosed(conn: DataConnection) {
    if (conn === this.pending) {
      this.pending = null
      window.clearTimeout(this.attemptTimer)
      this.retry()
      return
    }
    if (conn !== this.conn || this.closed) return
    const wasAnnounced = this.announced
    this.dropConnection()
    if (wasAnnounced) this.emit({ type: "interrupted" })
    if (this.role === "guest") {
      this.retries = 0
      this.retryDeadline = performance.now() + (this.everConnected ? RECONNECT_TIMEOUT_MS : JOIN_TIMEOUT_MS)
      this.retry()
    } else if (wasAnnounced) {
      window.clearTimeout(this.lostTimer)
      this.lostTimer = window.setTimeout(() => this.fail("lost"), RECONNECT_TIMEOUT_MS)
    }
  }

  /** Forgets the current connection without reporting anything. */
  private dropConnection() {
    const conn = this.conn
    this.conn = null
    this.announced = false
    this.helloReceived = false
    window.clearTimeout(this.pingTimer)
    this.assembler.clear()
    this.closeCalls()
    conn?.close()
  }

  private async drained(conn: DataConnection) {
    const buffered = () =>
      (conn.dataChannel?.bufferedAmount ?? 0) + ((conn as DataConnection & { bufferSize?: number }).bufferSize ?? 0)
    while (conn.open && buffered() > DRAINED_BYTES) await delay(50)
  }

  // Live preview --------------------------------------------------------------------------

  private syncOutgoingCall() {
    const partner = this.conn?.peer
    if (!partner || !this.announced) return
    const stream = this.localStream
    const track = stream?.getVideoTracks()[0]
    if (!stream || !track || track.readyState === "ended") {
      this.closeOutgoing()
      return
    }
    const current = this.outgoing
    const sender = videoSender(current)
    if (current && sender) {
      if (sender.track === track) return
      // A new camera (flip, restart): swap the track in place, no renegotiation.
      sender.replaceTrack(track).then(
        () => limitPreview(current, track),
        () => {
          if (this.outgoing !== current) return
          this.closeOutgoing()
          this.syncOutgoingCall()
        }
      )
      return
    }
    this.closeOutgoing()
    const call = this.peer.call(partner, stream, { metadata: { clientId: this.clientId } })
    if (!call) return
    this.outgoing = call
    call.on("close", () => {
      if (this.outgoing === call) this.outgoing = null
    })
    call.on("error", () => {})
    limitPreview(call, track)
  }

  private onIncomingCall(call: MediaConnection) {
    // Only the partner on the current connection may send us video.
    if (this.closed || !this.conn || call.peer !== this.conn.peer) {
      call.close()
      return
    }
    this.incoming?.close()
    this.incoming = call
    call.on("stream", (stream) => {
      if (this.incoming === call) this.emit({ type: "remote-stream", stream })
    })
    call.on("close", () => {
      if (this.incoming !== call) return
      this.incoming = null
      this.emit({ type: "remote-stream", stream: null })
    })
    call.on("error", () => {})
    call.answer()
  }

  private closeOutgoing() {
    const call = this.outgoing
    this.outgoing = null
    call?.close()
  }

  private closeCalls() {
    this.closeOutgoing()
    const incoming = this.incoming
    this.incoming = null
    incoming?.close()
    if (incoming) this.emit({ type: "remote-stream", stream: null })
  }

  // Lifecycle -----------------------------------------------------------------------------

  private fail(error: LinkError) {
    if (this.closed) return
    this.teardown()
    this.peer.destroy()
    this.emit({ type: "failed", error })
  }

  /** Stops all timers and connections; later PeerJS events are ignored. */
  private teardown() {
    this.closed = true
    window.removeEventListener("online", this.onWake)
    document.removeEventListener("visibilitychange", this.onWake)
    window.clearTimeout(this.signalTimer)
    window.clearTimeout(this.retryTimer)
    window.clearTimeout(this.attemptTimer)
    window.clearTimeout(this.pingTimer)
    window.clearTimeout(this.lostTimer)
    this.retryTimer = undefined
    this.pending?.close()
    this.pending = null
    const conn = this.conn
    this.conn = null
    this.closeOutgoing()
    this.incoming?.close()
    this.incoming = null
    this.assembler.clear()
    // Close the data connection after the goodbye had a moment to go out.
    if (conn) window.setTimeout(() => conn.close(), BYE_FLUSH_MS)
  }
}
