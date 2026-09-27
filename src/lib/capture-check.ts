import type { AstroIntegration } from "astro"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { CaptureError, loadCapture } from "./capture"

const FENCE = /^\s*(```|~~~)/
const DIRECTIVE = /^\s*:::capture\{([^}]*)\}/
const SRC = /(?:^|\s)src=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/

// Every `:::capture` src in a Markdown file, skipping fenced code blocks.
// A directive without a src yields "" so the check reports it.
export function captureRefs(markdown: string): string[] {
  const refs: string[] = []
  let fence: string | undefined
  for (const line of markdown.split("\n")) {
    const marker = FENCE.exec(line)?.[1]
    if (marker) {
      if (!fence) fence = marker
      else if (marker === fence) fence = undefined
      continue
    }
    if (fence) continue
    const attrs = DIRECTIVE.exec(line)?.[1]
    if (attrs === undefined) continue
    const src = SRC.exec(attrs)
    refs.push(src?.[1] ?? src?.[2] ?? src?.[3] ?? "")
  }
  return refs
}

// Loads every capture referenced from the Markdown files under contentDir.
// Returns one message per broken capture, naming the post it came from.
// The build runs this up front because Astro logs, but does not fail on,
// errors thrown while rendering a content entry.
export function checkCaptures(contentDir: string, root: string): string[] {
  const errors: string[] = []
  const files = readdirSync(contentDir, { recursive: true, encoding: "utf8" })
  for (const file of files.filter((f) => f.endsWith(".md")).sort()) {
    const path = join(contentDir, file)
    for (const src of captureRefs(readFileSync(path, "utf8"))) {
      try {
        loadCapture(root, src)
      } catch (error) {
        if (!(error instanceof CaptureError)) throw error
        errors.push(`${relative(contentDir, path)}: ${error.message}`)
      }
    }
  }
  return errors
}

// Fails `astro dev` and `astro build` at startup when any post references a
// missing or invalid capture.
export function captureCheck(contentDir: string, root: string) {
  return {
    name: "capture-check",
    hooks: {
      "astro:config:setup": () => {
        const errors = checkCaptures(contentDir, root)
        if (errors.length > 0) {
          throw new Error(`broken captures:\n${errors.join("\n")}`)
        }
      },
    },
  } satisfies AstroIntegration
}
