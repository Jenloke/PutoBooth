export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * The centered source region shown by `object-fit: cover` when a `srcW`×`srcH` image fills
 * a box with aspect ratio `targetAspect` (width / height). The live preview uses CSS cover
 * on the <video>; capture and compositing use this, so saved framing matches the preview.
 */
export function coverCrop(srcW: number, srcH: number, targetAspect: number): CropRect {
  if (srcW <= 0 || srcH <= 0 || !(targetAspect > 0)) {
    return { sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) }
  }
  const srcAspect = srcW / srcH
  if (srcAspect > targetAspect) {
    // Source is wider: crop the sides.
    const sw = srcH * targetAspect
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
  }
  // Source is taller: crop top and bottom.
  const sh = srcW / targetAspect
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh }
}
