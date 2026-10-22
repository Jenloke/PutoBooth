import { isIOS, isStandalone } from "@/lib/platform"

export type CameraErrorKind = "insecure" | "unsupported" | "denied" | "notfound" | "busy" | "unknown"

export interface CameraError {
  kind: CameraErrorKind
  title: string
  message: string
  /** Fix-it steps for this device and browser. */
  steps: string[]
}

type Browser = "ios" | "safari" | "chrome" | "other"

function detectBrowser(): Browser {
  if (isIOS()) return "ios"
  const ua = navigator.userAgent
  if (/Chrome|Chromium|Edg\//.test(ua)) return "chrome"
  if (/Safari/.test(ua)) return "safari"
  return "other"
}

function deniedSteps(browser: Browser): string[] {
  switch (browser) {
    case "ios":
      return isStandalone()
        ? [
            "Open the Settings app → Apps → Safari → Camera, and choose Ask or Allow.",
            "Close Photobooth from the app switcher, reopen it, and tap Allow when asked.",
          ]
        : [
            "In Safari's address bar, open the page menu (aA or ···) → Website Settings → Camera → Allow.",
            "Or open the Settings app → Apps → Safari → Camera, and choose Ask or Allow.",
            "Reload this page, then tap Start camera.",
          ]
    case "safari":
      return [
        "Choose Safari → Settings → Websites → Camera, and set this website to Allow.",
        "If Safari isn't allowed at all: System Settings → Privacy & Security → Camera → turn on Safari.",
        "Reload this page, then click Start camera.",
      ]
    case "chrome":
      return [
        "Click the site controls icon at the left of the address bar → Camera → Allow.",
        "If Chrome isn't allowed at all: System Settings → Privacy & Security → Camera → turn on Google Chrome (then quit and reopen Chrome).",
        "Reload this page, then click Start camera.",
      ]
    default:
      return ["Allow camera access for this site in your browser's settings, then reload."]
  }
}

export function cameraError(kind: CameraErrorKind, detail?: string): CameraError {
  const browser = detectBrowser()
  switch (kind) {
    case "insecure":
      return {
        kind,
        title: "Camera needs a secure connection",
        message: "Browsers only allow the camera on https:// pages (and localhost).",
        steps: [
          "Open the https:// address of this site.",
          "For local testing on a phone, run npm run dev:https or use a tunnel (see README).",
        ],
      }
    case "unsupported":
      return {
        kind,
        title: "This browser can't use the camera",
        message: "Camera access isn't available here. In-app browsers (Instagram, Facebook, Gmail) often block it.",
        steps:
          browser === "ios"
            ? ["Open this page in Safari.", "Or add it to your Home Screen and open it from there."]
            : ["Open this page in the latest Safari or Chrome."],
      }
    case "denied":
      return {
        kind,
        title: "Camera access is blocked",
        message: "Photobooth needs the camera to take photos. They never leave your device.",
        steps: deniedSteps(browser),
      }
    case "notfound":
      return {
        kind,
        title: "No camera found",
        message: "We couldn't find a camera on this device.",
        steps:
          browser === "ios"
            ? ["Restart Safari and try again."]
            : [
                "Connect a webcam, or use your iPhone as a camera with Continuity Camera (iPhone: Settings → General → AirPlay & Continuity → Continuity Camera).",
                "Then click Try again.",
              ],
      }
    case "busy":
      return {
        kind,
        title: "The camera is busy",
        message: "Another app or tab is using the camera.",
        steps: [
          browser === "ios"
            ? "Close FaceTime, the Camera app, or any call that's using the camera."
            : "Quit apps that may be using it (FaceTime, Photo Booth, Zoom, Teams), and close other tabs with the camera on.",
          "Then try again.",
        ],
      }
    default:
      return {
        kind: "unknown",
        title: "Couldn't start the camera",
        message: detail ? `The browser reported: ${detail}` : "Something went wrong starting the camera.",
        steps: ["Try again.", "If it keeps failing, reload the page or restart the browser."],
      }
  }
}

/** Maps getUserMedia failures (DOMException names vary by browser) to a friendly error. */
export function toCameraError(error: unknown): CameraError {
  const name =
    error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : ""
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return cameraError("denied")
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return cameraError("notfound")
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return cameraError("busy")
    default:
      return cameraError("unknown", error instanceof Error ? error.message : undefined)
  }
}
