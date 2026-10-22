// Renders the app icons in public/ from one SVG design, using Playwright's Chromium.
// Run after changing the design: npm run icons
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { chromium } from "@playwright/test"

const publicDir = resolve(import.meta.dirname, "../public")

/**
 * A photo strip on a dark tile. `rounded` has transparent corners (favicon, "any" icons);
 * `full` is edge to edge (iOS rounds it itself); `maskable` keeps the art inside the
 * 80% safe zone so Android's mask never clips it.
 */
function iconSvg(variant) {
  const scale = variant === "maskable" ? 0.78 : 1
  const background =
    variant === "rounded"
      ? `<rect width="512" height="512" rx="112" fill="#111111"/>`
      : `<rect width="512" height="512" fill="#111111"/>`
  const frames = [86, 190, 294]
    .map((y) => `<rect x="196" y="${y}" width="120" height="90" rx="10" fill="url(#photo)"/>`)
    .join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="photo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffb36b"/>
      <stop offset="0.55" stop-color="#f0679a"/>
      <stop offset="1" stop-color="#7c6cf2"/>
    </linearGradient>
  </defs>
  ${background}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="180" y="70" width="152" height="390" rx="18" fill="#ffffff"/>
    ${frames}
    <rect x="226" y="414" width="60" height="10" rx="5" fill="#111111" opacity="0.55"/>
  </g>
</svg>`
}

const outputs = [
  { file: "pwa-192.png", size: 192, variant: "rounded" },
  { file: "pwa-512.png", size: 512, variant: "rounded" },
  { file: "maskable-512.png", size: 512, variant: "maskable" },
  { file: "apple-touch-icon.png", size: 180, variant: "full" },
  { file: "favicon-32.png", size: 32, variant: "rounded" },
]

writeFileSync(resolve(publicDir, "favicon.svg"), iconSvg("rounded"))

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, variant } of outputs) {
  await page.setViewportSize({ width: size, height: size })
  const src = `data:image/svg+xml;base64,${Buffer.from(iconSvg(variant)).toString("base64")}`
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`
  )
  await page.locator("img").evaluate((img) => img.decode())
  await page.screenshot({ path: resolve(publicDir, file), omitBackground: variant === "rounded" })
  console.log("wrote", file)
}
await browser.close()
