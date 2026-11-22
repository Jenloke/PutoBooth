import { NAV_PAGES } from "../src/lib/site.ts"

/** Shared markup for the static pages (everything but the app), filled in by site/plugin.ts. */

const BRAND_MARK = `<svg viewBox="0 0 24 24" aria-hidden="true" class="size-6">
          <rect x="6" y="1.5" width="12" height="21" rx="2.5" class="fill-foreground" />
          <rect x="8" y="3.5" width="8" height="5" rx="1" class="fill-background" />
          <rect x="8" y="9.5" width="8" height="5" rx="1" class="fill-background" />
          <rect x="8" y="15.5" width="8" height="2.5" rx="1" class="fill-background" />
        </svg>`

function navLinks(current: string | null, className: string): string {
  return NAV_PAGES.map((page) => {
    const active = page.path === current ? ` aria-current="page"` : ""
    return `<a href="${page.path}" class="${className}"${active}>${page.nav}</a>`
  }).join("\n          ")
}

export function siteHeader(current: string | null): string {
  return `<header class="site-header">
      <div class="site-container flex h-14 items-center gap-2">
        <a href="/" class="mr-auto flex items-center gap-2 rounded-md px-1 py-1 font-heading text-base font-semibold tracking-tight">
        ${BRAND_MARK}
          <span>Photobooth</span>
        </a>
        <nav aria-label="Main" class="hidden items-center gap-1 md:flex">
          ${navLinks(current, "site-nav-link")}
        </nav>
        <a href="/" class="site-button">Open the booth</a>
      </div>
    </header>`
}

export function siteFooter(current: string | null): string {
  return `<footer class="site-footer">
      <div class="site-container flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Site" class="flex flex-wrap gap-x-5 gap-y-2">
          <a href="/" class="site-footer-link">Booth</a>
          ${navLinks(current, "site-footer-link")}
        </nav>
        <p class="text-sm text-muted-foreground">Free, no sign-up. Your photos never leave your device.</p>
      </div>
    </footer>`
}

/** Links under the app's first paint (index.html), so crawlers find the pages from "/". */
export function siteLinks(): string {
  if (NAV_PAGES.length === 0) return ""
  return `<nav aria-label="About" class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
              ${navLinks(null, "underline-offset-4 hover:underline")}
            </nav>`
}
