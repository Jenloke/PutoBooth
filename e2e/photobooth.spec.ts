import { expect, test } from "@playwright/test"

import { collectErrors, collectUploads, downloadPng, openBooth } from "./helpers.ts"

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
