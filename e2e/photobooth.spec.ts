import { readFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"

/** Width and height from a PNG's IHDR chunk. */
function pngSize(png: Buffer) {
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG")
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(String(error)))
  return errors
}

/** Watches for requests that carry image data anywhere but this origin's static files. */
function collectUploads(page: Page) {
  const uploads: string[] = []
  page.on("request", (request) => {
    const body = request.postDataBuffer()
    if (request.method() !== "GET" || (body && body.length > 0)) uploads.push(`${request.method()} ${request.url()}`)
  })
  return uploads
}

async function openBooth(page: Page) {
  await page.addInitScript(() => {
    // Shortest timings so a full session takes seconds.
    localStorage.setItem(
      "photobooth-settings",
      JSON.stringify({ state: { countdown: 3, pauseSeconds: 0.5, flash: false }, version: 1 })
    )
  })
  await page.goto("/")
  const shutter = page.getByRole("button", { name: "Take photos" })
  await expect(shutter).toBeVisible()
  const start = page.getByRole("button", { name: "Start camera" })
  if (await start.isVisible()) await start.click()
  await expect(shutter).toBeEnabled()
  return shutter
}

async function downloadPng(page: Page) {
  const button = page.getByRole("button", { name: "Download" })
  await expect(button).toBeEnabled()
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()])
  const path = await download.path()
  return { name: download.suggestedFilename(), size: pngSize(await readFile(path)) }
}

test("Classic Strip session downloads a 600×1800 PNG and a 1200×1800 print sheet", async ({ page }) => {
  const errors = collectErrors(page)
  const uploads = collectUploads(page)
  const shutter = await openBooth(page)

  await shutter.click()
  // Four photos: countdown 3 s each, then review.
  await expect(page.getByRole("button", { name: "Retake photo 4" })).toBeVisible({ timeout: 60_000 })

  const strip = await downloadPng(page)
  expect(strip.size).toEqual({ width: 600, height: 1800 })
  expect(strip.name).toMatch(/^photobooth-classic-\d{8}-\d{6}\.png$/)

  await page.getByRole("tab", { name: "Export" }).click()
  await page.getByRole("switch", { name: "Print sheet: 2 strips on 4×6" }).click()
  const sheet = await downloadPng(page)
  expect(sheet.size).toEqual({ width: 1200, height: 1800 })
  expect(sheet.name).toContain("-sheet-")

  // Switching to another 4-photo layout reuses the shots.
  await page.getByRole("tab", { name: "Layout" }).click()
  await page.getByRole("radio", { name: /^Grid/ }).click()
  const grid = await downloadPng(page)
  expect(grid.size).toEqual({ width: 1200, height: 1800 })

  // The result lands in the gallery.
  await page.getByRole("button", { name: "Start over" }).click()
  await page.getByRole("button", { name: "Gallery" }).first().click()
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible()
  await expect(page.getByText("1 photo", { exact: false }).first()).toBeVisible()

  expect(uploads).toEqual([])
  expect(errors).toEqual([])
})

test("Postcard exports 1800×1200 and retakes a single shot", async ({ page }) => {
  const errors = collectErrors(page)
  const shutter = await openBooth(page)
  await page.getByRole("radio", { name: /^Postcard/ }).click()

  await shutter.click()
  const slot = page.getByRole("button", { name: "Retake photo 1" })
  await expect(slot).toBeVisible({ timeout: 30_000 })
  expect((await downloadPng(page)).size).toEqual({ width: 1800, height: 1200 })

  await slot.click()
  await expect(page.getByText("Retaking photo 1")).toBeVisible()
  await expect(page.getByRole("button", { name: "Retake photo 1" })).toBeVisible({ timeout: 30_000 })
  expect((await downloadPng(page)).size).toEqual({ width: 1800, height: 1200 })

  expect(errors).toEqual([])
})

test("Space starts a session and Esc cancels it", async ({ page }) => {
  const errors = collectErrors(page)
  await openBooth(page)

  await page.keyboard.press("Space")
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Take photos" })).toBeEnabled()
  await expect(page.getByRole("list", { name: "Photos taken: 0 of 4" })).toBeVisible()

  expect(errors).toEqual([])
})

test("Unknown routes and the gallery load directly", async ({ page }) => {
  await page.goto("/gallery")
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible()
  await page.goto("/does-not-exist")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("button", { name: "Take photos" })).toBeVisible()
})
