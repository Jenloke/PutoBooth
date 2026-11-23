import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { APP_PATHS, SITE_PAGES as PAGES, type SitePage } from "../src/lib/site.ts"

interface VercelConfig {
  trailingSlash?: boolean
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const SITE_PAGES: readonly SitePage[] = PAGES
const root = resolve(import.meta.dirname, "..")
const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as VercelConfig

/** Where a rewrite sends `path`, or null. Sources have no :params, so they read as plain regexes. */
function rewriteFor(path: string): string | null {
  return config.rewrites.find((rule) => new RegExp(`^${rule.source}$`).test(path))?.destination ?? null
}

function headersFor(path: string): Record<string, string> {
  return Object.fromEntries(
    config.headers
      .filter((rule) => new RegExp(`^${rule.source}$`).test(path))
      .flatMap((rule) => rule.headers.map((h) => [h.key, h.value]))
  )
}

function directive(name: string): string[] {
  const csp = config.headers
    .flatMap((rule) => rule.headers)
    .find((h) => h.key === "Content-Security-Policy")?.value
  const found = csp?.split(";").find((d) => d.trim().startsWith(`${name} `))
  return found?.trim().split(/\s+/).slice(1) ?? []
}

describe("vercel.json", () => {
  it("has no named params in the rewrites, so the regex checks below mean what they say", () => {
    for (const rule of config.rewrites) expect(rule.source).not.toMatch(/\/:/)
  })

  it('serves the app for its client-side routes ("/" is index.html itself)', () => {
    for (const path of APP_PATHS.filter((p) => p !== "/")) expect(rewriteFor(path), path).toBe("/index.html")
  })

  it("serves every static page at its clean URL", () => {
    for (const page of SITE_PAGES) {
      expect(existsSync(resolve(root, page.file)), page.file).toBe(true)
      if (page.path === null || page.path === "/") continue
      expect(rewriteFor(page.path), page.path).toBe(`/${page.file}`)
    }
  })

  it("rewrites nothing else, so unknown paths get the real 404 page", () => {
    const known = new Set<string | null>([...APP_PATHS, ...SITE_PAGES.map((p) => p.path)])
    for (const rule of config.rewrites) expect(known.has(rule.source), rule.source).toBe(true)
    for (const path of ["/old/bookmark", "/does-not-exist", "/gallery/extra", "/_vercelish"]) {
      expect(rewriteFor(path), path).toBeNull()
    }
  })

  it("leaves Vercel's own /_vercel/ routes alone, or analytics would get index.html", () => {
    for (const path of [
      "/_vercel/insights/script.js",
      "/_vercel/insights/view",
      "/_vercel/speed-insights/script.js",
      "/_vercel/speed-insights/vitals",
    ]) {
      expect(rewriteFor(path), path).toBeNull()
    }
  })

  it("has one URL per page: trailing slashes redirect to the bare path", () => {
    expect(config.trailingSlash).toBe(false)
  })

  it("keeps the gallery (different on every device) out of search results", () => {
    expect(headersFor("/gallery")["X-Robots-Tag"]).toBe("noindex")
    expect(headersFor("/")["X-Robots-Tag"]).toBeUndefined()
  })

  it("lets Web Analytics and Speed Insights load and report from this origin", () => {
    expect(directive("script-src")).toContain("'self'")
    expect(directive("connect-src")).toContain("'self'")
  })
})
