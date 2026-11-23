import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { PwaUpdatePrompt } from "@/components/pwa-update"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { consumeJoinLink, consumeTogetherLink } from "@/features/pair/pairStore"
import { startAnalytics, trackEvent } from "@/lib/analytics"
import { captureInstallPrompt } from "@/lib/install"
import { inAppBrowser } from "@/lib/platform"
import { normalizeLocation } from "@/lib/router"

normalizeLocation()
// Chrome offers installation once, early: keep it for after the first saved strip.
captureInstallPrompt()
const invited = consumeJoinLink()
if (!invited) consumeTogetherLink()
// After the URL is cleaned up, so the first page view never carries an invite code.
startAnalytics()
// Events sent before startAnalytics() would be dropped.
if (invited) trackEvent("pair", { role: "guest", via: "link" })
const app = inAppBrowser()
if (app) trackEvent("in_app_browser", { app })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider storageKey="photobooth-theme">
      <TooltipProvider delayDuration={400}>
        <App />
        <Toaster position="top-center" />
        <PwaUpdatePrompt />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>
)
