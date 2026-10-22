import { cn } from "@/lib/utils"

import type { Shot } from "./session"

type ShotTrayProps = {
  shots: readonly (Shot | null)[]
  /** Photo aspect ratio (width / height). */
  aspect: number
  /** CSS filter so thumbnails look like the result. */
  filter: string
  activeIndex: number | null
  className?: string
}

/** Thumbnails of this session's shots; each new one slides in. */
export function ShotTray({ shots, aspect, filter, activeIndex, className }: ShotTrayProps) {
  const taken = shots.filter(Boolean).length
  return (
    <ol
      aria-label={`Photos taken: ${taken} of ${shots.length}`}
      className={cn("flex items-center justify-center gap-2 px-3", className)}
    >
      {shots.map((shot, i) => (
        <li
          key={i}
          className={cn(
            "relative h-12 overflow-hidden rounded-md ring-offset-2 ring-offset-background transition-shadow",
            activeIndex === i && "ring-2 ring-foreground"
          )}
          style={{ aspectRatio: aspect }}
        >
          {shot ? (
            <img
              key={shot.id}
              src={shot.url}
              alt={`Photo ${i + 1}`}
              className="size-full object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-8 motion-safe:zoom-in-75 motion-safe:duration-500"
              style={{ filter: filter === "none" ? undefined : filter }}
            />
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
