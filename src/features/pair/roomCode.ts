/**
 * Room codes: 6 characters of Crockford base32 (no I, L, O or U), shown as "K7M-4QD".
 * 32^6 ≈ 1.07 billion codes, and a room only exists while its host has the app open.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
export const ROOM_CODE_LENGTH = 6

/** Namespaces our peer ids on the shared signaling server. */
const PEER_PREFIX = "photobooth-pair"

type Random = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array

export function generateRoomCode(random: Random = defaultRandom): string {
  const bytes = random(new Uint8Array(ROOM_CODE_LENGTH))
  // 256 is a multiple of 32, so masking keeps every character equally likely.
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join("")
}

function defaultRandom(bytes: Uint8Array<ArrayBuffer>): Uint8Array {
  return crypto.getRandomValues(bytes)
}

/**
 * Reads what someone typed or pasted: any case, with spaces or dashes, and the letters people
 * confuse with digits (O → 0, I/L → 1). Returns null unless it's a complete code.
 */
export function parseRoomCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
  if (code.length !== ROOM_CODE_LENGTH) return null
  for (const char of code) if (!ALPHABET.includes(char)) return null
  return code
}

/** "K7M4QD" → "K7M-4QD". */
export function formatRoomCode(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)}-${code.slice(half)}`
}

export function hostPeerId(code: string): string {
  return `${PEER_PREFIX}-${code}`
}

export function guestPeerId(clientId: string): string {
  return `${PEER_PREFIX}-guest-${clientId.replace(/[^A-Za-z0-9]/g, "")}`
}

/** The link a guest opens to join: `https://…/?join=K7M4QD`. */
export const JOIN_PARAM = "join"

export function inviteUrl(code: string, origin: string = window.location.origin): string {
  return `${origin}/?${JOIN_PARAM}=${code}`
}
