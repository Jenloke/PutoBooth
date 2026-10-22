import type { LayoutSpec } from "@/features/layouts/layouts"
import type { ExportFormat } from "@/store/settings"

export function mimeFor(format: ExportFormat): "image/png" | "image/jpeg" {
  return format === "png" ? "image/png" : "image/jpeg"
}

const pad = (n: number) => String(n).padStart(2, "0")

/** e.g. photobooth-classic-20261021-174502.png */
export function resultFileName(
  layout: LayoutSpec,
  takenAt: number,
  format: ExportFormat,
  printSheet: boolean
): string {
  const d = new Date(takenAt)
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  const ext = format === "png" ? "png" : "jpg"
  return `photobooth-${layout.id}${printSheet ? "-sheet" : ""}-${stamp}.${ext}`
}

/** Saves a file through <a download> (the Mac default, and the iPhone fallback to Share). */
export function downloadFile(file: File, objectUrl?: string): void {
  const href = objectUrl ?? URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = href
  link.download = file.name
  link.rel = "noopener"
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (!objectUrl) window.setTimeout(() => URL.revokeObjectURL(href), 30_000)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
