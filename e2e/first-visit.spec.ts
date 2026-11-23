import { readFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"

import { collectErrors, collectUploads, downloadPng, presetSettings } from "./helpers.ts"

// A first visit: camera access not granted yet, so the booth waits for a tap.
test.use({ permissions: [] })

const MESSENGER_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.58 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.41.111;]"

async function pickPhotos(page: Page, trigger: () => Promise<void>, count: number) {
  const photo = await readFile("public/pwa-512.png")
  const chooser = page.waitForEvent("filechooser")
  await trigger()
  await (await chooser).setFiles(
    Array.from({ length: count }, (_, i) => ({ name: `photo-${i + 1}.png`, mimeType: "image/png", buffer: photo }))
  )
}

test("the page has real content and link previews before any JavaScript runs", async ({ request }) => {
  const html = await (await request.get("/")).text()
  expect(html).toMatch(/<h1[^>]*>\s*A free photo booth in your browser\s*<\/h1>/)
  expect(html).toContain(`<link rel="canonical" href="http://localhost:4173/" />`)
  expect(html).toContain(`<meta property="og:image" content="http://localhost:4173/og-image.jpg" />`)
  expect(html).toContain(`"@type": "WebApplication"`)

  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toContain("Sitemap: http://localhost:4173/sitemap.xml")
  const sitemap = await (await request.get("/sitemap.xml")).text()
  expect(sitemap).toContain("<loc>http://localhost:4173/</loc>")
  expect((await request.get("/og-image.jpg")).headers()["content-type"]).toBe("image/jpeg")
})

test("the camera screen shows what a session makes before asking for the camera", async ({ page }) => {
  const errors = collectErrors(page)
  await presetSettings(page)
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible()
  await expect(page.getByText("4 photos · 3-second countdown")).toBeVisible()

  await page.getByRole("radio", { name: /^Postcard/ }).click()
  await expect(page.getByText("1 photo · 3-second countdown")).toBeVisible()
  expect(errors).toEqual([])
})

test("a strip from library photos: repeats fill the layout and can be replaced", async ({ page }) => {
  const errors = collectErrors(page)
  const uploads = collectUploads(page)
  await presetSettings(page)
  await page.goto("/")

  await pickPhotos(page, () => page.getByRole("button", { name: "Use photos instead" }).click(), 2)
  await expect(page.getByRole("button", { name: "Replace photo 4" })).toBeVisible()
  await expect(page.getByText("2 photos for 4 spots, so some repeat")).toBeVisible()
  await expect(page.getByText("Click a photo to replace it", { exact: true })).toBeVisible()
  expect((await downloadPng(page)).size).toEqual({ width: 600, height: 1800 })

  await pickPhotos(page, () => page.getByRole("button", { name: "Replace photo 3" }).click(), 1)
  expect((await downloadPng(page)).size).toEqual({ width: 600, height: 1800 })

  // "Choose photos" starts over from the library; the first result stays in the gallery.
  await pickPhotos(page, () => page.getByRole("button", { name: "Choose photos" }).click(), 4)
  await expect(page.getByRole("button", { name: "Replace photo 4" })).toBeVisible()
  await expect(page.getByText(/some repeat/)).toBeHidden()

  expect(uploads).toEqual([])
  expect(errors).toEqual([])
})

test.describe("inside a chat app's browser", () => {
  test.use({ userAgent: MESSENGER_ANDROID })

  test("offers a way out to a real browser before the camera fails", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText("Messenger's browser may block the camera")).toBeVisible()
    const open = page.getByRole("link", { name: "Open in Chrome" })
    await expect(open).toHaveAttribute("href", /^intent:\/\/localhost:4173\/#Intent;scheme=http;package=com\.android\.chrome;end$/)
    await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Use photos instead" })).toBeVisible()
  })
})
