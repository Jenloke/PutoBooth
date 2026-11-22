import { useEffect, useId, useState } from "react"

import { prefersReducedMotion } from "@/lib/platform"
import { cn } from "@/lib/utils"

import { computeLayout } from "./computeLayout"
import { shotCount, type LayoutSpec } from "./layouts"

/** Time per photo, and how long the finished result stays up before it starts over. */
const STEP_MS = 650
const HOLD_STEPS = 4

/**
 * What a session makes, before anyone grants the camera: a miniature of the layout (same
 * geometry as the export) whose photos fill in one by one, then start over. Static with
 * reduced motion. Remount it (key) when the layout changes.
 */
export function LayoutDemo({ layout, className }: { layout: LayoutSpec; className?: string }) {
  const { width, height, slots, footer } = computeLayout(layout)
  const total = shotCount(layout)
  const [still] = useState(prefersReducedMotion)
  const [step, setStep] = useState(still ? total : 0)
  const gradient = useId()

  useEffect(() => {
    if (still) return
    const timer = window.setInterval(() => setStep((n) => (n >= total + HOLD_STEPS ? 0 : n + 1)), STEP_MS)
    return () => window.clearInterval(timer)
  }, [still, total])

  const corner = Math.max(width, height) * 0.03
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className={cn("w-auto shrink-0", className)}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb36b" />
          <stop offset="0.55" stopColor="#f0679a" />
          <stop offset="1" stopColor="#7c6cf2" />
        </linearGradient>
      </defs>
      <rect width={width} height={height} rx={corner} fill="#ffffff" />
      {slots.map((slot, i) => {
        const r = Math.min(slot.w, slot.h) * 0.17
        const cx = slot.x + slot.w / 2
        const head = slot.y + slot.h * 0.42
        const shown = i < step
        return (
          <g key={i}>
            <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx={corner / 2} fill="#e5e5e5" />
            <g className="transition-opacity duration-300" style={{ opacity: shown ? 1 : 0 }}>
              <rect x={slot.x} y={slot.y} width={slot.w} height={slot.h} rx={corner / 2} fill={`url(#${gradient})`} />
              <g fill="#ffffff" fillOpacity={0.55}>
                <circle cx={cx} cy={head} r={r} />
                <path
                  d={`M${cx - r * 2} ${slot.y + slot.h} c0 ${-r * 1.4} ${r * 0.9} ${-r * 2.3} ${r * 2} ${-r * 2.3} s${r * 2} ${r * 0.9} ${r * 2} ${r * 2.3}z`}
                />
              </g>
            </g>
          </g>
        )
      })}
      {footer && (
        <rect
          x={footer.x + footer.w * 0.3}
          y={footer.y + footer.h / 2 - corner / 2}
          width={footer.w * 0.4}
          height={corner}
          rx={corner / 2}
          fill="#111111"
          opacity={0.35}
        />
      )}
    </svg>
  )
}
