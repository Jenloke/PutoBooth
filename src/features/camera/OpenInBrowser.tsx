import { CopyIcon, ExternalLinkIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { usePair } from "@/features/pair/pairStore"
import { inviteUrl } from "@/features/pair/roomCode"
import { trackEvent } from "@/lib/analytics"
import { chromeIntentUrl, isAndroid, isIOS, type InAppBrowser } from "@/lib/platform"
import { cn } from "@/lib/utils"

import { inAppError } from "./cameraErrors"

/** This page's address for a real browser, keeping an invite code a guest arrived with. */
function pageUrl(): string {
  const { role, code } = usePair.getState()
  return role === "guest" && code ? inviteUrl(code) : `${window.location.origin}/`
}

/** Frees the host's room before this device rejoins from the other browser. */
function leaveForOtherBrowser() {
  const { role, status } = usePair.getState()
  if (role === "guest" && status !== "off") usePair.getState().leave()
}

type ActionsProps = {
  app: InAppBrowser
  /** On the camera screen's dark backdrop, whatever the theme. */
  onDark?: boolean
  className?: string
}

/** Open in Chrome (Android) and Copy link: the ways out of an in-app browser. */
export function OpenInBrowserActions({ app, onDark = false, className }: ActionsProps) {
  const copy = async () => {
    const url = pageUrl()
    trackEvent("open_in_browser", { app, action: "copy" })
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copied", { description: `Paste it into ${isIOS() ? "Safari" : "Chrome"} to use the camera.` })
    } catch {
      // Some in-app browsers block the clipboard: show the link to copy by hand.
      toast("Copy this link", { description: url, duration: 20_000 })
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
      {isAndroid() && (
        <Button asChild size="sm" className={cn(onDark && "bg-white text-neutral-950 hover:bg-white/90")}>
          <a
            href={chromeIntentUrl(pageUrl())}
            onClick={(event) => {
              // Built at tap time: a guest's invite code must still be in it.
              event.currentTarget.href = chromeIntentUrl(pageUrl())
              trackEvent("open_in_browser", { app, action: "intent" })
              leaveForOtherBrowser()
            }}
          >
            <ExternalLinkIcon />
            Open in Chrome
          </a>
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className={cn(onDark && "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white dark:bg-transparent")}
        onClick={() => void copy()}
      >
        <CopyIcon />
        Copy link
      </Button>
    </div>
  )
}

/** Shown on the camera screen before anyone taps Start, inside an app that may block the camera. */
export function InAppBrowserNotice({ app }: { app: InAppBrowser }) {
  return (
    <div
      role="note"
      className="flex flex-col gap-2 rounded-xl bg-amber-300/15 p-3 text-left text-xs text-amber-50 ring-1 ring-amber-200/30"
    >
      <p className="text-sm font-medium text-white">{app}'s browser may block the camera</p>
      <p className="text-white/75 gate-short:hidden">{inAppError("unsupported", app).steps[0]}</p>
      <OpenInBrowserActions app={app} onDark className="justify-start" />
    </div>
  )
}
