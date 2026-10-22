import { useEffect } from "react"
import { toast } from "sonner"
import { useRegisterSW } from "virtual:pwa-register/react"

import { isShooting, useSession } from "@/features/booth/session"

const TOAST_ID = "pwa-update"
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Registers the service worker and offers a reload when a new deploy is ready. Installed
 * apps check on launch, hourly, and whenever they return to the foreground. The prompt is
 * held back while photos are being taken, so an update never interrupts a session.
 */
export function PwaUpdatePrompt() {
  const shooting = useSession((s) => isShooting(s.phase))
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {})
      }
      window.setInterval(check, CHECK_INTERVAL_MS)
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check()
      })
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    if (shooting) {
      toast.dismiss(TOAST_ID)
      return
    }
    toast("New version available", {
      id: TOAST_ID,
      description: "Reload to get the latest Photobooth.",
      duration: Infinity,
      action: { label: "Reload", onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, shooting, updateServiceWorker])

  return null
}
