import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftIcon, Settings2Icon } from "lucide-react"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"

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
import { compositeGeometry, slotParts, type Rect } from "@/features/layouts/computeLayout"
import { LayoutPicker } from "@/features/layouts/LayoutPicker"
import { LAYOUTS, aspectRatio, getLayout, shotCount } from "@/features/layouts/layouts"
import { boothHint, partnerOverlayText } from "@/features/pair/copy"
import { PairPreview, PartnerWaiting } from "@/features/pair/PairPreview"
import { isLinked, partnerLabel, usePair } from "@/features/pair/pairStore"
import { startBlocker } from "@/features/pair/presence"
import { sideOf, type Side } from "@/features/pair/protocol"
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
  const pair = usePair(
    useShallow((s) => ({
      status: s.status,
      role: s.role,
      partner: s.partner,
      partnerName: s.partnerName,
      remoteStream: s.remoteStream,
    }))
  )
  const selectLayout = usePair((s) => s.selectLayout)
  const layout = getLayout(session.layoutId)
  const total = shotCount(layout)
  const shooting = isShooting(session.phase)
  const retaking = session.retakeIndex !== null
  const filterCss = toCssFilter(getFilter(settings.design.filter).ops)

  // Shared booth: every slot holds both people. A shared session stays split after the partner
  // leaves; a retake then fills this device's half next to their photo.
  const linked = isLinked(pair.status)
  const split = linked || session.pair !== null
  const side: Side = session.pair?.side ?? (pair.role ? sideOf(pair.role) : 0)
  const partnerName = linked ? partnerLabel(pair) : session.pair?.partnerName || "your partner"
  const partnerTag = (linked ? pair.partner?.name || pair.partnerName : session.pair?.partnerName) || "Partner"
  const padding = settings.design.padding
  const slot = useMemo(() => compositeGeometry(layout, { padding }).slots[0], [layout, padding])
  const parts = useMemo(() => slotParts(slot, 2, padding) as [Rect, Rect], [slot, padding])
  const sideBySide = slot.w >= slot.h
  const aspect = split ? slot.w / slot.h : aspectRatio(layout)

  const camera = useCamera({
    deviceId: settings.cameraId,
    facing: settings.facing,
    // Single-photo layouts get the sharpest frame the camera offers.
    highRes: total === 1,
  })
  const live = camera.status === "live" && !camera.muted
  const videoRef = useRef<HTMLVideoElement>(null)
  const runner = useBoothSession(videoRef, {
    // A failed capture, or leaving mid-sequence, stops the partner's side too.
    onAbort: () => {
      if (isLinked(usePair.getState().status)) usePair.getState().announceCancel(useSession.getState().id)
    },
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const touch = useMediaQuery("(pointer: coarse)")
  const mirrorShots = settings.mirror && camera.isFrontFacing

  // The partner sees this camera live, and waits for it before shooting.
  useEffect(() => {
    usePair.getState().setCamera({ live, mirrored: mirrorShots, stream: camera.stream })
  }, [live, mirrorShots, camera.stream])
  useEffect(() => () => usePair.getState().setCamera({ live: false, mirrored: false, stream: null }), [])

  const blocker = !linked
    ? null
    : pair.status !== "connected"
      ? "partner-missing"
      : startBlocker(
          {
            name: "",
            screen: "booth",
            phase: session.phase,
            sessionId: session.id,
            retakeIndex: session.retakeIndex,
            live,
            mirrored: mirrorShots,
          },
          pair.partner
        )
  const canShoot = linked ? blocker === null : live

  const shoot = () => {
    if (!canShoot || shooting) return
    if (settings.sound) unlockAudio()
    setSettingsOpen(false)
    if (linked) usePair.getState().shoot()
    else runner.start({ mirror: mirrorShots })
  }
  // Read at call time: the pair can drop while these are mounted.
  const cancel = () => (isLinked(usePair.getState().status) ? usePair.getState().cancel() : runner.cancel())
  const backToReview = () => (isLinked(usePair.getState().status) ? usePair.getState().cancel() : session.cancel())

  // Shared booth: run the sequence the host scheduled, on this device's clock.
  useEffect(() => {
    if (!session.scheduled) return
    const timeline = useSession.getState().takeSchedule()
    if (timeline) runner.run(timeline, { mirror: mirrorShots })
  }, [session.scheduled, runner, mirrorShots])

  // "Retake" from review: shoot as soon as the camera is back. (A shared booth waits for both.)
  useEffect(() => {
    if (linked || !session.autoStart || !live || session.phase !== "idle") return
    useSession.getState().clearAutoStart()
    runner.start({ mirror: mirrorShots })
  }, [linked, session.autoStart, session.phase, live, runner, mirrorShots])

  // iOS suspends the camera in the background: abandon the sequence rather than shoot black frames.
  useEffect(() => {
    if (!shooting) return
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return
      if (isLinked(usePair.getState().status)) usePair.getState().cancel()
      else runner.cancel()
      toast("Photos cancelled", { description: "The camera was interrupted. Tap the shutter to start again." })
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [shooting, runner])

  useWakeLock(live || shooting)

  useHotkeys({
    Space: () => shoot(),
    Escape: () => {
      if (shooting) cancel()
      else if (retaking) backToReview()
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
      onSelectLayout={selectLayout}
      showLayouts={showLayouts}
      disabled={shooting || retaking}
      timingFrom={linked && pair.role === "guest" ? partnerName : undefined}
    />
  )

  const gate = (
    <CameraGate
      status={camera.status}
      muted={camera.muted}
      onStart={camera.start}
      note={split ? `Your photos go straight to ${partnerName}'s device, encrypted. Nothing is uploaded.` : undefined}
    />
  )
  const overlays = (
    <>
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
    </>
  )
  const partnerOverlay = linked
    ? partnerOverlayText(pair.status, pair.partner, partnerName, Boolean(pair.remoteStream))
    : null

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
              <Button variant="outline" onClick={backToReview}>
                <ArrowLeftIcon />
                Back to review
              </Button>
            </div>
          )}
          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 @container-size sm:p-5">
            {split ? (
              <PairPreview
                slot={slot}
                parts={parts}
                side={side}
                filter={filterCss}
                grid={settings.grid}
                seamColor={settings.design.frameColor}
                videoRef={videoRef}
                self={{ stream: camera.stream, mirrored: camera.isFrontFacing, overlay: gate }}
                partner={{
                  name: partnerTag,
                  stream: linked ? pair.remoteStream : null,
                  mirrored: pair.partner?.mirrored ?? false,
                  still: linked ? null : (session.pair?.shots[session.retakeIndex ?? 0]?.url ?? null),
                  overlay: partnerOverlay && <PartnerWaiting {...partnerOverlay} />,
                }}
                labels={!shooting}
              >
                {overlays}
              </PairPreview>
            ) : (
              <CameraPreview
                stream={camera.stream}
                aspect={aspect}
                mirrored={camera.isFrontFacing}
                filter={filterCss}
                grid={settings.grid}
                videoRef={videoRef}
              >
                {gate}
                {overlays}
              </CameraPreview>
            )}
            {camera.status === "error" && camera.error && (
              <CameraErrorPanel error={camera.error} onRetry={camera.start} />
            )}
          </div>

          <div className="pb-safe flex shrink-0 flex-col gap-3 phone-landscape:w-36 phone-landscape:justify-center phone-landscape:pb-0">
            <ShotTray
              shots={session.shots}
              pair={session.pair}
              sideBySide={sideBySide}
              aspect={aspect}
              filter={filterCss}
              activeIndex={shooting ? session.activeIndex : session.retakeIndex}
              className="phone-landscape:hidden"
            />
            <LayoutPicker
              variant="chips"
              layouts={LAYOUTS}
              value={session.layoutId}
              onChange={selectLayout}
              disabled={shooting || retaking}
              className="lg:hidden phone-landscape:hidden"
            />
            <div className="grid grid-cols-3 items-center px-6 pt-1 pb-4 phone-landscape:grid-cols-1 phone-landscape:gap-5 phone-landscape:px-0 phone-landscape:pb-0">
              <div className="justify-self-start lg:invisible phone-landscape:order-3 phone-landscape:justify-self-center">
                <GalleryButton disabled={shooting} />
              </div>
              <div className="justify-self-center phone-landscape:order-2">
                <ShutterButton shooting={shooting} disabled={!canShoot} onShoot={shoot} onCancel={cancel} />
              </div>
              <div className="justify-self-end phone-landscape:order-1 phone-landscape:justify-self-center">
                {touch && camera.devices.length > 1 && (
                  <FlipCameraButton onFlip={flip} disabled={shooting || camera.status === "starting"} />
                )}
              </div>
            </div>
            {linked ? (
              <p role="status" className="min-h-4 px-4 pb-3 text-center text-xs text-muted-foreground phone-landscape:hidden">
                {boothHint(blocker, partnerName, pair.status, side, sideBySide)}
              </p>
            ) : (
              <p className="hidden pb-3 text-center text-xs text-muted-foreground pointer-fine:block phone-landscape:hidden">
                Press <Kbd>Space</Kbd> to start · <Kbd>Esc</Kbd> to cancel
              </p>
            )}
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
