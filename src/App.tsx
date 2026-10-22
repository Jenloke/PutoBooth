import { lazy, Suspense } from "react"

import { AppHeader } from "@/components/app-header"
import { Spinner } from "@/components/ui/spinner"
import { BoothScreen } from "@/features/booth/BoothScreen"
import { useSession } from "@/features/booth/session"
import { useRoute } from "@/lib/router"

// The booth loads first; review code is fetched (or read from the SW cache) on demand.
const ReviewScreen = lazy(() =>
  import("@/features/review/ReviewScreen").then((m) => ({ default: m.ReviewScreen }))
)

function ScreenFallback() {
  return (
    <div className="grid flex-1 place-items-center">
      <Spinner className="size-6" />
    </div>
  )
}

export function App() {
  const route = useRoute()
  const reviewing = useSession((s) => s.phase === "review")

  return (
    <div className="pl-safe pr-safe flex h-dvh flex-col overflow-hidden bg-background">
      <Suspense fallback={<ScreenFallback />}>
        {route === "/gallery" ? (
          <>
            <AppHeader />
            <main className="grid flex-1 place-items-center p-6 text-muted-foreground">Gallery</main>
          </>
        ) : reviewing ? (
          <ReviewScreen />
        ) : (
          <BoothScreen />
        )}
      </Suspense>
    </div>
  )
}

export default App
