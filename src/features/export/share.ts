import { canShareFiles } from "@/lib/platform"

export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed"

/**
 * Opens the share sheet (iPhone: "Save Image" puts it in Photos).
 *
 * Call it directly from the tap handler with a File rendered beforehand: iOS requires
 * navigator.share() to run within the user gesture, and awaiting canvas.toBlob() first
 * loses it (NotAllowedError). Only `files` are passed; adding text/url can hide "Save Image".
 */
export function shareFile(file: File): Promise<ShareOutcome> {
  if (!canShareFiles(file)) return Promise.resolve("unsupported")
  return navigator.share({ files: [file] }).then(
    () => "shared",
    (error: unknown) =>
      error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "failed"
  )
}
