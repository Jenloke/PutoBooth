import { expect, test, type Browser, type Page } from "@playwright/test"

import { collectErrors, collectUploads, downloadPng, presetSettings, startCamera } from "./helpers.ts"

/** A second "device": its own browser context, so its own storage, camera and connection. */
async function newDevice(browser: Browser, baseURL: string | undefined, name: string) {
  const context = await browser.newContext({ baseURL, permissions: ["camera"], viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await presetSettings(page, { displayName: name })
  return page
}

/** Center pixel of each half of the first photo slot in the review image (Classic Strip). */
async function firstSlotHalves(page: Page) {
  return page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('img[alt^="Classic Strip"]')
    if (!img) throw new Error("No result image")
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0)
    const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
    // Slot 1 is 540×360 at (30, 30): halves of 265 px with a 9 px seam.
    return { left: at(162, 210), right: at(437, 210) }
  })
}

const PLACEHOLDER_GRAY = [212, 212, 212]

test("two devices shoot one strip together, retake together and leave", async ({ page: host, browser, baseURL }) => {
  const guest = await newDevice(browser, baseURL, "Sam")
  const errors = [...[host, guest].map(collectErrors)]
  const uploads = [host, guest].map(collectUploads)

  // Alex opens a shared booth.
  await presetSettings(host, { displayName: "Alex" })
  await host.goto("/")
  await startCamera(host)
  await host.getByRole("button", { name: "Shoot together" }).click()
  await host.getByRole("button", { name: "Start a shared booth" }).click()
  const code = (await host.getByRole("dialog").getByText(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/).textContent())!

  // Sam opens the invite link.
  await guest.goto(`/?join=${code.replace("-", "")}`)
  await expect(guest).toHaveURL(/\/$/)
  await expect(guest.getByRole("heading", { name: "Connected with Alex" })).toBeVisible()
  await guest.getByRole("button", { name: "Start shooting" }).click()
  await startCamera(guest)
  await expect(host.getByRole("heading", { name: "Connected with Sam" })).toBeVisible()
  await host.getByRole("button", { name: "Start shooting" }).click()

  // Both are ready; Sam presses the shutter and both devices shoot.
  await expect(host.getByText("You're on the left, Sam is on the right.")).toBeVisible()
  await expect(guest.getByText("You're on the right, Alex is on the left.")).toBeVisible()
  await guest.getByRole("button", { name: "Take photos" }).click()
  for (const page of [host, guest]) {
    await expect(page.getByRole("button", { name: "Retake photo 4" })).toBeVisible({ timeout: 60_000 })
  }

  // Each side received the other's four photos and composites both halves.
  await expect(host.getByText("Click a photo to retake it with Sam")).toBeVisible()
  await expect(guest.getByText("Click a photo to retake it with Alex")).toBeVisible()
  for (const page of [host, guest]) {
    expect((await downloadPng(page)).size).toEqual({ width: 600, height: 1800 })
    const { left, right } = await firstSlotHalves(page)
    expect(left).not.toEqual(PLACEHOLDER_GRAY)
    expect(right).not.toEqual(PLACEHOLDER_GRAY)
  }

  // Alex retakes photo 2: both devices go back to the booth and shoot it together.
  await host.getByRole("button", { name: "Retake photo 2" }).click()
  for (const page of [host, guest]) {
    await expect(page.getByRole("status").filter({ hasText: /^Retaking photo 2\./ })).toBeAttached()
  }
  for (const page of [host, guest]) {
    await expect(page.getByRole("button", { name: "Retake photo 4" })).toBeVisible({ timeout: 30_000 })
  }
  await expect(guest.getByText("Click a photo to retake it with Alex")).toBeVisible()

  // Sam leaves; Alex is told and the booth goes back to one device.
  await guest.getByRole("button", { name: "Shared booth with Alex" }).click()
  await guest.getByRole("button", { name: "Leave" }).click()
  await expect(host.getByText("Sam left the shared booth")).toBeVisible()
  await expect(host.getByRole("button", { name: "Shoot together" })).toBeVisible()

  // The shared strip is in both galleries, with who it was shot with.
  await host.getByRole("button", { name: "Start over" }).click()
  await host.getByRole("button", { name: "Gallery" }).first().click()
  await expect(host.getByText(/with Sam/)).toBeVisible()

  expect(uploads.flat()).toEqual([])
  expect(errors.flat()).toEqual([])
  await guest.context().close()
})

test("an invite link with a bad code explains the problem", async ({ page }) => {
  await page.goto("/?join=NOPE")
  await expect(page.getByRole("heading", { name: "Couldn't connect" })).toBeVisible()
  await expect(page.getByText("That isn't a booth code.", { exact: false })).toBeVisible()
  await page.getByRole("button", { name: "Back" }).click()
  await expect(page.getByRole("button", { name: "Start a shared booth" })).toBeVisible()
})
