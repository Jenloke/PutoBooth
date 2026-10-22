import { cn } from "@/lib/utils"

/**
 * Full-screen white flash at capture. It's on before the frame is grabbed, so it also lights
 * faces in a dim room; it fades out afterwards (instantly with reduced motion).
 */
export function Flash({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-active={active || undefined}
      className={cn(
        "pointer-events-none fixed inset-0 z-[100] bg-white opacity-0",
        "transition-opacity duration-500 ease-out motion-reduce:transition-none",
        "data-active:opacity-100 data-active:duration-75"
      )}
    />
  )
}
