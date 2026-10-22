import { describe, expect, it } from "vitest"

import {
  FILTERS,
  applyFilterToPixels,
  getFilter,
  toColorMatrix,
  toCssFilter,
  type FilterOp,
} from "./filters"

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]

function pixel(r: number, g: number, b: number, a = 255) {
  return new Uint8ClampedArray([r, g, b, a])
}

function run(ops: readonly FilterOp[], r: number, g: number, b: number) {
  const data = pixel(r, g, b)
  applyFilterToPixels(data, ops)
  return Array.from(data)
}

function expectMatrixClose(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(12)
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6))
}

describe("toColorMatrix", () => {
  it("is the identity for neutral amounts", () => {
    const neutral: FilterOp[] = [
      { fn: "grayscale", amount: 0 },
      { fn: "sepia", amount: 0 },
      { fn: "saturate", amount: 1 },
      { fn: "brightness", amount: 1 },
      { fn: "contrast", amount: 1 },
      { fn: "invert", amount: 0 },
      { fn: "hue-rotate", deg: 0 },
      { fn: "hue-rotate", deg: 360 },
    ]
    for (const op of neutral) expectMatrixClose(toColorMatrix(op), IDENTITY)
  })

  it("matches the Filter Effects spec for full grayscale and sepia", () => {
    expectMatrixClose(toColorMatrix({ fn: "grayscale", amount: 1 }), [
      0.2126, 0.7152, 0.0722, 0, 0.2126, 0.7152, 0.0722, 0, 0.2126, 0.7152, 0.0722, 0,
    ])
    expectMatrixClose(toColorMatrix({ fn: "sepia", amount: 1 }), [
      0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0,
    ])
  })

  it("clamps grayscale, sepia and invert amounts to 1 like CSS", () => {
    expectMatrixClose(
      toColorMatrix({ fn: "grayscale", amount: 3 }),
      toColorMatrix({ fn: "grayscale", amount: 1 })
    )
    expectMatrixClose(
      toColorMatrix({ fn: "sepia", amount: 2 }),
      toColorMatrix({ fn: "sepia", amount: 1 })
    )
  })

  it("models contrast and invert as slope + intercept", () => {
    expectMatrixClose(toColorMatrix({ fn: "contrast", amount: 2 }), [
      2, 0, 0, -0.5, 0, 2, 0, -0.5, 0, 0, 2, -0.5,
    ])
    expectMatrixClose(toColorMatrix({ fn: "invert", amount: 1 }), [
      -1, 0, 0, 1, 0, -1, 0, 1, 0, 0, -1, 1,
    ])
  })
})

describe("applyFilterToPixels", () => {
  it("leaves pixels untouched with no ops", () => {
    expect(run([], 12, 34, 56)).toEqual([12, 34, 56, 255])
  })

  it("converts to luma-weighted gray", () => {
    // 0.2126 * 255 = 54.2
    expect(run([{ fn: "grayscale", amount: 1 }], 255, 0, 0)).toEqual([54, 54, 54, 255])
    expect(run([{ fn: "grayscale", amount: 1 }], 0, 255, 0)).toEqual([182, 182, 182, 255])
  })

  it("tints white with sepia and clamps overflow", () => {
    // Row sums are 1.351, 1.203, 0.937: red and green clip at 255.
    expect(run([{ fn: "sepia", amount: 1 }], 255, 255, 255)).toEqual([255, 255, 239, 255])
  })

  it("applies brightness and contrast around mid-gray", () => {
    expect(run([{ fn: "brightness", amount: 0.5 }], 200, 100, 50)).toEqual([100, 50, 25, 255])
    expect(run([{ fn: "contrast", amount: 2 }], 128, 64, 192)).toEqual([128, 0, 255, 255])
  })

  it("clamps between steps, in order", () => {
    // brightness(2) clips 200 → 255, then brightness(0.5) gives 128 (not 200).
    const ops: FilterOp[] = [
      { fn: "brightness", amount: 2 },
      { fn: "brightness", amount: 0.5 },
    ]
    expect(run(ops, 200, 200, 200)).toEqual([128, 128, 128, 255])
  })

  it("never touches alpha", () => {
    const data = pixel(10, 20, 30, 77)
    applyFilterToPixels(data, getFilter("vivid").ops)
    expect(data[3]).toBe(77)
  })

  it("keeps grays gray under hue-rotate and saturate", () => {
    const [r, g, b] = run(
      [
        { fn: "hue-rotate", deg: 90 },
        { fn: "saturate", amount: 1.8 },
      ],
      120,
      120,
      120
    )
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1)
  })

  it("gives Cool a blue cast and Warm a yellow cast on neutral gray", () => {
    const [cr, , cb] = run(getFilter("cool").ops, 128, 128, 128)
    expect(cb).toBeGreaterThan(cr)
    const [wr, , wb] = run(getFilter("warm").ops, 128, 128, 128)
    expect(wr).toBeGreaterThan(wb)
  })

  it("turns every pixel gray for B&W and Noir", () => {
    for (const id of ["bw", "noir"] as const) {
      const [r, g, b] = run(getFilter(id).ops, 200, 90, 30)
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1)
    }
  })
})

describe("toCssFilter", () => {
  it("serializes the same ops the export uses", () => {
    expect(toCssFilter([])).toBe("none")
    expect(toCssFilter(getFilter("noir").ops)).toBe("grayscale(1) contrast(1.45) brightness(0.92)")
    expect(toCssFilter([{ fn: "hue-rotate", deg: -12 }])).toBe("hue-rotate(-12deg)")
  })

  it("produces a valid CSS filter for every filter", () => {
    for (const filter of FILTERS) {
      const css = toCssFilter(filter.ops)
      expect(css).toMatch(/^(none|([a-z-]+\(-?[\d.]+(deg)?\)( |$))+)$/)
    }
  })
})
