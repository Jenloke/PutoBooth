import {
  computeLayout,
  computePrintSheet,
  type ComputedLayout,
  type Rect,
} from "@/features/layouts/computeLayout"
import {
  PRINT_DPI,
  PRINT_SHEET,
  withPadding,
  type FooterArrangement,
  type LayoutSpec,
} from "@/features/layouts/layouts"
import {
  context2d,
  createCanvas,
  freeCanvas,
  roundRectPath,
  type DecodedImage,
} from "@/lib/canvas"

import { coverCrop } from "./crop"
import {
  MAX_RADIUS_FRACTION,
  formatDateStamp,
  readableTextColor,
  type Design,
} from "./design"
import { applyFilterToPixels, getFilter, type FilterOp } from "./filters"
import { canvasFont, getFont, loadFont, type FontDef } from "./fonts"

export interface CompositeInput {
  layout: LayoutSpec
  /** Decoded shots in slot order; missing shots render as an empty slot. */
  images: readonly (DecodedImage | null)[]
  design: Design
  /** Printed by the date stamp (the session's capture date). */
  date: Date
  logo: DecodedImage | null
}

/** Geometry the compositor uses for a design: the layout with the design's padding applied. */
export function compositeGeometry(layout: LayoutSpec, design: Pick<Design, "padding">): ComputedLayout {
  return computeLayout(withPadding(layout, design.padding), PRINT_DPI)
}

/**
 * Draws the finished image at print resolution. Output depends only on the inputs (never on
 * the app theme). The caller owns the returned canvas and should free it when done.
 */
export async function renderComposite(input: CompositeInput): Promise<HTMLCanvasElement> {
  const { layout, images, design, date, logo } = input
  const geometry = compositeGeometry(layout, design)
  const font = getFont(design.font)
  const caption = design.caption.trim()
  const dateText = design.showDate ? formatDateStamp(date) : ""

  if (geometry.footer && (caption || dateText)) {
    await loadFont(font, `${caption}${dateText}`)
  }

  const canvas = createCanvas(geometry.width, geometry.height)
  const ctx = context2d(canvas)
  ctx.fillStyle = design.frameColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const ops = getFilter(design.filter).ops
  geometry.slots.forEach((slot, index) => {
    const radius = design.radius * MAX_RADIUS_FRACTION * Math.min(slot.w, slot.h)
    drawPhoto(ctx, images[index] ?? null, slot, ops, radius)
  })

  if (geometry.footer && layout.footer) {
    drawFooter(ctx, geometry.footer, layout.footer.arrangement, {
      caption,
      date: dateText,
      logo: design.showLogo ? logo : null,
      font,
      color: readableTextColor(design.frameColor),
    })
  }

  return canvas
}

/** Two copies of a strip on a 4×6 in sheet. Frees nothing; the caller owns both canvases. */
export function renderPrintSheet(strip: HTMLCanvasElement): HTMLCanvasElement {
  const sheet = computePrintSheet(strip, PRINT_SHEET, PRINT_DPI)
  const canvas = createCanvas(sheet.width, sheet.height)
  const ctx = context2d(canvas)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  for (const p of sheet.placements) ctx.drawImage(strip, p.x, p.y, p.w, p.h)
  return canvas
}

function drawPhoto(
  ctx: CanvasRenderingContext2D,
  image: DecodedImage | null,
  slot: Rect,
  ops: readonly FilterOp[],
  radius: number
) {
  ctx.save()
  if (radius > 0.5) {
    roundRectPath(ctx, slot.x, slot.y, slot.w, slot.h, radius)
    ctx.clip()
  }
  if (!image) {
    ctx.fillStyle = "#d4d4d4"
    ctx.fillRect(slot.x, slot.y, slot.w, slot.h)
    ctx.restore()
    return
  }
  // Filter in a slot-sized scratch canvas: getImageData/putImageData ignore clipping, so
  // filtering in place would also tint the frame around rounded corners.
  const photo = scaleCover(image, slot.w, slot.h, ops.length > 0)
  if (ops.length > 0) {
    const pctx = context2d(photo, { willReadFrequently: true })
    const pixels = pctx.getImageData(0, 0, photo.width, photo.height)
    applyFilterToPixels(pixels.data, ops)
    pctx.putImageData(pixels, 0, 0)
  }
  ctx.drawImage(photo, slot.x, slot.y, slot.w, slot.h)
  freeCanvas(photo)
  ctx.restore()
}

/**
 * Center-crops `image` to w:h and scales it to w×h. Large downscales are done in halving
 * steps; a single bilinear step from a 4K frame to a 540 px slot looks aliased.
 */
function scaleCover(
  image: DecodedImage,
  w: number,
  h: number,
  willRead: boolean
): HTMLCanvasElement {
  const crop = coverCrop(image.width, image.height, w / h)
  let source: CanvasImageSource = image.source
  let sx = crop.sx
  let sy = crop.sy
  let sw = crop.sw
  let sh = crop.sh
  let step: HTMLCanvasElement | null = null

  while (sw >= w * 2 && sh >= h * 2) {
    const next = createCanvas(Math.round(sw / 2), Math.round(sh / 2))
    context2d(next).drawImage(source, sx, sy, sw, sh, 0, 0, next.width, next.height)
    freeCanvas(step)
    step = next
    source = next
    sx = 0
    sy = 0
    sw = next.width
    sh = next.height
  }

  const out = createCanvas(w, h)
  context2d(out, willRead ? { willReadFrequently: true } : undefined).drawImage(
    source,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    w,
    h
  )
  freeCanvas(step)
  return out
}

interface FooterContent {
  caption: string
  date: string
  logo: DecodedImage | null
  font: FontDef
  color: string
}

const DATE_ALPHA = 0.72

function drawFooter(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  arrangement: FooterArrangement,
  content: FooterContent
) {
  if (!content.caption && !content.date && !content.logo) return
  ctx.save()
  ctx.fillStyle = content.color
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  if (arrangement === "stack") drawStackedFooter(ctx, rect, content)
  else drawInlineFooter(ctx, rect, content)
  ctx.restore()
}

interface TextBox {
  text: string
  size: number
  width: number
  ascent: number
  descent: number
}

function measure(ctx: CanvasRenderingContext2D, font: FontDef, text: string, size: number): TextBox {
  ctx.font = canvasFont(font, size)
  const m = ctx.measureText(text)
  return {
    text,
    size,
    width: m.width,
    // Ink bounds give optically centered text regardless of the font's line metrics.
    ascent: m.actualBoundingBoxAscent || size * 0.75,
    descent: m.actualBoundingBoxDescent || size * 0.2,
  }
}

/** Measures text at `size`, shrinking it until it fits `maxWidth`. */
function fit(
  ctx: CanvasRenderingContext2D,
  font: FontDef,
  text: string,
  size: number,
  maxWidth: number
): TextBox {
  let box = measure(ctx, font, text, size)
  if (box.width > maxWidth && box.width > 0) {
    box = measure(ctx, font, text, size * (maxWidth / box.width))
  }
  return box
}

function scaleBox(box: TextBox, k: number): TextBox {
  return {
    ...box,
    size: box.size * k,
    width: box.width * k,
    ascent: box.ascent * k,
    descent: box.descent * k,
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  font: FontDef,
  box: TextBox,
  x: number,
  baseline: number,
  alpha = 1
) {
  ctx.font = canvasFont(font, box.size)
  ctx.globalAlpha = alpha
  ctx.fillText(box.text, x, baseline)
  ctx.globalAlpha = 1
}

/** Logo, caption and date centered in a column (narrow footers: strips, instant). */
function drawStackedFooter(ctx: CanvasRenderingContext2D, rect: Rect, c: FooterContent) {
  const maxWidth = rect.w * 0.88
  const available = rect.h * 0.86
  const hasText = Boolean(c.caption || c.date)

  let caption = c.caption
    ? fit(ctx, c.font, c.caption, Math.min(rect.h * 0.3, rect.w * 0.15) * c.font.sizeScale, maxWidth)
    : null
  // Alone, the date is the footer's headline; under a caption it's a quieter second line.
  const dateSize = caption
    ? Math.min(rect.h * 0.14 * c.font.sizeScale, caption.size * 0.55)
    : Math.min(rect.h * 0.22, rect.w * 0.1) * c.font.sizeScale
  let date = c.date ? fit(ctx, c.font, c.date, dateSize, maxWidth * 0.8) : null

  let logoW = 0
  let logoH = 0
  if (c.logo) {
    const maxH = hasText ? rect.h * 0.4 : available
    const k = Math.min((maxWidth * 0.7) / c.logo.width, maxH / c.logo.height)
    logoW = c.logo.width * k
    logoH = c.logo.height * k
  }

  let gap = rect.h * 0.06
  const rows = () =>
    [c.logo ? logoH : 0, caption ? caption.ascent + caption.descent : 0, date ? date.ascent + date.descent : 0]
      .filter((h) => h > 0)
  const total = () => {
    const heights = rows()
    return heights.reduce((sum, h) => sum + h, 0) + gap * Math.max(0, heights.length - 1)
  }

  const k = total() > available ? available / total() : 1
  if (k < 1) {
    caption = caption && scaleBox(caption, k)
    date = date && scaleBox(date, k)
    logoW *= k
    logoH *= k
    gap *= k
  }

  const cx = rect.x + rect.w / 2
  let y = rect.y + (rect.h - total()) / 2
  if (c.logo) {
    ctx.drawImage(c.logo.source, cx - logoW / 2, y, logoW, logoH)
    y += logoH + gap
  }
  if (caption) {
    drawText(ctx, c.font, caption, cx - caption.width / 2, y + caption.ascent)
    y += caption.ascent + caption.descent + gap
  }
  if (date) {
    drawText(ctx, c.font, date, cx - date.width / 2, y + date.ascent, DATE_ALPHA)
  }
}

/** Logo, caption and date on one centered line (wide, short footers). */
function drawInlineFooter(ctx: CanvasRenderingContext2D, rect: Rect, c: FooterContent) {
  const maxWidth = rect.w * 0.92
  let caption = c.caption ? measure(ctx, c.font, c.caption, rect.h * 0.4 * c.font.sizeScale) : null
  let date = c.date
    ? measure(ctx, c.font, c.date, rect.h * (caption ? 0.26 : 0.34) * c.font.sizeScale)
    : null

  let logoH = c.logo ? rect.h * 0.62 : 0
  let logoW = c.logo ? Math.min(logoH * (c.logo.width / c.logo.height), rect.w * 0.3) : 0
  if (c.logo) logoH = logoW / (c.logo.width / c.logo.height)

  let gap = rect.h * 0.3
  const widths = () => [logoW, caption?.width ?? 0, date?.width ?? 0].filter((w) => w > 0)
  const total = () => {
    const w = widths()
    return w.reduce((sum, v) => sum + v, 0) + gap * Math.max(0, w.length - 1)
  }

  if (total() > maxWidth) {
    const k = maxWidth / total()
    caption = caption && scaleBox(caption, k)
    date = date && scaleBox(date, k)
    logoW *= k
    logoH *= k
    gap *= k
  }

  const cy = rect.y + rect.h / 2
  // Caption and date share a baseline; the caption's ink is centered vertically.
  const lead = caption ?? date
  const baseline = lead ? cy + (lead.ascent - lead.descent) / 2 : cy
  let x = rect.x + (rect.w - total()) / 2
  if (c.logo) {
    ctx.drawImage(c.logo.source, x, cy - logoH / 2, logoW, logoH)
    x += logoW + gap
  }
  if (caption) {
    drawText(ctx, c.font, caption, x, baseline)
    x += caption.width + gap
  }
  if (date) {
    drawText(ctx, c.font, date, x, baseline, DATE_ALPHA)
  }
}
