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
