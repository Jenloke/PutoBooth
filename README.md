# Photobooth

A photobooth that runs entirely in the browser. Tap the shutter, get a countdown and a timed
sequence of photos, and leave with a print-ready image: a classic 2×6 in strip by default,
or one of six other layouts. Built for Safari on iPhone and Safari/Chrome on Mac.

Everything happens on the device. There is no backend, nothing is uploaded, and the site
deploys to Vercel as static files.

- **Stack:** Vite, React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui (Radix), lucide-react,
  zustand, idb-keyval, vite-plugin-pwa, self-hosted fonts via @fontsource.
- **Tests:** Vitest (layout geometry, filter matrices, crop math, CSP hash) and Playwright
  (full sessions with Chromium's fake camera).

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173 (localhost may use the camera without HTTPS)
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run dev:https` | Dev server on your LAN with a self-signed certificate (for iPhone testing) |
| `npm run build` | `tsc -b && vite build`, so type errors fail the build and the deploy |
| `npm run preview` | Serves `dist/` locally |
| `npm run typecheck` / `npm run lint` | TypeScript project build / ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; first run `npx playwright install chromium`) |
| `npm run icons` | Regenerates the PWA icons in `public/` from the SVG in `scripts/generate-icons.mjs` |

Node 22 is required (`engines.node` is `22.x`, which Vercel also uses).

## Deploying to Vercel

The repo is a plain static Vite site: no server functions, environment variables or
analytics. `vercel.json` holds the rewrite, cache and security headers.

### One-time setup (Git integration)

1. Push this repo to GitHub (any visibility).
2. In Vercel, choose **Add New → Project**, then import the repository.
3. Vercel detects **Vite**. Keep the defaults: build command `npm run build`, output
   directory `dist`, root directory `/`. No environment variables are needed.
4. Deploy. From then on:
   - every push to `main` deploys to **production**;
   - every other branch and every pull request gets its own HTTPS **preview URL**.

The camera requires HTTPS, and every Vercel URL is HTTPS.

### Settings worth checking

- **Deployment Protection.** Preview deployments sit behind Vercel Authentication by default.
  To try a preview on an iPhone, sign in to Vercel in Safari on that phone first. The
  production domain stays public. Add to Home Screen also works on protected previews,
  because the manifest is requested with credentials (`useCredentials: true` in
  `vite.config.ts`).
- **Vercel Toolbar.** The toolbar Vercel injects into preview deployments loads scripts from
  `vercel.live`, which this app's Content-Security-Policy blocks. The page still works, but the
  console shows CSP errors. Turn the toolbar off under **Project Settings → General → Vercel
  Toolbar**, or add the Vercel domains to the CSP if you want it.

### CLI fallback

```bash
npx vercel          # preview deployment (asks you to log in and link the project the first time)
npx vercel --prod   # production deployment
```

### What `vercel.json` does

- **SPA fallback.** Every path rewrites to `/index.html`, so reloading `/gallery` works.
  Real files in `dist/` are served first.
- **Caching.**
  - `/assets/*` has hashed file names, so it's cached for a year as `immutable`.
  - `/sw.js` and `/manifest.webmanifest` are `no-cache`, so installed apps notice new deploys.
- **Security headers.**
  - `Permissions-Policy` keeps `camera=(self)`, plus wake lock, Web Share and fullscreen for the
    app itself; everything else is disabled.
  - The CSP allows `blob:` and `data:` images, which the shots and previews use. It does not
    allow `unsafe-inline` for scripts.
  - The one inline script, the no-flash theme snippet in `index.html`, is allowed by its sha256
    hash. If you edit that script, update the hash in `vercel.json`. `tests/csp.test.ts` fails
    until they match, and prints the hash it expects.

### Updates to the installed app

The service worker precaches the whole app, so it works offline after the first visit. When
a new deploy is live, the app shows a **"New version available · Reload"** toast. It checks on
launch, hourly, and whenever the app returns to the foreground. The toast never appears while
photos are being taken, and nothing reloads by itself.

## Testing on an iPhone

**Easiest: deploy a preview.** Push a branch, open the preview URL in Safari on the iPhone
(signed in to Vercel), tap **Start camera**, and allow access.

**Without deploying, on the same Wi-Fi network:**

```bash
npm run dev:https    # prints https://192.168.x.x:5173
```

Open that URL on the iPhone. Accept the certificate warning once (Show Details → visit this
website), then allow the camera.

**Through a tunnel**, which gives you a trusted HTTPS URL with no certificate warning:

```bash
npm run dev
cloudflared tunnel --url http://localhost:5173    # or: ngrok http 5173
```

`*.trycloudflare.com`, `*.ngrok-free.app` and `*.ngrok.app` are already in
`server.allowedHosts`. Add other tunnel hosts there.

On a Mac, the built-in camera, external webcams and Continuity Camera all appear in the camera
picker in the settings panel. Device names show up after you grant access the first time.

## How it works

```
src/
  components/            app header, theme provider + mode toggle, PWA update prompt, shadcn ui/
  features/
    camera/              useCamera (stream lifecycle, devices, errors), preview, picker, capture
    booth/               session store + runner (idle → countdown → capture → pause → review),
                         countdown, flash, shot tray, shutter, settings panel, sounds
    layouts/             layouts.ts (data), computeLayout.ts (pure geometry), picker, icons
    compose/             renderComposite (canvas), filters (CSS lists → color matrices), fonts,
                         design defaults, crop math, logo store
    review/              review screen, customizer, debounced export rendering, gallery autosave
    export/              file names + download, Web Share, print
    gallery/             IndexedDB store, gallery screen and viewer
  store/settings.ts      persisted settings (zustand + localStorage)
  lib/                   platform detection, canvas helpers, router, hooks
```

- **WYSIWYG.** The review screen shows the actual export: the same canvas, encoded to the
  same PNG or JPEG you download or share. It re-renders on every change, debounced, and keeps
  a ready-made `File`, so Share can call `navigator.share()` directly inside the tap.
- **Framing.** Each shot stores the full camera frame (mirrored if "Mirror photos" is on). Slots
  are cropped at render time with the same cover math the preview gets from
  `object-fit: cover`, so the saved framing matches the preview box. This is also why you can
  switch to another layout with the same number of photos without reshooting.
- **Filters.** Each filter is defined once as a list of CSS filter functions. The preview applies
  them as CSS `filter` on the `<video>`. The export converts the same functions to the Filter
  Effects color matrices and applies them to `ImageData` in order, clamped after each step.

### Layouts (300 DPI)

| Layout | Output | Photos |
| --- | --- | --- |
| Classic Strip, 2×6 in | 600 × 1800 | 4 × 540×360 (3:2), 30 px margins and gaps, 210 px footer |
| Trio Strip, 2×6 in | 600 × 1800 | 3 × 540×405 (4:3), 465 px footer |
| Grid, 4×6 in | 1200 × 1800 | 2×2 × 540×720 (3:4), 240 px footer |
| Six-Pack, 4×6 in | 1200 × 1800 | 3×2 × 500×500, 140 px footer |
| Postcard, 6×4 in | 1800 × 1200 | 1 × 1440×960 (3:2), 120 px footer |
| Instant, 3.5×4.2 in | 1050 × 1260 | 1 × 930×930, Polaroid-style bottom border |
| Square (social) | 1080 × 1080 | 2×2 × 440×440 |
| Print sheet (2×6 strips) | 1200 × 1800 | two strips side by side, to print on 4×6 paper and cut |

Layouts are data in `src/features/layouts/layouts.ts`. To add one, add an entry there and
its expected geometry to `computeLayout.test.ts`.

## Known Safari limits (and what the app does about them)

- **No `CanvasRenderingContext2D.filter` in Safari.** Filters would silently vanish in exports,
  so the export uses color matrices on pixels instead.
- **No ImageCapture API.** Shots are grabbed by drawing the `<video>` frame to a canvas.
- **Canvas size cap of about 16.7 MP on iOS.** Captures are scaled below 14 MP. Temporary
  canvases are released right away, and object URLs are revoked.
- **WebP encoding isn't reliable.** Exports are PNG or JPEG only.
- **The share sheet needs the user gesture.** `navigator.share()` is called synchronously with
  a file rendered in advance. On iPhone, choose **Save Image** in the sheet to put it in Photos.
  On Mac, Download is the main action.
- **Camera permission.** Safari may ask again on later visits unless the site is set to **Allow**
  (Website Settings → Camera). iOS mutes or ends the camera when the app goes to the
  background; the app cancels any countdown in progress and reopens the camera when you come
  back.
- **Storage can be evicted.** Safari may delete website data for sites that haven't been used in a
  while, and Home Screen apps keep storage separate from Safari. The gallery is a convenience.
  The app asks for persistent storage and reminds people to download or share.
- **`@page` sizing.** Print sets the page to the layout's size (2×6, 4×6 and so on). Browsers that
  don't support `@page size` fall back to the printer's paper size.
- **No vibration on iOS**, so the app doesn't use `navigator.vibrate`.
- **Shutter sound.** It uses Web Audio, which iOS keeps silent while the ring/silent switch is on.
  Sound is off by default.
- **Screen Wake Lock** is requested while the camera is on and during review. Where it isn't
  available, the screen may dim as usual.
