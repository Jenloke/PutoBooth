/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Shared booth signaling: a self-hosted PeerServer instead of the PeerJS cloud server. */
  readonly VITE_PEER_HOST?: string
  readonly VITE_PEER_PORT?: string
  readonly VITE_PEER_PATH?: string
  /** "false" for a plain ws:// server (local testing only). */
  readonly VITE_PEER_SECURE?: string
  /** JSON array of RTCIceServer objects (e.g. your own TURN server); "[]" for none. */
  readonly VITE_ICE_SERVERS?: string
  /** Set by Vercel on its builds ("production", "preview" or "development"); turns on Web Analytics. */
  readonly VITE_VERCEL_ENV?: string
}
