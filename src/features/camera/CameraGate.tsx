import { useMemo } from "react"
import { CameraIcon, CameraOffIcon, ImagesIcon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { LayoutDemo } from "@/features/layouts/LayoutDemo"
import { shotCount, type LayoutSpec } from "@/features/layouts/layouts"
import { inAppBrowser } from "@/lib/platform"
import { cn } from "@/lib/utils"

import type { CameraError } from "./cameraErrors"
import { InAppBrowserNotice, OpenInBrowserActions } from "./OpenInBrowser"
import type { CameraStatus } from "./useCamera"

const PRIVACY_NOTE = "Photos are taken and processed on this device. Nothing is uploaded."

type CameraGateProps = {
  status: CameraStatus
  muted: boolean
  onStart: () => void
  /** Replaces the privacy note (the shared booth sends photos to the partner's device). */
  note?: string
  /** Solo booth: what a session makes, shown before the camera starts. */
  intro?: { layout: LayoutSpec; countdown: number }
  /** Solo booth: make the strip from library photos instead. */
  onPickPhotos?: () => void
}

/** "4 photos · 3-second countdown" */
export function sessionSummary(layout: LayoutSpec, countdown: number): string {
  const photos = shotCount(layout)
  return `${photos} ${photos === 1 ? "photo" : "photos"} · ${countdown}-second countdown`
}

/** Overlay inside the preview box until the camera is live: start button or progress. */
export function CameraGate({ status, muted, onStart, note, intro, onPickPhotos }: CameraGateProps) {
  const app = useMemo(() => inAppBrowser(), [])

  if (status === "live" && !muted) return null

  if (status === "live" && muted) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-neutral-950/80 p-4 text-center text-sm text-white">
        <div className="flex flex-col items-center gap-2">
          <Spinner className="size-5" />
          Waiting for the camera…
        </div>
      </div>
    )
  }

  if (status === "starting") {
    return (
      <div className="absolute inset-0 grid place-items-center bg-neutral-950 p-4 text-center text-sm text-white/85">
        <div className="flex flex-col items-center gap-2">
          <Spinner className="size-5" />
          <span>Starting camera…</span>
          <span className="text-xs text-white/60">Allow camera access if your browser asks.</span>
        </div>
      </div>
    )
  }

  const startButton = (
    <Button
      size="lg"
      onClick={onStart}
      className="h-11 rounded-full bg-white px-5 text-base text-neutral-950 hover:bg-white/90"
    >
      <CameraIcon />
      Start camera
    </Button>
  )

  if (!intro) {
    return (
      <div className="absolute inset-0 grid place-items-center overflow-auto bg-neutral-950 p-4 text-center text-white">
        <div className="flex max-w-xs flex-col items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-white/10">
            <CameraIcon className="size-6" />
          </span>
          <p className="text-sm text-white/75 phone-landscape:hidden">{note ?? PRIVACY_NOTE}</p>
          {startButton}
        </div>
      </div>
    )
  }

  // Solo booth: show what you get before asking for the camera. A phone's preview box is short
  // (about 240 px), so the demo sits beside the text and extras drop out when space runs out.
  // Centered with auto margins, not place-items: content taller than the box stays scrollable.
  return (
    <div className="absolute inset-0 flex overflow-auto bg-neutral-950 p-4 text-white @container-size">
      <div className="m-auto flex w-full max-w-sm flex-col items-center gap-3 gate-short:gap-2">
        {/* In an in-app browser on a phone, the way out matters more than the preview. */}
        <div className={cn("flex items-center gap-4", app && "gate-short:hidden")}>
          <LayoutDemo key={intro.layout.id} layout={intro.layout} className="h-24 gate-tall:h-40" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-heading text-base font-semibold">{intro.layout.name}</p>
            <p className="text-sm text-white/75">{sessionSummary(intro.layout, intro.countdown)}</p>
            <p className="text-xs text-pretty text-white/55 gate-short:hidden">{PRIVACY_NOTE}</p>
          </div>
        </div>
        {app && <InAppBrowserNotice app={app} />}
        <div className="flex flex-col items-center gap-1">
          {startButton}
          {onPickPhotos && (
            <Button variant="link" size="sm" onClick={onPickPhotos} className="text-white/75 hover:text-white">
              <ImagesIcon />
              Use photos instead
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

type CameraErrorPanelProps = {
  error: CameraError
  onRetry: () => void
  /** Solo booth: make the strip from library photos instead. */
  onPickPhotos?: () => void
}

/** Friendly camera error with fix-it steps. Covers the stage (errors need room for steps). */
export function CameraErrorPanel({ error, onRetry, onPickPhotos }: CameraErrorPanelProps) {
  const app = useMemo(() => inAppBrowser(), [])
  return (
    <div role="alert" className="absolute inset-0 overflow-auto bg-background p-4">
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 py-2">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <CameraOffIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-base font-semibold">{error.title}</h2>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </div>
        </div>
        <ol className="flex list-decimal flex-col gap-2 rounded-xl border bg-muted/40 p-4 pl-8 text-sm">
          {error.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {app && (error.kind === "denied" || error.kind === "unsupported") && (
          <OpenInBrowserActions app={app} className="justify-start" />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {error.kind !== "insecure" && error.kind !== "unsupported" && (
            <Button size="lg" className="h-11 px-5" onClick={onRetry}>
              <RotateCcwIcon />
              Try again
            </Button>
          )}
          {onPickPhotos && (
            <Button size="lg" variant="outline" className="h-11 px-5" onClick={onPickPhotos}>
              <ImagesIcon />
              Use photos instead
            </Button>
          )}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" />
            Photos never leave this device.
          </span>
        </div>
      </div>
    </div>
  )
}
