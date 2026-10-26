import type { Phase } from "./session"

type CountdownProps = {
  phase: Phase
  count: number
  /** 0-based slot being shot. */
  index: number | null
  total: number
  retaking: boolean
}

function announcement({ phase, count, index, total, retaking }: CountdownProps): string {
  const photo = index === null ? "" : retaking ? `Retaking photo ${index + 1}. ` : `Photo ${index + 1} of ${total}. `
  switch (phase) {
    case "starting":
      return "Get ready."
    case "countdown":
      return `${photo}${count}`
    case "capturing":
      return "Smile!"
    case "pause":
      return index !== null ? `Photo ${index + 1} taken.` : ""
    default:
      return ""
  }
}

/** Big countdown numerals over the preview, plus a live region for screen readers. */
export function Countdown(props: CountdownProps) {
  const { phase, count, index, total } = props
  return (
    <>
      {phase === "starting" && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="rounded-full bg-black/55 px-4 py-1.5 text-base font-medium text-white backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0">
            Get ready…
          </span>
        </div>
      )}
      {phase === "countdown" && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          <span
            key={`${index}-${count}`}
            className="font-heading text-[min(42cqmin,11rem)] leading-none font-semibold text-white tabular-nums [text-shadow:0_4px_24px_rgb(0_0_0/0.45)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-150 motion-safe:duration-300"
          >
            {count}
          </span>
        </div>
      )}
      {phase === "pause" && index !== null && index < total - 1 && !props.retaking && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-black/55 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm">
            Get ready for photo {index + 2}
          </span>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="assertive" aria-atomic="true">
        {announcement(props)}
      </div>
    </>
  )
}
