import { useEffect, useState } from "react"
import { DownloadIcon, PencilIcon, PrinterIcon, ShareIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useSession, type Shot } from "@/features/booth/session"
import { sanitizeDesign } from "@/features/compose/design"
import { downloadFile } from "@/features/export/export"
import { PrintImage, printNow } from "@/features/export/print"
import { shareFile } from "@/features/export/share"
import { PRINT_SHEET, getLayout, isLayoutId, printSizeInches } from "@/features/layouts/layouts"
import { uid } from "@/lib/id"
import { canShareFiles, isIOS } from "@/lib/platform"
import { navigate } from "@/lib/router"
import { useObjectUrl } from "@/lib/useObjectUrl"
import { useSettings } from "@/store/settings"

import {
  readGalleryData,
  useGallery,
  type GalleryData,
  type GalleryMeta,
  type GalleryShot,
  type PartnerShots,
} from "./galleryStore"

type Loaded = {
  id: string
  file: File
  data: GalleryData
  shots: GalleryShot[] | undefined
  partner: PartnerShots | undefined
}

function toShot(s: GalleryShot): Shot {
  return { id: uid(), blob: s.blob, url: URL.createObjectURL(s.blob), width: s.width, height: s.height }
}

type GalleryViewerProps = {
  item: GalleryMeta | null
  onClose: () => void
}

/** Full-size view of a gallery entry with save, share, print, edit and delete. */
export function GalleryViewer({ item, onClose }: GalleryViewerProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const current = loaded && item && loaded.id === item.id ? loaded : null
  const url = useObjectUrl(current?.file)
  const remove = useGallery((s) => s.remove)

  useEffect(() => {
    if (!item) return
    let cancelled = false
    readGalleryData(item.id)
      .then(({ data, shots, partner }) => {
        if (cancelled) return
        if (!data) throw new Error("missing")
        // Re-wrap so the share sheet always gets the right name and type.
        const file = new File([data.result], item.fileName, { type: item.mime, lastModified: item.takenAt })
        setLoaded({ id: item.id, file, data, shots, partner })
      })
      .catch(() => {
        if (!cancelled) toast.error("Couldn't open this photo")
      })
    return () => {
      cancelled = true
    }
  }, [item])

  const layout = item ? getLayout(item.layoutId) : null
  const printSize = item?.printSheet
    ? { width: PRINT_SHEET.width, height: PRINT_SHEET.height }
    : layout
      ? printSizeInches(layout)
      : null
  const shareable = current ? canShareFiles(current.file) : false
  const primaryShare = isIOS() && shareable

  const share = () => {
    if (!current) return
    const { file } = current
    void shareFile(file).then((outcome) => {
      if (outcome === "unsupported" || outcome === "failed") downloadFile(file)
    })
  }

  const edit = () => {
    if (!item || !current?.shots?.length || !isLayoutId(item.layoutId)) return
    const shots = current.shots.map(toShot)
    // A shared session comes back with both halves; retakes then reshoot this device's half.
    const pair =
      item.pair && current.partner
        ? {
            side: item.pair.side,
            partnerName: item.pair.partnerName,
            shots: shots.map((_, i) => {
              const s = current.partner?.[i]
              return s ? toShot(s) : null
            }),
          }
        : null
    useSettings.getState().update({ design: sanitizeDesign(current.data.design), printSheet: item.printSheet })
    useSession.getState().load({ id: item.id, layoutId: item.layoutId, shots, takenAt: item.takenAt, pair })
    onClose()
    navigate("/")
  }

  const destroy = async () => {
    if (!item) return
    await remove(item.id)
    onClose()
    toast("Photo deleted")
  }

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{layout?.name ?? "Photo"}</DialogTitle>
          <DialogDescription>
            {item && new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" }).format(item.takenAt)}
            {item?.pair && ` · with ${item.pair.partnerName || "a partner"}`}
            {item && ` · ${item.width}×${item.height} px`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 place-items-center rounded-lg bg-muted/60 p-3">
          {url ? (
            <img
              src={url}
              alt={layout ? `${layout.name} photo` : "Photo"}
              className="max-h-[min(62dvh,42rem)] max-w-full rounded-xs object-contain shadow-sm ring-1 ring-black/10"
            />
          ) : (
            <Spinner className="my-24 size-6" />
          )}
        </div>
        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" className="h-10 text-destructive hover:text-destructive" onClick={() => void destroy()}>
              <Trash2Icon />
              Delete
            </Button>
            {current?.shots?.length ? (
              <Button variant="ghost" className="h-10" onClick={edit}>
                <PencilIcon />
                Edit
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="size-10 px-0" aria-label="Print" disabled={!url} onClick={printNow}>
              <PrinterIcon />
            </Button>
            <Button
              variant={primaryShare ? "outline" : "default"}
              className="h-10"
              disabled={!current}
              onClick={() => current && downloadFile(current.file, url ?? undefined)}
            >
              <DownloadIcon />
              Download
            </Button>
            {shareable && (
              <Button variant={primaryShare ? "default" : "outline"} className="h-10" onClick={share}>
                <ShareIcon />
                {primaryShare ? "Share / Save" : "Share"}
              </Button>
            )}
          </div>
        </DialogFooter>
        {item && <PrintImage url={url} size={printSize} />}
      </DialogContent>
    </Dialog>
  )
}
