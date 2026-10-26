import { useEffect, type ReactNode, type Ref, type RefObject } from "react"

import { cn } from "@/lib/utils"

type CameraPreviewProps = {
  stream: MediaStream | null
  /** Photo aspect ratio (width / height); the box crops the video like the saved shot. */
  aspect: number
  mirrored: boolean
  /** CSS filter string of the selected filter (the export applies the same functions). */
  filter: string
  grid: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  /** Overlays drawn inside the preview box (countdown, status). */
  children?: ReactNode
  className?: string
}

/** Plays `stream` in the video element, and resumes it when Safari paused it in the background. */
export function useVideoStream(videoRef: RefObject<HTMLVideoElement | null>, stream: MediaStream | null) {
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (video.srcObject !== stream) video.srcObject = stream
    if (!stream) return
    const play = () => {
      video.play().catch(() => {
        // Autoplay can be refused until the stream is live; `playing` retries via the effect.
      })
    }
    play()
    // Safari pauses the video while the app is in the background.
    const onVisible = () => {
      if (document.visibilityState === "visible") play()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [stream, videoRef])
}

/**
 * Live preview, cropped to the slot aspect with object-fit: cover. Sized as the largest box
 * of that aspect that fits the parent, which must be a size container (`[container-type:size]`).
 */
export function CameraPreview({
  stream,
  aspect,
  mirrored,
  filter,
  grid,
  videoRef,
  children,
  className,
}: CameraPreviewProps) {
  useVideoStream(videoRef, stream)

  return (
    <div
      className={cn("fit-box relative overflow-hidden rounded-2xl bg-neutral-950 shadow-sm", className)}
      style={{ "--aspect": aspect } as React.CSSProperties}
    >
      <video
        ref={videoRef as Ref<HTMLVideoElement>}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        aria-label="Camera preview"
        className="absolute inset-0 size-full object-cover"
        style={{
          transform: mirrored ? "scaleX(-1)" : undefined,
          filter: filter === "none" ? undefined : filter,
        }}
      />
      {grid && <GridOverlay />}
      {children}
    </div>
  )
}

export function GridOverlay() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
      <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
      <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
      <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
    </div>
  )
}
