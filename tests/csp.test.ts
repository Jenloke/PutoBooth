import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")

function inlineScriptHashes(html: string): string[] {
  // Vercel serves files checked out with LF endings (see .gitattributes).
  const source = html.replace(/\r\n/g, "\n")
  return [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`
  )
}

function cspFromVercelJson(): string {
  const config = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const header = config.headers
    .flatMap((rule) => rule.headers)
    .find((h) => h.key === "Content-Security-Policy")
  if (!header) throw new Error("vercel.json has no Content-Security-Policy header")
  return header.value
}

describe("Content-Security-Policy", () => {
  const csp = cspFromVercelJson()
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? ""

  it("allows the inline theme script in index.html by hash", () => {
    const hashes = inlineScriptHashes(readFileSync(resolve(root, "index.html"), "utf8"))
    expect(hashes.length).toBeGreaterThan(0)
    for (const hash of hashes) expect(scriptSrc).toContain(hash)
  })

  it.runIf(existsSync(resolve(root, "dist/index.html")))(
    "allows every inline script in the built index.html",
    () => {
      const hashes = inlineScriptHashes(readFileSync(resolve(root, "dist/index.html"), "utf8"))
      for (const hash of hashes) expect(scriptSrc).toContain(hash)
    }
  )

  it("keeps the camera and object URLs working", () => {
    expect(csp).toMatch(/img-src[^;]*blob:/)
    expect(csp).toMatch(/img-src[^;]*data:/)
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })
})
