import { PRINT_DPI, withPadding, type LayoutSpec } from "./layouts"

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface ComputedLayout {
  width: number
  height: number
  /** Photo slots in row-major order (left to right, top to bottom). */
  slots: Rect[]
  footer?: Rect
}

/**
 * Pixel geometry for a layout. Pure: the same input always gives the same integer rects.
 *
 * The photo area is the canvas minus margins and the footer. Each photo is fitted to its
 * aspect ratio inside an equal cell, gaps stay exactly `gap`, and the whole grid is
 * centered in the photo area (leftover space goes to the margins, evenly). The footer sits
 * directly below the photo area, inside the bottom margin.
 */
export function computeLayout(layout: LayoutSpec, dpi: number = PRINT_DPI): ComputedLayout {
  const scale = layout.size.unit === "in" ? dpi : 1
  const px = (value: number) => Math.round(value * scale)

  const width = px(layout.size.width)
  const height = px(layout.size.height)
  const margin = px(layout.margin)
  const gap = px(layout.gap)
  const footerHeight = layout.footer ? px(layout.footer.height) : 0

  const area: Rect = {
    x: margin,
    y: margin,
    w: Math.max(0, width - 2 * margin),
    h: Math.max(0, height - 2 * margin - footerHeight),
  }

  const { rows, cols } = layout
  const cellW = (area.w - (cols - 1) * gap) / cols
  const cellH = (area.h - (rows - 1) * gap) / rows
  const aspect = layout.aspect.w / layout.aspect.h

  // Fit (contain) the photo aspect inside a cell. The epsilon absorbs float noise so
  // exact fits (e.g. 540/360 = 1.5) don't lose a pixel to flooring.
  let photoW: number
  let photoH: number
  if (cellW / cellH > aspect) {
    photoH = cellH
    photoW = cellH * aspect
  } else {
    photoW = cellW
    photoH = cellW / aspect
  }
  photoW = Math.max(1, Math.floor(photoW + 1e-6))
  photoH = Math.max(1, Math.floor(photoH + 1e-6))

  const gridW = cols * photoW + (cols - 1) * gap
  const gridH = rows * photoH + (rows - 1) * gap
  const originX = area.x + Math.round((area.w - gridW) / 2)
  const originY = area.y + Math.round((area.h - gridH) / 2)

  const slots: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({
        x: originX + col * (photoW + gap),
        y: originY + row * (photoH + gap),
        w: photoW,
        h: photoH,
      })
    }
  }

  const result: ComputedLayout = { width, height, slots }
  if (layout.footer) {
    result.footer = {
      x: margin,
      y: height - margin - footerHeight,
      w: width - 2 * margin,
      h: footerHeight,
    }
  }
  return result
}

/** The 4×6 in sheet with copies of a strip side by side. */
export function computePrintSheet(
  strip: { width: number; height: number },
  sheetInches: { width: number; height: number; copies: number },
  dpi: number = PRINT_DPI
): { width: number; height: number; placements: Rect[] } {
  const width = Math.round(sheetInches.width * dpi)
  const height = Math.round(sheetInches.height * dpi)
  const totalW = strip.width * sheetInches.copies
  const x0 = Math.round((width - totalW) / 2)
  const y0 = Math.round((height - strip.height) / 2)
  const placements = Array.from({ length: sheetInches.copies }, (_, i) => ({
    x: x0 + i * strip.width,
    y: y0,
    w: strip.width,
    h: strip.height,
  }))
  return { width, height, placements }
}

/** Geometry the compositor uses for a design: the layout with the design's padding applied. */
export function compositeGeometry(layout: LayoutSpec, design: { padding: number }): ComputedLayout {
  return computeLayout(withPadding(layout, design.padding), PRINT_DPI)
}

/** Seam between the photos sharing a slot, as a fraction of the slot's shorter side. */
export const SPLIT_GAP_FRACTION = 0.025

/**
 * The photo rects inside one slot: the slot itself, or (shared booth) `parts` equal photos
 * along its longer side, side by side in landscape and square slots and stacked in portrait
 * ones. The seam scales with the design's padding, so padding 0 makes the photos touch.
 * Integer rects that tile the slot exactly; an odd pixel goes to the last photo.
 */
export function slotParts(slot: Rect, parts: number, padding = 1): Rect[] {
  if (parts <= 1) return [slot]
  const horizontal = slot.w >= slot.h
  const length = horizontal ? slot.w : slot.h
  const wanted = Math.round(Math.min(slot.w, slot.h) * SPLIT_GAP_FRACTION * Math.max(0, padding))
  const gap = Math.min(wanted, Math.floor((length - parts) / (parts - 1)))
  const available = length - gap * (parts - 1)
  const size = Math.floor(available / parts)

  const rects: Rect[] = []
  let offset = 0
  for (let i = 0; i < parts; i++) {
    const extent = i === parts - 1 ? available - size * (parts - 1) : size
    rects.push(
      horizontal
        ? { x: slot.x + offset, y: slot.y, w: extent, h: slot.h }
        : { x: slot.x, y: slot.y + offset, w: slot.w, h: extent }
    )
    offset += extent + gap
  }
  return rects
}
