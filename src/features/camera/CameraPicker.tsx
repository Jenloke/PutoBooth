import { SwitchCameraIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

import type { CameraDevice } from "./useCamera"

type CameraPickerProps = {
  devices: CameraDevice[]
  deviceId: string | null
  onSelect: (deviceId: string) => void
  disabled?: boolean
  className?: string
  id?: string
}

/** Every camera the browser offers: built-in, external webcams, Continuity Camera. */
export function CameraPicker({ devices, deviceId, onSelect, disabled, className, id }: CameraPickerProps) {
  if (devices.length === 0) return null
  const value = devices.some((d) => d.id === deviceId) ? (deviceId ?? undefined) : undefined

  return (
    <Select value={value} onValueChange={onSelect} disabled={disabled || devices.length < 2}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label="Camera">
        <SelectValue placeholder="Choose a camera" />
      </SelectTrigger>
      <SelectContent position="popper">
        {devices.map((device) => (
          <SelectItem key={device.id} value={device.id}>
            {device.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type FlipCameraButtonProps = {
  onFlip: () => void
  disabled?: boolean
  className?: string
}

/** Front/back toggle for phones (facingMode user ↔ environment). */
export function FlipCameraButton({ onFlip, disabled, className }: FlipCameraButtonProps) {
  return (
    <Button
      variant="secondary"
      size="icon-lg"
      className={cn("size-12 rounded-full", className)}
      onClick={onFlip}
      disabled={disabled}
      aria-label="Switch between front and back camera"
    >
      <SwitchCameraIcon className="size-5" />
    </Button>
  )
}
