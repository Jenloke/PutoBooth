import { useEffect, useState } from "react"
import { CameraIcon, ImagesIcon, InfoIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { AppHeader } from "@/components/app-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { formatBytes } from "@/features/export/export"
import { getLayout } from "@/features/layouts/layouts"
import { isStandalone } from "@/lib/platform"
import { navigate } from "@/lib/router"
import { useObjectUrl } from "@/lib/useObjectUrl"

import { GalleryViewer } from "./GalleryViewer"
import { useGallery, type GalleryMeta } from "./galleryStore"

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })

export function GalleryScreen() {
  const { items, loaded, refresh, clearAll } = useGallery()
  const [openId, setOpenId] = useState<string | null>(null)
  const [usage, setUsage] = useState<number | null>(null)
  const open = items.find((item) => item.id === openId) ?? null

  useEffect(() => {
    refresh().catch(() => toast.error("Couldn't open the gallery", { description: "Storage isn't available in this browser mode." }))
  }, [refresh])

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((estimate) => setUsage(estimate.usage ?? null))
      .catch(() => {})
  }, [items.length])

  const onClearAll = async () => {
    await clearAll()
    setOpenId(null)
    toast("Gallery cleared")
  }

  return (
    <>
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="pb-safe mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-tight">Gallery</h1>
              <p className="text-sm text-muted-foreground">
                {items.length} {items.length === 1 ? "photo" : "photos"}
                {usage !== null && items.length > 0 && ` · ${formatBytes(usage)} on this device`}
              </p>
            </div>
            {items.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="h-10">
                    <Trash2Icon />
                    Clear all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all {items.length} photos?</AlertDialogTitle>
                    <AlertDialogDescription>
                      They're only stored in this browser, so this can't be undone. Photos you downloaded or saved to
                      Photos aren't affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void onClearAll()}>
                      Delete all
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {items.length > 0 && (
            <Alert>
              <InfoIcon />
              <AlertTitle>Saved on this device only</AlertTitle>
              <AlertDescription>
                {isStandalone()
                  ? "Nothing is uploaded. Download or share the photos you want to keep."
                  : "Nothing is uploaded, and Safari may clear data for sites you haven't used in a while. Download or share the photos you want to keep."}
              </AlertDescription>
            </Alert>
          )}

          {!loaded ? (
            <div className="grid place-items-center py-24">
              <Spinner className="size-6" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="border py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImagesIcon />
                </EmptyMedia>
                <EmptyTitle>No photos yet</EmptyTitle>
                <EmptyDescription>Finished strips appear here, on this device only.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button className="h-10" onClick={() => navigate("/")}>
                  <CameraIcon />
                  Go to the booth
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item) => (
                <li key={item.id}>
                  <GalleryTile item={item} onOpen={() => setOpenId(item.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <GalleryViewer item={open} onClose={() => setOpenId(null)} />
    </>
  )
}

function GalleryTile({ item, onOpen }: { item: GalleryMeta; onOpen: () => void }) {
  const url = useObjectUrl(item.thumb)
  const layout = getLayout(item.layoutId)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-xl p-1.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="block aspect-4/5 w-full overflow-hidden rounded-lg bg-muted/70 p-3">
        {url && (
          // object-contain letterboxes any layout (tall strips, wide postcards); drop-shadow
          // follows the visible image rather than the box.
          <img
            src={url}
            alt=""
            className="size-full object-contain drop-shadow-md transition-transform group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        )}
      </span>
      <span className="flex flex-col px-1">
        <span className="text-sm font-medium">{layout.name}</span>
        <span className="text-xs text-muted-foreground">
          {dateFormat.format(item.takenAt)}
          {item.pair && ` · with ${item.pair.partnerName || "a partner"}`}
        </span>
      </span>
    </button>
  )
}
