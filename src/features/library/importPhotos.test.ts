import { describe, expect, it, vi } from "vitest"

import type { Shot } from "@/features/booth/session"

import { assignToSlots, fitPixels, importPhotos, importSummary } from "./importPhotos"

vi.stubGlobal("URL", { ...URL, createObjectURL: () => `blob:${Math.random()}`, revokeObjectURL: () => {} })

function fakeShot(name: string): Shot {
  return { id: name, blob: new Blob([name]), url: `blob:${name}`, width: 4, height: 3 }
}

/** Decodes "ok-*" blobs; anything else fails, like HEIC outside Safari. */
async function fakeDecode(file: Blob): Promise<Shot> {
  const name = await file.text()
  if (!name.startsWith("ok")) throw new Error("can't decode")
  return fakeShot(name)
}

const files = (...names: string[]) => names.map((name) => new Blob([name]))

describe("assignToSlots", () => {
  it("fills slots in the order the photos were picked", () => {
    expect(assignToSlots(4, 4)).toEqual([0, 1, 2, 3])
  })

  it("repeats from the first photo when there are fewer photos than slots", () => {
    expect(assignToSlots(2, 4)).toEqual([0, 1, 0, 1])
    expect(assignToSlots(1, 3)).toEqual([0, 0, 0])
  })

  it("has nothing to assign without photos", () => {
    expect(assignToSlots(0, 4)).toEqual([])
  })
})

describe("fitPixels", () => {
  it("keeps photos under the cap at their size", () => {
    expect(fitPixels(4032, 3024)).toEqual({ width: 4032, height: 3024 })
  })

  it("scales larger photos under the iOS canvas limit, keeping the aspect", () => {
    const { width, height } = fitPixels(8000, 6000)
    expect(width * height).toBeLessThanOrEqual(14_000_000 + 8000)
    expect(width / height).toBeCloseTo(4 / 3, 2)
  })
})

describe("importPhotos", () => {
  it("makes one shot per slot from exactly enough photos", async () => {
    const result = await importPhotos(files("ok-a", "ok-b", "ok-c", "ok-d"), 4, fakeDecode)
    expect(result.shots.map((s) => s.id)).toEqual(["ok-a", "ok-b", "ok-c", "ok-d"])
    expect(result).toMatchObject({ used: 4, failed: 0, extra: 0 })
  })

  it("repeats photos to fill the layout, each repeat with its own URL", async () => {
    const result = await importPhotos(files("ok-a", "ok-b"), 4, fakeDecode)
    expect(result.shots).toHaveLength(4)
    expect(result.shots[2].blob).toBe(result.shots[0].blob)
    expect(new Set(result.shots.map((s) => s.url)).size).toBe(4)
    expect(new Set(result.shots.map((s) => s.id)).size).toBe(4)
    expect(result.used).toBe(2)
  })

  it("skips photos it can't open and uses the next ones", async () => {
    const result = await importPhotos(files("heic", "ok-a", "ok-b", "ok-c", "ok-d"), 4, fakeDecode)
    expect(result.shots.map((s) => s.id)).toEqual(["ok-a", "ok-b", "ok-c", "ok-d"])
    expect(result).toMatchObject({ used: 4, failed: 1, extra: 0 })
  })

  it("reports photos beyond what the layout holds", async () => {
    const result = await importPhotos(files("ok-a", "ok-b", "ok-c"), 1, fakeDecode)
    expect(result.shots.map((s) => s.id)).toEqual(["ok-a"])
    expect(result.extra).toBe(2)
  })

  it("returns no shots when nothing could be opened", async () => {
    const result = await importPhotos(files("heic", "raw"), 4, fakeDecode)
    expect(result.shots).toEqual([])
    expect(result).toMatchObject({ used: 0, failed: 2 })
  })
})

describe("importSummary", () => {
  const result = (used: number, failed = 0, extra = 0) => ({ shots: [], used, failed, extra })

  it("says nothing when the photos fill the layout exactly", () => {
    expect(importSummary(result(4), 4)).toBeNull()
  })

  it("explains repeats, and how to replace them", () => {
    expect(importSummary(result(2), 4)).toEqual({
      title: "2 photos for 4 spots, so some repeat",
      description: "Tap a photo to replace it.",
    })
    expect(importSummary(result(2), 4, "Click")?.description).toBe("Click a photo to replace it.")
  })

  it("mentions photos that couldn't be opened or didn't fit", () => {
    expect(importSummary(result(1, 1), 1)).toEqual({ title: "1 photo couldn't be opened.", description: undefined })
    expect(importSummary(result(4, 0, 2), 4)).toEqual({
      title: "This layout holds 4, so the first 4 are in.",
      description: undefined,
    })
  })
})
