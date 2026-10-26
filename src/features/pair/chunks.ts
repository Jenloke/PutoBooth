/**
 * Binary framing for photos on the data channel. Each frame is a 4-byte big-endian transfer id
 * followed by up to 16 KiB − 4 bytes of payload; 16 KiB messages work between every browser.
 * The channel is reliable and ordered, so a transfer's frames arrive complete and in order,
 * and transfers can interleave because every frame carries its id.
 */
export const FRAME_BYTES = 16 * 1024
const HEADER_BYTES = 4
export const FRAME_PAYLOAD_BYTES = FRAME_BYTES - HEADER_BYTES

export function* encodeFrames(transferId: number, data: Uint8Array): Generator<ArrayBuffer> {
  for (let offset = 0; offset < data.byteLength; offset += FRAME_PAYLOAD_BYTES) {
    const payload = data.subarray(offset, offset + FRAME_PAYLOAD_BYTES)
    const frame = new Uint8Array(HEADER_BYTES + payload.byteLength)
    new DataView(frame.buffer).setUint32(0, transferId)
    frame.set(payload, HEADER_BYTES)
    yield frame.buffer
  }
}

export function decodeFrame(frame: ArrayBuffer): { transferId: number; payload: Uint8Array } | null {
  if (frame.byteLength <= HEADER_BYTES || frame.byteLength > FRAME_BYTES) return null
  return {
    transferId: new DataView(frame).getUint32(0),
    payload: new Uint8Array(frame, HEADER_BYTES),
  }
}

interface Pending<Meta> {
  meta: Meta
  data: Uint8Array<ArrayBuffer>
  received: number
}

/**
 * Reassembles transfers announced by a header (`begin`) from their frames (`push`). The buffer
 * is allocated once at the announced size, so a transfer costs one copy per frame. At most
 * `maxPending` transfers are kept; a new one evicts the oldest.
 */
export class TransferAssembler<Meta extends { transferId: number; size: number }> {
  private pending = new Map<number, Pending<Meta>>()
  private readonly maxPending: number

  constructor(maxPending = 4) {
    this.maxPending = maxPending
  }

  begin(meta: Meta): void {
    this.pending.delete(meta.transferId)
    while (this.pending.size >= this.maxPending) {
      const oldest = this.pending.keys().next().value
      if (oldest === undefined) break
      this.pending.delete(oldest)
    }
    this.pending.set(meta.transferId, { meta, data: new Uint8Array(meta.size), received: 0 })
  }

  /** Adds a frame; returns the transfer once its last byte arrived. Bad frames drop their transfer. */
  push(frame: ArrayBuffer): { meta: Meta; data: Uint8Array<ArrayBuffer> } | null {
    const decoded = decodeFrame(frame)
    if (!decoded) return null
    const entry = this.pending.get(decoded.transferId)
    if (!entry) return null
    const end = entry.received + decoded.payload.byteLength
    if (end > entry.data.byteLength) {
      this.pending.delete(decoded.transferId)
      return null
    }
    entry.data.set(decoded.payload, entry.received)
    entry.received = end
    if (end < entry.data.byteLength) return null
    this.pending.delete(decoded.transferId)
    return { meta: entry.meta, data: entry.data }
  }

  get size(): number {
    return this.pending.size
  }

  clear(): void {
    this.pending.clear()
  }
}
