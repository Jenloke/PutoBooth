import { describe, expect, it } from "vitest"

import { coverCrop } from "./crop"

describe("coverCrop", () => {
  it("crops the sides of a wide frame (Mac 1080p into a 3:2 slot)", () => {
    expect(coverCrop(1920, 1080, 3 / 2)).toEqual({ sx: 150, sy: 0, sw: 1620, sh: 1080 })
  })

  it("crops top and bottom of a tall frame (iPhone portrait into a 3:2 slot)", () => {
    expect(coverCrop(1080, 1920, 3 / 2)).toEqual({ sx: 0, sy: 600, sw: 1080, sh: 720 })
  })

  it("handles square slots from both orientations", () => {
    expect(coverCrop(1280, 720, 1)).toEqual({ sx: 280, sy: 0, sw: 720, sh: 720 })
    expect(coverCrop(720, 1280, 1)).toEqual({ sx: 0, sy: 280, sw: 720, sh: 720 })
  })

  it("handles portrait slots (3:4 grid from a 720p webcam)", () => {
    expect(coverCrop(1280, 720, 3 / 4)).toEqual({ sx: 370, sy: 0, sw: 540, sh: 720 })
  })

  it("is the full frame when aspects already match", () => {
    expect(coverCrop(1620, 1080, 1.5)).toEqual({ sx: 0, sy: 0, sw: 1620, sh: 1080 })
  })

  it("always keeps the target aspect ratio and stays centered", () => {
    for (const [w, h] of [[640, 480], [1920, 1080], [3024, 4032], [4032, 3024]]) {
      for (const aspect of [3 / 2, 4 / 3, 3 / 4, 1]) {
        const c = coverCrop(w, h, aspect)
        expect(c.sw / c.sh).toBeCloseTo(aspect, 9)
        expect(c.sx * 2 + c.sw).toBeCloseTo(w, 9)
        expect(c.sy * 2 + c.sh).toBeCloseTo(h, 9)
        expect(c.sw).toBeLessThanOrEqual(w)
        expect(c.sh).toBeLessThanOrEqual(h)
      }
    }
  })

  it("degrades gracefully on empty input", () => {
    expect(coverCrop(0, 0, 1.5)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 })
  })
})
