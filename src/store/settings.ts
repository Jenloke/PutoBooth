import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { DEFAULT_DESIGN, sanitizeDesign, type Design } from "@/features/compose/design"
import { DEFAULT_LAYOUT_ID, isLayoutId, type LayoutId } from "@/features/layouts/layouts"
import { cleanName } from "@/features/pair/protocol"

export type Countdown = 3 | 5 | 10
export type ExportFormat = "png" | "jpeg"
export type Facing = "user" | "environment"

export const COUNTDOWN_OPTIONS: readonly Countdown[] = [3, 5, 10]
export const PAUSE_RANGE = { min: 0.5, max: 5, step: 0.5 } as const
export const JPEG_QUALITY_RANGE = { min: 0.6, max: 1, step: 0.01 } as const

export interface Settings {
  countdown: Countdown
  /** Seconds between shots. */
  pauseSeconds: number
  /** Save front-camera shots mirrored, like the preview. */
  mirror: boolean
  /** White screen flash at capture; doubles as a front light in dim rooms. */
  flash: boolean
  sound: boolean
  grid: boolean
  defaultLayout: LayoutId
  exportFormat: ExportFormat
  jpegQuality: number
  /** Export 2×6 strips as two copies on a 4×6 sheet. */
  printSheet: boolean
  /** Last-used customization, kept for the next session (e.g. an event's caption). */
  design: Design
  facing: Facing
  cameraId: string | null
  /** Shown to a shared booth partner; empty means the device's name. */
  displayName: string
}

export const DEFAULT_SETTINGS: Settings = {
  countdown: 3,
  pauseSeconds: 1.5,
  mirror: true,
  flash: true,
  sound: false,
  grid: false,
  defaultLayout: DEFAULT_LAYOUT_ID,
  exportFormat: "png",
  jpegQuality: 0.92,
  printSheet: false,
  design: DEFAULT_DESIGN,
  facing: "user",
  cameraId: null,
  displayName: "",
}

interface SettingsActions {
  update: (patch: Partial<Settings>) => void
  updateDesign: (patch: Partial<Design>) => void
  resetDesign: () => void
}

export type SettingsStore = Settings & SettingsActions

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** Validates persisted data so a bad or old value never breaks the app. */
export function sanitizeSettings(value: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(value ?? {}) }
  return {
    countdown: COUNTDOWN_OPTIONS.includes(s.countdown) ? s.countdown : DEFAULT_SETTINGS.countdown,
    pauseSeconds: clamp(s.pauseSeconds, PAUSE_RANGE.min, PAUSE_RANGE.max, DEFAULT_SETTINGS.pauseSeconds),
    mirror: typeof s.mirror === "boolean" ? s.mirror : DEFAULT_SETTINGS.mirror,
    flash: typeof s.flash === "boolean" ? s.flash : DEFAULT_SETTINGS.flash,
    sound: typeof s.sound === "boolean" ? s.sound : DEFAULT_SETTINGS.sound,
    grid: typeof s.grid === "boolean" ? s.grid : DEFAULT_SETTINGS.grid,
    defaultLayout: isLayoutId(s.defaultLayout) ? s.defaultLayout : DEFAULT_SETTINGS.defaultLayout,
    exportFormat: s.exportFormat === "jpeg" ? "jpeg" : "png",
    jpegQuality: clamp(s.jpegQuality, JPEG_QUALITY_RANGE.min, JPEG_QUALITY_RANGE.max, DEFAULT_SETTINGS.jpegQuality),
    printSheet: typeof s.printSheet === "boolean" ? s.printSheet : DEFAULT_SETTINGS.printSheet,
    design: sanitizeDesign(s.design),
    facing: s.facing === "environment" ? "environment" : "user",
    cameraId: typeof s.cameraId === "string" && s.cameraId ? s.cameraId : null,
    displayName: cleanName(s.displayName),
  }
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      updateDesign: (patch) => set((state) => ({ design: { ...state.design, ...patch } })),
      resetDesign: () => set({ design: DEFAULT_DESIGN }),
    }),
    {
      name: "photobooth-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): Settings => {
        // Strip the action functions before persisting.
        const { update, updateDesign, resetDesign, ...settings } = state
        void update
        void updateDesign
        void resetDesign
        return settings
      },
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeSettings(persisted as Partial<Settings> | undefined),
      }),
    }
  )
)
