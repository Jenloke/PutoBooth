import { useRef, type CSSProperties, type ReactNode, type Ref, type RefObject } from "react"

import { Spinner } from "@/components/ui/spinner"
import { GridOverlay, useVideoStream } from "@/features/camera/CameraPreview"
import type { Rect } from "@/features/layouts/computeLayout"
import { cn } from "@/lib/utils"

import type { Side } from "./protocol"

type PairPreviewProps = {
  /** One photo slot and its two halves (slotParts), in print pixels. */
  slot: Rect
  parts: readonly [Rect, Rect]
  /** The half this device fills. */
  side: Side
  /** CSS filter of the selected filter, applied to both halves like the export does. */
  filter: string
  grid: boolean
  /** The frame color, which shows in the seam between the halves as it will in print. */
  seamColor: string
  /** This device's camera preview; captures are grabbed from it. */
  videoRef: RefObject<HTMLVideoElement | null>
  self: {
    stream: MediaStream | null
    mirrored: boolean
    /** Shown over this device's half (camera start, errors). */
    overlay?: ReactNode
  }
  partner: {
    name: string
    stream: MediaStream | null
    /** Their photos are saved mirrored, so their video is shown mirrored too. */
    mirrored: boolean
    /** Their photo for this slot, shown when there's no live video (retaking alone). */
    still: string | null
    overlay?: ReactNode
  }
  /** Name tags on the halves. */
  labels: boolean
  /** Overlays over the whole slot (countdown, status). */
  children?: ReactNode
}

function placement(part: Rect, slot: Rect): CSSProperties {
  return {
    left: `${((part.x - slot.x) / slot.w) * 100}%`,
    top: `${((part.y - slot.y) / slot.h) * 100}%`,
    width: `${(part.w / slot.w) * 100}%`,
    height: `${(part.h / slot.h) * 100}%`,
  }
}

function NameTag({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
      {children}
    </span>
  )
}

/**
 * The shared booth's live preview: one photo slot with this device's camera in its half and the
 * partner's live video in the other, both cropped with object-fit: cover exactly like the export.
 * Must sit in a size container, like CameraPreview.
 */
export function PairPreview({
  slot,
  parts,
  side,
  filter,
  grid,
  seamColor,
  videoRef,
  self,
  partner,
  labels,
  children,
}: PairPreviewProps) {
  const remoteRef = useRef<HTMLVideoElement>(null)
  useVideoStream(videoRef, self.stream)
  useVideoStream(remoteRef, partner.stream)
  const css = filter === "none" ? undefined : filter

  return (
    <div
      className="fit-box relative overflow-hidden rounded-2xl shadow-sm"
      style={{ "--aspect": slot.w / slot.h, backgroundColor: seamColor } as CSSProperties}
    >
      <div className="absolute overflow-hidden bg-neutral-950" style={placement(parts[side], slot)}>
        <video
          ref={videoRef as Ref<HTMLVideoElement>}
          autoPlay
          playsInline
          muted
          disablePictureInPicture
          aria-label="Camera preview"
          className="absolute inset-0 size-full object-cover"
          style={{ transform: self.mirrored ? "scaleX(-1)" : undefined, filter: css }}
        />
        {grid && <GridOverlay />}
        {labels && <NameTag>You</NameTag>}
        {self.overlay}
      </div>

      <div
        className="absolute overflow-hidden bg-neutral-900"
        style={placement(parts[side === 0 ? 1 : 0], slot)}
      >
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          muted
          disablePictureInPicture
          aria-label={`${partner.name}'s camera`}
          className={cn("absolute inset-0 size-full object-cover", !partner.stream && "hidden")}
          style={{ transform: partner.mirrored ? "scaleX(-1)" : undefined, filter: css }}
        />
        {!partner.stream && partner.still && (
          <img
            src={partner.still}
            alt={`${partner.name}'s photo`}
            className="absolute inset-0 size-full object-cover"
            style={{ filter: css }}
          />
        )}
        {labels && <NameTag>{partner.name}</NameTag>}
        {partner.overlay}
      </div>

      {children}
    </div>
  )
}

/** Covers the partner's half while there's nothing live to show. */
export function PartnerWaiting({ text, busy = true }: { text: string; busy?: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-white/80 sm:text-sm">
      <div className="flex flex-col items-center gap-2">
        {busy && <Spinner className="size-4" />}
        <span className="text-balance">{text}</span>
      </div>
    </div>
  )
}
