import { useEffect, useMemo } from "react"
import {
  DownloadIcon,
  PrinterIcon,
  RotateCcwIcon,
  ShareIcon,
  SquarePlusIcon,
} from "lucide-react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"

import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useSession } from "@/features/booth/session"
import { useLogo } from "@/features/compose/logoStore"
import { downloadFile } from "@/features/export/export"
import { PrintImage, printNow } from "@/features/export/print"
import { shareFile } from "@/features/export/share"
import { compositeGeometry, computePrintSheet } from "@/features/layouts/computeLayout"
import {
  PRINT_DPI,
  PRINT_SHEET,
  getLayout,
  isStrip,
  printSizeInches,
} from "@/features/layouts/layouts"
import { isLinked, partnerLabel, usePair } from "@/features/pair/pairStore"
import { canShareFiles, isIOS } from "@/lib/platform"
import { navigate } from "@/lib/router"
import { useHotkeys } from "@/lib/useHotkeys"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { useWakeLock } from "@/lib/useWakeLock"
import { useSettings } from "@/store/settings"

import { Customizer } from "./Customizer"
import { ResultPreview } from "./ResultPreview"
import { useComposite } from "./useComposite"
import { useGalleryAutosave } from "./useGalleryAutosave"

export function ReviewScreen() {
  const session = useSession()
  const design = useSettings((s) => s.design)
  const exportFormat = useSettings((s) => s.exportFormat)
  const jpegQuality = useSettings((s) => s.jpegQuality)
  const printSheetSetting = useSettings((s) => s.printSheet)
  const logo = useLogo((s) => s.blob)
  const touch = useMediaQuery("(pointer: coarse)")
  const pair = usePair(
    useShallow((s) => ({ status: s.status, jointId: s.jointId, partner: s.partner, partnerName: s.partnerName }))
  )

  useEffect(() => {
    void useLogo.getState().load()
  }, [])

  // While paired, retakes are shot together: only the shared session's photos can be retaken,
  // and "Retake all" starts a new round for both.
  const linked = isLinked(pair.status)
  const connected = pair.status === "connected"
  const joint = session.pair !== null && session.id === pair.jointId
  const partnerName = session.pair?.partnerName || partnerLabel(pair)
  const retakeOne = !linked ? session.retake : connected && joint ? (i: number) => usePair.getState().retake(i) : null
  const retakeAll = !linked ? () => session.retakeAll() : connected ? () => usePair.getState().retake(null) : null
  const partnerReceived = session.pair?.shots.filter(Boolean).length ?? 0
  const partnerMissing = session.pair ? session.pair.shots.length - partnerReceived : 0
  const receiving = partnerMissing > 0 && joint && linked

  const layout = getLayout(session.layoutId)
  const sheet = printSheetSetting && isStrip(layout)
  const { result, stale, error } = useComposite({
    layout,
    shots: session.shots,
    pair: session.pair,
    design,
    takenAt: session.takenAt,
    logo,
    format: exportFormat,
    quality: jpegQuality,
    printSheet: sheet,
  })

  const geometry = useMemo(() => compositeGeometry(layout, design), [layout, design])
  const sheetGeometry = useMemo(
    () => (sheet ? computePrintSheet(geometry, PRINT_SHEET, PRINT_DPI) : null),
    [sheet, geometry]
  )
  const width = sheetGeometry?.width ?? geometry.width
  const height = sheetGeometry?.height ?? geometry.height
  const placements = sheetGeometry?.placements ?? [{ x: 0, y: 0, w: width, h: height }]
  const printSize = sheet ? { width: PRINT_SHEET.width, height: PRINT_SHEET.height } : printSizeInches(layout)

  const ready = Boolean(result) && !stale
  const ios = useMemo(() => isIOS(), [])
  const shareable = result ? canShareFiles(result.file) : false
  // iPhone: the share sheet's "Save Image" is how photos reach the Photos app.
  const primary = ios && shareable ? "share" : "download"

  useWakeLock(true)
  useGalleryAutosave({
    sessionId: session.id,
    layoutId: session.layoutId,
    shots: session.shots,
    pair: session.pair,
    takenAt: session.takenAt,
    design,
    printSheet: sheet,
    result,
    stale,
  })

  useEffect(() => {
    if (error) toast.error("Couldn't render the image", { id: "render-error", description: error.message })
  }, [error])

  const download = () => {
    if (!result || stale) return
    downloadFile(result.file, result.url)
    toast.success("Downloaded", { description: result.file.name })
  }

  const share = () => {
    if (!result || stale) return
    // Synchronous call inside the tap: iOS rejects share() once the gesture is lost.
    const file = result.file
    const url = result.url
    void shareFile(file).then((outcome) => {
      if (outcome === "unsupported" || outcome === "failed") {
        downloadFile(file, url)
        toast("Sharing isn't available here, so it was downloaded instead.")
      }
    })
  }

  const print = () => {
    if (ready) printNow()
  }

  const startOver = () => {
    session.startOver()
    toast("Saved in your gallery", {
      description: "Gallery photos stay on this device. Download or share the ones you want to keep.",
      action: { label: "View", onClick: () => navigate("/gallery") },
    })
  }

  useHotkeys({
    r: () => {
      const focused = document.activeElement?.getAttribute("data-retake-index")
      if (focused != null) retakeOne?.(Number(focused))
      else retakeAll?.()
    },
    s: () => (primary === "share" ? share() : download()),
  })

  const shareButton = shareable && (
    <Button
      size="lg"
      variant={primary === "share" ? "default" : "outline"}
      className="h-11 px-4"
      onClick={share}
      disabled={!ready}
    >
      <ShareIcon />
      {ios ? "Share / Save" : "Share"}
    </Button>
  )

  const downloadButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="lg"
          variant={primary === "download" ? "default" : "outline"}
          className={primary === "download" ? "h-11 px-4" : "size-11 px-0 sm:w-auto sm:px-4"}
          onClick={download}
          disabled={!ready}
          aria-label="Download"
        >
          <DownloadIcon />
          <span className={primary === "download" ? undefined : "sr-only sm:not-sr-only"}>Download</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Save <Kbd>S</Kbd>
      </TooltipContent>
    </Tooltip>
  )

  return (
    <>
      <AppHeader />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row phone-landscape:flex-row">
        <section aria-label="Result" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              {receiving ? (
                <>
                  <Spinner className="size-3.5" />
                  Receiving {partnerName}'s photos… {partnerReceived} of {session.pair!.shots.length}
                </>
              ) : partnerMissing > 0 ? (
                `${partnerMissing} of ${partnerName}'s photos didn't arrive`
              ) : linked && !connected ? (
                `Reconnecting to ${partnerName}…`
              ) : !retakeOne ? (
                `Retake all to shoot a new round with ${partnerLabel(pair)}`
              ) : (
                `${touch ? "Tap" : "Click"} a photo to retake it${linked ? ` with ${partnerName}` : ""}`
              )}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" onClick={() => retakeAll?.()} disabled={!retakeAll}>
                  <RotateCcwIcon />
                  Retake all
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Retake <Kbd>R</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 @container-size sm:p-6">
            <ResultPreview
              url={result?.url ?? null}
              width={width}
              height={height}
              placements={placements}
              geometry={geometry}
              rendering={stale}
              onRetake={(index) => retakeOne?.(index)}
              disabled={!retakeOne}
              alt={`${layout.name} with ${session.shots.length} ${session.shots.length === 1 ? "photo" : "photos"}`}
            />
          </div>
        </section>

        <aside
          aria-label="Customize and save"
          className="flex min-h-0 shrink-0 basis-[48%] flex-col border-t lg:basis-auto lg:w-[26rem] lg:border-t-0 lg:border-l phone-landscape:basis-auto phone-landscape:w-80 phone-landscape:border-t-0 phone-landscape:border-l"
        >
          <Customizer
            className="flex-1"
            layout={layout}
            shotCount={session.shots.length}
            onSelectLayout={session.selectLayout}
            sampleUrl={session.shots[0]?.url}
            output={{ width, height, size: result && !stale ? result.file.size : null }}
          />
          <div className="pb-safe shrink-0 border-t bg-background">
            <div className="flex items-center gap-2 p-3">
              <Button variant="ghost" className="h-11 px-3" onClick={startOver}>
                <SquarePlusIcon />
                <span className="max-sm:sr-only">Start over</span>
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  className="size-11 px-0"
                  onClick={print}
                  disabled={!ready}
                  aria-label="Print"
                >
                  <PrinterIcon />
                </Button>
                {primary === "share" ? (
                  <>
                    {downloadButton}
                    {shareButton}
                  </>
                ) : (
                  <>
                    {shareButton}
                    {downloadButton}
                  </>
                )}
              </div>
            </div>
          </div>
        </aside>
      </main>
      <PrintImage url={ready && result ? result.url : null} size={printSize} />
    </>
  )
}
