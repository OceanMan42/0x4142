import type { SvgComponent } from "astro/types"
import Email from "@/assets/icons/email.svg"
import GitHub from "@/assets/icons/github.svg"
import RSS from "@/assets/icons/rss.svg"

export const SITE = {
  title: "0x4142",
  // Id of the site owner in src/content/authors/. The body of that file is
  // the homepage bio.
  author: "0x4142",
  description: "Security write-ups, CTF write-ups, and projects by 0x4142.",
  tagline: "",
  locale: "en-US",
  dir: "ltr",
  defaultPageImage: "/static/og-default.png",
  defaultPostImage: "/static/og-default.png",
} as const

export const NAVIGATION = [
  { href: "/blog", label: "Blog" },
  { href: "/ctfs", label: "CTFs" },
  { href: "/projects", label: "Projects" },
]

export const SOCIALS: { href: string; label: string; icon: SvgComponent }[] = [
  { href: "https://github.com/OceanMan42", label: "GitHub", icon: GitHub },
  { href: "mailto:banurag97@gmail.com", label: "Email", icon: Email },
  { href: "/rss.xml", label: "RSS", icon: RSS },
]
