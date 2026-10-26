import { describe, expect, it } from "vitest"

import { computeLayout, computePrintSheet, slotParts, type Rect } from "./computeLayout"
import {
  LAYOUTS,
  PRINT_SHEET,
  getLayout,
  isStrip,
  layoutsWithShotCount,
  shotCount,
  withPadding,
  type LayoutId,
} from "./layouts"

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

const expected: Record<
  LayoutId,
  { width: number; height: number; slots: Rect[]; footer: Rect }
> = {
  classic: {
    width: 600,
    height: 1800,
    slots: [rect(30, 30, 540, 360), rect(30, 420, 540, 360), rect(30, 810, 540, 360), rect(30, 1200, 540, 360)],
    footer: rect(30, 1560, 540, 210),
  },
  trio: {
    width: 600,
    height: 1800,
    slots: [rect(30, 30, 540, 405), rect(30, 465, 540, 405), rect(30, 900, 540, 405)],
    footer: rect(30, 1305, 540, 465),
  },
  grid: {
    width: 1200,
    height: 1800,
    slots: [rect(40, 40, 540, 720), rect(620, 40, 540, 720), rect(40, 800, 540, 720), rect(620, 800, 540, 720)],
    footer: rect(40, 1520, 1120, 240),
  },
  "six-pack": {
    width: 1200,
    height: 1800,
    slots: [
      rect(85, 50, 500, 500),
      rect(615, 50, 500, 500),
      rect(85, 580, 500, 500),
      rect(615, 580, 500, 500),
      rect(85, 1110, 500, 500),
      rect(615, 1110, 500, 500),
    ],
    footer: rect(50, 1610, 1100, 140),
  },
  postcard: {
    width: 1800,
    height: 1200,
    slots: [rect(180, 60, 1440, 960)],
    footer: rect(60, 1020, 1680, 120),
  },
  instant: {
    width: 1050,
    height: 1260,
    slots: [rect(60, 60, 930, 930)],
    footer: rect(60, 990, 930, 210),
  },
  square: {
    width: 1080,
    height: 1080,
    slots: [rect(90, 40, 440, 440), rect(550, 40, 440, 440), rect(90, 500, 440, 440), rect(550, 500, 440, 440)],
    footer: rect(40, 940, 1000, 100),
  },
}

describe("computeLayout at 300 DPI", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.name} has exact pixel geometry`, () => {
      const result = computeLayout(layout, 300)
      const want = expected[layout.id]
      expect({ width: result.width, height: result.height }).toEqual({
        width: want.width,
        height: want.height,
      })
      expect(result.slots).toEqual(want.slots)
      expect(result.footer).toEqual(want.footer)
    })
  }

  it("covers every layout", () => {
    expect(Object.keys(expected).sort()).toEqual(LAYOUTS.map((l) => l.id).sort())
  })

  it("produces one slot per shot, each at the layout's photo aspect ratio", () => {
    for (const layout of LAYOUTS) {
      const { slots } = computeLayout(layout)
      expect(slots).toHaveLength(shotCount(layout))
      for (const slot of slots) {
        expect(slot.w / slot.h).toBeCloseTo(layout.aspect.w / layout.aspect.h, 2)
      }
    }
  })

  it("keeps every slot and the footer inside the canvas without overlaps", () => {
    for (const layout of LAYOUTS) {
      const { width, height, slots, footer } = computeLayout(layout)
      const rects = footer ? [...slots, footer] : slots
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0)
        expect(r.y).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w).toBeLessThanOrEqual(width)
        expect(r.y + r.h).toBeLessThanOrEqual(height)
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]
          const b = rects[j]
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
          expect(overlap, `${layout.id} rects ${i} and ${j}`).toBe(false)
        }
      }
    }
  })

  it("centers the photo grid horizontally", () => {
    for (const layout of LAYOUTS) {
      const { width, slots } = computeLayout(layout)
      const left = Math.min(...slots.map((s) => s.x))
      const right = width - Math.max(...slots.map((s) => s.x + s.w))
      expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    }
  })

  it("scales inch layouts with DPI and keeps pixel layouts fixed", () => {
    const classic = computeLayout(getLayout("classic"), 150)
    expect([classic.width, classic.height]).toEqual([300, 900])
    expect(classic.slots[0]).toEqual(rect(15, 15, 270, 180))
    const square = computeLayout(getLayout("square"), 150)
    expect([square.width, square.height]).toEqual([1080, 1080])
  })
})

describe("padding", () => {
  it("scales margins and gaps but never the canvas size", () => {
    const classic = getLayout("classic")
    for (const scale of [0, 0.5, 2]) {
      const result = computeLayout(withPadding(classic, scale))
      expect([result.width, result.height]).toEqual([600, 1800])
    }
    const doubled = computeLayout(withPadding(classic, 2))
    expect(doubled.slots[0].x).toBeGreaterThan(30)
    expect(doubled.slots[1].y - (doubled.slots[0].y + doubled.slots[0].h)).toBe(60)
  })

  it("at zero lets photos touch while keeping their aspect ratio", () => {
    const { slots } = computeLayout(withPadding(getLayout("grid"), 0))
    expect(slots[1].x).toBe(slots[0].x + slots[0].w)
    for (const s of slots) expect(s.w / s.h).toBeCloseTo(0.75, 2)
  })
})

describe("print sheet", () => {
  it("puts two 2×6 strips side by side on a 1200×1800 sheet", () => {
    const strip = computeLayout(getLayout("classic"))
    const sheet = computePrintSheet(strip, PRINT_SHEET, 300)
    expect([sheet.width, sheet.height]).toEqual([1200, 1800])
    expect(sheet.placements).toEqual([rect(0, 0, 600, 1800), rect(600, 0, 600, 1800)])
  })
})

describe("layout catalog", () => {
  it("identifies 2×6 strips", () => {
    expect(LAYOUTS.filter(isStrip).map((l) => l.id)).toEqual(["classic", "trio"])
  })

  it("groups layouts that can share shots", () => {
    expect(layoutsWithShotCount(4).map((l) => l.id)).toEqual(["classic", "grid", "square"])
    expect(layoutsWithShotCount(1).map((l) => l.id)).toEqual(["postcard", "instant"])
  })
})

describe("shared slots", () => {
  const area = (r: Rect) => r.w * r.h

  it("keeps a single photo as the whole slot", () => {
    expect(slotParts(rect(30, 30, 540, 360), 1)).toEqual([rect(30, 30, 540, 360)])
  })

  it("puts two photos side by side in landscape slots, as 3:4 portraits for a classic strip", () => {
    // 2.5% of the 360 px side is a 9 px seam.
    expect(slotParts(rect(30, 30, 540, 360), 2)).toEqual([rect(30, 30, 265, 360), rect(304, 30, 266, 360)])
  })

  it("stacks two photos in portrait slots", () => {
    const [top, bottom] = slotParts(rect(40, 40, 540, 720), 2)
    expect(top).toEqual(rect(40, 40, 540, 353))
    expect(bottom.y).toBe(top.y + top.h + 14)
    expect(bottom.y + bottom.h).toBe(40 + 720)
  })

  it("splits square slots side by side", () => {
    const [left, right] = slotParts(rect(0, 0, 500, 500), 2)
    expect(left.h).toBe(500)
    expect(right.x + right.w).toBe(500)
  })

  it("tiles the slot exactly for every layout, and scales the seam with padding", () => {
    for (const layout of LAYOUTS) {
      for (const slot of computeLayout(layout).slots) {
        for (const padding of [0, 1, 2]) {
          const parts = slotParts(slot, 2, padding)
          const horizontal = slot.w >= slot.h
          const seam = horizontal ? parts[1].x - (parts[0].x + parts[0].w) : parts[1].y - (parts[0].y + parts[0].h)
          expect(area(parts[0]) + area(parts[1]) + seam * (horizontal ? slot.h : slot.w)).toBe(area(slot))
          expect(Math.abs(area(parts[0]) - area(parts[1]))).toBeLessThanOrEqual(Math.max(slot.w, slot.h))
          if (padding === 0) expect(seam).toBe(0)
        }
      }
    }
  })
})
