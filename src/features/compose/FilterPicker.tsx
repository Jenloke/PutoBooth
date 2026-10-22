import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { FILTERS, toCssFilter, type FilterId } from "./filters"

type FilterPickerProps = {
  value: FilterId
  onChange: (id: FilterId) => void
  /** A photo to preview filters on; a colorful sample swatch is used otherwise. */
  sampleUrl?: string
  disabled?: boolean
  className?: string
}

export function FilterPicker({ value, onChange, sampleUrl, disabled, className }: FilterPickerProps) {
  return (
    <ToggleGroup
      type="single"
      spacing={2}
      value={value}
      onValueChange={(next) => next && onChange(next as FilterId)}
      disabled={disabled}
      aria-label="Filter"
      className={cn("grid w-full grid-cols-4 gap-2", className)}
    >
      {FILTERS.map((filter) => (
        <ToggleGroupItem
          key={filter.id}
          value={filter.id}
          className="group/filter h-auto min-w-0 flex-col gap-1.5 rounded-lg p-1 pb-1.5 text-xs font-normal data-[state=on]:bg-transparent data-[state=on]:font-medium"
        >
          <span
            aria-hidden="true"
            className="block aspect-square w-full overflow-hidden rounded-md ring-2 ring-transparent ring-offset-2 ring-offset-background transition-shadow group-data-[state=on]/filter:ring-foreground"
          >
            {sampleUrl ? (
              <img
                src={sampleUrl}
                alt=""
                className="size-full object-cover"
                style={{ filter: toCssFilter(filter.ops) }}
              />
            ) : (
              <span
                className="block size-full bg-[linear-gradient(135deg,#f7c9a6_0%,#e07a5f_30%,#f2cc8f_45%,#81b29a_65%,#3d5a80_100%)]"
                style={{ filter: toCssFilter(filter.ops) }}
              />
            )}
          </span>
          <span className="truncate">{filter.name}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
