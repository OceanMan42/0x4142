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
            {
              type: "text",
              value: `Step ${i + 1} of ${total}: ${frame.label}`,
            },
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
