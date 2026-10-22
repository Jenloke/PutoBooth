import { cn } from "@/lib/utils"

/** A tiny photo strip: the app's logo mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6", className)}
    >
      <rect x="6" y="1.5" width="12" height="21" rx="2.5" className="fill-foreground" />
      <rect x="8" y="3.5" width="8" height="5" rx="1" className="fill-background" />
      <rect x="8" y="9.5" width="8" height="5" rx="1" className="fill-background" />
      <rect x="8" y="15.5" width="8" height="2.5" rx="1" className="fill-background" />
    </svg>
  )
}
