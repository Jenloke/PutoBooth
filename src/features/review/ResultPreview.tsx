import { RotateCcwIcon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import type { ComputedLayout, Rect } from "@/features/layouts/computeLayout"
import { cn } from "@/lib/utils"

type ResultPreviewProps = {
  /** URL of the exported image (the preview is the export). */
  url: string | null
  width: number
  height: number
  /** Where each strip copy sits in the image (two on a print sheet). */
  placements: readonly Rect[]
  /** Slot geometry of one copy, in that copy's pixels. */
  geometry: ComputedLayout
  rendering: boolean
  onRetake: (index: number) => void
  disabled?: boolean
  alt: string
}

/**
 * The rendered result with a hit area over each photo: tap one to retake just that shot.
 * Must sit in a size container (`@container-size`) to fit.
 */
export function ResultPreview({
  url,
  width,
  height,
  placements,
  geometry,
  rendering,
  onRetake,
  disabled,
  alt,
}: ResultPreviewProps) {
  return (
    <div
      className="fit-box relative rounded-sm bg-muted shadow-[0_10px_40px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/10 dark:ring-white/10"
      style={{ "--aspect": width / height } as React.CSSProperties}
    >
      {url && <img src={url} alt={alt} draggable={false} className="absolute inset-0 size-full select-none" />}
      {(rendering || !url) && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-full bg-background/85 p-1.5 shadow-sm">
          <Spinner className="size-4" aria-label="Updating preview" />
        </div>
      )}
      {placements.flatMap((copy, copyIndex) =>
        geometry.slots.map((slot, index) => (
          <button
            key={`${copyIndex}-${index}`}
            type="button"
            data-retake-index={index}
            disabled={disabled}
            // The second copy on a print sheet is a duplicate: reachable by pointer, not by Tab.
            tabIndex={copyIndex === 0 ? undefined : -1}
            aria-hidden={copyIndex === 0 ? undefined : true}
            aria-label={`Retake photo ${index + 1}`}
            onClick={() => onRetake(index)}
            className={cn(
              "group/slot absolute rounded-xs outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring hover:bg-black/25 hover:ring-2 hover:ring-white/80",
              "disabled:pointer-events-none"
            )}
            style={{
              left: `${((copy.x + slot.x) / width) * 100}%`,
              top: `${((copy.y + slot.y) / height) * 100}%`,
              width: `${(slot.w / width) * 100}%`,
              height: `${(slot.h / height) * 100}%`,
            }}
          >
            <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover/slot:opacity-100 group-focus-visible/slot:opacity-100">
              <span className="flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
                <RotateCcwIcon className="size-3" />
                Retake
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}
