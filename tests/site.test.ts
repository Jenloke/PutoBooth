import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  resolveSiteUrl,
  robotsTxt,
  seoTags,
  sitemapXml,
  themeScript,
  transformPage,
} from "../site/plugin.ts"
import { SITE_PAGES, type SitePage } from "../src/lib/site.ts"

const root = resolve(import.meta.dirname, "..")
const read = (file: string) => readFileSync(resolve(root, file), "utf8")
const INDEX = read("index.html")
const SITE = "https://booth.example"
const HOME: SitePage = { file: "index.html", path: "/" }

describe("resolveSiteUrl", () => {
  it("prefers SITE_URL, without a trailing slash", () => {
    expect(
      resolveSiteUrl({ SITE_URL: "https://photo.example/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })
    ).toBe("https://photo.example")
  })

  it("uses the Vercel project's production domain on Vercel builds", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "putobooth.vercel.app" })).toBe(
      "https://putobooth.vercel.app"
    )
  })

  it("falls back to the local preview server", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:4173")
  })

  it("rejects addresses that aren't web pages", () => {
    expect(() => resolveSiteUrl({ SITE_URL: "ftp://booth.example" })).toThrow()
  })
})

describe("seoTags", () => {
  const head = `<title>Free Photo Booth &amp; Strips</title><meta name="description" content="Shoot a &quot;strip&quot;." />`

  it("gives each page its canonical URL and a social preview", () => {
    const tags = seoTags(head, { file: "x.html", path: "/how-it-works" }, SITE)
    expect(tags).toContain(`<link rel="canonical" href="https://booth.example/how-it-works" />`)
    expect(tags).toContain(`<meta property="og:url" content="https://booth.example/how-it-works" />`)
    expect(tags).toContain(`<meta property="og:image" content="https://booth.example/og-image.jpg" />`)
    expect(tags).toContain(`<meta name="twitter:card" content="summary_large_image" />`)
  })

  it("reuses the title and description, escaped once", () => {
    const tags = seoTags(head, HOME, SITE)
    expect(tags).toContain(`<meta property="og:title" content="Free Photo Booth &amp; Strips" />`)
    expect(tags).toContain(`<meta property="og:description" content="Shoot a &quot;strip&quot;." />`)
  })

  it("marks a page without a URL (the 404 page) noindex, with no canonical", () => {
    const tags = seoTags(head, { file: "404.html", path: null }, SITE)
    expect(tags).toBe(`<meta name="robots" content="noindex" />`)
  })

  it("refuses a page without a title or description", () => {
    expect(() => seoTags("<title>Only a title</title>", HOME, SITE)).toThrow()
  })
})

describe("pages", () => {
  for (const page of SITE_PAGES) {
    it(`${page.file} builds with its head, header and footer filled in`, () => {
      const html = transformPage(read(page.file), page, SITE, INDEX)
      expect(html).not.toMatch(/<!-- site:|__SITE_URL__/)
      expect(html.match(/<h1[\s>]/g)?.length, "exactly one h1").toBe(1)
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ""
      const description = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? ""
      expect(title.length, title).toBeLessThanOrEqual(70)
      expect(description.length, description).toBeGreaterThanOrEqual(50)
      expect(description.length, description).toBeLessThanOrEqual(160)
      if (page.path === null) expect(html).toContain(`name="robots" content="noindex"`)
      else expect(html).toContain(`<link rel="canonical" href="${SITE}${page.path}" />`)
    })
  }

  it("all carry the exact theme snippet, so one CSP hash covers every page", () => {
    for (const page of SITE_PAGES) {
      const html = transformPage(read(page.file), page, SITE, INDEX)
      expect(html, page.file).toContain(themeScript(INDEX))
    }
  })

  it("index.html's structured data is valid JSON pointing at the site", () => {
    const html = transformPage(INDEX, HOME, SITE, INDEX)
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1]
    const data = JSON.parse(json ?? "") as { "@type": string; url: string }
    expect(data["@type"]).toBe("WebApplication")
    expect(data.url).toBe(`${SITE}/`)
  })
})

describe("robots.txt and sitemap.xml", () => {
  it("point crawlers at the sitemap", () => {
    expect(robotsTxt(SITE)).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
  })

  it("list every page with a URL, and nothing else", () => {
    const locs = [...sitemapXml(SITE).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(SITE_PAGES.flatMap((p) => (p.path === null ? [] : [SITE + p.path])))
    expect(locs).not.toContain(`${SITE}/gallery`)
  })
})
