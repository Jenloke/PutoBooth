import { cn } from "@/lib/utils"

import { computeLayout } from "./computeLayout"
import type { LayoutSpec } from "./layouts"

/** A miniature of the layout, drawn from the same geometry as the export. */
export function LayoutIcon({ layout, className }: { layout: LayoutSpec; className?: string }) {
  const { width, height, slots, footer } = computeLayout(layout)
  const inset = Math.max(width, height) * 0.02

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("h-8 w-auto shrink-0", className)}
    >
      <rect
        x={inset / 2}
        y={inset / 2}
        width={width - inset}
        height={height - inset}
        rx={inset * 2}
        className="fill-background stroke-current"
        strokeWidth={inset}
      />
      {slots.map((slot, i) => (
        <rect key={i} x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx={inset} className="fill-current opacity-60" />
      ))}
      {footer && (
        <rect
          x={footer.x + footer.w * 0.25}
          y={footer.y + footer.h / 2 - inset}
          width={footer.w * 0.5}
          height={inset * 2}
          rx={inset}
          className="fill-current opacity-60"
        />
      )}
    </svg>
  )
}
