import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

interface VercelConfig {
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "vercel.json"), "utf8")
) as VercelConfig

/** Paths the SPA rewrite sends to index.html. Its source has no :params, so it reads as a plain regex. */
function rewrittenToApp(path: string): boolean {
  return config.rewrites.some(
    (rule) =>
      rule.destination === "/index.html" &&
      new RegExp(`^${rule.source}$`).test(path)
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
  it("has no named params in the rewrite, so the regex check below means what it says", () => {
    for (const rule of config.rewrites) expect(rule.source).not.toMatch(/\/:/)
  })

  it("serves the app for every route, including stale and unknown paths", () => {
    for (const path of [
      "/",
      "/gallery",
      "/gallery/",
      "/old/bookmark",
      "/_vercelish",
    ]) {
      expect(rewrittenToApp(path), path).toBe(true)
    }
  })

  it("leaves Vercel's own /_vercel/ routes alone, or Web Analytics would get index.html", () => {
    for (const path of [
      "/_vercel/insights/script.js",
      "/_vercel/insights/view",
    ]) {
      expect(rewrittenToApp(path), path).toBe(false)
    }
  })

  it("lets Web Analytics load its script and report from this origin", () => {
    expect(directive("script-src")).toContain("'self'")
    expect(directive("connect-src")).toContain("'self'")
  })
})
