import type { PeerOptions } from "peerjs"

/**
 * Where the shared booth finds the other device. Signaling (a few small messages that introduce
 * the devices) goes through the free PeerJS cloud server unless VITE_PEER_* point elsewhere.
 * Photos and video never touch it: they flow device to device, encrypted by WebRTC.
 */
export const DEFAULT_SIGNALING_HOST = "0.peerjs.com"

function iceServers(raw: string | undefined): RTCIceServer[] | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RTCIceServer[]) : undefined
  } catch {
    return undefined
  }
}

export function peerOptions(env: ImportMetaEnv = import.meta.env): PeerOptions {
  // PeerJS logs to the console at level 1 and up; the app reports problems itself.
  const options: PeerOptions = { debug: 0 }
  if (env.VITE_PEER_HOST) {
    options.host = env.VITE_PEER_HOST
    options.port = Number(env.VITE_PEER_PORT) || 443
    options.path = env.VITE_PEER_PATH || "/"
    options.secure = env.VITE_PEER_SECURE !== "false"
  }
  // Without this PeerJS uses its defaults: Google's STUN server plus the PeerJS TURN relays,
  // which get phones on carrier networks connected.
  const servers = iceServers(env.VITE_ICE_SERVERS)
  if (servers) options.config = { iceServers: servers }
  return options
}

export function supportsPeerConnections(): boolean {
  return typeof RTCPeerConnection === "function"
}
