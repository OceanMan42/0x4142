import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { captureRefs, checkCaptures } from "./capture-check"

const captures = fileURLToPath(
  new URL("./__fixtures__/captures", import.meta.url),
)

function contentDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "capture-check-"))
  for (const [name, text] of Object.entries(files)) {
    const file = join(dir, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  return dir
}

describe("captureRefs", () => {
  it("finds every capture src in a post", () => {
    const md = [
      ':::capture{src="demo/one"}',
      ":::",
      "",
      ':::capture{diff="off" src="demo/steps"}',
      ":::",
    ].join("\n")
    expect(captureRefs(md)).toEqual(["demo/one", "demo/steps"])
  })

  it("ignores directives inside fenced code blocks", () => {
    const md = ["```md", ':::capture{src="demo/nope"}', ":::", "```"].join("\n")
    expect(captureRefs(md)).toEqual([])
  })

  it("reports a capture directive with no src", () => {
    expect(captureRefs(':::capture{diff="off"}\n:::')).toEqual([""])
  })
})

describe("checkCaptures", () => {
  it("returns no errors when every capture loads", () => {
    const dir = contentDir({
      "a.md": ':::capture{src="demo/one"}\n:::\n',
      "series/b.md": ':::capture{src="demo/steps"}\n:::\n',
    })
    expect(checkCaptures(dir, captures)).toEqual([])
  })

  it("names the post and the reason for each broken capture", () => {
    const dir = contentDir({
      "series/b.md": ':::capture{src="demo/missing"}\n:::\n',
      "c.md": ':::capture{src="Bad/Case"}\n:::\n',
    })
    const errors = checkCaptures(dir, captures)
    expect(errors).toHaveLength(2)
    expect(errors.join("\n")).toMatch(
      /series\/b\.md: .*demo\/missing.*file not found/,
    )
    expect(errors.join("\n")).toMatch(/c\.md: .*src must be/)
  })

  it("skips files that are not Markdown", () => {
    const dir = contentDir({ "notes.txt": ':::capture{src="demo/missing"}' })
    expect(checkCaptures(dir, captures)).toEqual([])
  })
})
