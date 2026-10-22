// Caption fonts, self-hosted. Latin subsets only, one weight each; other scripts fall back
// to the system font. The UI font (Geist) is imported in index.css.
import "@fontsource/playfair-display/latin-700.css"
import "@fontsource/playfair-display/latin-ext-700.css"
import "@fontsource/caveat/latin-700.css"
import "@fontsource/caveat/latin-ext-700.css"
import "@fontsource/bebas-neue/latin-400.css"
import "@fontsource/bebas-neue/latin-ext-400.css"
import "@fontsource/pacifico/latin-400.css"
import "@fontsource/pacifico/latin-ext-400.css"

export type FontId = "geist" | "playfair" | "caveat" | "bebas" | "pacifico"

export interface FontDef {
  id: FontId
  name: string
  family: string
  weight: number
  /** Optical size correction so every font looks about the same size at the same px. */
  sizeScale: number
}

export const FONTS: readonly FontDef[] = [
  { id: "playfair", name: "Serif", family: "Playfair Display", weight: 700, sizeScale: 1 },
  { id: "geist", name: "Sans", family: "Geist Variable", weight: 600, sizeScale: 1 },
  { id: "caveat", name: "Handwritten", family: "Caveat", weight: 700, sizeScale: 1.3 },
  { id: "bebas", name: "Display", family: "Bebas Neue", weight: 400, sizeScale: 1.2 },
  { id: "pacifico", name: "Script", family: "Pacifico", weight: 400, sizeScale: 0.85 },
]

const BY_ID = new Map(FONTS.map((font) => [font.id, font]))

export function isFontId(value: unknown): value is FontId {
  return typeof value === "string" && BY_ID.has(value as FontId)
}

export function getFont(id: FontId): FontDef {
  return BY_ID.get(id) ?? FONTS[0]
}

/** A canvas `font` shorthand with a fallback stack. */
export function canvasFont(font: FontDef, sizePx: number): string {
  return `${font.weight} ${sizePx.toFixed(2)}px "${font.family}", system-ui, sans-serif`
}

/** CSS font-family value, for showing font choices in the UI. */
export function cssFontFamily(font: FontDef): string {
  return `"${font.family}", system-ui, sans-serif`
}

/**
 * Loads the font faces needed to draw `text`. Canvas text silently falls back to another
 * font if the face isn't loaded yet, so always await this before drawing.
 */
export async function loadFont(font: FontDef, text: string): Promise<void> {
  if (!("fonts" in document)) return
  try {
    await document.fonts.load(canvasFont(font, 48), text || "Aa")
  } catch {
    // Missing font: canvas uses the fallback stack.
  }
}
