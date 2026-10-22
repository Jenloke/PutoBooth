/** Print resolution for every inch-based layout. */
export const PRINT_DPI = 300

/** Inches from dots at 300 DPI, so spacing reads in the pixel terms it was designed in. */
const dots = (px: number) => px / PRINT_DPI

export type LayoutId =
  | "classic"
  | "trio"
  | "grid"
  | "six-pack"
  | "postcard"
  | "instant"
  | "square"

export type FooterArrangement = "stack" | "inline"
export type FooterItem = "caption" | "date" | "logo"

export interface FooterSpec {
  /** Height in the layout's unit, directly below the photos and inside the bottom margin. */
  height: number
  /** `stack` centers items vertically (narrow footers); `inline` puts them on one line. */
  arrangement: FooterArrangement
  content: readonly FooterItem[]
}

export interface LayoutSpec {
  id: LayoutId
  name: string
  description: string
  /** Physical print size in inches, or a fixed pixel size for social formats. */
  size: { unit: "in" | "px"; width: number; height: number }
  rows: number
  cols: number
  /** Photo aspect ratio, width:height. */
  aspect: { w: number; h: number }
  /** Outer margin and gap between photos, in the layout's unit. */
  margin: number
  gap: number
  footer: FooterSpec | null
}

const FULL_FOOTER: readonly FooterItem[] = ["caption", "date", "logo"]

export const LAYOUTS: readonly LayoutSpec[] = [
  {
    id: "classic",
    name: "Classic Strip",
    description: "2×6 in · 4 photos",
    size: { unit: "in", width: 2, height: 6 },
    rows: 4,
    cols: 1,
    aspect: { w: 3, h: 2 },
    margin: dots(30),
    gap: dots(30),
    footer: { height: dots(210), arrangement: "stack", content: FULL_FOOTER },
  },
  {
    id: "trio",
    name: "Trio Strip",
    description: "2×6 in · 3 photos",
    size: { unit: "in", width: 2, height: 6 },
    rows: 3,
    cols: 1,
    aspect: { w: 4, h: 3 },
    margin: dots(30),
    gap: dots(30),
    footer: { height: dots(465), arrangement: "stack", content: FULL_FOOTER },
  },
  {
    id: "grid",
    name: "Grid",
    description: "4×6 in · 4 photos",
    size: { unit: "in", width: 4, height: 6 },
    rows: 2,
    cols: 2,
    aspect: { w: 3, h: 4 },
    margin: dots(40),
    gap: dots(40),
    footer: { height: dots(240), arrangement: "inline", content: FULL_FOOTER },
  },
  {
    id: "six-pack",
    name: "Six-Pack",
    description: "4×6 in · 6 photos",
    size: { unit: "in", width: 4, height: 6 },
    rows: 3,
    cols: 2,
    aspect: { w: 1, h: 1 },
    margin: dots(50),
    gap: dots(30),
    footer: { height: dots(140), arrangement: "inline", content: FULL_FOOTER },
  },
  {
    id: "postcard",
    name: "Postcard",
    description: "6×4 in · 1 photo",
    size: { unit: "in", width: 6, height: 4 },
    rows: 1,
    cols: 1,
    aspect: { w: 3, h: 2 },
    margin: dots(60),
    gap: 0,
    footer: { height: dots(120), arrangement: "inline", content: FULL_FOOTER },
  },
  {
    id: "instant",
    name: "Instant",
    description: "3.5×4.2 in · 1 photo",
    size: { unit: "in", width: 3.5, height: 4.2 },
    rows: 1,
    cols: 1,
    aspect: { w: 1, h: 1 },
    margin: dots(60),
    gap: 0,
    footer: { height: dots(210), arrangement: "stack", content: FULL_FOOTER },
  },
  {
    id: "square",
    name: "Square",
    description: "1080 px · 4 photos",
    size: { unit: "px", width: 1080, height: 1080 },
    rows: 2,
    cols: 2,
    aspect: { w: 1, h: 1 },
    margin: 40,
    gap: 20,
    footer: { height: 100, arrangement: "inline", content: FULL_FOOTER },
  },
]

export const DEFAULT_LAYOUT_ID: LayoutId = "classic"

const BY_ID = new Map(LAYOUTS.map((layout) => [layout.id, layout]))

export function isLayoutId(value: unknown): value is LayoutId {
  return typeof value === "string" && BY_ID.has(value as LayoutId)
}

export function getLayout(id: LayoutId): LayoutSpec {
  return BY_ID.get(id) ?? LAYOUTS[0]
}

export function shotCount(layout: LayoutSpec): number {
  return layout.rows * layout.cols
}

export function aspectRatio(layout: LayoutSpec): number {
  return layout.aspect.w / layout.aspect.h
}

/** Layouts that can reuse the same shots (same number of photos). */
export function layoutsWithShotCount(count: number): LayoutSpec[] {
  return LAYOUTS.filter((layout) => shotCount(layout) === count)
}

/** 2×6 in strips, which are usually printed two-up on 4×6 paper and cut. */
export function isStrip(layout: LayoutSpec): boolean {
  return layout.size.unit === "in" && layout.size.width === 2 && layout.size.height === 6
}

/** Physical size in inches, or null for pixel-sized (social) layouts. */
export function printSizeInches(layout: LayoutSpec): { width: number; height: number } | null {
  return layout.size.unit === "in"
    ? { width: layout.size.width, height: layout.size.height }
    : null
}

/** Scales margin and gap (the "Padding" control). 1 is the layout's own spacing. */
export function withPadding(layout: LayoutSpec, scale: number): LayoutSpec {
  if (scale === 1) return layout
  const s = Math.max(0, scale)
  return { ...layout, margin: layout.margin * s, gap: layout.gap * s }
}

/** Two strips side by side on 4×6 in paper. */
export const PRINT_SHEET = { width: 4, height: 6, copies: 2 } as const
