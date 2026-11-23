import { readFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import type { Plugin } from "vite"

import { OG_IMAGE, SITE_PAGES, type SitePage } from "../src/lib/site.ts"
import { siteFooter, siteHeader, siteLinks } from "./partials.ts"

/**
 * Build-time SEO for every page in src/lib/site.ts:
 *
 * - canonical URL, Open Graph and Twitter tags, from each page's <title> and description;
 * - `__SITE_URL__` placeholders (index.html's structured data) become the site's address;
 * - the static pages get the shared head (theme snippet, icons), header and footer;
 * - robots.txt and sitemap.xml are written next to them.
 */

/**
 * The address search engines should index. SITE_URL wins; on Vercel the project's production
 * domain (its shortest custom domain, or *.vercel.app) is the default, also for previews,
 * whose canonical URLs then point at production. Local builds get the preview server.
 */
export function resolveSiteUrl(env: Record<string, string | undefined>): string {
  const raw =
    env.SITE_URL?.trim() ||
    (env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : "") ||
    "http://localhost:4173"
  const url = new URL(raw)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`SITE_URL must be http(s): ${raw}`)
  return url.origin
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Reads back text the page wrote in HTML (only the entities our pages use). */
const decodeText = (value: string) =>
  value.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

function pageFor(filename: string): SitePage {
  const file = basename(filename)
  const page = SITE_PAGES.find((p) => p.file === file)
  if (!page) throw new Error(`${file} isn't listed in src/lib/site.ts`)
  return page
}

/** Canonical, Open Graph and Twitter tags for a page, or noindex for one without a URL. */
export function seoTags(html: string, page: SitePage, siteUrl: string): string {
  if (page.path === null) return `<meta name="robots" content="noindex" />`
  const title = decodeText(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "")
  const description = decodeText(/<meta\s+name="description"\s+content="([^"]*)"/.exec(html)?.[1] ?? "")
  if (!title || !description) throw new Error(`${page.file} needs a <title> and a meta description`)
  const url = siteUrl + page.path
  const image = siteUrl + OG_IMAGE.path
  const tags: [string, string, string][] = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Photobooth"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["property", "og:image:width", String(OG_IMAGE.width)],
    ["property", "og:image:height", String(OG_IMAGE.height)],
    ["property", "og:image:alt", "Two photo strips next to the words: a photo booth in your browser"],
    ["name", "twitter:card", "summary_large_image"],
  ]
  return [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeAttr(value)}" />`),
  ].join("\n    ")
}

/** The no-flash theme snippet, copied byte for byte from index.html so its CSP hash still matches. */
export function themeScript(indexHtml: string): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)
  if (!match) throw new Error("index.html has no inline theme script")
  return `<script>${match[1]}</script>`
}

/** What the static pages share in <head>: everything index.html has but the app's own tags. */
function sharedHead(indexHtml: string): string {
  return [
    `<meta name="color-scheme" content="light dark" />`,
    `<meta name="theme-color" content="#ffffff" />`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    themeScript(indexHtml),
  ].join("\n    ")
}

export function robotsTxt(siteUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`
}

export function sitemapXml(siteUrl: string): string {
  const urls = SITE_PAGES.flatMap((page) => (page.path === null ? [] : [siteUrl + page.path]))
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map((url) => `  <url><loc>${escapeAttr(url)}</loc></url>`),
    `</urlset>`,
    ``,
  ].join("\n")
}

export function transformPage(html: string, page: SitePage, siteUrl: string, indexHtml: string): string {
  const out = html
    .replace("<!-- site:head -->", sharedHead(indexHtml))
    .replace("<!-- site:header -->", siteHeader(page.path))
    .replace("<!-- site:footer -->", siteFooter(page.path))
    .replace("<!-- site:links -->", siteLinks())
    .replaceAll("__SITE_URL__", siteUrl)
  if (!out.includes("</head>")) throw new Error(`${page.file} has no </head>`)
  return out.replace(/( *)<\/head>/, (_, indent: string) => `${indent}  ${seoTags(out, page, siteUrl)}\n${indent}</head>`)
}

export function sitePlugin({ root, siteUrl }: { root: string; siteUrl: string }): Plugin {
  const indexHtml = () => readFileSync(resolve(root, "index.html"), "utf8")
  return {
    name: "photobooth-site",
    transformIndexHtml: {
      order: "pre",
      handler: (html, ctx) => transformPage(html, pageFor(ctx.filename), siteUrl, indexHtml()),
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(siteUrl) })
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml(siteUrl) })
    },
  }
}
