import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { LayoutIcon } from "./LayoutIcon"
import type { LayoutId, LayoutSpec } from "./layouts"

type LayoutPickerProps = {
  layouts: readonly LayoutSpec[]
  value: LayoutId
  onChange: (id: LayoutId) => void
  /** `chips`: one scrollable row (phones). `list`: a vertical list with sizes (panels). */
  variant: "chips" | "list"
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

export function LayoutPicker({
  layouts,
  value,
  onChange,
  variant,
  disabled,
  className,
  "aria-label": ariaLabel = "Layout",
}: LayoutPickerProps) {
  const group = (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={2}
      orientation={variant === "list" ? "vertical" : "horizontal"}
      value={value}
      // Radix allows deselecting the active item; a layout must always be selected.
      onValueChange={(next) => next && onChange(next as LayoutId)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(variant === "list" ? "w-full" : "w-max px-3 sm:px-4")}
    >
      {layouts.map((layout) => (
        <ToggleGroupItem
          key={layout.id}
          value={layout.id}
          aria-label={`${layout.name}, ${layout.description}`}
          className={cn(
            "gap-2 data-[state=on]:border-foreground/40 data-[state=on]:bg-accent",
            variant === "list" ? "h-auto justify-start px-3 py-2 text-left" : "h-11 rounded-full pr-4 pl-2.5"
          )}
        >
          <LayoutIcon layout={layout} className={variant === "list" ? "h-9" : "h-7"} />
          {variant === "list" ? (
            <span className="flex flex-col items-start">
              <span className="font-medium">{layout.name}</span>
              <span className="text-xs text-muted-foreground">{layout.description}</span>
            </span>
          ) : (
            <span>{layout.name}</span>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )

  if (variant === "list") return <div className={className}>{group}</div>

  return (
    <div
      className={cn(
        "-my-1 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {group}
    </div>
  )
}
