import { useId } from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FilterPicker } from "@/features/compose/FilterPicker"
import { CameraPicker } from "@/features/camera/CameraPicker"
import type { UseCamera } from "@/features/camera/useCamera"
import { LayoutPicker } from "@/features/layouts/LayoutPicker"
import { LAYOUTS, isLayoutId, type LayoutId } from "@/features/layouts/layouts"
import {
  COUNTDOWN_OPTIONS,
  PAUSE_RANGE,
  useSettings,
  type Countdown,
  type Settings,
} from "@/store/settings"

import { unlockAudio } from "./sound"

type BoothSettingsProps = {
  camera: UseCamera
  onSelectCamera: (deviceId: string) => void
  layoutId: LayoutId
  onSelectLayout: (id: LayoutId) => void
  /** The phone UI has layout chips under the preview, so only panels show the list. */
  showLayouts: boolean
  disabled: boolean
}

type BooleanSetting = "mirror" | "flash" | "sound" | "grid"

const SWITCHES: { key: BooleanSetting; label: string; description: string }[] = [
  { key: "mirror", label: "Mirror photos", description: "Save selfies the way the preview shows them." },
  { key: "flash", label: "Screen flash", description: "Flashes white at each shot; lights faces in dim rooms." },
  { key: "sound", label: "Shutter sound", description: "Countdown beeps and a shutter click." },
  { key: "grid", label: "Grid overlay", description: "Rule-of-thirds guides on the preview." },
]

/** Booth settings: in the side panel on Mac, in a bottom drawer on iPhone. */
export function BoothSettings({
  camera,
  onSelectCamera,
  layoutId,
  onSelectLayout,
  showLayouts,
  disabled,
}: BoothSettingsProps) {
  const settings = useSettings()
  const id = useId()

  const setFlag = (key: BooleanSetting, value: boolean) => {
    // Turning sound on is a user gesture: unlock audio now so the first beep plays on iOS.
    if (key === "sound" && value) unlockAudio()
    settings.update({ [key]: value } as Partial<Settings>)
  }

  return (
    <FieldGroup className="gap-7">
      {showLayouts && (
        <FieldSet>
          <FieldLegend variant="label">Layout</FieldLegend>
          <LayoutPicker
            variant="list"
            layouts={LAYOUTS}
            value={layoutId}
            onChange={onSelectLayout}
            disabled={disabled}
          />
        </FieldSet>
      )}

      <FieldSet>
        <FieldLegend variant="label">Filter</FieldLegend>
        <FilterPicker
          value={settings.design.filter}
          onChange={(filter) => settings.updateDesign({ filter })}
        />
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Countdown</FieldLegend>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={String(settings.countdown)}
          onValueChange={(v) => v && settings.update({ countdown: Number(v) as Countdown })}
          disabled={disabled}
          aria-label="Countdown"
          className="w-full"
        >
          {COUNTDOWN_OPTIONS.map((seconds) => (
            <ToggleGroupItem key={seconds} value={String(seconds)} className="flex-1">
              {seconds} s
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor={`${id}-pause`}>Pause between shots</FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">
              {settings.pauseSeconds.toFixed(1)} s
            </span>
          </div>
          <Slider
            id={`${id}-pause`}
            min={PAUSE_RANGE.min}
            max={PAUSE_RANGE.max}
            step={PAUSE_RANGE.step}
            value={[settings.pauseSeconds]}
            onValueChange={([value]) => settings.update({ pauseSeconds: value })}
            disabled={disabled}
            aria-label="Pause between shots, in seconds"
          />
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Capture</FieldLegend>
        <FieldGroup className="gap-4">
          {SWITCHES.map((item) => (
            <Field key={item.key} orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor={`${id}-${item.key}`}>{item.label}</FieldLabel>
                <FieldDescription>{item.description}</FieldDescription>
              </FieldContent>
              <Switch
                id={`${id}-${item.key}`}
                checked={settings[item.key]}
                onCheckedChange={(checked) => setFlag(item.key, checked)}
              />
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      {camera.devices.length > 0 && (
        <FieldSet>
          <FieldLegend variant="label">Camera</FieldLegend>
          <Field>
            <CameraPicker
              id={`${id}-camera`}
              devices={camera.devices}
              deviceId={camera.deviceId}
              onSelect={onSelectCamera}
              disabled={disabled}
            />
            {camera.resolution && (
              <FieldDescription>
                {camera.resolution.width}×{camera.resolution.height} ·{" "}
                {camera.devices.length > 1
                  ? "External webcams and Continuity Camera appear here when connected."
                  : "Connect a webcam or use Continuity Camera to switch cameras."}
              </FieldDescription>
            )}
          </Field>
        </FieldSet>
      )}

      <FieldSet>
        <FieldLegend variant="label">Defaults</FieldLegend>
        <Field orientation="horizontal">
          <FieldLabel htmlFor={`${id}-default-layout`} className="flex-1">
            Layout on launch
          </FieldLabel>
          <Select
            value={settings.defaultLayout}
            onValueChange={(v) => isLayoutId(v) && settings.update({ defaultLayout: v })}
          >
            <SelectTrigger id={`${id}-default-layout`} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {LAYOUTS.map((layout) => (
                <SelectItem key={layout.id} value={layout.id}>
                  {layout.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <FieldLabel className="flex-1">Save as</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={settings.exportFormat}
            onValueChange={(v) => (v === "png" || v === "jpeg") && settings.update({ exportFormat: v })}
            aria-label="File format"
          >
            <ToggleGroupItem value="png" className="w-20">
              PNG
            </ToggleGroupItem>
            <ToggleGroupItem value="jpeg" className="w-20">
              JPEG
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldSet>
    </FieldGroup>
  )
}
