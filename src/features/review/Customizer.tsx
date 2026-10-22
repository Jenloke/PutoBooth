import { useId, useRef } from "react"
import { ImagePlusIcon, PipetteIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  CAPTION_MAX_LENGTH,
  FRAME_PRESETS,
  PADDING_RANGE,
  type Design,
} from "@/features/compose/design"
import { FilterPicker } from "@/features/compose/FilterPicker"
import { FONTS, cssFontFamily, isFontId } from "@/features/compose/fonts"
import { useLogo } from "@/features/compose/logoStore"
import { formatBytes } from "@/features/export/export"
import { LayoutPicker } from "@/features/layouts/LayoutPicker"
import {
  isStrip,
  layoutsWithShotCount,
  printSizeInches,
  type LayoutId,
  type LayoutSpec,
} from "@/features/layouts/layouts"
import { useObjectUrl } from "@/lib/useObjectUrl"
import { cn } from "@/lib/utils"
import { JPEG_QUALITY_RANGE, useSettings } from "@/store/settings"

type CustomizerProps = {
  layout: LayoutSpec
  shotCount: number
  onSelectLayout: (id: LayoutId) => void
  sampleUrl?: string
  output: { width: number; height: number; size: number | null }
  className?: string
}

export function Customizer({ layout, shotCount, onSelectLayout, sampleUrl, output, className }: CustomizerProps) {
  return (
    <Tabs defaultValue="style" className={cn("min-h-0 gap-0", className)}>
      <div className="shrink-0 px-4 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
        <TabsContent value="style">
          <StyleTab sampleUrl={sampleUrl} />
        </TabsContent>
        <TabsContent value="text">
          <TextTab />
        </TabsContent>
        <TabsContent value="layout">
          <LayoutTab layout={layout} shotCount={shotCount} onSelectLayout={onSelectLayout} />
        </TabsContent>
        <TabsContent value="export">
          <ExportTab layout={layout} output={output} />
        </TabsContent>
      </div>
    </Tabs>
  )
}

function useDesign(): [Design, (patch: Partial<Design>) => void] {
  const design = useSettings((s) => s.design)
  const updateDesign = useSettings((s) => s.updateDesign)
  return [design, updateDesign]
}

function StyleTab({ sampleUrl }: { sampleUrl?: string }) {
  const [design, update] = useDesign()
  const id = useId()
  const isPreset = FRAME_PRESETS.some((p) => p.value === design.frameColor)

  return (
    <FieldGroup className="gap-7">
      <FieldSet>
        <FieldLegend variant="label">Filter</FieldLegend>
        <FilterPicker value={design.filter} onChange={(filter) => update({ filter })} sampleUrl={sampleUrl} />
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label">Frame color</FieldLegend>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            spacing={2}
            value={isPreset ? design.frameColor : ""}
            onValueChange={(value) => value && update({ frameColor: value })}
            aria-label="Frame color"
            className="flex-wrap"
          >
            {FRAME_PRESETS.map((preset) => (
              <ToggleGroupItem
                key={preset.value}
                value={preset.value}
                aria-label={preset.name}
                title={preset.name}
                className="size-9 min-w-0 rounded-full p-0 ring-offset-2 ring-offset-background data-[state=on]:bg-transparent data-[state=on]:ring-2 data-[state=on]:ring-foreground"
              >
                <span
                  className="block size-7 rounded-full ring-1 ring-black/15 ring-inset dark:ring-white/25"
                  style={{ backgroundColor: preset.value }}
                />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <label
            className={cn(
              "relative grid size-9 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-background focus-within:ring-3 focus-within:ring-ring/50",
              !isPreset && "ring-2 ring-foreground"
            )}
            title="Custom color"
          >
            <span
              className="grid size-7 place-items-center rounded-full ring-1 ring-black/15 ring-inset dark:ring-white/25"
              style={{
                background: isPreset
                  ? "conic-gradient(#f87171, #fbbf24, #4ade80, #60a5fa, #c084fc, #f87171)"
                  : design.frameColor,
              }}
            >
              <PipetteIcon className="size-3.5 text-white mix-blend-difference" />
            </span>
            <input
              type="color"
              aria-label="Custom frame color"
              value={design.frameColor}
              onChange={(event) => update({ frameColor: event.target.value.toLowerCase() })}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </FieldSet>

      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor={`${id}-padding`}>Padding</FieldLabel>
          <span className="text-sm text-muted-foreground tabular-nums">{Math.round(design.padding * 100)}%</span>
        </div>
        <Slider
          id={`${id}-padding`}
          min={PADDING_RANGE.min}
          max={PADDING_RANGE.max}
          step={PADDING_RANGE.step}
          value={[design.padding]}
          onValueChange={([padding]) => update({ padding })}
          aria-label="Padding around photos"
        />
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor={`${id}-radius`}>Rounded corners</FieldLabel>
          <span className="text-sm text-muted-foreground tabular-nums">{Math.round(design.radius * 100)}%</span>
        </div>
        <Slider
          id={`${id}-radius`}
          min={0}
          max={1}
          step={0.05}
          value={[design.radius]}
          onValueChange={([radius]) => update({ radius })}
          aria-label="Photo corner radius"
        />
      </Field>
    </FieldGroup>
  )
}

function TextTab() {
  const [design, update] = useDesign()
  const logo = useLogo()
  const logoUrl = useObjectUrl(logo.blob)
  const fileInput = useRef<HTMLInputElement>(null)
  const id = useId()

  const onLogoFile = async (file: File | undefined) => {
    if (!file) return
    try {
      await logo.setFromFile(file)
      update({ showLogo: true })
    } catch {
      toast.error("That image couldn't be used as a logo", { description: "Try a PNG or JPEG." })
    }
  }

  return (
    <FieldGroup className="gap-7">
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor={`${id}-caption`}>Caption</FieldLabel>
          <span className="text-xs text-muted-foreground tabular-nums">
            {design.caption.length}/{CAPTION_MAX_LENGTH}
          </span>
        </div>
        <Input
          id={`${id}-caption`}
          value={design.caption}
          maxLength={CAPTION_MAX_LENGTH}
          placeholder="Event name, e.g. Sam & Alex 2026"
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => update({ caption: event.target.value })}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className="h-10"
        />
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Font</FieldLegend>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={design.font}
          onValueChange={(value) => isFontId(value) && update({ font: value })}
          aria-label="Font"
          className="grid w-full grid-cols-2 gap-2"
        >
          {FONTS.map((font) => (
            <ToggleGroupItem
              key={font.id}
              value={font.id}
              className="h-11 justify-start px-3 text-base data-[state=on]:border-foreground/40 data-[state=on]:bg-accent"
            >
              <span style={{ fontFamily: cssFontFamily(font), fontWeight: font.weight }}>{font.name}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldSet>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`${id}-date`}>Date stamp</FieldLabel>
          <FieldDescription>The day the photos were taken.</FieldDescription>
        </FieldContent>
        <Switch id={`${id}-date`} checked={design.showDate} onCheckedChange={(showDate) => update({ showDate })} />
      </Field>

      <FieldSet>
        <FieldLegend variant="label">Logo</FieldLegend>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            void onLogoFile(event.target.files?.[0])
            event.target.value = ""
          }}
        />
        {logo.blob && logoUrl ? (
          <div className="flex items-center gap-3 rounded-lg border p-2">
            <img
              src={logoUrl}
              alt="Your logo"
              className="size-14 rounded-md bg-[conic-gradient(#e5e5e5_25%,#fff_0_50%,#e5e5e5_0_75%,#fff_0)] bg-[length:12px_12px] object-contain"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Field orientation="horizontal">
                <FieldLabel htmlFor={`${id}-logo`} className="flex-1">
                  Show logo
                </FieldLabel>
                <Switch
                  id={`${id}-logo`}
                  checked={design.showLogo}
                  onCheckedChange={(showLogo) => update({ showLogo })}
                />
              </Field>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                  Replace
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void logo.clear()}>
                  <Trash2Icon />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="h-11 w-full" onClick={() => fileInput.current?.click()}>
            <ImagePlusIcon />
            Upload a logo
          </Button>
        )}
        <FieldDescription>PNG with transparency works best. Kept on this device for your next session.</FieldDescription>
      </FieldSet>
    </FieldGroup>
  )
}

function LayoutTab({
  layout,
  shotCount,
  onSelectLayout,
}: {
  layout: LayoutSpec
  shotCount: number
  onSelectLayout: (id: LayoutId) => void
}) {
  const options = layoutsWithShotCount(shotCount)
  return (
    <FieldSet>
      <FieldLegend variant="label">Layout</FieldLegend>
      <FieldDescription>
        {options.length > 1
          ? `Layouts with ${shotCount} ${shotCount === 1 ? "photo" : "photos"} reuse your shots.`
          : `No other layout uses ${shotCount} ${shotCount === 1 ? "photo" : "photos"}. Start over to pick a different one.`}
      </FieldDescription>
      <LayoutPicker variant="list" layouts={options} value={layout.id} onChange={onSelectLayout} />
    </FieldSet>
  )
}

function ExportTab({
  layout,
  output,
}: {
  layout: LayoutSpec
  output: { width: number; height: number; size: number | null }
}) {
  const settings = useSettings()
  const id = useId()
  const strip = isStrip(layout)
  const sheet = strip && settings.printSheet
  const inches = sheet ? { width: 4, height: 6 } : printSizeInches(layout)

  return (
    <FieldGroup className="gap-7">
      <Field orientation="horizontal">
        <FieldLabel className="flex-1">File format</FieldLabel>
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

      {settings.exportFormat === "jpeg" && (
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor={`${id}-quality`}>JPEG quality</FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">{Math.round(settings.jpegQuality * 100)}</span>
          </div>
          <Slider
            id={`${id}-quality`}
            min={JPEG_QUALITY_RANGE.min}
            max={JPEG_QUALITY_RANGE.max}
            step={JPEG_QUALITY_RANGE.step}
            value={[settings.jpegQuality]}
            onValueChange={([jpegQuality]) => settings.update({ jpegQuality })}
            aria-label="JPEG quality"
          />
        </Field>
      )}

      {strip && (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-sheet`}>Print sheet: 2 strips on 4×6</FieldLabel>
            <FieldDescription>Two copies side by side. Print on 4×6 paper and cut down the middle.</FieldDescription>
          </FieldContent>
          <Switch
            id={`${id}-sheet`}
            checked={settings.printSheet}
            onCheckedChange={(printSheet) => settings.update({ printSheet })}
          />
        </Field>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
        <dt className="text-muted-foreground">Size</dt>
        <dd className="tabular-nums">
          {output.width} × {output.height} px
        </dd>
        {inches && (
          <>
            <dt className="text-muted-foreground">Print</dt>
            <dd className="tabular-nums">
              {inches.width} × {inches.height} in at 300 DPI
            </dd>
          </>
        )}
        {output.size !== null && (
          <>
            <dt className="text-muted-foreground">File</dt>
            <dd className="tabular-nums">
              {settings.exportFormat.toUpperCase()} · {formatBytes(output.size)}
            </dd>
          </>
        )}
      </dl>
    </FieldGroup>
  )
}
