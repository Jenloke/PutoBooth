import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, Settings2Icon } from "lucide-react"
import { toast } from "sonner"

import { AppHeader } from "@/components/app-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CameraErrorPanel, CameraGate } from "@/features/camera/CameraGate"
import { FlipCameraButton } from "@/features/camera/CameraPicker"
import { CameraPreview } from "@/features/camera/CameraPreview"
import { useCamera } from "@/features/camera/useCamera"
import { getFilter, toCssFilter } from "@/features/compose/filters"
import { GalleryButton } from "@/features/gallery/GalleryButton"
import { LayoutPicker } from "@/features/layouts/LayoutPicker"
import { LAYOUTS, aspectRatio, getLayout, shotCount } from "@/features/layouts/layouts"
import { useHotkeys } from "@/lib/useHotkeys"
import { useMediaQuery } from "@/lib/useMediaQuery"
import { useWakeLock } from "@/lib/useWakeLock"
import { useSettings } from "@/store/settings"

import { BoothSettings } from "./BoothSettings"
import { Countdown } from "./Countdown"
import { Flash } from "./Flash"
import { isShooting, useSession } from "./session"
import { ShotTray } from "./ShotTray"
import { ShutterButton } from "./ShutterButton"
import { unlockAudio } from "./sound"
import { useBoothSession } from "./useBoothSession"

export function BoothScreen() {
  const settings = useSettings()
  const session = useSession()
  const layout = getLayout(session.layoutId)
  const total = shotCount(layout)
  const aspect = aspectRatio(layout)
  const shooting = isShooting(session.phase)
  const retaking = session.retakeIndex !== null
  const filterCss = toCssFilter(getFilter(settings.design.filter).ops)

  const camera = useCamera({
    deviceId: settings.cameraId,
    facing: settings.facing,
    // Single-photo layouts get the sharpest frame the camera offers.
    highRes: total === 1,
  })
  const live = camera.status === "live" && !camera.muted
  const videoRef = useRef<HTMLVideoElement>(null)
  const runner = useBoothSession(videoRef)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const touch = useMediaQuery("(pointer: coarse)")
  const mirrorShots = settings.mirror && camera.isFrontFacing

  const shoot = () => {
    if (!live || shooting) return
    if (settings.sound) unlockAudio()
    setSettingsOpen(false)
    runner.start({ mirror: mirrorShots })
  }

  // "Retake" from review: shoot as soon as the camera is back.
  useEffect(() => {
    if (!session.autoStart || !live || session.phase !== "idle") return
    useSession.getState().clearAutoStart()
    runner.start({ mirror: mirrorShots })
  }, [session.autoStart, session.phase, live, runner, mirrorShots])

  // iOS suspends the camera in the background: abandon the sequence rather than shoot black frames.
  useEffect(() => {
    if (!shooting) return
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return
      runner.cancel()
      toast("Photos cancelled", { description: "The camera was interrupted. Tap the shutter to start again." })
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [shooting, runner])

  useWakeLock(live || shooting)

  useHotkeys({
    Space: () => shoot(),
    Escape: () => {
      if (shooting) runner.cancel()
      else if (retaking) session.cancel()
    },
  })

  const selectCamera = (deviceId: string) => {
    settings.update({ cameraId: deviceId })
    camera.selectDevice(deviceId)
  }
  const flip = () => {
    const current = camera.facing ?? settings.facing
    settings.update({ cameraId: null, facing: current === "user" ? "environment" : "user" })
    camera.flip()
  }

  const settingsPanel = (showLayouts: boolean) => (
    <BoothSettings
      camera={camera}
      onSelectCamera={selectCamera}
      layoutId={session.layoutId}
      onSelectLayout={session.selectLayout}
      showLayouts={showLayouts}
      disabled={shooting || retaking}
    />
  )

  return (
    <>
      <AppHeader
        locked={shooting}
        actions={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Settings"
            disabled={shooting}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2Icon />
          </Button>
        }
      />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="Booth" className="flex min-h-0 flex-1 flex-col phone-landscape:flex-row">
          {retaking && !shooting && (
            <div className="flex items-center justify-center gap-3 px-3 pt-3 text-sm phone-landscape:hidden">
              <span className="font-medium">Retaking photo {session.retakeIndex! + 1}</span>
              <Button variant="outline" onClick={session.cancel}>
                <ArrowLeftIcon />
                Back to review
              </Button>
            </div>
          )}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 @container-size sm:p-5">
            <CameraPreview
              stream={camera.stream}
              aspect={aspect}
              mirrored={camera.isFrontFacing}
              filter={filterCss}
              grid={settings.grid}
              videoRef={videoRef}
            >
              <CameraGate status={camera.status} muted={camera.muted} onStart={camera.start} />
              {shooting && session.activeIndex !== null && (
                <Badge className="absolute top-3 left-3 bg-black/55 text-white tabular-nums backdrop-blur-sm">
                  {retaking ? "Retake" : `${session.activeIndex + 1} / ${total}`}
                </Badge>
              )}
              <Countdown
                phase={session.phase}
                count={session.count}
                index={session.activeIndex}
                total={total}
                retaking={retaking}
              />
              {session.phase === "capturing" && !settings.flash && (
                <div aria-hidden="true" className="absolute inset-0 bg-black/50 motion-safe:animate-out motion-safe:fade-out-0 motion-safe:duration-300" />
              )}
            </CameraPreview>
            {camera.status === "error" && camera.error && (
              <CameraErrorPanel error={camera.error} onRetry={camera.start} />
            )}
          </div>

          <div className="pb-safe flex shrink-0 flex-col gap-3 phone-landscape:w-36 phone-landscape:justify-center phone-landscape:pb-0">
            <ShotTray
              shots={session.shots}
              aspect={aspect}
              filter={filterCss}
              activeIndex={shooting ? session.activeIndex : session.retakeIndex}
              className="phone-landscape:hidden"
            />
            <LayoutPicker
              variant="chips"
              layouts={LAYOUTS}
              value={session.layoutId}
              onChange={session.selectLayout}
              disabled={shooting || retaking}
              className="lg:hidden phone-landscape:hidden"
            />
            <div className="grid grid-cols-3 items-center px-6 pt-1 pb-4 phone-landscape:grid-cols-1 phone-landscape:gap-5 phone-landscape:px-0 phone-landscape:pb-0">
              <div className="justify-self-start lg:invisible phone-landscape:order-3 phone-landscape:justify-self-center">
                <GalleryButton disabled={shooting} />
              </div>
              <div className="justify-self-center phone-landscape:order-2">
                <ShutterButton shooting={shooting} disabled={!live} onShoot={shoot} onCancel={runner.cancel} />
              </div>
              <div className="justify-self-end phone-landscape:order-1 phone-landscape:justify-self-center">
                {touch && camera.devices.length > 1 && (
                  <FlipCameraButton onFlip={flip} disabled={shooting || camera.status === "starting"} />
                )}
              </div>
            </div>
            <p className="hidden pb-3 text-center text-xs text-muted-foreground pointer-fine:block phone-landscape:hidden">
              Press <Kbd>Space</Kbd> to start · <Kbd>Esc</Kbd> to cancel
            </p>
          </div>
        </section>

        <aside aria-label="Settings" className="hidden w-88 shrink-0 border-l lg:block">
          <ScrollArea className="h-full">
            <div className="p-5">{settingsPanel(true)}</div>
          </ScrollArea>
        </aside>
      </main>

      <Drawer open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DrawerContent className="max-h-[85svh]">
          <DrawerHeader>
            <DrawerTitle>Settings</DrawerTitle>
            <DrawerDescription className="sr-only">Countdown, filter, flash and camera settings</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {settingsPanel(false)}
          </div>
        </DrawerContent>
      </Drawer>

      <Flash active={session.phase === "capturing" && settings.flash} />
    </>
  )
}
