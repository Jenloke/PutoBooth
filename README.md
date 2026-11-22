# Photobooth

A photobooth that runs entirely in the browser. Tap the shutter, get a countdown and a timed
sequence of photos, and leave with a print-ready image: a classic 2×6 in strip by default,
or one of six other layouts. Built for Safari on iPhone and Safari/Chrome on Mac.

Two people can also **shoot together on two devices**: each fills one half of every photo,
the countdown runs on both screens at once, and both get the strip (see
[Shared booth](#shared-booth)).

Everything happens on the device. There is no backend, no photo is ever uploaded, and the site
deploys to Vercel as static files. In a shared booth, photos go straight to the other device.
The deployed site counts visits and a few funnel steps with [Vercel Web Analytics](#web-analytics),
and page speed with Speed Insights: no cookies, and no photos, names or room codes. Next to the app
it serves a few static pages for search (see [Search and link previews](#search-and-link-previews)).

- **Stack:** Vite, React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui (Radix), lucide-react,
  zustand, idb-keyval, vite-plugin-pwa, PeerJS (WebRTC), uqr, @vercel/analytics,
  @vercel/speed-insights, self-hosted fonts via @fontsource.
- **Tests:** Vitest (layout geometry, filter matrices, crop math, CSP, routes in `vercel.json`, SEO
  tags and sitemap, analytics, in-app browser detection, library import, and the shared booth's
  protocol, framing, clock sync and timeline) and Playwright (full sessions with Chromium's fake
  camera, two browsers sharing a booth, a first visit without camera access, a strip from library
  photos, and the static pages).

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
| `npm run icons` | Regenerates the PWA icons and the link preview image (`og-image.jpg`) in `public/` from `scripts/generate-icons.mjs` |

Node 22 is required (`engines.node` is `22.x`, which Vercel also uses).

## Deploying to Vercel

The repo is a plain static Vite site: no server functions, and no environment variables are
needed (optional ones: `SITE_URL`, see [Search and link previews](#search-and-link-previews), and
the shared booth's, see below). `vercel.json` holds the routes, cache and security headers.

### One-time setup (Git integration)

1. Push this repo to GitHub (any visibility).
2. In Vercel, choose **Add New → Project**, then import the repository.
3. Vercel detects **Vite**. Keep the defaults: build command `npm run build`, output
   directory `dist`, root directory `/`. No environment variables are needed.
4. Deploy. From then on:
   - every push to `main` deploys to **production**;
   - every other branch and every pull request gets its own HTTPS **preview URL**.
5. Open the project's **Analytics** tab and select **Enable**, do the same under **Speed
   Insights**, and redeploy (see [Web analytics](#web-analytics)).
6. After the first production deploy, add the site to Google Search Console and Bing Webmaster
   Tools (see [After the first production deploy](#after-the-first-production-deploy)).

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

- **Routes.** `/gallery` rewrites to `/index.html` (the app routes on the client), and each
  static page's clean URL (`/how-it-works`) to its file. Nothing else is rewritten, so an unknown
  path gets `404.html` with a real 404 status, not the app with a 200 (which search engines count
  as a "soft 404"). Vercel's own `/_vercel/*` routes (analytics) are untouched.
  `trailingSlash: false` redirects `/gallery/` to `/gallery`, so each page has one URL.
  `tests/vercel.test.ts` checks all of this against `src/lib/site.ts`.
- **`/gallery` is `noindex`** (an `X-Robots-Tag` header): it's different on every device and
  empty to a crawler.
- **Caching.**
  - `/assets/*` has hashed file names, so it's cached for a year as `immutable`.
  - `/sw.js` and `/manifest.webmanifest` are `no-cache`, so installed apps notice new deploys.
- **Security headers.**
  - `Permissions-Policy` keeps `camera=(self)`, plus wake lock, Web Share and fullscreen for the
    app itself; everything else is disabled.
  - The CSP allows `blob:` and `data:` images, which the shots and previews use. It does not
    allow `unsafe-inline` for scripts.
  - `connect-src` allows only the app itself (which covers Web Analytics) and
    `wss://0.peerjs.com`, the shared booth's signaling server. `tests/csp.test.ts` checks it
    matches `src/features/pair/config.ts`.
  - The one inline script, the no-flash theme snippet in `index.html`, is allowed by its sha256
    hash. The static pages get a byte-for-byte copy, so the same hash covers them. If you edit
    that script, update the hash in `vercel.json`. `tests/csp.test.ts` fails until they match
    (in every built page), and prints the hash it expects. The structured data in `index.html` is
    a JSON data block, not a script, so the CSP doesn't apply to it.

### Web analytics

The deployed site uses [Vercel Web Analytics](https://vercel.com/docs/analytics) to count
visitors, page views and the steps of the [activation funnel](#the-funnel), and
[Speed Insights](https://vercel.com/docs/speed-insights) for Core Web Vitals from real visits.
Neither sets cookies. Photos, display names, captions, room codes and anything else in the app are
never sent.

- **Turning it on.** Enable each in the project's **Analytics** and **Speed Insights** tabs, then
  redeploy. Until then the script requests return 404 and nothing is counted.
- **Custom events need Pro.** Vercel records custom events only on the Pro and Enterprise plans,
  with at most two properties each on Pro (every event here has two or fewer). On Hobby the
  events are dropped and page views still count.
- **Where it runs.** `src/lib/analytics.ts` loads the scripts only in builds Vercel makes for
  production and preview deployments, which it recognizes by `VITE_VERCEL_ENV` (Vercel sets it
  while **Automatically expose System Environment Variables** is on, the default). The dev
  server, `npm run preview` and the end-to-end tests never load them, and make no analytics
  requests. Preview traffic is reported too; the dashboard filters by environment.
- **Same origin.** The scripts and their reports use `/_vercel/insights/*` and
  `/_vercel/speed-insights/*` on the site's own domain, so the CSP needs no extra hosts. Ad
  blockers may still block them, so the numbers run low.
- **Invite codes.** An invite link carries its room code (`/?join=CODE`). The app removes it from
  the address bar before analytics starts, and a `beforeSend` hook strips it from every event and
  every Speed Insights report in case that ever changes.

#### The funnel

The app is one URL: shooting, reviewing and saving all happen on `/`, so a page-view bounce rate
can't tell a finished strip from a visitor who left after three seconds. Bounces are counted by
what people do instead. `trackEvent()` in `src/lib/analytics.ts` sends these:

| Event | Sent when | Properties |
| --- | --- | --- |
| `camera_start` | Start camera is tapped, or the camera starts by itself for a returning visitor (once per page load) | `auto` |
| `camera_error` | The camera fails (once per kind per page load) | `kind`, `app` (the in-app browser, or `none`) |
| `photos_imported` | A strip is made from library photos | `count`, `layout` |
| `shoot_start` | The shutter is pressed (not for a single retake) | `layout`, `shared` |
| `strip_done` | A full sequence reaches the review | `layout`, `shared` |
| `strip_saved` | Download, share or print | `method`, `source` (`camera`, `shared` or `library`) |
| `pair` | A shared booth is opened | `role`, `via` (`button`, `code` or `link`) |
| `in_app_browser` | The page opens inside Messenger, Instagram, TikTok and the like | `app` |
| `open_in_browser` | Open in Chrome or Copy link, from the in-app browser notice | `app`, `action` |
| `install` | The install prompt is answered, the iOS hint is shown, or the app is installed | `outcome` |

- **Bounce:** a visit with neither `camera_start` nor `photos_imported`.
- **Activation:** the share of visits with a `strip_saved`. This is the number to grow.

### Updates to the installed app

The service worker precaches the whole app, so it works offline after the first visit. It
answers navigations to `/` and `/gallery` with the app, and the static pages from the precache
under their clean URLs. Other paths go to the network, which returns the 404 page. When
a new deploy is live, the app shows a **"New version available · Reload"** toast. It checks on
launch, hourly, and whenever the app returns to the foreground. The toast never appears while
photos are being taken, and nothing reloads by itself.

## Search and link previews

Next to the app (`index.html`), the site serves static pages for people searching for a photo
booth or a photo strip maker: `/how-it-works`, `/shoot-together`, `/photo-strip-maker` and
`/privacy`, plus `404.html`. They are plain HTML, with no JavaScript beyond the theme snippet,
styled by `site/site.css` with the app's design tokens (`src/styles/theme.css`).

- **One list of pages.** `src/lib/site.ts` lists every HTML page. The build inputs, the SEO tags,
  the sitemap, the page header and footer, the booth's About links and (checked by
  `tests/vercel.test.ts`) the rewrites in `vercel.json` all follow it.
- **Generated at build time** by `site/plugin.ts`: a canonical URL plus Open Graph and Twitter
  tags for every page (from its `<title>` and meta description), `robots.txt` and `sitemap.xml`.
  Static pages fill in `<!-- site:head -->`, `<!-- site:header -->` and `<!-- site:footer -->`
  from `site/partials.ts`. The 404 page is `noindex` and has no canonical URL.
- **The site's address.** Canonical URLs, the sitemap and link previews need an absolute URL. On
  Vercel it's the project's production domain (`VERCEL_PROJECT_PRODUCTION_URL`: the shortest
  custom domain, else `*.vercel.app`), on previews too, so their canonical URLs point at
  production. Set `SITE_URL` (for example `https://booth.example.com`) in Vercel to choose another.
  Local builds use `http://localhost:4173`.
- **First paint.** `index.html` carries a static copy of the header and a short intro inside
  `#root`. It shows before the JavaScript runs and gives crawlers and link previews real text;
  React replaces it on start. `index.html` also has `WebApplication` structured data.
- **Link previews.** `public/og-image.jpg` (1200×630) is the picture chat apps and social sites
  show for any link to the site, invites included. `npm run icons` renders it. It isn't
  precached, so visitors never download it.
- **Adding a page.** Create `name.html` at the root (copy `privacy.html`: a `<title>` under 70
  characters, a meta description of 50 to 160, and one `<h1>`). Add it to `SITE_PAGES` in
  `src/lib/site.ts`, and add `{ "source": "/name", "destination": "/name.html" }` to the
  rewrites in `vercel.json`. `npm test` fails until all three agree.

### After the first production deploy

1. Add the site to [Google Search Console](https://search.google.com/search-console) as a
   **Domain** property (verified with a DNS TXT record, so the pages need no meta tag), and
   submit `https://<domain>/sitemap.xml` under **Sitemaps**.
2. Do the same in [Bing Webmaster Tools](https://www.bing.com/webmasters), which can import the
   site from Search Console.
3. In Search Console, run **URL Inspection → Test live URL → View tested page** on `/` and
   `/shoot-together` to see what Google renders.
4. Paste a link into a chat to check the preview's picture, title and description.

## Measuring and improving

Collect two weeks of numbers before changing anything, as a baseline. Then, once a week:

- **Funnel** (Web Analytics → Events): visits → `camera_start` or `photos_imported` →
  `shoot_start` → `strip_done` → `strip_saved`. Work on the biggest drop first. Many
  `camera_error` events with an `app` other than `none` mean links travel through chat apps; many
  with `denied` mean people back out at the permission prompt.
- **Speed** (Speed Insights, mobile, 75th percentile): LCP under 2.5 s, INP under 200 ms, CLS
  under 0.1.
- **Search** (Search Console → Performance): impressions, clicks, click-through rate and position,
  by query and by page. A page with many impressions and few clicks needs a title and description
  that answer that query. Queries without a matching page are ideas for new ones.

Change one thing at a time, and compare it with the weeks before.

## Shared booth

Tap the people icon in the header to **Shoot together**.

1. One person taps **Start a shared booth**. The app shows a 6-character code (like `K7M-4QD`),
   a QR code and an invite link (`/?join=K7M4QD`).
2. The other person scans the QR code, opens the link, or taps **Shoot together** and types
   the code. Either device can be a phone or a computer, on any network.
3. The booth preview splits in two: your camera live in your half, the other person's live
   video in theirs. The host is on the left (or top, in tall layouts), the guest on the right.
4. Either person presses the shutter. The countdown, flash and capture happen on both devices
   at the same moment, and each sends its photos to the other.
5. Each person customizes and saves their own copy. Tapping a photo to retake it, or **Retake
   all**, reshoots on both devices together. Leaving keeps everything you already have; a
   shared result in the gallery can still be edited later, and a retake then reshoots only your
   half.

### How it works

- **Peer to peer.** The devices connect over WebRTC with [PeerJS](https://peerjs.com). Photos
  and live video go directly between them, encrypted by WebRTC (DTLS/SRTP). Nothing is stored
  on a server.
- **Signaling.** To find each other, the devices exchange a few small messages through the free
  PeerJS cloud server (`0.peerjs.com`). The host registers its room code there; a room exists
  only while the host has the app open.
- **Hard networks.** Phones on cellular networks often can't connect directly. PeerJS's
  defaults include Google's STUN server and the PeerJS TURN relays, which then forward the
  (still encrypted) traffic.
- **Same moment on both screens.** The devices measure the offset between their clocks with
  ping/pong round trips, NTP-style. The host schedules each sequence on its clock, and both
  devices run the same absolute timeline. Captures typically land within a few tens of
  milliseconds of each other (the clock estimate is only as good as the network is symmetric).
- **The host decides.** The guest sends requests (shoot, retake, layout); the host checks that
  both devices are ready (in the booth, camera live, same retake) and sends the commands both
  apply.
- **Photos.** Each device keeps its own full-resolution frames and sends the other a ~2 MP JPEG
  (shorter side 1080 px), plenty for half a slot. Photos travel in 16 KiB chunks over a
  reliable, ordered data channel. After a reconnect, each side resends what the other is
  missing.
- **Dropped connections.** A heartbeat notices a dead link within 10 seconds. The guest keeps
  reconnecting for 2 minutes and the host keeps the room open; a sequence in progress is
  cancelled on both devices.
- **Bundle size.** PeerJS and the QR encoder load only when someone opens the shared booth.

### Running your own signaling or TURN server (optional)

The PeerJS cloud server is free and has no uptime guarantee. To use your own
[PeerServer](https://github.com/peers/peerjs-server) or TURN server, set these in Vercel
(**Project Settings → Environment Variables**) and redeploy:

| Variable | Example | Meaning |
| --- | --- | --- |
| `VITE_PEER_HOST` | `peer.example.com` | PeerServer host (default: the PeerJS cloud server) |
| `VITE_PEER_PORT` | `443` | Its port |
| `VITE_PEER_PATH` | `/` | Its path |
| `VITE_PEER_SECURE` | `true` | `false` only for a local `ws://` server |
| `VITE_ICE_SERVERS` | `[{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]` | STUN/TURN servers (JSON) |

If you change the signaling host, also replace `wss://0.peerjs.com` in `connect-src` in
`vercel.json` (and `DEFAULT_SIGNALING_HOST` in `src/features/pair/config.ts`, which the CSP test
compares against).

The end-to-end tests start a local PeerServer (`npx peerjs --port 9000`) and point the build
at it, so they never touch the cloud server.

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
                         timeline (absolute-time schedule), countdown, flash, shot tray, shutter,
                         settings panel, sounds
    layouts/             layouts.ts (data), computeLayout.ts (pure geometry), picker, icons
    compose/             renderComposite (canvas), filters (CSS lists → color matrices), fonts,
                         design defaults, crop math, logo store
    review/              review screen, customizer, debounced export rendering, gallery autosave
    export/              file names + download, Web Share, print
    gallery/             IndexedDB store, gallery screen and viewer
    library/             strips from library photos: decode upright, fill the layout, replace one
    pair/                shared booth: room codes, message protocol + validation, photo framing,
                         clock sync, PeerJS link, store (host decisions, photo exchange), dialog,
                         split preview
  store/settings.ts      persisted settings (zustand + localStorage)
  styles/theme.css       design tokens (light and dark), shared with the static pages
  lib/                   platform detection (in-app browsers too), canvas helpers, router, hooks,
                         analytics + funnel events, install prompt, the site's page list (site.ts)
site/                    build-time SEO plugin, the static pages' header, footer and stylesheet
*.html                   the app (index.html), the static pages, and 404.html
```

- **Camera screen.** Before the camera starts, a solo booth shows a miniature of the selected
  layout filling in photo by photo (`LayoutDemo`), the photo count and countdown, and **Use photos
  instead**. In an in-app browser it adds a notice with **Open in Chrome** (Android) and **Copy
  link**, keeping a guest's invite code.
- **After saving.** The first saved strip brings one suggestion, once per device: install the app
  where the browser can, otherwise the shared booth (`review/nextStep.ts`).
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
