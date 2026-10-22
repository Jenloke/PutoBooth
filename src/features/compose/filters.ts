/**
 * Photo filters, each defined once as a list of CSS filter functions.
 *
 * Preview: the list as a CSS `filter` on the <video>.
 * Export: the same functions as color matrices (Filter Effects Level 1, in sRGB), applied to
 * ImageData in order and clamped after each step, as browsers do for chained filters.
 * We never use CanvasRenderingContext2D.filter: Safari ignores it.
 */

export type FilterOp =
  | {
      fn: "grayscale" | "sepia" | "saturate" | "brightness" | "contrast" | "invert"
      amount: number
    }
  | { fn: "hue-rotate"; deg: number }

export type FilterId =
  | "none"
  | "bw"
  | "noir"
  | "sepia"
  | "warm"
  | "cool"
  | "vintage"
  | "vivid"

export interface FilterDef {
  id: FilterId
  name: string
  ops: readonly FilterOp[]
}

const op = (fn: Exclude<FilterOp["fn"], "hue-rotate">, amount: number): FilterOp => ({
  fn,
  amount,
})

export const FILTERS: readonly FilterDef[] = [
  { id: "none", name: "None", ops: [] },
  { id: "bw", name: "B&W", ops: [op("grayscale", 1), op("contrast", 1.08)] },
  {
    id: "noir",
    name: "Noir",
    ops: [op("grayscale", 1), op("contrast", 1.45), op("brightness", 0.92)],
  },
  { id: "sepia", name: "Sepia", ops: [op("sepia", 0.85), op("contrast", 1.05)] },
  {
    id: "warm",
    name: "Warm",
    ops: [op("sepia", 0.3), op("saturate", 1.3), op("brightness", 1.02)],
  },
  {
    // Hue-rotate and saturate keep grays gray, so a cool cast comes from tinting the
    // inverted image warm (sepia) and inverting back. Invert never clips, so nothing is lost.
    id: "cool",
    name: "Cool",
    ops: [
      op("invert", 1),
      op("sepia", 0.25),
      op("invert", 1),
      op("saturate", 1.15),
      op("brightness", 1.04),
    ],
  },
  {
    id: "vintage",
    name: "Vintage",
    ops: [
      op("sepia", 0.45),
      op("contrast", 0.85),
      op("brightness", 1.06),
      op("saturate", 0.85),
    ],
  },
  { id: "vivid", name: "Vivid", ops: [op("saturate", 1.6), op("contrast", 1.1)] },
]

const BY_ID = new Map(FILTERS.map((filter) => [filter.id, filter]))

export function isFilterId(value: unknown): value is FilterId {
  return typeof value === "string" && BY_ID.has(value as FilterId)
}

export function getFilter(id: FilterId): FilterDef {
  return BY_ID.get(id) ?? FILTERS[0]
}

/** CSS `filter` value for a filter, e.g. "grayscale(1) contrast(1.08)". */
export function toCssFilter(ops: readonly FilterOp[]): string {
  if (ops.length === 0) return "none"
  return ops
    .map((o) => (o.fn === "hue-rotate" ? `hue-rotate(${o.deg}deg)` : `${o.fn}(${o.amount})`))
    .join(" ")
}

/**
 * Row-major 3×4 matrix: [r_r, r_g, r_b, r_offset, g_r, ..., b_offset] on channels in 0..1.
 * Alpha is untouched by every filter we use.
 */
export type ColorMatrix = readonly number[]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function toColorMatrix(o: FilterOp): ColorMatrix {
  switch (o.fn) {
    case "grayscale": {
      const s = 1 - clamp01(o.amount)
      return [
        0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0,
        0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0,
        0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s, 0,
      ]
    }
    case "sepia": {
      const s = 1 - clamp01(o.amount)
      return [
        0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0,
        0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0,
        0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s, 0,
      ]
    }
    case "saturate": {
      const s = Math.max(0, o.amount)
      return [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
      ]
    }
    case "hue-rotate": {
      const rad = (o.deg * Math.PI) / 180
      const c = Math.cos(rad)
      const s = Math.sin(rad)
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
      ]
    }
    case "brightness": {
      const b = Math.max(0, o.amount)
      return [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0]
    }
    case "contrast": {
      const k = Math.max(0, o.amount)
      const offset = 0.5 - 0.5 * k
      return [k, 0, 0, offset, 0, k, 0, offset, 0, 0, k, offset]
    }
    case "invert": {
      const a = clamp01(o.amount)
      const k = 1 - 2 * a
      return [k, 0, 0, a, 0, k, 0, a, 0, 0, k, a]
    }
  }
}

/** Applies the filter chain to RGBA pixels in place. */
export function applyFilterToPixels(data: Uint8ClampedArray, ops: readonly FilterOp[]): void {
  if (ops.length === 0) return
  // Pre-scale offsets to 0..255 so the inner loop works on raw channel values.
  const matrices = ops.map((o) => {
    const m = toColorMatrix(o)
    return [
      m[0], m[1], m[2], m[3] * 255,
      m[4], m[5], m[6], m[7] * 255,
      m[8], m[9], m[10], m[11] * 255,
    ]
  })
  const count = matrices.length
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]
    for (let k = 0; k < count; k++) {
      const m = matrices[k]
      const nr = m[0] * r + m[1] * g + m[2] * b + m[3]
      const ng = m[4] * r + m[5] * g + m[6] * b + m[7]
      const nb = m[8] * r + m[9] * g + m[10] * b + m[11]
      r = nr < 0 ? 0 : nr > 255 ? 255 : nr
      g = ng < 0 ? 0 : ng > 255 ? 255 : ng
      b = nb < 0 ? 0 : nb > 255 ? 255 : nb
    }
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}
