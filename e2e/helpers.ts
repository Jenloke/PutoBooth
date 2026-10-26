import { readFile } from "node:fs/promises"
import { expect, type Page } from "@playwright/test"

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Buffer) {
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

export function collectErrors(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(String(error)))
  return errors
}

/** Watches for requests that carry image data anywhere but this origin's static files. */
export function collectUploads(page: Page) {
  const uploads: string[] = []
  page.on("request", (request) => {
    const body = request.postDataBuffer()
    if (request.method() !== "GET" || (body && body.length > 0)) uploads.push(`${request.method()} ${request.url()}`)
  })
  return uploads
}

/** Shortest timings so a full session takes seconds, plus any other settings. */
export async function presetSettings(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript((settings) => {
    localStorage.setItem("photobooth-settings", JSON.stringify({ state: settings, version: 1 }))
  }, { countdown: 3, pauseSeconds: 0.5, flash: false, ...extra })
}

/** Starts the camera if the booth asks for it, and waits until it's live. */
export async function startCamera(page: Page) {
  const start = page.getByRole("button", { name: "Start camera" })
  await expect(page.getByLabel("Camera preview")).toBeAttached()
  if (await start.isVisible()) await start.click()
  await expect(start).toBeHidden()
}

export async function openBooth(page: Page) {
  await presetSettings(page)
  await page.goto("/")
  const shutter = page.getByRole("button", { name: "Take photos" })
  await expect(shutter).toBeVisible()
  await startCamera(page)
  await expect(shutter).toBeEnabled()
  return shutter
}

export async function downloadPng(page: Page) {
  const button = page.getByRole("button", { name: "Download" })
  await expect(button).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()])
  const path = await download.path()
  return { name: download.suggestedFilename(), size: pngSize(await readFile(path)) }
}
