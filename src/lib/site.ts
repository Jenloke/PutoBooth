/**
 * Every HTML page the site serves. The build, the SEO tags, the sitemap, vercel.json's
 * rewrites (checked by tests/vercel.test.ts) and the app's footer links all come from here.
 */
export interface SitePage {
  /** HTML entry at the project root. */
  file: string
  /** Public path, or null for a page with no URL of its own (the 404 page). */
  path: string | null
  /** Link text in the page header and footer. Pages without one aren't linked. */
  nav?: string
}

export const SITE_PAGES = [
  { file: "index.html", path: "/" },
  { file: "404.html", path: null },
] as const satisfies readonly SitePage[]

/** Pages linked from the app and from every page's footer. */
export const NAV_PAGES = SITE_PAGES.flatMap((page) => ("nav" in page ? [page] : []))

/** Paths that index.html serves; the app routes between them. Only "/" is worth indexing. */
export const APP_PATHS = ["/", "/gallery"] as const

/** The link preview image in public/, 1200×630 (`npm run icons` renders it). */
export const OG_IMAGE = { path: "/og-image.jpg", width: 1200, height: 630 } as const
