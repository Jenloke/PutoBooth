import type { Shot } from "@/features/booth/session"
import { canvasToBlob, context2d, createCanvas, decodeImage, freeCanvas } from "@/lib/canvas"
import { uid } from "@/lib/id"

/** Same cap as camera captures: iOS refuses canvases above ~16.7 MP. */
const MAX_PIXELS = 14_000_000

/**
 * Which photo fills each slot: in the order picked, repeating from the first when there are
 * fewer photos than slots (each repeat can be replaced from the review).
 */
export function assignToSlots(photoCount: number, slotCount: number): number[] {
  if (photoCount <= 0) return []
  return Array.from({ length: slotCount }, (_, slot) => slot % photoCount)
}

/** Largest size within the pixel cap, never upscaled. */
export function fitPixels(width: number, height: number, maxPixels: number = MAX_PIXELS) {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Decodes a picked photo, upright (EXIF orientation applied), and re-encodes it as a JPEG shot,
 * like a camera capture. Formats the browser can't decode (HEIC outside Safari) throw.
 */
export async function photoToShot(file: Blob): Promise<Shot> {
  const image = await decodeImage(file)
  try {
    const size = fitPixels(image.width, image.height)
    const canvas = createCanvas(size.width, size.height)
    try {
      context2d(canvas).drawImage(image.source, 0, 0, canvas.width, canvas.height)
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92)
      return { id: uid(), blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height }
    } finally {
      freeCanvas(canvas)
    }
  } finally {
    image.close()
  }
}

export interface ImportResult {
  /** One per slot, or empty if no photo could be opened. */
  shots: Shot[]
  /** Distinct photos used. */
  used: number
  /** Photos that couldn't be opened. */
  failed: number
  /** Photos picked beyond what the layout holds (left out). */
  extra: number
}

/**
 * Turns picked photos into one shot per slot. Photos are decoded one at a time (several 12 MP
 * decodes at once can crash iOS); one that fails is skipped and the next one takes its place.
 */
export async function importPhotos(
  files: readonly Blob[],
  slotCount: number,
  toShot: (file: Blob) => Promise<Shot> = photoToShot
): Promise<ImportResult> {
  const photos: Shot[] = []
  let failed = 0
  let next = 0
  while (photos.length < slotCount && next < files.length) {
    try {
      photos.push(await toShot(files[next]))
    } catch {
      failed++
    }
    next++
  }
  const shots = assignToSlots(photos.length, slotCount).map((index, slot) => {
    const photo = photos[index]
    // A repeated photo gets its own id and object URL: replacing one slot revokes only its own.
    return slot < photos.length ? photo : { ...photo, id: uid(), url: URL.createObjectURL(photo.blob) }
  })
  return { shots, used: photos.length, failed, extra: files.length - next }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/** One line on what happened to the picked photos, or null when they fit exactly. */
export function importSummary(
  result: ImportResult,
  slots: number,
  verb: "Tap" | "Click" = "Tap"
): { title: string; description?: string } | null {
  const notes: string[] = []
  if (result.failed > 0) notes.push(`${plural(result.failed, "photo")} couldn't be opened.`)
  if (result.extra > 0) notes.push(`This layout holds ${slots}, so the first ${slots} are in.`)
  if (result.used < slots) {
    return {
      title: `${plural(result.used, "photo")} for ${slots} spots, so some repeat`,
      description: [...notes, `${verb} a photo to replace it.`].join(" "),
    }
  }
  return notes.length ? { title: notes[0], description: notes[1] } : null
}
