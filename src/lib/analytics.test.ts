import { describe, expect, it } from "vitest"

import { analyticsEnabled, scrubEvent } from "./analytics"

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
})
