import { trackEvent } from "./analytics"
import { inAppBrowser, isIOS, isStandalone } from "./platform"

/** Chrome's install prompt (Android, desktop). Not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: BeforeInstallPromptEvent | null = null

/**
 * Keeps Chrome's install prompt for later (it fires once, early, on page load) so the app can
 * offer to install at a good moment: after the first saved strip. Chrome's own install UI
 * stays as it is; this doesn't call preventDefault.
 */
export function captureInstallPrompt(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    deferred = event as BeforeInstallPromptEvent
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    trackEvent("install", { outcome: "installed" })
  })
}

/** How this browser installs the app: Chrome's prompt, Safari's Share sheet (iOS), or not at all. */
export type InstallOffer = "prompt" | "ios" | null

export function installOffer(): InstallOffer {
  if (isStandalone()) return null
  if (deferred) return "prompt"
  // iPhone and iPad install from the Share sheet; in-app browsers can't.
  if (isIOS() && !inAppBrowser()) return "ios"
  return null
}

export async function promptInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    trackEvent("install", { outcome })
  } catch {
    // Already used, or the browser withdrew it.
  }
}
