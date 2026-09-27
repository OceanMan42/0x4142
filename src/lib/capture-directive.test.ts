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
    await expect(render(':::capture{src="demo/nope"}\n:::\n')).rejects.toThrow(
      /capture "demo\/nope": file not found/,
    )
  })

  it("fails on an unsafe src", async () => {
    await expect(render(':::capture{src="../secret"}\n:::\n')).rejects.toThrow(
      /src must be/,
    )
  })
})
