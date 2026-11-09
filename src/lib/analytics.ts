import { inject, type BeforeSendEvent } from "@vercel/analytics"

import { JOIN_PARAM } from "@/features/pair/roomCode"

/**
 * Vercel Web Analytics: cookieless page views (page, referrer, country, browser, device type).
 * Photos, names and anything typed in the app are never part of it.
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
export function scrubEvent<E extends BeforeSendEvent>(event: E): E {
  const url = new URL(event.url)
  if (!url.searchParams.has(JOIN_PARAM)) return event
  url.searchParams.delete(JOIN_PARAM)
  return { ...event, url: url.href }
}

/** Loads the analytics script on Vercel deployments. Route changes are tracked automatically. */
export function startAnalytics(env: ImportMetaEnv = import.meta.env): void {
  if (analyticsEnabled(env)) inject({ beforeSend: scrubEvent })
}
