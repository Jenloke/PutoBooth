import { useEffect, useState, useSyncExternalStore } from "react"

import { hasCameraApi, isSecureContextForCamera } from "@/lib/platform"
import type { Facing } from "@/store/settings"

import { cameraError, toCameraError, type CameraError } from "./cameraErrors"

export type CameraStatus = "idle" | "starting" | "live" | "error"

export interface CameraDevice {
  id: string
  label: string
}

export interface CameraSnapshot {
  status: CameraStatus
  error: CameraError | null
  stream: MediaStream | null
  /** Video inputs. Labels only appear after permission is granted. */
  devices: CameraDevice[]
  deviceId: string | null
  facing: Facing | null
  /** Front cameras are previewed mirrored. Unknown facing (most Mac cameras) counts as front. */
  isFrontFacing: boolean
  /** iOS mutes the track while the app is in the background or another app takes the camera. */
  muted: boolean
  resolution: { width: number; height: number } | null
}

export interface CameraPrefs {
  deviceId: string | null
  facing: Facing
  /** Ask for 4K (single-photo layouts) instead of 1080p. */
  highRes: boolean
}

const INITIAL: CameraSnapshot = {
  status: "idle",
  error: null,
  stream: null,
  devices: [],
  deviceId: null,
  facing: null,
  isFrontFacing: true,
  muted: false,
  resolution: null,
}

/** Set once a stream was granted in this page, so the booth restarts the camera on its own. */
let grantedThisPage = false

function resolutionConstraints(highRes: boolean): MediaTrackConstraints {
  // `ideal` only: `exact` throws OverconstrainedError on cameras that can't comply (e.g. a
  // Mac has no rear camera; many Mac cameras top out at 720p). We accept whatever arrives.
  return highRes
    ? { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } }
    : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
}

function videoConstraints(prefs: CameraPrefs): MediaTrackConstraints {
  const constraints = resolutionConstraints(prefs.highRes)
  if (prefs.deviceId) constraints.deviceId = { ideal: prefs.deviceId }
  else constraints.facingMode = { ideal: prefs.facing }
  return constraints
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

function isFront(settings: MediaTrackSettings, label: string) {
  if (settings.facingMode === "environment") return false
  if (settings.facingMode === "user") return true
  return !/\b(back|rear|environment)\b/i.test(label)
}

class CameraController {
  private snapshot: CameraSnapshot = INITIAL
  private listeners = new Set<() => void>()
  private stream: MediaStream | null = null
  private request = 0
  private wanted = false
  private restarts: number[] = []
  private visibilityTimer: number | undefined
  prefs: CameraPrefs

  constructor(prefs: CameraPrefs) {
    this.prefs = { ...prefs }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.snapshot

  private set(patch: Partial<CameraSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  async start(prefs?: Partial<CameraPrefs>) {
    if (prefs) this.prefs = { ...this.prefs, ...prefs }
    if (!this.wanted) {
      this.wanted = true
      document.addEventListener("visibilitychange", this.onVisibilityChange)
      navigator.mediaDevices?.addEventListener?.("devicechange", this.onDeviceChange)
    }
    const request = ++this.request

    if (!isSecureContextForCamera()) {
      this.set({ status: "error", error: cameraError("insecure") })
      return
    }
    if (!hasCameraApi()) {
      this.set({ status: "error", error: cameraError("unsupported") })
      return
    }

    // Stop the current camera first: iOS can't run two, and switching needs the old one released.
    this.release()
    this.set({ status: "starting", error: null, stream: null, muted: false })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints(this.prefs),
      })
      if (request !== this.request || !this.wanted) {
        stopStream(stream)
        return
      }
      grantedThisPage = true
      this.attach(stream)
      void this.refreshDevices()
    } catch (error) {
      if (request !== this.request) return
      this.set({ status: "error", error: toCameraError(error), stream: null })
    }
  }

  stop() {
    this.wanted = false
    this.request++
    window.clearTimeout(this.visibilityTimer)
    document.removeEventListener("visibilitychange", this.onVisibilityChange)
    navigator.mediaDevices?.removeEventListener?.("devicechange", this.onDeviceChange)
    this.release()
    this.set({ status: "idle", stream: null, muted: false, error: null })
  }

  selectDevice(deviceId: string) {
    if (deviceId === this.snapshot.deviceId && this.snapshot.status === "live") return
    void this.start({ deviceId })
  }

  flip() {
    const current = this.snapshot.facing ?? this.prefs.facing
    void this.start({ deviceId: null, facing: current === "user" ? "environment" : "user" })
  }

  /** Upgrades or downgrades resolution in place, without reopening the camera. */
  setHighRes(highRes: boolean) {
    if (this.prefs.highRes === highRes) return
    this.prefs = { ...this.prefs, highRes }
    const track = this.stream?.getVideoTracks()[0]
    if (!track || track.readyState !== "live") return
    track
      .applyConstraints(resolutionConstraints(highRes))
      .then(() => {
        const { width, height } = track.getSettings()
        if (width && height) this.set({ resolution: { width, height } })
      })
      .catch(() => {
        // Not supported on this camera: keep the current resolution.
      })
  }

  private attach(stream: MediaStream) {
    this.stream = stream
    const track = stream.getVideoTracks()[0]
    if (!track) {
      this.set({ status: "error", error: cameraError("notfound") })
      return
    }
    track.addEventListener("ended", this.onTrackEnded)
    track.addEventListener("mute", this.onMuteChange)
    track.addEventListener("unmute", this.onMuteChange)
    const settings = track.getSettings()
    const facing =
      settings.facingMode === "user" || settings.facingMode === "environment"
        ? settings.facingMode
        : null
    this.set({
      status: "live",
      error: null,
      stream,
      deviceId: settings.deviceId ?? null,
      facing,
      isFrontFacing: isFront(settings, track.label),
      muted: track.muted,
      resolution:
        settings.width && settings.height ? { width: settings.width, height: settings.height } : null,
    })
  }

  private release() {
    const stream = this.stream
    if (!stream) return
    for (const track of stream.getVideoTracks()) {
      track.removeEventListener("ended", this.onTrackEnded)
      track.removeEventListener("mute", this.onMuteChange)
      track.removeEventListener("unmute", this.onMuteChange)
    }
    stopStream(stream)
    this.stream = null
  }

  private async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const devices = all
        .filter((d) => d.kind === "videoinput" && d.deviceId)
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      this.set({ devices })
    } catch {
      // Keep the previous list.
    }
  }

  /** Re-acquires the camera after iOS or another app took it, with a guard against loops. */
  private restart() {
    const now = Date.now()
    this.restarts = this.restarts.filter((t) => now - t < 15_000)
    if (this.restarts.length >= 3) {
      this.release()
      this.set({ status: "error", error: cameraError("busy"), stream: null })
      return
    }
    this.restarts.push(now)
    void this.start()
  }

  private onTrackEnded = () => {
    if (!this.wanted) return
    if (document.visibilityState === "visible") this.restart()
    else {
      // Re-acquired by onVisibilityChange when the app comes back.
      this.release()
      this.set({ status: "starting", stream: null })
    }
  }

  private onMuteChange = () => {
    const track = this.stream?.getVideoTracks()[0]
    this.set({ muted: track?.muted ?? false })
  }

  private onVisibilityChange = () => {
    if (!this.wanted || document.visibilityState !== "visible") return
    window.clearTimeout(this.visibilityTimer)
    // Give iOS a moment to unmute the track by itself before reopening the camera.
    this.visibilityTimer = window.setTimeout(() => {
      const track = this.stream?.getVideoTracks()[0]
      if (!track || track.readyState === "ended" || track.muted) this.restart()
    }, 600)
  }

  private onDeviceChange = () => {
    void this.refreshDevices()
  }
}

export async function cameraPermissionGranted(): Promise<boolean> {
  if (grantedThisPage) return true
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName })
    return status.state === "granted"
  } catch {
    return false
  }
}

export interface UseCamera extends CameraSnapshot {
  start: () => void
  stop: () => void
  selectDevice: (deviceId: string) => void
  flip: () => void
}

/**
 * Camera lifecycle for the booth. Starts automatically only when access was already granted
 * (permission is requested from a tap), stops all tracks on unmount.
 */
export function useCamera(prefs: CameraPrefs): UseCamera {
  const [controller] = useState(() => new CameraController(prefs))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    let cancelled = false
    void cameraPermissionGranted().then((granted) => {
      if (granted && !cancelled) void controller.start()
    })
    return () => {
      cancelled = true
      controller.stop()
    }
  }, [controller])

  useEffect(() => {
    controller.setHighRes(prefs.highRes)
  }, [controller, prefs.highRes])

  const [actions] = useState(() => ({
    start: () => void controller.start(),
    stop: () => controller.stop(),
    selectDevice: (deviceId: string) => controller.selectDevice(deviceId),
    flip: () => controller.flip(),
  }))

  return { ...snapshot, ...actions }
}
