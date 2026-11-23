/** Feature and platform detection. Prefer feature checks; UA checks only pick sensible defaults. */

export function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac; touch support gives it away.
  return (
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  )
}

/** A friendly default name for this device ("iPhone", "Mac", …), shown to a shared booth partner. */
export function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad"
  if (/iPhone|iPod/.test(ua)) return "iPhone"
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet"
  if (/Macintosh/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows PC"
  if (/CrOS/.test(ua)) return "Chromebook"
  return "Guest"
}

export function isAndroid(ua = navigator.userAgent): boolean {
  return /Android/.test(ua)
}

export type InAppBrowser =
  | "Messenger"
  | "Instagram"
  | "Facebook"
  | "TikTok"
  | "LINE"
  | "Snapchat"
  | "LinkedIn"
  | "WeChat"

/** Order matters: Messenger's user agent also carries Facebook's tokens. */
const IN_APP_BROWSERS: readonly [InAppBrowser, RegExp][] = [
  ["Messenger", /FBAN\/Messenger|FB_IAB\/(?:MESSENGER|Orca-Android)/i],
  ["Instagram", /\bInstagram\b/],
  ["Facebook", /FBAN\/|FBAV\/|FB_IAB\//],
  ["TikTok", /musical_ly|BytedanceWebview|\bTikTok\b/i],
  ["LINE", /\bLine\/\d/],
  ["Snapchat", /\bSnapchat\b/],
  ["LinkedIn", /LinkedInApp/],
  ["WeChat", /MicroMessenger/],
]

/**
 * The social or chat app whose built-in browser this page is open in, if any. These browsers
 * often block the camera, and links shared in chats (invites included) open in them first.
 */
export function inAppBrowser(ua = navigator.userAgent): InAppBrowser | null {
  for (const [app, pattern] of IN_APP_BROWSERS) if (pattern.test(ua)) return app
  return null
}

/** An Android intent link that opens `href` in Chrome, out of an in-app browser. */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href)
  const scheme = url.protocol.replace(/:$/, "")
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};package=com.android.chrome;end`
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function hasCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function isSecureContextForCamera(): boolean {
  return window.isSecureContext
}

export function hasCameraApi(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function"
}

export function canShareFiles(file: File): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] })
    )
  } catch {
    return false
  }
}

export function hasWakeLock(): boolean {
  return "wakeLock" in navigator
}

/** Asks the browser not to evict our IndexedDB data. Safari may still clear it for unused sites. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
