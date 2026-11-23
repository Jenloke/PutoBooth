import { inject, track } from "@vercel/analytics"
import { injectSpeedInsights } from "@vercel/speed-insights"

import { JOIN_PARAM } from "@/features/pair/roomCode"

/**
 * Vercel Web Analytics: cookieless page views (page, referrer, country, browser, device type),
 * plus a few funnel events (below). Vercel Speed Insights: Core Web Vitals from real visits.
 * Photos, names, room codes and anything typed in the app are never part of either.
 */

/**
 * Vercel sets VITE_VERCEL_ENV when it builds a production or preview deployment. Anywhere else
 * (dev server, `vite preview`, the end-to-end build) there is no analytics script to load.
 */
export function analyticsEnabled(
  env: ImportMetaEnv = import.meta.env
): boolean {
  return (
    env.VITE_VERCEL_ENV === "production" || env.VITE_VERCEL_ENV === "preview"
  )
}

/**
 * Drops an invite link's room code from the reported URL: anyone holding the code can join that
 * booth while it's open. consumeJoinLink() already removes it before the first page view; this
 * makes sure it can't reach analytics even if that ever changes.
 */
export function scrubEvent<E extends { url: string }>(event: E): E {
  const url = new URL(event.url)
  if (!url.searchParams.has(JOIN_PARAM)) return event
  url.searchParams.delete(JOIN_PARAM)
  return { ...event, url: url.href }
}

/** Loads the analytics scripts on Vercel deployments. Route changes are tracked automatically. */
export function startAnalytics(env: ImportMetaEnv = import.meta.env): void {
  if (!analyticsEnabled(env)) return
  inject({ beforeSend: scrubEvent })
  injectSpeedInsights({ beforeSend: scrubEvent })
}

export type SaveMethod = "download" | "share" | "print"
/** Where a strip's photos came from. */
export type StripSource = "camera" | "shared" | "library"

/**
 * The activation funnel: landing → camera_start (or photos_imported) → shoot_start →
 * strip_done → strip_saved. A visit with neither camera_start nor photos_imported is a bounce.
 *
 * Vercel accepts at most two properties per event on the Pro plan, and records custom events
 * only on Pro and Enterprise. On Hobby these calls are dropped and page views still count.
 */
export interface AnalyticsEvents {
  /** The camera was asked to start: a tap, or automatically for a returning visitor. */
  camera_start: { auto: boolean }
  /** The camera failed. `app` names an in-app browser, or "none". */
  camera_error: { kind: string; app: string }
  shoot_start: { layout: string; shared: boolean }
  /** A full sequence finished and the review opened. */
  strip_done: { layout: string; shared: boolean }
  /** A strip made from library photos instead of the camera. */
  photos_imported: { count: number; layout: string }
  strip_saved: { method: SaveMethod; source: StripSource }
  /** A shared booth was opened, by its host or by a guest (invite link or typed code). */
  pair: { role: "host" | "guest"; via: "button" | "link" | "code" }
  /** The page opened inside a social or chat app's browser. */
  in_app_browser: { app: string }
  /** "Open in Chrome" or "Copy link" from the in-app browser notice. */
  open_in_browser: { app: string; action: "intent" | "copy" }
  install: { outcome: "accepted" | "dismissed" | "ios_hint" | "installed" }
}

export function trackEvent<K extends keyof AnalyticsEvents>(
  name: K,
  properties: AnalyticsEvents[K],
  env: ImportMetaEnv = import.meta.env
): void {
  if (!analyticsEnabled(env)) return
  try {
    track(name, properties)
  } catch {
    // Analytics must never break the app.
  }
}

const once = new Set<string>()

/** Reports an event at most once per page load (per name and key), e.g. a camera that keeps failing. */
export function trackOnce<K extends keyof AnalyticsEvents>(
  name: K,
  properties: AnalyticsEvents[K],
  key = "",
  env: ImportMetaEnv = import.meta.env
): void {
  const id = `${name}:${key}`
  if (once.has(id)) return
  once.add(id)
  trackEvent(name, properties, env)
}
