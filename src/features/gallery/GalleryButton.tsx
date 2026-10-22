import { useEffect } from "react"
import { ImagesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { navigate } from "@/lib/router"
import { useObjectUrl } from "@/lib/useObjectUrl"

import { useGallery } from "./galleryStore"

/** Bottom-bar shortcut to the gallery showing the latest result, like the camera app. */
export function GalleryButton({ disabled }: { disabled?: boolean }) {
  const latest = useGallery((s) => s.items[0])
  const loaded = useGallery((s) => s.loaded)
  const url = useObjectUrl(latest?.thumb)

  useEffect(() => {
    if (!loaded) void useGallery.getState().refresh().catch(() => {})
  }, [loaded])

  return (
    <Button
      variant="secondary"
      size="icon-lg"
      className="size-12 overflow-hidden rounded-xl p-0"
      aria-label="Gallery"
      disabled={disabled}
      onClick={() => navigate("/gallery")}
    >
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagesIcon className="size-5" />}
    </Button>
  )
}
