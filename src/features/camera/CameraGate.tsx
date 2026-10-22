import { CameraIcon, CameraOffIcon, RotateCcwIcon, ShieldCheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import type { CameraError } from "./cameraErrors"
import type { CameraStatus } from "./useCamera"

type CameraGateProps = {
  status: CameraStatus
  muted: boolean
  onStart: () => void
}

/** Overlay inside the preview box until the camera is live: start button or progress. */
export function CameraGate({ status, muted, onStart }: CameraGateProps) {
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

  return (
    <div className="absolute inset-0 grid place-items-center overflow-auto bg-neutral-950 p-4 text-center text-white">
      <div className="flex max-w-xs flex-col items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-white/10">
          <CameraIcon className="size-6" />
        </span>
        <p className="text-sm text-white/75 phone-landscape:hidden">
          Photos are taken and processed on this device. Nothing is uploaded.
        </p>
        <Button
          size="lg"
          onClick={onStart}
          className="h-11 rounded-full bg-white px-5 text-base text-neutral-950 hover:bg-white/90"
        >
          <CameraIcon />
          Start camera
        </Button>
      </div>
    </div>
  )
}

type CameraErrorPanelProps = {
  error: CameraError
  onRetry: () => void
}

/** Friendly camera error with fix-it steps. Covers the stage (errors need room for steps). */
export function CameraErrorPanel({ error, onRetry }: CameraErrorPanelProps) {
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
        <div className="flex flex-wrap items-center gap-3">
          {error.kind !== "insecure" && error.kind !== "unsupported" && (
            <Button size="lg" className="h-11 px-5" onClick={onRetry}>
              <RotateCcwIcon />
              Try again
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
