import { cn } from "@/lib/utils"

import { slotShots, type PairShots, type Shot } from "./session"

type ShotTrayProps = {
  shots: readonly (Shot | null)[]
  /** Shared booth: the partner's photos, shown in the other half of each thumbnail. */
  pair?: Pick<PairShots, "side" | "shots"> | null
  /** Shared slots split side by side (landscape and square slots) or stacked (portrait). */
  sideBySide?: boolean
  /** Photo slot aspect ratio (width / height). */
  aspect: number
  /** CSS filter so thumbnails look like the result. */
  filter: string
  activeIndex: number | null
  className?: string
}

/** Thumbnails of this session's shots; each new one slides in. */
export function ShotTray({ shots, pair, sideBySide = true, aspect, filter, activeIndex, className }: ShotTrayProps) {
  const taken = shots.filter(Boolean).length
  const css = filter === "none" ? undefined : filter
  return (
    <ol
      aria-label={`Photos taken: ${taken} of ${shots.length}`}
      className={cn("flex items-center justify-center gap-2 px-3", className)}
    >
      {slotShots(shots, pair ?? null).map((parts, i) => (
        <li
          key={i}
          className={cn(
            "relative h-12 overflow-hidden rounded-md ring-offset-2 ring-offset-background transition-shadow",
            activeIndex === i && "ring-2 ring-foreground"
          )}
          style={{ aspectRatio: aspect }}
        >
          {parts.some(Boolean) ? (
            <span className={cn("flex size-full gap-px", !sideBySide && "flex-col")}>
              {parts.map((shot, part) =>
                shot ? (
                  <img
                    key={shot.id}
                    src={shot.url}
                    alt={pair && part !== pair.side ? `Partner's photo ${i + 1}` : `Photo ${i + 1}`}
                    className="min-h-0 min-w-0 flex-1 object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-8 motion-safe:zoom-in-75 motion-safe:duration-500"
                    style={{ filter: css }}
                  />
                ) : (
                  <span key={part} className="min-h-0 min-w-0 flex-1 bg-muted" />
                )
              )}
            </span>
          ) : (
            <span className="grid size-full place-items-center rounded-md border border-dashed border-foreground/25 text-xs text-muted-foreground tabular-nums">
              {i + 1}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
