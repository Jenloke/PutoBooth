import { describe, expect, it } from "vitest"

import { FRAME_BYTES, FRAME_PAYLOAD_BYTES, TransferAssembler, decodeFrame, encodeFrames } from "./chunks"

function bytes(length: number, seed = 1): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 31 + seed) & 0xff)
}

describe("frames", () => {
  it("splits data into frames no larger than 16 KiB, tagged with the transfer id", () => {
    const data = bytes(FRAME_PAYLOAD_BYTES * 2 + 100)
    const frames = [...encodeFrames(0xdeadbeef, data)]
    expect(frames.map((f) => f.byteLength)).toEqual([FRAME_BYTES, FRAME_BYTES, 104])
    for (const frame of frames) expect(decodeFrame(frame)?.transferId).toBe(0xdeadbeef)
  })

  it("rejects frames without payload or over the size limit", () => {
    expect(decodeFrame(new ArrayBuffer(4))).toBeNull()
    expect(decodeFrame(new ArrayBuffer(FRAME_BYTES + 1))).toBeNull()
  })
})

describe("TransferAssembler", () => {
  const meta = (transferId: number, size: number) => ({ transferId, size })

  it("reassembles a transfer, even interleaved with another", () => {
    const a = bytes(40_000, 1)
    const b = bytes(20_000, 7)
    const assembler = new TransferAssembler()
    assembler.begin(meta(1, a.byteLength))
    assembler.begin(meta(2, b.byteLength))

    const framesA = [...encodeFrames(1, a)]
    const framesB = [...encodeFrames(2, b)]
    const done: { id: number; data: Uint8Array }[] = []
    for (let i = 0; i < Math.max(framesA.length, framesB.length); i++) {
      for (const frame of [framesA[i], framesB[i]]) {
        if (!frame) continue
        const result = assembler.push(frame)
        if (result) done.push({ id: result.meta.transferId, data: result.data })
      }
    }

    expect(done.map((d) => d.id)).toEqual([2, 1])
    expect(done.find((d) => d.id === 1)?.data).toEqual(a)
    expect(done.find((d) => d.id === 2)?.data).toEqual(b)
    expect(assembler.size).toBe(0)
  })

  it("ignores frames of transfers it never saw", () => {
    const assembler = new TransferAssembler()
    expect(assembler.push([...encodeFrames(9, bytes(10))][0])).toBeNull()
  })

  it("drops a transfer that sends more than it announced", () => {
    const assembler = new TransferAssembler()
    assembler.begin(meta(1, 10))
    expect(assembler.push([...encodeFrames(1, bytes(11))][0])).toBeNull()
    expect(assembler.size).toBe(0)
  })

  it("keeps a bounded number of transfers, evicting the oldest", () => {
    const assembler = new TransferAssembler(2)
    assembler.begin(meta(1, 5))
    assembler.begin(meta(2, 5))
    assembler.begin(meta(3, 5))
    expect(assembler.size).toBe(2)
    expect(assembler.push([...encodeFrames(1, bytes(5))][0])).toBeNull()
    expect(assembler.push([...encodeFrames(3, bytes(5))][0])?.meta.transferId).toBe(3)
  })

  it("restarts a transfer announced again", () => {
    const assembler = new TransferAssembler()
    assembler.begin(meta(1, 4))
    assembler.push([...encodeFrames(1, bytes(2))][0])
    assembler.begin(meta(1, 4))
    expect(assembler.push([...encodeFrames(1, bytes(4, 3))][0])?.data).toEqual(bytes(4, 3))
  })
})
