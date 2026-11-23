import { describe, expect, it } from "vitest"

import { pickNextStep } from "./nextStep"

describe("pickNextStep", () => {
  it("offers to install first, where the browser can", () => {
    expect(pickNextStep([], "prompt", false)).toBe("install")
    expect(pickNextStep([], "ios", false)).toBe("install")
  })

  it("then suggests the shared booth to someone shooting alone", () => {
    expect(pickNextStep(["install"], "prompt", false)).toBe("together")
    expect(pickNextStep([], null, false)).toBe("together")
  })

  it("doesn't suggest the shared booth to people already in one", () => {
    expect(pickNextStep(["install"], "prompt", true)).toBeNull()
    expect(pickNextStep([], null, true)).toBeNull()
  })

  it("shows each suggestion only once", () => {
    expect(pickNextStep(["install", "together"], "prompt", false)).toBeNull()
  })
})
