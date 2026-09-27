import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import { satteri } from "@astrojs/markdown-satteri"
import {
  blockExpressiveCode,
  inlineExpressiveCode,
} from "./src/lib/expressive-code"
import { temmlMath } from "./src/lib/math"
import { calloutDirective } from "./src/lib/callout"
import { captureCheck } from "./src/lib/capture-check"
import {
  captureDirective,
  DEFAULT_ROOT as CAPTURE_ROOT,
} from "./src/lib/capture-directive"
import { externalLinks } from "./src/lib/external-links"
import { headingAnchors } from "./src/lib/heading-anchors"

export default defineConfig({
  site: "https://astro-erudite.vercel.app",
  compressHTML: true,
  prefetch: { prefetchAll: true },
  integrations: [
    captureCheck("./src/content", CAPTURE_ROOT),
    sitemap({
      filter: (page) =>
        !/\/authors\/[^/]+\/?$/.test(page) && !page.includes("/tags/"),
    }),
  ],
  markdown: {
    syntaxHighlight: false,
    processor: satteri({
      features: { directive: true, math: true },
      mdastPlugins: [
        captureDirective,
        calloutDirective,
        inlineExpressiveCode,
        temmlMath,
      ],
      hastPlugins: [externalLinks, blockExpressiveCode, headingAnchors],
    }),
  },
})
