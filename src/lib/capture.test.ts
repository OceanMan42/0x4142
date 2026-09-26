import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { CaptureError, changedLines, loadCapture, stripAnsi } from "./capture"

const ESC = String.fromCharCode(27)

function rootWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "capture-"))
  for (const [name, body] of Object.entries(files)) {
    const file = join(root, `${name}.json`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return root
}

const valid = {
  version: 1,
  title: "The ELF header",
  frames: [{ label: "header", command: "$ readelf -h hello", output: "a\nb" }],
}

describe("loadCapture", () => {
  it("loads a valid capture", () => {
    const root = rootWith({ "s/part-01/header": JSON.stringify(valid) })
    expect(loadCapture(root, "s/part-01/header")).toEqual(valid)
  })

  it("normalizes CRLF and trailing newlines in output", () => {
    const capture = {
      ...valid,
      frames: [{ ...valid.frames[0], output: "a\r\nb\r\n\n" }],
    }
    const root = rootWith({ x: JSON.stringify(capture) })
    expect(loadCapture(root, "x").frames[0].output).toBe("a\nb")
  })

  it("rejects a missing file and names the src", () => {
    const root = rootWith({})
    expect(() => loadCapture(root, "s/nope")).toThrow(CaptureError)
    expect(() => loadCapture(root, "s/nope")).toThrow(
      /capture "s\/nope": file not found/,
    )
  })

  it("rejects invalid JSON", () => {
    const root = rootWith({ x: "{ \"version\": 1," })
    expect(() => loadCapture(root, "x")).toThrow(/invalid JSON/)
  })

  it("rejects an unknown version", () => {
    const root = rootWith({ x: JSON.stringify({ ...valid, version: 2 }) })
    expect(() => loadCapture(root, "x")).toThrow(/version/)
  })

  it("rejects an empty frames array", () => {
    const root = rootWith({ x: JSON.stringify({ ...valid, frames: [] }) })
    expect(() => loadCapture(root, "x")).toThrow(/frames/)
  })

  it("rejects a frame without a label and names the path", () => {
    const frames = [{ command: "$ ls", output: "" }]
    const root = rootWith({ x: JSON.stringify({ ...valid, frames }) })
    expect(() => loadCapture(root, "x")).toThrow(/frames\.0\.label/)
  })

  it.each(["../secret", "/etc/passwd", "Part-01/x", "a//b", "a/b/", ""])(
    "rejects the unsafe src %j",
    (src) => {
      expect(() => loadCapture(rootWith({}), src)).toThrow(/src must be/)
    },
  )
})

describe("stripAnsi", () => {
  it("removes SGR color codes", () => {
    expect(stripAnsi(`${ESC}[31mrsp${ESC}[0m 0x1`)).toBe("rsp 0x1")
  })
})

describe("changedLines", () => {
  it("returns nothing for identical output", () => {
    expect(changedLines("a\nb", "a\nb")).toEqual([])
  })

  it("returns 1-based numbers of changed lines", () => {
    expect(changedLines("a\nb\nc", "a\nB\nc")).toEqual([2])
  })

  it("ignores changes that are only color", () => {
    expect(changedLines("rsp 0x1", `${ESC}[31mrsp${ESC}[0m 0x1`)).toEqual([])
  })

  it("marks lines that did not exist before", () => {
    expect(changedLines("a", "a\nb\nc")).toEqual([2, 3])
  })

  it("only reports lines present in the new output", () => {
    expect(changedLines("a\nb\nc", "a")).toEqual([])
  })
})
