import { expect, test } from "@playwright/test"

import { NAV_PAGES } from "../src/lib/site.ts"
import { collectErrors } from "./helpers.ts"

test("every page has its heading, canonical URL, navigation and a way into the booth", async ({ page }) => {
  const errors = collectErrors(page)
  for (const { path, nav } of NAV_PAGES) {
    await page.goto(path)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `http://localhost:4173${path}`)
    await expect(page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: nav })).toHaveAttribute(
      "aria-current",
      "page"
    )
    await expect(page.getByRole("link", { name: "Open the booth" }).first()).toHaveAttribute("href", "/")
  }
  expect(errors).toEqual([])
})

test("the booth links to the pages, and the pages lead back to it", async ({ page }) => {
  await page.goto("/how-it-works")
  await page.getByRole("link", { name: "Open the booth" }).first().click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("button", { name: "Take photos" })).toBeVisible()

  const about = page.getByRole("navigation", { name: "About" })
  for (const { path, nav } of NAV_PAGES) await expect(about.getByRole("link", { name: nav })).toHaveAttribute("href", path)
})

test("'Start a shared booth' opens the booth with the shared booth dialog", async ({ page }) => {
  await page.goto("/shoot-together")
  await page.getByRole("link", { name: "Start a shared booth" }).first().click()
  await expect(page.getByRole("dialog", { name: "Shoot together" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})
