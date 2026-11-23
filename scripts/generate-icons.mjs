// Renders the app icons and the social preview image in public/ from one design, using
// Playwright's Chromium. Run after changing the design: npm run icons
import { readFileSync, writeFileSync } from "node:fs"
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

const PHOTO_GRADIENTS = [
  "linear-gradient(135deg, #ffb36b, #f0679a 55%, #7c6cf2)",
  "linear-gradient(160deg, #f0679a, #7c6cf2)",
  "linear-gradient(120deg, #ffb36b, #f0679a)",
  "linear-gradient(145deg, #7c6cf2, #f0679a 60%, #ffb36b)",
]

/** One photo: a gradient with one person, or two side by side (a shared booth strip). */
function photo(i, people) {
  const figure = (cx, r) =>
    `<circle cx="${cx}" cy="${42 - (r - 16)}" r="${r}"/><path d="M${cx - r * 2} 96c0-19 ${r * 0.9} -31 ${r * 2} -31s${r * 2} 12 ${r * 2} 31z"/>`
  const figures = people === 2 ? figure(46, 14) + figure(98, 14) : figure(72, 17)
  return `<div class="photo" style="background:${PHOTO_GRADIENTS[i % 4]}">
    <svg viewBox="0 0 144 96" fill="#fff" fill-opacity="0.5">${figures}</svg>
  </div>`
}

function strip(people, style) {
  return `<div class="strip" style="${style}">${[0, 1, 2, 3].map((i) => photo(i + people, people)).join("")}<div class="caption"></div></div>`
}

/** The link preview (Open Graph) image, 1200×630. */
function ogHtml() {
  const geist = readFileSync(
    resolve(import.meta.dirname, "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")
  ).toString("base64")
  return `<!doctype html><html><head><style>
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${geist}) format("woff2"); font-weight: 100 900; }
  html, body { margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #111111; color: #ffffff; font-family: Geist, sans-serif; }
  .glow { position: absolute; inset: 0; background:
    radial-gradient(520px 380px at 84% 46%, rgba(240, 103, 154, 0.30), transparent 70%),
    radial-gradient(460px 340px at 68% 96%, rgba(124, 108, 242, 0.26), transparent 70%),
    radial-gradient(420px 300px at 98% 0%, rgba(255, 179, 107, 0.22), transparent 70%); }
  .copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 610px; display: flex; flex-direction: column; justify-content: center; gap: 30px; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; letter-spacing: -0.01em; }
  h1 { margin: 0; font-size: 78px; line-height: 1.02; font-weight: 700; letter-spacing: -0.04em; }
  p { margin: 0; font-size: 29px; line-height: 1.4; color: #b8b8b8; text-wrap: pretty; }
  .strip { position: absolute; width: 168px; height: 504px; box-sizing: border-box; padding: 12px; display: flex; flex-direction: column; gap: 12px;
    background: #ffffff; border-radius: 12px; box-shadow: 0 30px 70px rgba(0, 0, 0, 0.5); }
  .photo { height: 96px; border-radius: 5px; overflow: hidden; flex: none; }
  .photo svg { display: block; width: 100%; height: 100%; }
  .caption { margin: auto auto 10px; width: 70px; height: 8px; border-radius: 4px; background: #111111; opacity: 0.45; }
</style></head><body>
  <div class="glow"></div>
  <div class="copy">
    <div class="brand">
      <svg viewBox="0 0 24 24" width="34" height="34"><rect x="6" y="1.5" width="12" height="21" rx="2.5" fill="#fff"/><rect x="8" y="3.5" width="8" height="5" rx="1" fill="#111"/><rect x="8" y="9.5" width="8" height="5" rx="1" fill="#111"/><rect x="8" y="15.5" width="8" height="2.5" rx="1" fill="#111"/></svg>
      Photobooth
    </div>
    <h1>A photo booth in your browser</h1>
    <p>Countdown, four photos, a print-ready strip. Shoot together on two devices. Nothing is uploaded.</p>
  </div>
  ${strip(1, "left: 790px; top: 70px; transform: rotate(-7deg);")}
  ${strip(2, "left: 962px; top: 52px; transform: rotate(6deg);")}
</body></html>`
}

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

await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(ogHtml())
await page.evaluate(() => document.fonts.ready)
// JPEG keeps it small for link-preview crawlers; the service worker doesn't precache it.
await page.screenshot({ path: resolve(publicDir, "og-image.jpg"), type: "jpeg", quality: 90 })
console.log("wrote og-image.jpg")

await browser.close()
