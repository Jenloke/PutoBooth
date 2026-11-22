import { beforeEach, describe, expect, it, vi } from "vitest"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock("@vercel/analytics", () => ({ inject: vi.fn(), track }))
vi.mock("@vercel/speed-insights", () => ({ injectSpeedInsights: vi.fn() }))

import { analyticsEnabled, scrubEvent, trackEvent, trackOnce } from "./analytics"

const VERCEL = { VITE_VERCEL_ENV: "production" } as ImportMetaEnv
const LOCAL = {} as ImportMetaEnv

describe("analyticsEnabled", () => {
  it("is on for Vercel production and preview deployments", () => {
    expect(
      analyticsEnabled({ VITE_VERCEL_ENV: "production" } as ImportMetaEnv)
    ).toBe(true)
    expect(
      analyticsEnabled({ VITE_VERCEL_ENV: "preview" } as ImportMetaEnv)
    ).toBe(true)
  })

  it("is off everywhere else, where the analytics script doesn't exist", () => {
    expect(
      analyticsEnabled({ VITE_VERCEL_ENV: "development" } as ImportMetaEnv)
    ).toBe(false)
    expect(analyticsEnabled({} as ImportMetaEnv)).toBe(false)
  })
})

describe("scrubEvent", () => {
  it("removes an invite link's room code", () => {
    const event = scrubEvent({
      type: "pageview",
      url: "https://booth.example/?join=K7M4QD",
    })
    expect(event).toEqual({ type: "pageview", url: "https://booth.example/" })
  })

  it("keeps other query parameters and the path", () => {
    const event = scrubEvent({
      type: "pageview",
      url: "https://booth.example/gallery?utm_source=qr&join=K7M4QD",
    })
    expect(event.url).toBe("https://booth.example/gallery?utm_source=qr")
  })

  it("passes events without a room code through untouched", () => {
    const event = {
      type: "event",
      url: "https://booth.example/gallery?utm_source=qr",
    } as const
    expect(scrubEvent(event)).toBe(event)
  })

  it("scrubs Speed Insights vitals too", () => {
    const event = scrubEvent({ type: "vital", url: "https://booth.example/?join=K7M4QD", route: "/" })
    expect(event).toEqual({ type: "vital", url: "https://booth.example/", route: "/" })
  })
})

describe("trackEvent", () => {
  beforeEach(() => track.mockClear())

  it("reports funnel events on Vercel deployments", () => {
    trackEvent("strip_saved", { method: "share", source: "camera" }, VERCEL)
    expect(track).toHaveBeenCalledWith("strip_saved", { method: "share", source: "camera" })
  })

  it("does nothing where analytics is off", () => {
    trackEvent("strip_saved", { method: "share", source: "camera" }, LOCAL)
    expect(track).not.toHaveBeenCalled()
  })

  it("never throws, even if the analytics script does", () => {
    track.mockImplementationOnce(() => {
      throw new Error("blocked")
    })
    expect(() => trackEvent("camera_start", { auto: false }, VERCEL)).not.toThrow()
  })

  it("reports a once-per-load event a single time per key", () => {
    trackOnce("camera_error", { kind: "denied", app: "none" }, "denied", VERCEL)
    trackOnce("camera_error", { kind: "denied", app: "none" }, "denied", VERCEL)
    trackOnce("camera_error", { kind: "busy", app: "none" }, "busy", VERCEL)
    expect(track).toHaveBeenCalledTimes(2)
  })
})
