import { toast } from "sonner"

import { usePair } from "@/features/pair/pairStore"
import { trackEvent } from "@/lib/analytics"
import { installOffer, promptInstall, type InstallOffer } from "@/lib/install"

/** Suggestions after a saved strip. Each is shown once per device, and at most one at a time. */
export type NextStep = "install" | "together"

const STORAGE_KEY = "photobooth-next-steps"
/** After the save's own confirmation, so the two don't arrive as one. */
const DELAY_MS = 1200

function shown(): NextStep[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(value) ? (value as NextStep[]) : []
  } catch {
    return []
  }
}

function markShown(step: NextStep): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set([...shown(), step])]))
  } catch {
    // Private mode: the suggestion may come back next visit, which is fine.
  }
}

/**
 * Which suggestion fits now: installing comes first (it brings people back), then the shared
 * booth for someone who has only shot alone. Null when both were shown or neither applies.
 */
export function pickNextStep(seen: readonly NextStep[], offer: InstallOffer, linked: boolean): NextStep | null {
  if (offer && !seen.includes("install")) return "install"
  if (!linked && !seen.includes("together")) return "together"
  return null
}

function show(step: NextStep, offer: InstallOffer) {
  if (step === "install" && offer === "prompt") {
    toast("Keep Photobooth on your home screen", {
      description: "Install it to open it in one tap. It works offline too.",
      duration: 10_000,
      action: { label: "Install", onClick: () => void promptInstall() },
    })
  } else if (step === "install") {
    trackEvent("install", { outcome: "ios_hint" })
    toast("Add Photobooth to your Home Screen", {
      description: "Tap Share, then Add to Home Screen. It opens in one tap and works offline.",
      duration: 10_000,
    })
  } else {
    toast("Next time, shoot together", {
      description: "Two devices, one strip: each of you fills half of every photo, from anywhere.",
      duration: 10_000,
      action: { label: "Try it", onClick: () => usePair.getState().setDialogOpen(true) },
    })
  }
}

/** Call after a strip is saved (downloaded, shared or printed). */
export function suggestNextStep({ linked }: { linked: boolean }): void {
  window.setTimeout(() => {
    const offer = installOffer()
    const step = pickNextStep(shown(), offer, linked)
    if (!step) return
    markShown(step)
    show(step, offer)
  }, DELAY_MS)
}
