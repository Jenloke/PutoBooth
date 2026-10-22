import { isFilterId, type FilterId } from "./filters"
import { isFontId, type FontId } from "./fonts"

/** Everything the user can customize on the result. Output colors never follow the app theme. */
export interface Design {
  filter: FilterId
  frameColor: string
  /** Multiplier for the layout's margin and gap; 1 is the layout default. */
  padding: number
  /** Photo corner radius, 0..1 of the maximum. */
  radius: number
  caption: string
  font: FontId
  showDate: boolean
  showLogo: boolean
}

export const DEFAULT_DESIGN: Design = {
  filter: "none",
  frameColor: "#ffffff",
  padding: 1,
  radius: 0,
  caption: "",
  font: "playfair",
  showDate: true,
  showLogo: true,
}

export const CAPTION_MAX_LENGTH = 40
export const PADDING_RANGE = { min: 0, max: 2, step: 0.05 } as const

export const FRAME_PRESETS: readonly { name: string; value: string }[] = [
  { name: "White", value: "#ffffff" },
  { name: "Cream", value: "#f4ede1" },
  { name: "Black", value: "#111111" },
  { name: "Blush", value: "#f3c9d1" },
  { name: "Butter", value: "#f5e3a3" },
  { name: "Sage", value: "#c8d6c1" },
  { name: "Sky", value: "#c6dbef" },
  { name: "Lilac", value: "#d8cdf0" },
]

/** Largest corner radius, as a fraction of the slot's shorter side. */
export const MAX_RADIUS_FRACTION = 0.16

const HEX = /^#([0-9a-f]{6})$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value)
}

function srgbToLinear(channel: number) {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(hex: string): number {
  const value = HEX.exec(hex)?.[1] ?? "ffffff"
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** Near-black or white text, whichever contrasts more with the frame color. */
export function readableTextColor(background: string): string {
  const l = relativeLuminance(background)
  const dark = 0.012 // luminance of #1a1a1a
  const contrastWithDark = (l + 0.05) / (dark + 0.05)
  const contrastWithWhite = 1.05 / (l + 0.05)
  return contrastWithDark >= contrastWithWhite ? "#1a1a1a" : "#ffffff"
}

/** Coerces persisted or partial data into a valid design. */
export function sanitizeDesign(value: Partial<Design> | undefined): Design {
  const d = { ...DEFAULT_DESIGN, ...(value ?? {}) }
  return {
    filter: isFilterId(d.filter) ? d.filter : DEFAULT_DESIGN.filter,
    frameColor: isHexColor(d.frameColor) ? d.frameColor.toLowerCase() : DEFAULT_DESIGN.frameColor,
    padding: clampNumber(d.padding, PADDING_RANGE.min, PADDING_RANGE.max, DEFAULT_DESIGN.padding),
    radius: clampNumber(d.radius, 0, 1, DEFAULT_DESIGN.radius),
    caption: typeof d.caption === "string" ? d.caption.slice(0, CAPTION_MAX_LENGTH) : "",
    font: isFontId(d.font) ? d.font : DEFAULT_DESIGN.font,
    showDate: typeof d.showDate === "boolean" ? d.showDate : DEFAULT_DESIGN.showDate,
    showLogo: typeof d.showLogo === "boolean" ? d.showLogo : DEFAULT_DESIGN.showLogo,
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

export function formatDateStamp(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date)
}
