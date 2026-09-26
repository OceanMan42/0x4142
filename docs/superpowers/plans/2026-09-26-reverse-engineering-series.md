# Reverse Engineering Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the infrastructure for the Reverse Engineering series (a `:::capture` Markdown directive with a stepper, and a Docker lab repo that produces captures) plus draft posts for part 0 and part 1.

**Architecture:** The blog owns a JSON capture format. A satteri mdast plugin replaces `:::capture{src="..."}` with ordinary `ansi` code nodes (one frame) or a `<capture-steps>` element holding one code node per frame (several frames); the existing Expressive Code hast pass then renders every frame, including ANSI colors and `{n}` line markers. A small client script turns `<capture-steps>` into a stepper. A separate repo, `reverse-engineering-lab`, builds the lab binaries in Docker and runs TOML scenarios through `capture.py` to write capture JSON into the blog.

**Tech Stack:** Astro 7, satteri 0.10 (mdast/hast plugins), satteri-expressive-code, Zod (`astro/zod`), Vitest (new), TypeScript. Lab: Docker, Ubuntu 24.04, gcc, binutils, gdb, Python 3 stdlib (`tomllib`, `unittest`), GNU make.

**Spec:** `docs/superpowers/specs/2026-09-26-reverse-engineering-series-design.md`

## Global Constraints

- Never use the em dash character (U+2014) in any file, commit message, or post. Use commas, periods, or colons.
- Series name: "Reverse Engineering". Blog slug: `reverse-engineering`. Lab repo: `reverse-engineering-lab`, local path `~/workspace/reverse-engineering-lab`.
- Captures live at `src/captures/<series>/<part>/<scenario>.json` in the blog. This series: `src/captures/reverse-engineering/`.
- Capture `src` values and scenario paths use lowercase path segments only: regex `^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$`.
- Capture format `version` is exactly `1`.
- Captured output targets at most 80 visible columns. Wider lines are a warning, not an error.
- Assembly syntax is Intel everywhere (`objdump -M intel`, and later `set disassembly-flavor intel` in gdb).
- Arc 1 build flags: `-O0 -g -fno-pie -no-pie`.
- pwndbg is not installed in this plan. It is added to the image in the part 6 plan (YAGNI: parts 0 and 1 do not use it).
- Commit in the blog with explicit paths: `git add <paths> && git commit -m "..." -- <paths>`. Never `git add -A` or `git add .` (the user's untracked files may be present).
- Do not create GitHub repos, push, or publish images. The user does that.
- Code style follows `biome.json`: 2-space indent, double quotes, no semicolons, 80 columns.
- Every commit message ends with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. A capture title containing `"` must not break the Expressive Code meta string. Expect the title to render with `'` in place of `"`. (Test in Task 2.)
2. Arrow keys pressed while a code block inside the stepper has focus must scroll that block, not change frames. Expect frame changes only when the stepper element itself or its nav buttons have focus. (Browser check in Task 7, code in Task 3.)
3. `capture-frame { display: block }` overrides the `hidden` attribute. Expect a `capture-frame[hidden] { display: none }` rule so hidden frames actually hide. (Code in Task 3, browser check in Task 7.)
4. `make capture` run through Docker must not leave root-owned files in the blog repo. Expect the container to run with the host user's uid and gid. (Check in Task 6.)
5. A scenario removed from the lab must not leave a stale capture that a post can still silently reference. Expect `capture.py` to prune JSON files it did not write, and to prune nothing when any scenario fails. (Tests in Task 5.)

---

## Prerequisites (user action)

**Before Task 0: commit pending work.** The blog has uncommitted staged
changes (favicon, CTF section, README, `src/lib/content.ts`,
`src/pages/blog/[...id].astro`, and more). Tasks 2 and 3 edit three of those
files, and a path-limited commit takes the whole file, so the user's
changes would end up in this plan's commits. The user commits (or asks for
a commit of) their pending work first. Verify with `git status --short`:
nothing staged before Task 0 starts.

**Before Task 4: install Docker.** Docker is not installed on this machine.
The user runs:

```sh
sudo pacman -S docker docker-buildx
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

then logs out and back in (or runs `newgrp docker`). Verify with `docker run --rm hello-world`. Tasks 1 to 3 do not need Docker and can run first.

## Task 0: Branch

- [ ] **Step 1: Create a branch in the blog repo**

```bash
cd ~/workspace/0x4142
git switch -c reverse-engineering-series
```

The user's staged changes come along unchanged. Leave them alone.

---

## Task 1: Capture schema, loader and line diff (blog)

**Files:**
- Modify: `package.json` (add `vitest` dev dependency and `test` script)
- Create: `vitest.config.ts`
- Create: `src/lib/capture.ts`
- Test: `src/lib/capture.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CAPTURE_SRC: RegExp`
  - `type Capture = { version: 1; title: string; frames: CaptureFrame[] }`
  - `type CaptureFrame = { label: string; command: string; output: string }`
  - `class CaptureError extends Error`
  - `loadCapture(root: string, src: string): Capture` (throws `CaptureError`; output has CRLF converted to LF and trailing newlines removed)
  - `stripAnsi(text: string): string`
  - `changedLines(prev: string, next: string): number[]` (1-based line numbers in `next` whose ANSI-stripped text differs from the same line in `prev`)

- [ ] **Step 1: Install Vitest and add the test script**

```bash
npm install --save-dev vitest
npm pkg set scripts.test="vitest run"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
})
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/capture.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/lib/capture.test.ts`
Expected: FAIL, cannot resolve `./capture`.

- [ ] **Step 4: Implement `src/lib/capture.ts`**

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "astro/zod"

export const CAPTURE_SRC = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/

const frameSchema = z.object({
  label: z.string().min(1),
  command: z.string(),
  output: z.string(),
})

export const captureSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  frames: z.array(frameSchema).min(1),
})

export type Capture = z.infer<typeof captureSchema>
export type CaptureFrame = z.infer<typeof frameSchema>

export class CaptureError extends Error {}

const normalize = (output: string) =>
  output.replace(/\r\n/g, "\n").replace(/\n+$/, "")

export function loadCapture(root: string, src: string): Capture {
  const fail = (reason: string): never => {
    throw new CaptureError(`capture "${src}": ${reason}`)
  }

  if (!CAPTURE_SRC.test(src)) {
    fail('src must be lowercase path segments, like "series/part-01/name"')
  }

  const file = join(root, `${src}.json`)
  let text = ""
  try {
    text = readFileSync(file, "utf8")
  } catch {
    fail(`file not found at ${file}`)
  }

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    fail(`invalid JSON (${(error as Error).message})`)
  }

  const result = captureSchema.safeParse(json)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ")
    return fail(issues)
  }

  return {
    ...result.data,
    frames: result.data.frames.map((frame) => ({
      ...frame,
      output: normalize(frame.output),
    })),
  }
}

const ESC = String.fromCharCode(27)
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]`, "g")

export const stripAnsi = (text: string) => text.replace(ANSI, "")

export function changedLines(prev: string, next: string): number[] {
  const before = stripAnsi(prev).split("\n")
  const after = stripAnsi(next).split("\n")
  return after.flatMap((line, i) => (line === before[i] ? [] : [i + 1]))
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/lib/capture.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
P="package.json package-lock.json vitest.config.ts src/lib/capture.ts src/lib/capture.test.ts"
git add $P && git commit -m "Add capture format schema, loader and line diff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- $P
```

If `bun.lock` changed too, add it to `P`.

---

## Task 2: `:::capture` directive (blog)

**Files:**
- Create: `src/lib/capture-directive.ts`
- Create: `src/lib/__fixtures__/captures/demo/one.json`
- Create: `src/lib/__fixtures__/captures/demo/steps.json`
- Create: `src/lib/__fixtures__/captures/demo/quoted.json`
- Create: `src/captures/.gitkeep`
- Modify: `astro.config.ts` (register the plugin)
- Modify: `README.md` (document the directive and format under "Markdown extensions")
- Test: `src/lib/capture-directive.test.ts`

**Interfaces:**
- Consumes: `loadCapture`, `changedLines`, `Capture` from Task 1.
- Produces:
  - `createCaptureDirective(options?: { root?: string })`: satteri mdast plugin
  - `captureDirective`: the plugin with the default root `src/captures`
  - Rendered markup (used by Task 3):
    - one frame: a normal Expressive Code block (`div.expressive-code`, `pre[data-language="ansi"]`)
    - several frames: `<capture-steps data-title="...">` containing one `<capture-frame data-label="...">` per frame; each frame holds `<p class="capture-label">Step N of M: label</p>` followed by an Expressive Code block

- [ ] **Step 1: Write the fixtures**

`src/lib/__fixtures__/captures/demo/one.json`:

```json
{
  "version": 1,
  "title": "file: what is this?",
  "frames": [
    {
      "label": "file type",
      "command": "$ file hello",
      "output": "hello: ELF 64-bit LSB executable, x86-64"
    }
  ]
}
```

`src/lib/__fixtures__/captures/demo/steps.json` (frame 2 changes line 1 of the output, frame 3 changes line 2; the first frame's color codes must not count as changes):

```json
{
  "version": 1,
  "title": "push rbp",
  "frames": [
    {
      "label": "before push rbp",
      "command": "(gdb) info registers rsp rbp",
      "output": "\u001b[32mrsp\u001b[0m 0x7fffffffe0f0\nrbp 0x0"
    },
    {
      "label": "after push rbp",
      "command": "(gdb) stepi",
      "output": "rsp 0x7fffffffe0e8\nrbp 0x0"
    },
    {
      "label": "after mov rbp, rsp",
      "command": "(gdb) stepi",
      "output": "rsp 0x7fffffffe0e8\nrbp 0x7fffffffe0e8"
    }
  ]
}
```

`src/lib/__fixtures__/captures/demo/quoted.json`:

```json
{
  "version": 1,
  "title": "The \"hello\" binary",
  "frames": [{ "label": "run", "command": "$ ./hello", "output": "Hello" }]
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/capture-directive.test.ts`:

```ts
import { fileURLToPath } from "node:url"
import { markdownToHtml } from "satteri"
import { describe, expect, it } from "vitest"
import { createCaptureDirective } from "./capture-directive"
import { blockExpressiveCode } from "./expressive-code"

const root = fileURLToPath(new URL("./__fixtures__/captures", import.meta.url))

async function render(markdown: string): Promise<string> {
  const { html } = await markdownToHtml(markdown, {
    features: { directive: true },
    mdastPlugins: [createCaptureDirective({ root })],
    hastPlugins: [blockExpressiveCode],
  })
  return html
}

const count = (html: string, needle: string) => html.split(needle).length - 1

describe("capture directive", () => {
  it("renders a one-frame capture as a plain ansi block", async () => {
    const html = await render(':::capture{src="demo/one"}\n:::\n')
    expect(html).toContain('data-language="ansi"')
    expect(html).toContain("$ file hello")
    expect(html).toContain("ELF 64-bit LSB executable")
    expect(html).not.toContain("<capture-steps")
  })

  it("renders a multi-frame capture as a stepper", async () => {
    const html = await render(':::capture{src="demo/steps"}\n:::\n')
    expect(count(html, "<capture-steps")).toBe(1)
    expect(count(html, "<capture-frame")).toBe(3)
    expect(html).toContain('data-title="push rbp"')
    expect(html).toContain("Step 2 of 3: after push rbp")
    expect(count(html, 'data-language="ansi"')).toBe(3)
  })

  it("marks lines that changed since the previous frame", async () => {
    const html = await render(':::capture{src="demo/steps"}\n:::\n')
    expect(count(html, "highlight mark")).toBe(2)
  })

  it("does not mark changes when diff is off", async () => {
    const html = await render(':::capture{src="demo/steps" diff="off"}\n:::\n')
    expect(count(html, "highlight mark")).toBe(0)
  })

  it("does not wrap long lines", async () => {
    const html = await render(':::capture{src="demo/steps"}\n:::\n')
    expect(html).not.toMatch(/<pre[^>]*class="wrap"/)
  })

  it("keeps a title containing double quotes intact", async () => {
    const html = await render(':::capture{src="demo/quoted"}\n:::\n')
    expect(html).toContain("The 'hello' binary")
  })

  it("leaves other directives alone", async () => {
    const html = await render(":::note\nhi\n:::\n")
    expect(html).not.toContain("capture")
  })

  it("fails on a missing src attribute", async () => {
    await expect(render(":::capture\n:::\n")).rejects.toThrow(/missing src/)
  })

  it("fails on a missing capture file and names it", async () => {
    await expect(
      render(':::capture{src="demo/nope"}\n:::\n'),
    ).rejects.toThrow(/capture "demo\/nope": file not found/)
  })

  it("fails on an unsafe src", async () => {
    await expect(
      render(':::capture{src="../secret"}\n:::\n'),
    ).rejects.toThrow(/src must be/)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- src/lib/capture-directive.test.ts`
Expected: FAIL, cannot resolve `./capture-directive`.

- [ ] **Step 4: Implement `src/lib/capture-directive.ts`**

```ts
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { BlockContent, Code } from "mdast"
import type {} from "mdast-util-to-hast"
import { defineMdastPlugin } from "satteri"
import { type Capture, changedLines, loadCapture } from "./capture"

const DEFAULT_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../captures",
)

const quote = (text: string) => `"${text.replace(/"/g, "'")}"`

function frameCode(capture: Capture, index: number, diff: boolean): Code {
  const frame = capture.frames[index]
  const offset = frame.command ? 1 : 0
  const marks =
    diff && index > 0
      ? changedLines(capture.frames[index - 1].output, frame.output).map(
          (line) => line + offset,
        )
      : []
  const meta = [
    `title=${quote(capture.title)}`,
    "wrap=false",
    marks.length > 0 ? `{${marks.join(",")}}` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const value = frame.command
    ? `${frame.command}\n${frame.output}`
    : frame.output
  return { type: "code", lang: "ansi", meta, value }
}

function stepper(capture: Capture, diff: boolean): BlockContent {
  const total = capture.frames.length
  return {
    type: "containerDirective",
    name: "capture-steps",
    data: {
      hName: "capture-steps",
      hProperties: { dataTitle: capture.title },
    },
    children: capture.frames.map((frame, i) => ({
      type: "containerDirective",
      name: "capture-frame",
      data: {
        hName: "capture-frame",
        hProperties: { dataLabel: frame.label },
      },
      children: [
        {
          type: "paragraph",
          data: { hProperties: { className: ["capture-label"] } },
          children: [
            { type: "text", value: `Step ${i + 1} of ${total}: ${frame.label}` },
          ],
        },
        frameCode(capture, i, diff),
      ],
    })),
  }
}

export function createCaptureDirective({ root = DEFAULT_ROOT } = {}) {
  return defineMdastPlugin({
    name: "capture-directive",
    containerDirective(node, ctx) {
      if (node.name !== "capture") return

      const where = ctx.fileURL ? ` in ${fileURLToPath(ctx.fileURL)}` : ""
      const src = node.attributes?.src
      if (!src) throw new Error(`:::capture is missing src="..."${where}`)

      let capture: Capture
      try {
        capture = loadCapture(root, src)
      } catch (error) {
        throw new Error(`${(error as Error).message}${where}`)
      }

      const diff = node.attributes?.diff !== "off"
      ctx.replaceNode(
        node,
        capture.frames.length === 1
          ? frameCode(capture, 0, false)
          : stepper(capture, diff),
      )
    },
  })
}

export const captureDirective = createCaptureDirective()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, both test files green. If the "highlight mark" count is off, print the HTML of the failing case and compare the `{...}` marker list against the fixture before changing code: the command line is line 1, so output line N is marked as N + 1.

- [ ] **Step 6: Register the plugin**

In `astro.config.ts`, add the import next to the callout import:

```ts
import { captureDirective } from "./src/lib/capture-directive"
```

and put it first in `mdastPlugins`:

```ts
      mdastPlugins: [
        captureDirective,
        calloutDirective,
        inlineExpressiveCode,
        temmlMath,
      ],
```

Create an empty `src/captures/.gitkeep` so the default root exists.

- [ ] **Step 7: Document it in the README**

In `README.md`, under `#### Markdown extensions`, add after the callouts bullet:

````markdown
- Terminal captures render recorded terminal sessions from
  `src/captures/<series>/<part>/<scenario>.json`. A one-frame capture renders
  as a normal terminal block; a capture with several frames renders as a
  stepper (previous and next buttons, arrow keys) with changed lines marked.
  Add `diff="off"` for tools that highlight changes themselves:

  ```markdown
  :::capture{src="reverse-engineering/part-03/push-pop"}
  :::
  ```

  Captures are produced by each series' lab repo, never written by hand. A
  missing or invalid capture fails the build. After re-capturing, restart
  `npm run dev` to pick up the new files.
````

Then add a new subsection at the end of `### Blog posts` (before `### Authors`):

````markdown
#### Capture format

Lab repos write this JSON. `version` must be `1`; `frames` needs at least
one entry. `command` is shown verbatim as the first line (include the
prompt, such as `$ ` or `(gdb) `; use `""` for no command line). `output`
may contain ANSI color codes and should stay within 80 columns.

```json
{
  "version": 1,
  "title": "push and pop moving rsp",
  "frames": [
    { "label": "before push rbp", "command": "(gdb) stepi", "output": "..." }
  ]
}
```

Paths use lowercase segments: `src/captures/reverse-engineering/part-03/push-pop.json`
is referenced as `src="reverse-engineering/part-03/push-pop"`.
````

- [ ] **Step 8: Build to confirm nothing else broke**

Run: `npm run build`
Expected: `astro check` 0 errors, build completes. Existing posts render as before (no post uses `:::capture` yet).

- [ ] **Step 9: Commit**

```bash
P="src/lib/capture-directive.ts src/lib/capture-directive.test.ts src/lib/__fixtures__ src/captures/.gitkeep astro.config.ts README.md"
git add $P && git commit -m "Add :::capture directive for recorded terminal sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- $P
```

---

## Task 3: Stepper behavior and styles (blog)

**Files:**
- Create: `src/components/CaptureStepper.astro`
- Modify: `src/pages/blog/[...id].astro` (render `<CaptureStepper />` once)
- Modify: `src/lib/content.ts:27` and `src/lib/content.ts:38` (show drafts during `npm run dev`)

**Interfaces:**
- Consumes: the `<capture-steps>` / `<capture-frame>` / `.capture-label` markup from Task 2.
- Produces: nothing other tasks call.

- [ ] **Step 1: Create `src/components/CaptureStepper.astro`**

```astro
---
---

<style is:global>
  capture-steps {
    display: block;
    margin-block: 1.5rem;
  }

  capture-frame {
    display: block;
  }

  capture-frame[hidden] {
    display: none;
  }

  capture-frame + capture-frame {
    margin-block-start: 1.25rem;
  }

  capture-steps[data-enhanced] capture-frame + capture-frame {
    margin-block-start: 0;
  }

  capture-steps:focus-visible {
    outline: 2px solid var(--foreground);
    outline-offset: 4px;
  }

  .capture-label {
    margin-block: 0 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--muted-foreground);
  }

  capture-nav {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-block-start: 0.5rem;
  }

  capture-nav button {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--foreground);
    font: inherit;
    font-size: 0.85em;
    cursor: pointer;
  }

  capture-nav button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .capture-live {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>

<script>
  const button = (label: string, text: string) => {
    const el = document.createElement("button")
    el.type = "button"
    el.setAttribute("aria-label", label)
    el.textContent = text
    return el
  }

  for (const steps of document.querySelectorAll<HTMLElement>(
    "capture-steps",
  )) {
    const frames = [
      ...steps.querySelectorAll<HTMLElement>(":scope > capture-frame"),
    ]
    if (frames.length < 2) continue

    const prev = button("Previous step", "← Prev")
    const next = button("Next step", "Next →")
    const nav = document.createElement("capture-nav")
    const live = document.createElement("span")
    live.className = "capture-live"
    live.setAttribute("aria-live", "polite")
    nav.append(prev, next)
    steps.append(nav, live)

    let current = 0
    const show = (index: number, announce: boolean) => {
      current = index
      frames.forEach((frame, i) => {
        frame.hidden = i !== index
      })
      prev.disabled = index === 0
      next.disabled = index === frames.length - 1
      if (announce) {
        live.textContent =
          frames[index].querySelector(".capture-label")?.textContent ?? ""
      }
    }

    prev.addEventListener("click", () => show(current - 1, true))
    next.addEventListener("click", () => show(current + 1, true))

    steps.tabIndex = 0
    steps.setAttribute("role", "group")
    steps.setAttribute(
      "aria-label",
      `${steps.dataset.title ?? "Terminal"}: use left and right arrow keys to step`,
    )
    steps.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement
      if (target !== steps && !nav.contains(target)) return
      if (event.key === "ArrowLeft" && current > 0) {
        event.preventDefault()
        show(current - 1, true)
      } else if (event.key === "ArrowRight" && current < frames.length - 1) {
        event.preventDefault()
        show(current + 1, true)
      }
    })

    steps.dataset.enhanced = ""
    show(0, false)
  }
</script>
```

The server HTML has no `hidden` attributes and no nav: without JavaScript every frame shows, stacked, each with its "Step N of M" label.

- [ ] **Step 2: Render it on post pages**

In `src/pages/blog/[...id].astro`, add the import in alphabetical position among the component imports:

```ts
import CaptureStepper from "@/components/CaptureStepper.astro"
```

and render it next to `<ReadingProgress />`:

```astro
  <ReadingProgress />
  <CaptureStepper />
```

- [ ] **Step 3: Show drafts in dev**

In `src/lib/content.ts`, change the blog filters so drafts appear during `npm run dev` but never in `npm run build`:

```ts
  const posts = await getCollection(
    "blog",
    ({ data }) => import.meta.env.DEV || !data.draft,
  )
```

and in `getSubposts`:

```ts
    ({ id, data }) =>
      (import.meta.env.DEV || !data.draft) && id.split("/").length === 2,
```

- [ ] **Step 4: Build**

Run: `npm run build && npm test`
Expected: 0 check errors, build completes, tests pass. Browser verification happens in Task 7, once a real post uses a stepper.

- [ ] **Step 5: Commit**

```bash
P="src/components/CaptureStepper.astro src/pages/blog/[...id].astro src/lib/content.ts"
git add $P && git commit -m "Add capture stepper behavior and show drafts in dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- $P
```

---

## Task 4: Lab repo scaffold (lab)

Requires Docker (see Prerequisites).

**Files (all in `~/workspace/reverse-engineering-lab`):**
- Create: `part-01/hello.c`, `Makefile`, `Dockerfile`, `.dockerignore`, `.gitignore`, `README.md`, `.github/workflows/image.yml`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Image tag `reverse-engineering-lab:local` with the repo at `/lab` and binaries built in place (`/lab/part-01/hello`).
  - Make targets: `build`, `image`, `shell`, `test`, `versions`, `clean` (and `capture`, added in Task 6).

- [ ] **Step 1: Create the repo**

```bash
mkdir -p ~/workspace/reverse-engineering-lab && cd ~/workspace/reverse-engineering-lab
git init -b main
```

- [ ] **Step 2: Write `part-01/hello.c`**

```c
#include <stdio.h>

int main(void) {
    printf("Hello, world!\n");
    return 0;
}
```

- [ ] **Step 3: Write the `Makefile`**

```make
IMAGE ?= reverse-engineering-lab:local
CC := gcc

# Arc 1 (parts 1 to 5): no optimization, no PIE, debug info, so the
# disassembly stays close to the source and addresses stay fixed.
ARC1_CFLAGS := -O0 -g -fno-pie -no-pie

BINARIES := part-01/hello

.PHONY: build image shell test versions clean

build: $(BINARIES)

part-01/%: part-01/%.c
	$(CC) $(ARC1_CFLAGS) -o $@ $<

image:
	docker build -t $(IMAGE) .

shell: image
	docker run --rm -it $(IMAGE)

test:
	python3 -m unittest discover -s tests -v

versions: image
	docker run --rm $(IMAGE) sh -c \
	  'gcc --version | head -1; objdump --version | head -1; gdb --version | head -1'

clean:
	rm -f $(BINARIES)
```

Recipe lines must be indented with a tab.

- [ ] **Step 4: Write the `Dockerfile`**

```dockerfile
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential binutils file gdb python3 less \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /lab
COPY . /lab
RUN make build

CMD ["bash"]
```

`.dockerignore`:

```
.git
.github
tests
```

`.gitignore` (ignore built binaries, keep sources):

```
/part-*/*
!/part-*/*.c
!/part-*/*.h
__pycache__/
```

- [ ] **Step 5: Build the image and check the binary**

```bash
make image
docker run --rm reverse-engineering-lab:local file part-01/hello
docker run --rm reverse-engineering-lab:local ./part-01/hello
make versions
```

Expected: `file` reports `ELF 64-bit LSB executable, x86-64` (executable, not `pie executable`); the binary prints `Hello, world!`; `versions` prints gcc 13.x, binutils 2.42, gdb 15.x (exact minor versions may differ).

- [ ] **Step 6: Pin the base image**

```bash
docker inspect --format '{{index .RepoDigests 0}}' ubuntu:24.04
```

Replace `FROM ubuntu:24.04` with `FROM ubuntu:24.04@sha256:<digest from the output>` and rebuild with `make image`. This keeps readers and captures on identical toolchains.

- [ ] **Step 7: Write `README.md`**

```markdown
# Reverse Engineering lab

The lab for the [Reverse Engineering](https://0x4142.example/blog/reverse-engineering)
series on 0x4142. Every binary and every terminal session shown in the
series comes from this image, so what you see in the posts is what you get
here.

## Run it

    docker run --rm -it ghcr.io/oceanman42/reverse-engineering-lab

or build it yourself:

    git clone https://github.com/OceanMan42/reverse-engineering-lab
    cd reverse-engineering-lab
    make shell

Each part of the series has a folder: `part-01/` holds the source and the
compiled binary for part 1, and so on.

## For the author

- `make capture BLOG=../0x4142` rebuilds the image, runs every scenario in
  `captures/`, and writes capture JSON into the blog. Run `git diff` in the
  blog afterwards to see what changed (useful after a toolchain update).
- `make test` runs the capture script's tests.
- `make versions` prints the toolchain versions baked into the image.
```

The blog's final domain is not decided yet; leave the placeholder link and mention it to the user.

- [ ] **Step 8: Write the CI workflow `.github/workflows/image.yml`**

```yaml
name: image

on:
  push:
    tags: ["v*"]

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - run: python3 -m unittest discover -s tests -v
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: |
            ghcr.io/oceanman42/reverse-engineering-lab:${{ github.ref_name }}
            ghcr.io/oceanman42/reverse-engineering-lab:latest
```

- [ ] **Step 9: Commit**

```bash
git add part-01/hello.c Makefile Dockerfile .dockerignore .gitignore README.md .github
git commit -m "Scaffold the Reverse Engineering lab image with part 1's binary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Capture script (lab)

**Files:**
- Create: `capture.py`
- Test: `tests/test_capture.py`

**Interfaces:**
- Consumes: nothing (runs inside the image from Task 4, but is tested on the host).
- Produces:
  - CLI: `python3 capture.py SCENARIO_DIR OUT_DIR`, exit 0 on success, 1 on any scenario error (nothing written, nothing pruned).
  - Scenario TOML: top-level `title` (string), `tool = "shell"`, optional `cwd` (relative to the lab root); one or more `[[step]]` with `label`, `command`, optional `allow_failure = true`.
  - Functions: `load_scenario(path: Path) -> dict`, `capture(scenario: dict, lab_root: Path) -> dict`, `wide_lines(capture: dict) -> list[str]`, `main(argv: list[str]) -> int`, `ScenarioError`.
  - Output: blog capture format v1; each frame's `command` is `"$ " + command`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_capture.py`:

```python
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import capture as cap  # noqa: E402

ESC = "\x1b"


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


SCENARIO = """
title = "two steps"
tool = "shell"

[[step]]
label = "first"
command = "printf 'a\\nb\\n'"

[[step]]
label = "second"
command = "echo oops >&2"
"""


class LoadScenarioTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def test_loads_a_valid_scenario(self):
        s = cap.load_scenario(write(self.dir / "ok.toml", SCENARIO))
        self.assertEqual(s["title"], "two steps")
        self.assertEqual(len(s["step"]), 2)

    def test_rejects_missing_title(self):
        path = write(self.dir / "x.toml", 'tool = "shell"\n[[step]]\nlabel="a"\ncommand="ls"\n')
        with self.assertRaisesRegex(cap.ScenarioError, "missing 'title'"):
            cap.load_scenario(path)

    def test_rejects_unsupported_tool(self):
        path = write(self.dir / "x.toml", 'title="t"\ntool="gdb"\n[[step]]\nlabel="a"\ncommand="ls"\n')
        with self.assertRaisesRegex(cap.ScenarioError, "not supported yet"):
            cap.load_scenario(path)

    def test_rejects_no_steps(self):
        path = write(self.dir / "x.toml", 'title="t"\ntool="shell"\n')
        with self.assertRaisesRegex(cap.ScenarioError, "at least one"):
            cap.load_scenario(path)

    def test_rejects_step_without_command(self):
        path = write(self.dir / "x.toml", 'title="t"\ntool="shell"\n[[step]]\nlabel="a"\n')
        with self.assertRaisesRegex(cap.ScenarioError, "step 1 missing 'command'"):
            cap.load_scenario(path)


class CaptureTest(unittest.TestCase):
    def setUp(self):
        self.lab = Path(tempfile.mkdtemp())

    def scenario(self, *steps, cwd="."):
        return {"title": "t", "tool": "shell", "cwd": cwd, "step": list(steps)}

    def test_runs_commands_and_builds_frames(self):
        result = cap.capture(
            self.scenario({"label": "l", "command": "printf 'a\\nb\\n'"}), self.lab
        )
        self.assertEqual(result["version"], 1)
        self.assertEqual(result["title"], "t")
        self.assertEqual(
            result["frames"],
            [{"label": "l", "command": "$ printf 'a\\nb\\n'", "output": "a\nb"}],
        )

    def test_includes_stderr(self):
        result = cap.capture(self.scenario({"label": "l", "command": "echo oops >&2"}), self.lab)
        self.assertEqual(result["frames"][0]["output"], "oops")

    def test_runs_in_cwd(self):
        (self.lab / "part-01").mkdir()
        result = cap.capture(
            self.scenario({"label": "l", "command": "basename $PWD"}, cwd="part-01"), self.lab
        )
        self.assertEqual(result["frames"][0]["output"], "part-01")

    def test_failing_command_raises(self):
        with self.assertRaisesRegex(cap.ScenarioError, "exited with 3"):
            cap.capture(self.scenario({"label": "l", "command": "exit 3"}), self.lab)

    def test_allow_failure_keeps_output(self):
        result = cap.capture(
            self.scenario({"label": "l", "command": "echo x; exit 3", "allow_failure": True}),
            self.lab,
        )
        self.assertEqual(result["frames"][0]["output"], "x")


class WideLinesTest(unittest.TestCase):
    def frame(self, output):
        return {"frames": [{"label": "l", "command": "$ x", "output": output}]}

    def test_flags_lines_over_80_columns(self):
        warnings = cap.wide_lines(self.frame("a" * 81))
        self.assertEqual(len(warnings), 1)
        self.assertIn("81 columns", warnings[0])

    def test_ignores_color_codes_when_measuring(self):
        colored = f"{ESC}[31m" + "a" * 80 + f"{ESC}[0m"
        self.assertEqual(cap.wide_lines(self.frame(colored)), [])


class MainTest(unittest.TestCase):
    def setUp(self):
        self.scenarios = Path(tempfile.mkdtemp())
        self.out = Path(tempfile.mkdtemp())

    def test_writes_capture_json(self):
        write(self.scenarios / "part-01" / "two.toml", SCENARIO)
        self.assertEqual(cap.main(["capture.py", str(self.scenarios), str(self.out)]), 0)
        data = json.loads((self.out / "part-01" / "two.json").read_text())
        self.assertEqual([f["label"] for f in data["frames"]], ["first", "second"])

    def test_prunes_stale_captures(self):
        write(self.scenarios / "part-01" / "two.toml", SCENARIO)
        stale = write(self.out / "part-01" / "gone.json", "{}")
        cap.main(["capture.py", str(self.scenarios), str(self.out)])
        self.assertFalse(stale.exists())

    def test_error_writes_and_prunes_nothing(self):
        write(self.scenarios / "part-01" / "ok.toml", SCENARIO)
        write(self.scenarios / "part-01" / "bad.toml", 'title="t"\ntool="shell"\n')
        stale = write(self.out / "part-01" / "gone.json", "{}")
        self.assertEqual(cap.main(["capture.py", str(self.scenarios), str(self.out)]), 1)
        self.assertTrue(stale.exists())
        self.assertFalse((self.out / "part-01" / "ok.json").exists())

    def test_rejects_names_the_blog_cannot_reference(self):
        write(self.scenarios / "Part-01" / "Two.toml", SCENARIO)
        self.assertEqual(cap.main(["capture.py", str(self.scenarios), str(self.out)]), 1)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `make test`
Expected: FAIL with `ModuleNotFoundError: No module named 'capture'`.

- [ ] **Step 3: Implement `capture.py`**

```python
#!/usr/bin/env python3
"""Run capture scenarios and write capture JSON for the 0x4142 blog.

Usage: python3 capture.py SCENARIO_DIR OUT_DIR

Each scenario is a TOML file, for example captures/part-01/elf-header.toml:

    title = "readelf: the ELF header"
    tool = "shell"
    cwd = "part-01"

    [[step]]
    label = "the ELF header"
    command = "readelf -h hello"

It becomes OUT_DIR/part-01/elf-header.json in the blog's capture format
(see "Capture format" in the blog README). JSON files in OUT_DIR that no
scenario produced are removed, so a post cannot reference a deleted
scenario. If any scenario fails, nothing is written or removed.
"""

import json
import os
import re
import subprocess
import sys
import tomllib
from pathlib import Path

LAB_ROOT = Path(__file__).resolve().parent
MAX_COLUMNS = 80
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
ENV = {
    **os.environ,
    "COLUMNS": str(MAX_COLUMNS),
    "LC_ALL": "C.UTF-8",
    "TERM": "xterm-256color",
}


class ScenarioError(Exception):
    pass


def _require(table: dict, key: str, where: str) -> None:
    value = table.get(key)
    if not isinstance(value, str) or not value:
        raise ScenarioError(f"{where} missing '{key}'")


def load_scenario(path: Path) -> dict:
    with path.open("rb") as f:
        data = tomllib.load(f)
    _require(data, "title", f"{path}:")
    _require(data, "tool", f"{path}:")
    if data["tool"] != "shell":
        raise ScenarioError(
            f"{path}: tool '{data['tool']}' is not supported yet (only 'shell')"
        )
    steps = data.get("step")
    if not steps:
        raise ScenarioError(f"{path}: needs at least one [[step]]")
    for i, step in enumerate(steps, 1):
        _require(step, "label", f"{path}: step {i}")
        _require(step, "command", f"{path}: step {i}")
    return data


def _run(step: dict, cwd: Path) -> str:
    result = subprocess.run(
        ["bash", "-c", step["command"]],
        cwd=cwd,
        env=ENV,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=30,
    )
    if result.returncode != 0 and not step.get("allow_failure", False):
        raise ScenarioError(
            f"'{step['command']}' exited with {result.returncode}:\n{result.stdout}"
        )
    return result.stdout.rstrip("\n")


def capture(scenario: dict, lab_root: Path) -> dict:
    cwd = lab_root / scenario.get("cwd", ".")
    frames = [
        {
            "label": step["label"],
            "command": f"$ {step['command']}",
            "output": _run(step, cwd),
        }
        for step in scenario["step"]
    ]
    return {"version": 1, "title": scenario["title"], "frames": frames}


def wide_lines(result: dict) -> list[str]:
    warnings = []
    for i, frame in enumerate(result["frames"], 1):
        for n, line in enumerate(frame["output"].split("\n"), 1):
            width = len(ANSI.sub("", line))
            if width > MAX_COLUMNS:
                warnings.append(f"frame {i}, line {n}: {width} columns")
    return warnings


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__, file=sys.stderr)
        return 1
    scenario_dir, out_dir = Path(argv[1]), Path(argv[2])

    results = {}
    try:
        for path in sorted(scenario_dir.rglob("*.toml")):
            rel = path.relative_to(scenario_dir).with_suffix(".json")
            if not all(NAME.match(part) for part in rel.with_suffix("").parts):
                raise ScenarioError(
                    f"{path}: use lowercase letters, digits, '-' and '_' only"
                )
            results[rel] = capture(load_scenario(path), LAB_ROOT)
    except (ScenarioError, tomllib.TOMLDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    written = set()
    for rel, result in results.items():
        for warning in wide_lines(result):
            print(f"warning: {rel}: {warning}", file=sys.stderr)
        target = out_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
        written.add(target)
        print(f"wrote {target}")

    for stale in sorted(out_dir.rglob("*.json")):
        if stale not in written:
            stale.unlink()
            print(f"removed stale {stale}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `make test`
Expected: all tests OK.

- [ ] **Step 5: Commit**

```bash
git add capture.py tests/test_capture.py
git commit -m "Add capture script that turns scenarios into blog capture JSON

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Part 1 scenarios and `make capture` (lab, then blog)

**Files:**
- Create (lab): `captures/part-01/file.toml`, `captures/part-01/elf-header.toml`, `captures/part-01/sections.toml`, `captures/part-01/symbols.toml`, `captures/part-01/disasm-main.toml`, `captures/part-01/compile-stages.toml`
- Modify (lab): `Makefile` (add `capture` target)
- Create (blog): `src/captures/reverse-engineering/part-01/*.json` (generated)

**Interfaces:**
- Consumes: `capture.py` CLI (Task 5), image (Task 4), capture format (Task 1).
- Produces: capture `src` values for Task 7:
  - `reverse-engineering/part-01/file`
  - `reverse-engineering/part-01/elf-header`
  - `reverse-engineering/part-01/sections`
  - `reverse-engineering/part-01/symbols`
  - `reverse-engineering/part-01/disasm-main`
  - `reverse-engineering/part-01/compile-stages` (3 frames, used with `diff="off"`)

- [ ] **Step 1: Write the scenarios**

`captures/part-01/file.toml`:

```toml
title = "file: what did gcc produce?"
tool = "shell"
cwd = "part-01"

[[step]]
label = "identify the binary"
command = "file hello"
```

`captures/part-01/elf-header.toml`:

```toml
title = "readelf: the ELF header"
tool = "shell"
cwd = "part-01"

[[step]]
label = "the ELF header"
command = "readelf -h hello"
```

`captures/part-01/sections.toml`:

```toml
title = "readelf: sections"
tool = "shell"
cwd = "part-01"

[[step]]
label = "section headers"
command = "readelf -S hello"
```

`captures/part-01/symbols.toml`:

```toml
title = "nm: symbols"
tool = "shell"
cwd = "part-01"

[[step]]
label = "symbols in the binary"
command = "nm hello"
```

`captures/part-01/disasm-main.toml`:

```toml
title = "objdump: main in assembly"
tool = "shell"
cwd = "part-01"

[[step]]
label = "disassembly of main"
command = "objdump -d -M intel --no-show-raw-insn --disassembler-color=on --disassemble=main hello"
```

`captures/part-01/compile-stages.toml` (writes nothing to disk, since the container runs as the host user and `/lab` is not writable):

```toml
title = "From C to a binary"
tool = "shell"
cwd = "part-01"

[[step]]
label = "the source"
command = "cat hello.c"

[[step]]
label = "the compiler's assembly output"
command = "gcc -O0 -fno-pie -masm=intel -fno-asynchronous-unwind-tables -S -o - hello.c"

[[step]]
label = "the finished binary"
command = "file hello"
```

- [ ] **Step 2: Add the `capture` target to the `Makefile`**

Add `capture` to `.PHONY`, then:

```make
capture: image
	@test -n "$(BLOG)" || { echo "usage: make capture BLOG=path/to/0x4142"; exit 1; }
	mkdir -p "$(abspath $(BLOG))/src/captures/reverse-engineering"
	docker run --rm --user "$$(id -u):$$(id -g)" \
	  -v "$(abspath $(BLOG))/src/captures/reverse-engineering:/out" \
	  $(IMAGE) python3 capture.py captures /out
```

- [ ] **Step 3: Run it against the blog**

```bash
cd ~/workspace/reverse-engineering-lab
make capture BLOG=../0x4142
```

Expected: six `wrote /out/part-01/<name>.json` lines. Warnings about lines over 80 columns are acceptable for `sections` and `disasm-main`; note them for Task 7. If `disasm-main` has no `\u001b[` sequences in its JSON, `--disassembler-color=on` is not coloring in a pipe: try `--disassembler-color=extended` and re-run.

- [ ] **Step 4: Check ownership and content in the blog**

```bash
cd ~/workspace/0x4142
ls -ln src/captures/reverse-engineering/part-01/
grep -c '"label"' src/captures/reverse-engineering/part-01/compile-stages.json
```

Expected: files owned by your uid (not 0); `compile-stages.json` has 3 labels.

- [ ] **Step 5: Commit in the lab**

```bash
cd ~/workspace/reverse-engineering-lab
git add captures Makefile
git commit -m "Add part 1 capture scenarios and make capture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The blog's generated captures are committed with the posts in Task 7.

---

## Task 7: Part 0 and part 1 drafts, browser verification (blog)

**Files:**
- Create: `src/content/blog/reverse-engineering/index.md` (part 0)
- Create: `src/content/blog/reverse-engineering/what-your-compiler-made.md` (part 1)
- Add: `src/captures/reverse-engineering/part-01/*.json` (from Task 6)

**Interfaces:**
- Consumes: capture `src` values from Task 6, directive from Task 2, stepper from Task 3.

- [ ] **Step 1: Read the existing post for voice**

Read `src/content/blog/smashing-the-stack.md` and match its voice, heading style and level of detail. No em dashes.

- [ ] **Step 2: Write part 0, `src/content/blog/reverse-engineering/index.md`**

Frontmatter:

```yaml
---
title: "Reverse Engineering"
description: "A series that starts from C you already know and ends with you reading, debugging and cracking real x86-64 binaries."
date: 2026-09-26
authors:
  - "0x4142"
tags:
  - reverse-engineering
  - gdb
  - x86-64
draft: true
---
```

Sections, in order:
1. **Who this is for:** you can write and compile C; you have never read assembly or used gdb.
2. **What you'll be able to do:** the three arcs from the spec, one short paragraph each, with the part titles as a list.
3. **Setting up the lab:** `docker run --rm -it ghcr.io/oceanman42/reverse-engineering-lab`, or clone and `make shell`. Each part has a folder (`part-01/`...). Mention the image pins its toolchain so output matches the posts.
4. **How to read this series:** terminal blocks come straight from the lab; lines starting with `$ ` are what you type. Show a stepper using `:::capture{src="reverse-engineering/part-01/compile-stages" diff="off"}` and explain the buttons and arrow keys. State the Intel-syntax convention.
5. **Next:** one line pointing to part 1.

- [ ] **Step 3: Write part 1, `src/content/blog/reverse-engineering/what-your-compiler-made.md`**

Frontmatter: `title: "What Your Compiler Actually Made"`, a one-sentence `description`, `date: 2026-09-26`, `order: 1`, same `authors`, tags `reverse-engineering`, `elf`, `objdump`, `draft: true`.

Sections, in order, each built around its capture:
1. **The program:** `hello.c` as a ```c block; compile flags from the lab and why (`-O0`, no PIE: simpler output for now; later parts drop these).
2. **Four stages:** preprocess, compile, assemble, link. `:::capture{src="reverse-engineering/part-01/compile-stages" diff="off"}`.
3. **What is this file?:** `:::capture{src="reverse-engineering/part-01/file"}`. Explain ELF, 64-bit, LSB (little-endian, used again in part 3), "not stripped".
4. **The ELF header:** `:::capture{src="reverse-engineering/part-01/elf-header"}`. Walk through magic bytes, class, machine, entry point (and that the entry point is not `main`).
5. **Sections:** `:::capture{src="reverse-engineering/part-01/sections"}`. Focus on `.text`, `.rodata`, `.data`, `.bss`; point out where the string `"Hello, world!"` lives. Ignore the rest explicitly.
6. **Symbols:** `:::capture{src="reverse-engineering/part-01/symbols"}`. `main` as a symbol with an address in `.text`; `puts`/`printf` as undefined (resolved at runtime, covered in part 8). If the compiler turned `printf` into `puts`, point it out as the first sign the binary is not a literal translation of the source.
7. **First look at assembly:** `:::capture{src="reverse-engineering/part-01/disasm-main"}`. Do not teach instructions yet; point out the shape (prologue, loading the string address, the call, return 0, epilogue) and promise part 2.
8. **Recap and next:** 3 bullets, then one line pointing to part 2.

- [ ] **Step 4: Build**

Run: `npm run build && npm test`
Expected: build passes. Drafts are excluded from the production build, so the directive runs on these files only in dev; to confirm the captures resolve at build time too, temporarily set `draft: false` on both posts, run `npm run build`, confirm success, then restore `draft: true`.

- [ ] **Step 5: Verify the rendered HTML without JavaScript**

With `draft: false` still set from Step 4 (before restoring), check the built page:

```bash
grep -c "<capture-frame" dist/blog/reverse-engineering/index.html
grep -c "<capture-frame[^>]*hidden" dist/blog/reverse-engineering/index.html
```

Expected: a positive count of frames; zero hidden frames in the server HTML. Then restore `draft: true`.

- [ ] **Step 6: Verify in the browser**

Run `npm run dev` in the background and open `http://localhost:4321/blog/reverse-engineering` with the Playwright tools. Check, taking screenshots:
- Only frame 1 of the stepper is visible, with Prev disabled.
- Next shows frame 2, then frame 3, where Next becomes disabled.
- Tab to the stepper and press ArrowLeft/ArrowRight: frames change.
- Tab into a code block inside the stepper and press ArrowRight: the frame does not change.
- Colored `objdump` output in part 1 shows colors in both light and dark theme (toggle with the theme button).
- Resize to 375px wide: no horizontal page scroll; wide blocks scroll inside themselves.

Fix any problem in the task that owns the code, re-run its tests, and commit there.

- [ ] **Step 7: Commit**

```bash
P="src/content/blog/reverse-engineering src/captures/reverse-engineering"
git add $P && git commit -m "Add Reverse Engineering series drafts for parts 0 and 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- $P
```

- [ ] **Step 8: Hand off to the user**

Tell the user:
- Both posts are drafts (`draft: true`), visible only in `npm run dev`.
- The lab repo is local at `~/workspace/reverse-engineering-lab`, not pushed. To publish: create `OceanMan42/reverse-engineering-lab` on GitHub, `git remote add origin ...`, push, then `git tag v1 && git push --tags` to publish the image.
- The lab README has a placeholder blog URL until the domain is decided.
- Any 80-column warnings from Task 6.
