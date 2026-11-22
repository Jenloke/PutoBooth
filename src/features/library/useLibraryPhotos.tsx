import { useRef, useState } from "react"
import { toast } from "sonner"

import { useSession } from "@/features/booth/session"
import { getLayout, shotCount } from "@/features/layouts/layouts"
import { trackEvent } from "@/lib/analytics"
import { hasCoarsePointer } from "@/lib/platform"

import { importPhotos, importSummary, photoToShot } from "./importPhotos"

/**
 * A strip from library photos instead of the camera: for a denied camera, a desktop with no
 * webcam, or an in-app browser that blocks it. iPhone and Android pickers also offer Take Photo.
 */
export function useLibraryPhotos() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [onPicked, setOnPicked] = useState<((files: File[]) => void) | null>(null)

  /** Must run inside the tap: browsers only open a file picker from a user gesture. */
  const pick = (multiple: boolean, then: (files: File[]) => void) => {
    const input = inputRef.current
    if (!input) return
    input.multiple = multiple
    input.value = ""
    setOnPicked(() => then)
    input.click()
  }

  /** Picks photos for every slot of the current layout and opens them in review. */
  const startFromLibrary = () =>
    pick(true, async (files) => {
      const layout = getLayout(useSession.getState().layoutId)
      const slots = shotCount(layout)
      const busy = toast.loading(files.length === 1 ? "Opening your photo…" : "Opening your photos…")
      const result = await importPhotos(files, slots)
      toast.dismiss(busy)
      if (result.shots.length === 0) {
        toast.error("Couldn't open those photos", { description: "Try JPEG or PNG photos." })
        return
      }
      useSession.getState().loadPhotos(result.shots)
      trackEvent("photos_imported", { count: result.used, layout: layout.id })
      const summary = importSummary(result, slots, hasCoarsePointer() ? "Tap" : "Click")
      if (summary) toast(summary.title, { description: summary.description })
    })

  /** Replaces one slot's photo from the library (review of a library session). */
  const replacePhoto = (index: number) =>
    pick(false, async (files) => {
      if (!files[0]) return
      try {
        useSession.getState().setShot(index, await photoToShot(files[0]))
      } catch {
        toast.error("Couldn't open that photo", { description: "Try a JPEG or PNG photo." })
      }
    })

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      // Not display:none: older iOS Safari won't open a picker for a hidden input.
      className="sr-only"
      aria-hidden="true"
      tabIndex={-1}
      data-testid="library-input"
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? [])
        if (files.length) onPicked?.(files)
      }}
    />
  )

  return { input, startFromLibrary, replacePhoto }
}
