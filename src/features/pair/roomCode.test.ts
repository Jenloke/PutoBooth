import { describe, expect, it } from "vitest"

import {
  ROOM_CODE_LENGTH,
  formatRoomCode,
  generateRoomCode,
  guestPeerId,
  hostPeerId,
  inviteUrl,
  parseRoomCode,
} from "./roomCode"

describe("room codes", () => {
  it("generates codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode()
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/)
      expect(parseRoomCode(code)).toBe(code)
    }
  })

  it("maps every byte value onto the alphabet", () => {
    const code = generateRoomCode((bytes) => bytes.map((_, i) => [0, 31, 32, 255, 10, 18][i]))
    expect(code).toBe("0Z0ZAJ")
  })

  it("accepts what people type", () => {
    expect(parseRoomCode("k7m-4qd")).toBe("K7M4QD")
    expect(parseRoomCode(" K7M 4QD ")).toBe("K7M4QD")
    expect(parseRoomCode("ABC-ILO")).toBe("ABC110")
  })

  it("rejects incomplete or foreign codes", () => {
    expect(parseRoomCode("")).toBeNull()
    expect(parseRoomCode("K7M4Q")).toBeNull()
    expect(parseRoomCode("K7M4QDX")).toBeNull()
    expect(parseRoomCode("K7M4Q!")).toBeNull()
    expect(parseRoomCode("UUUUUU")).toBeNull()
  })

  it("formats codes in two groups", () => {
    expect(formatRoomCode("K7M4QD")).toBe("K7M-4QD")
  })

  it("derives valid PeerJS ids", () => {
    // PeerJS: alphanumeric at both ends, dashes and underscores in between.
    const valid = /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/
    expect(hostPeerId("K7M4QD")).toMatch(valid)
    expect(guestPeerId("3f2b1c9e-0d4a-4c7b-9e1f-2a3b4c5d6e7f")).toMatch(valid)
  })

  it("builds the invite link", () => {
    expect(inviteUrl("K7M4QD", "https://booth.example")).toBe("https://booth.example/?join=K7M4QD")
  })
})
