import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { PwaUpdatePrompt } from "@/components/pwa-update"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { normalizeLocation } from "@/lib/router"

normalizeLocation()

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
