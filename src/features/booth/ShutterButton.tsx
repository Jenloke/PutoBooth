import { XIcon } from "lucide-react"

import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ShutterButtonProps = {
  shooting: boolean
  disabled: boolean
  onShoot: () => void
  onCancel: () => void
  className?: string
}

/** Big round shutter. While a sequence runs it becomes Cancel. */
export function ShutterButton({ shooting, disabled, onShoot, onCancel, className }: ShutterButtonProps) {
  const label = shooting ? "Cancel" : "Take photos"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={shooting ? onCancel : onShoot}
          disabled={!shooting && disabled}
          aria-label={label}
          data-shooting={shooting || undefined}
          className={cn(
            "group/shutter relative grid size-19 shrink-0 place-items-center rounded-full border-4 border-foreground/85 outline-none transition-transform select-none",
            "focus-visible:ring-4 focus-visible:ring-ring/60 active:scale-95 motion-reduce:transition-none",
            "disabled:cursor-not-allowed disabled:opacity-40",
            className
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "grid size-[3.6rem] place-items-center rounded-full bg-foreground transition-all motion-reduce:transition-none",
              "group-enabled/shutter:group-hover/shutter:scale-95",
              "group-data-shooting/shutter:size-10 group-data-shooting/shutter:rounded-xl group-data-shooting/shutter:bg-destructive"
            )}
          >
            {shooting && <XIcon className="size-6 text-white" />}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label} <Kbd>{shooting ? "Esc" : "Space"}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
