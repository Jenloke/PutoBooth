import { canvasToBlob, context2d, createCanvas, freeCanvas } from "@/lib/canvas"

/** iOS refuses canvases above ~16.7 MP; stay well under it. */
const MAX_CAPTURE_PIXELS = 14_000_000

export interface CapturedFrame {
  blob: Blob
  width: number
  height: number
}

/**
 * Grabs the current video frame at camera resolution by drawing it to a canvas (Safari has
 * no ImageCapture API). The full frame is kept; slots are center-cropped at compose time
 * with the same cover math as the preview, so framing matches what the user saw.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  { mirror }: { mirror: boolean }
): Promise<CapturedFrame> {
  // Read at capture time: on iPhone these swap with orientation.
  const sourceW = video.videoWidth
  const sourceH = video.videoHeight
  if (!sourceW || !sourceH || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error("The camera isn't ready yet")
  }

  const scale = Math.min(1, Math.sqrt(MAX_CAPTURE_PIXELS / (sourceW * sourceH)))
  const width = Math.round(sourceW * scale)
  const height = Math.round(sourceH * scale)

  const canvas = createCanvas(width, height)
  try {
    const ctx = context2d(canvas)
    if (mirror) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.95)
    return { blob, width, height }
  } finally {
    freeCanvas(canvas)
  }
}
