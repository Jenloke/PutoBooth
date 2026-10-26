import { lazy, Suspense, useEffect } from "react"

import { Spinner } from "@/components/ui/spinner"
import { BoothScreen } from "@/features/booth/BoothScreen"
import { useSession } from "@/features/booth/session"
import { usePair } from "@/features/pair/pairStore"
import { useRoute } from "@/lib/router"

// The booth loads first; review and gallery code is fetched (or read from the SW cache) on demand.
const ReviewScreen = lazy(() =>
  import("@/features/review/ReviewScreen").then((m) => ({ default: m.ReviewScreen }))
)
const GalleryScreen = lazy(() =>
  import("@/features/gallery/GalleryScreen").then((m) => ({ default: m.GalleryScreen }))
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

  // A shared booth partner can't start a round while this device is in the gallery.
  useEffect(() => {
    usePair.getState().setAway(route === "/gallery")
  }, [route])

  return (
    <div className="pl-safe pr-safe flex h-dvh flex-col overflow-hidden bg-background">
      <Suspense fallback={<ScreenFallback />}>
        {route === "/gallery" ? <GalleryScreen /> : reviewing ? <ReviewScreen /> : <BoothScreen />}
      </Suspense>
    </div>
  )
}

export default App
