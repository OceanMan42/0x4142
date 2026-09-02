# 0x4142 Personal Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the astro-erudite template into 0x4142's personal site: a write-ups-first blog with new Photos (grid + lightbox) and Music (embedded players) sections, a personal homepage, and the template's demo content replaced with the site owner's own branding.

**Architecture:** Two new content collections (`photos`, `music`) added to the existing `content.config.ts` alongside `blog`/`authors`/`projects`, each following the exact `defineCollection` shape `projects` already uses. Two new route + component pairs (`/photos` + lightbox script, `/music` + `MusicCard.astro`) are added the same way `/projects` + `ProjectCard.astro` already work. Branding (`consts.ts`, author profile, webmanifest) and the homepage are updated last, once the new routes they link to and depend on already exist.

**Tech Stack:** Astro 7 (content collections, `astro:assets` `Image`), native CSS (no framework), vanilla `<script>` for interactivity (no JS framework — matches `ThemeToggle.astro`/`ScrollToTop.astro`'s existing pattern of `data-*` attribute hooks + plain DOM APIs). No unit test framework exists in this repo (`package.json` has no test runner) — verification is `astro check` + `astro build` (type-checks Zod schemas and statically renders every route) plus manual browser QA, per the approved spec's Testing section.

**Spec:** `docs/superpowers/specs/2026-09-01-personal-blog-design.md`

## Global Constraints

- Photos: single `/photos` grid page with click-to-open lightbox — no per-photo permalink pages.
- Music: embedded players only (`embedUrl` field, an already-embed-flavored iframe `src`) — no self-hosted audio, no per-provider URL-rewriting logic.
- Deployment target undecided — do not touch `astro.config.ts`'s `site` field or add an adapter.
- Keep `/projects` as a fourth nav item, schema unchanged.
- Drop the `Authors` link from `NAVIGATION` — `/authors/[...id].astro` and per-post author bylines/avatars keep working, just not linked as a standalone directory page.
- Site title: `"0x4142"`. Tagline/`SITE.description`: `"Bytes, light, and sound."`
- **YAML hex gotcha:** the string `0x4142` is valid YAML/YAML-1.1 hex-integer syntax and parses as the *number* `16706`, not the string `"0x4142"`, wherever it appears **unquoted** in frontmatter (verified with `js-yaml`, the parser class Astro's content loader uses, against this exact string). Every frontmatter occurrence of `0x4142` as a value (e.g. `authors: - "0x4142"`) **must be wrapped in quotes**. This does not affect `src/consts.ts` (`SITE.title` there is a TS string literal, not YAML) or filenames (Astro derives collection entry `id` from the file path, not by re-parsing it as YAML).
- Run `bun run build` (`astro check && astro build`) after every task if `bun` is available in the executor's environment; if not, fall back to `npx astro check && npx astro build` — Astro itself doesn't require bun, only this repo's lockfile choice does.

---

## Task 1: Photos subsystem

**Files:**
- Modify: `src/content.config.ts` (add `photos` collection)
- Create: `src/content/photos/placeholder.png` (copy of `src/content/projects/placeholder.png`, reused as the seed photo's image)
- Create: `src/content/photos/example-photo.md`
- Create: `src/pages/photos/index.astro`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the `photos` collection (schema below) and the `/photos` route, which Task 3 links to from `NAVIGATION`.

- [ ] **Step 1: Add the `photos` collection to `src/content.config.ts`**

Open `src/content.config.ts` and add, right after the `projects` collection definition:

```ts
const photos = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.md",
    base: "./src/content/photos",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().optional(),
      date: z.coerce.date(),
      image: image(),
      tags: z.array(z.string()).optional(),
      draft: z.boolean().optional(),
    }),
})
```

Then update the final export line:

```ts
export const collections = { blog, authors, projects, photos }
```

(`music` is added to this same line in Task 2 — don't worry about the final `{ blog, authors, projects, photos, music }` shape yet.)

- [ ] **Step 2: Add a seed photo so the collection isn't empty**

```bash
cp src/content/projects/placeholder.png src/content/photos/placeholder.png
```

Create `src/content/photos/example-photo.md`:

```markdown
---
title: "Example photo — replace me"
description: "A placeholder caption. Delete this file once you've added your own photos."
date: 2026-09-01
image: ./placeholder.png
tags:
  - placeholder
---
```

- [ ] **Step 3: Run `astro check` to confirm the schema and seed content are valid**

Run: `bun run astro check` (or `npx astro check` if `bun` is unavailable)
Expected: no errors referencing `photos` or `example-photo.md`.

- [ ] **Step 4: Build the `/photos` grid + lightbox page**

Create `src/pages/photos/index.astro`:

```astro
---
import MetaPage from "@/components/MetaPage.astro"
import Layout from "@/layouts/Layout.astro"
import { Image } from "astro:assets"
import { getCollection } from "astro:content"

const photos = (await getCollection("photos", ({ data }) => !data.draft)).sort(
  (a, b) => b.data.date.getTime() - a.data.date.getTime(),
)
---

<Layout>
  <MetaPage slot="head" title="Photos" />
  <ul data-photo-grid>
    {photos.map((photo, i) => (
        <li>
          <button
            type="button"
            data-photo-trigger
            data-index={i}
            aria-label={`View photo: ${photo.data.title}`}
          >
            <Image src={photo.data.image} alt="" width={480} height={480} />
          </button>
        </li>
      ))}
  </ul>

  <photo-lightbox data-open="false">
    <div data-lightbox-backdrop>
      <button type="button" data-lightbox-close aria-label="Close">✕</button>
      {photos.map((photo, i) => (
          <figure data-lightbox-slide data-index={i}>
            <Image
              src={photo.data.image}
              alt={photo.data.title}
              width={1600}
              height={1600}
            />
            {photo.data.description && (
                <figcaption>{photo.data.description}</figcaption>
              )}
          </figure>
        ))}
    </div>
  </photo-lightbox>
</Layout>

<style>
  [data-photo-grid] {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: var(--space-2xs);
    list-style: none;

    li button {
      display: block;
      inline-size: 100%;
      aspect-ratio: 1;
      padding: 0;
      border: none;
      cursor: pointer;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: none;

      :global(img) {
        inline-size: 100%;
        block-size: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.2s ease;
      }

      &:hover :global(img) {
        transform: scale(1.03);
      }
    }
  }

  photo-lightbox {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 50;

    &[data-open="true"] {
      display: block;
    }

    [data-lightbox-backdrop] {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: color-mix(in oklab, black 80%, transparent);
      padding: var(--space-m);
    }

    [data-lightbox-close] {
      position: absolute;
      inset-block-start: var(--space-s);
      inset-inline-end: var(--space-s);
      color: white;
      font-size: 1.25rem;
      line-height: 1;
      background: none;
      border: none;
      cursor: pointer;
      padding: var(--space-2xs);
    }

    [data-lightbox-slide] {
      display: none;
      max-inline-size: 100%;
      max-block-size: 100%;
      flex-direction: column;
      align-items: center;
      margin: 0;

      &[data-active] {
        display: flex;
      }

      :global(img) {
        max-inline-size: 100%;
        max-block-size: 80svh;
        inline-size: auto;
        block-size: auto;
        object-fit: contain;
      }

      figcaption {
        margin-block-start: var(--space-2xs);
        color: white;
        font-size: var(--step--1);
        text-align: center;
      }
    }
  }
</style>

<script>
  const lightbox = document.querySelector<HTMLElement>("photo-lightbox")
  const slides = [
    ...document.querySelectorAll<HTMLElement>("[data-lightbox-slide]"),
  ]
  const triggers = [
    ...document.querySelectorAll<HTMLElement>("[data-photo-trigger]"),
  ]

  const showSlide = (index: number) => {
    for (const slide of slides)
      slide.toggleAttribute("data-active", Number(slide.dataset.index) === index)
  }

  const open = (index: number) => {
    if (!lightbox) return
    showSlide(index)
    lightbox.setAttribute("data-open", "true")
    document.body.style.overflow = "hidden"
  }

  const close = () => {
    if (!lightbox) return
    lightbox.setAttribute("data-open", "false")
    document.body.style.overflow = ""
  }

  for (const trigger of triggers)
    trigger.addEventListener("click", () => open(Number(trigger.dataset.index)))

  lightbox
    ?.querySelector("[data-lightbox-close]")
    ?.addEventListener("click", close)

  lightbox
    ?.querySelector("[data-lightbox-backdrop]")
    ?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) close()
    })

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox?.getAttribute("data-open") === "true")
      close()
  })
</script>
```

- [ ] **Step 5: Run the build**

Run: `bun run build` (or `npx astro check && npx astro build`)
Expected: builds successfully, `dist/photos/index.html` is generated.

- [ ] **Step 6: Manual check in dev server**

Run: `bun dev` (or `npx astro dev`), open `http://localhost:4321/photos`
Expected:
- A grid of one thumbnail (the placeholder) renders.
- Clicking it opens a full-size overlay with the caption below the image.
- Pressing Esc closes it; clicking the ✕ closes it; clicking the dark backdrop (not the image) closes it.
- Background page cannot scroll while the overlay is open.

- [ ] **Step 7: Commit**

```bash
git add src/content.config.ts src/content/photos src/pages/photos
git commit -m "Add photos collection with grid + lightbox page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JTgvHDFv3BqVFDNv2q8Y5D"
```

---

## Task 2: Music subsystem

**Files:**
- Modify: `src/content.config.ts` (add `music` collection)
- Create: `src/content/music/example-track.md`
- Create: `src/components/MusicCard.astro`
- Create: `src/pages/music/index.astro`

**Interfaces:**
- Consumes: nothing from other tasks (independent of Task 1).
- Produces: the `music` collection and the `/music` route, which Task 3 links to from `NAVIGATION`.

- [ ] **Step 1: Add the `music` collection to `src/content.config.ts`**

Add, after the `photos` collection added in Task 1:

```ts
const music = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.md",
    base: "./src/content/music",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      artist: z.string().optional(),
      description: z.string().optional(),
      date: z.coerce.date(),
      embedUrl: z.url(),
      image: image().optional(),
      tags: z.array(z.string()).optional(),
      draft: z.boolean().optional(),
    }),
})
```

Update the export line to its final shape:

```ts
export const collections = { blog, authors, projects, photos, music }
```

- [ ] **Step 2: Add a seed track so the collection isn't empty**

Create `src/content/music/example-track.md`. This uses YouTube's own first-ever video ("Me at the zoo") as a stable, always-embeddable placeholder — it's not music, it's just here to prove the embed mechanism works; the description says so explicitly and it's meant to be deleted:

```markdown
---
title: "Example track — replace me"
description: "A placeholder embed (not actually music) so you can see how the player renders. Delete this file once you've added your own tracks."
artist: "YouTube"
date: 2026-09-01
embedUrl: "https://www.youtube.com/embed/jNQXAC9IVRw"
tags:
  - placeholder
---
```

- [ ] **Step 3: Run `astro check` to confirm the schema and seed content are valid**

Run: `bun run astro check` (or `npx astro check`)
Expected: no errors referencing `music` or `example-track.md`.

- [ ] **Step 4: Build the `MusicCard` component**

Create `src/components/MusicCard.astro`:

```astro
---
import { formatDate } from "@/lib/utils"
import { Image } from "astro:assets"
import type { CollectionEntry } from "astro:content"

type Props = { track: CollectionEntry<"music"> }

const { track } = Astro.props
const { title, artist, description, date, embedUrl, image, tags } =
  track.data
---

<li>
  {image && <Image src={image} alt="" width={640} height={336} />}
  <entry-info>
    <h2>{title}</h2>
    <entry-meta>
      {artist && <track-artist>{artist}</track-artist>}
      <time datetime={date.toISOString()}>{formatDate(date)}</time>
      {tags && tags.length > 0 && (
          <entry-tags>
            {tags.map((tag) => <span>#{tag}</span>)}
          </entry-tags>
        )}
    </entry-meta>
    {description && <p>{description}</p>}
    <entry-embed>
      <iframe
        src={embedUrl}
        title={`Embedded player for ${title}`}
        loading="lazy"
        allow="autoplay; encrypted-media; clipboard-write; picture-in-picture"
        allowfullscreen
      ></iframe>
    </entry-embed>
  </entry-info>
</li>

<style>
  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);

    > :global(img) {
      inline-size: 100%;
      max-inline-size: 28rem;
      block-size: auto;
      border-radius: var(--radius-md);
    }

    entry-info {
      display: flex;
      flex-direction: column;

      h2 {
        font-size: var(--step-1);
        line-height: calc(var(--leading-offset) + 1em);
        font-weight: var(--font-weight-medium);
        color: var(--foreground);
      }

      entry-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-3xs);
        margin-block-end: var(--space-3xs);
        font-size: var(--step--1);
        color: var(--muted-foreground);

        entry-tags {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3xs);

          span {
            color: color-mix(
              in oklab,
              var(--muted-foreground) 50%,
              transparent
            );
          }
        }

        track-artist ~ time::before,
        time ~ entry-tags::before {
          content: "·";
          margin-inline-end: var(--space-3xs);
        }
      }

      p {
        color: var(--muted-foreground);
        margin-block-end: var(--space-2xs);
      }

      entry-embed {
        iframe {
          inline-size: 100%;
          block-size: 22rem;
          border: 0;
          border-radius: var(--radius-md);
        }
      }
    }
  }
</style>
```

- [ ] **Step 5: Build the `/music` list page**

Create `src/pages/music/index.astro`:

```astro
---
import MetaPage from "@/components/MetaPage.astro"
import MusicCard from "@/components/MusicCard.astro"
import Layout from "@/layouts/Layout.astro"
import { getCollection } from "astro:content"

const tracks = (await getCollection("music", ({ data }) => !data.draft)).sort(
  (a, b) => b.data.date.getTime() - a.data.date.getTime(),
)
---

<Layout>
  <MetaPage slot="head" title="Music" />
  <ul>
    {tracks.map((track) => <MusicCard track={track} />)}
  </ul>
</Layout>

<style>
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
  }
</style>
```

- [ ] **Step 6: Run the build**

Run: `bun run build` (or `npx astro check && npx astro build`)
Expected: builds successfully, `dist/music/index.html` is generated.

- [ ] **Step 7: Manual check in dev server**

Run: `bun dev` (or `npx astro dev`), open `http://localhost:4321/music`
Expected: the placeholder track's title/artist/date/description/tags render, and the embedded YouTube player loads and plays when clicked.

- [ ] **Step 8: Commit**

```bash
git add src/content.config.ts src/content/music src/components/MusicCard.astro src/pages/music
git commit -m "Add music collection with embedded-player list page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JTgvHDFv3BqVFDNv2q8Y5D"
```

---

## Task 3: Branding, author profile, and content cleanup

**Files:**
- Modify: `src/consts.ts`
- Modify: `public/site.webmanifest`
- Create: `src/content/authors/0x4142.md`
- Delete: `src/content/authors/enscribe.md`
- Create: `src/content/blog/hello-world.md`
- Delete: `src/content/blog/introducing-v2/` (whole directory)
- Delete: `src/content/blog/v1-posts/` (whole directory)
- Create: `src/content/projects/example-project.md`
- Delete: `src/content/projects/project-a.md`, `project-b.md`, `project-c.md`
- Modify: `README.md` (one added note about the YAML hex gotcha)

**Interfaces:**
- Consumes: the `/photos` and `/music` routes from Tasks 1–2 (linked from `NAVIGATION`).
- Produces: the final `SITE`/`NAVIGATION`/`SOCIALS` values and the `"0x4142"` author id that Task 4's homepage and recent-posts list rely on.

- [ ] **Step 1: Rebrand `src/consts.ts`**

Replace the full file contents:

```ts
import type { SvgComponent } from "astro/types"
import Email from "@/assets/icons/email.svg"
import GitHub from "@/assets/icons/github.svg"
import RSS from "@/assets/icons/rss.svg"

export const SITE = {
  title: "0x4142",
  description: "Bytes, light, and sound.",
  locale: "en-US",
  dir: "ltr",
  defaultPageImage: "/static/opengraph-image.png",
  defaultPostImage: "/static/1200x630.png",
} as const

export const NAVIGATION = [
  { href: "/blog", label: "Blog" },
  { href: "/photos", label: "Photos" },
  { href: "/music", label: "Music" },
  { href: "/projects", label: "Projects" },
]

export const SOCIALS: { href: string; label: string; icon: SvgComponent }[] = [
  { href: "https://github.com/OceanMan42", label: "GitHub", icon: GitHub },
  { href: "mailto:banurag97@gmail.com", label: "Email", icon: Email },
  { href: "/rss.xml", label: "RSS", icon: RSS },
]
```

(The `Twitter` icon import is dropped since it's no longer used — an unused import would otherwise fail `biome` lint/format checks.)

- [ ] **Step 2: Rebrand the web app manifest**

In `public/site.webmanifest`, change:

```json
  "name": "astro-erudite",
  "short_name": "astro-erudite",
```

to:

```json
  "name": "0x4142",
  "short_name": "0x4142",
```

(Leave the icon file references and theme/background colors untouched — no favicon image redesign in scope.)

- [ ] **Step 3: Replace the author profile**

```bash
git rm src/content/authors/enscribe.md
```

Create `src/content/authors/0x4142.md`:

```markdown
---
name: "0x4142"
avatar: "https://github.com/OceanMan42.png"
bio: "Technical write-ups, photos, and music."
mail: "banurag97@gmail.com"
socials:
  github: "https://github.com/OceanMan42"
---
```

- [ ] **Step 4: Remove demo blog posts and add one placeholder post**

```bash
git rm -r src/content/blog/introducing-v2 src/content/blog/v1-posts
```

Create `src/content/blog/hello-world.md`. Note the author id is quoted — see the Global Constraints YAML hex gotcha:

```markdown
---
title: "Hello, world"
description: "The first post on 0x4142 — a placeholder to replace with your own writing."
date: 2026-09-01
authors:
  - "0x4142"
tags:
  - meta
---

This is a placeholder post so the blog isn't empty. Delete it (or edit it
in place) once you've published your first real write-up.
```

- [ ] **Step 5: Remove demo projects and add one placeholder project**

```bash
git rm src/content/projects/project-a.md src/content/projects/project-b.md src/content/projects/project-c.md
```

Create `src/content/projects/example-project.md` (reuses the existing `placeholder.png` already in this directory):

```markdown
---
name: "Example project — replace me"
description: "A placeholder project entry. Delete this file once you've added your own projects, or edit it in place."
link: "https://example.com"
image: "./placeholder.png"
tags: ["placeholder"]
startDate: "2026-09-01"
---
```

- [ ] **Step 6: Document the YAML hex gotcha in the README**

In `README.md`, in the "Authors" section (right after the author schema table, before the "### Projects" heading), add:

```markdown
> [!WARNING]
> If your site's name looks like a hex number (as `0x4142` does), quote it
> whenever it appears as a YAML value — e.g. `authors: - "0x4142"` — or the
> YAML parser will read it as the integer `16706` instead of the string
> `"0x4142"`, and the build will fail with a schema validation error.
```

- [ ] **Step 7: Run the build**

Run: `bun run build` (or `npx astro check && npx astro build`)
Expected: builds successfully — no references to `enscribe`, `introducing-v2`, `v1-posts`, `project-a/b/c` remain anywhere (check the build output for 404s or dangling references), and no unused-import lint errors from the removed `Twitter` icon.

- [ ] **Step 8: Manual check in dev server**

Run: `bun dev` (or `npx astro dev`)
Expected:
- The sidebar/nav shows exactly: Blog, Photos, Music, Projects (no Authors link), and every link resolves (no 404s).
- `/blog` shows only the "Hello, world" placeholder post, with byline "0x4142" linking to a working author page at `/authors/0x4142`.
- `/projects` shows only the placeholder project.
- Footer shows GitHub, Email, and RSS icons pointing at the right URLs.
- `/rss.xml` still generates and lists the placeholder post.

- [ ] **Step 9: Commit**

```bash
git add -A src/consts.ts public/site.webmanifest src/content/authors src/content/blog src/content/projects README.md
git commit -m "Rebrand site as 0x4142; replace demo content with placeholders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JTgvHDFv3BqVFDNv2q8Y5D"
```

---

## Task 4: Homepage rewrite and full-site verification

**Files:**
- Modify: `src/pages/index.astro` (full rewrite, replacing the "erudite" wordplay content)

**Interfaces:**
- Consumes: `SITE`, `SOCIALS` from `src/consts.ts` (Task 3); `getPosts()` from `src/lib/content.ts` (pre-existing, returns `CollectionEntry<"blog">[]` sorted newest-first with drafts excluded); `BlogCard.astro` (pre-existing) and `SocialIcons.astro` (pre-existing).
- Produces: the final homepage. Nothing later depends on this task.

- [ ] **Step 1: Rewrite the homepage**

Replace the full contents of `src/pages/index.astro`:

```astro
---
import BlogCard from "@/components/BlogCard.astro"
import MetaPage from "@/components/MetaPage.astro"
import SocialIcons from "@/components/SocialIcons.astro"
import Layout from "@/layouts/Layout.astro"
import { SITE, SOCIALS } from "@/consts"
import { getPosts } from "@/lib/content"

const recentPosts = (await getPosts()).slice(0, 5)
---

<Layout>
  <MetaPage slot="head" />
  <home-intro>
    <h1>{SITE.title}</h1>
    <p data-tagline>{SITE.description}</p>
    <p>
      Hi, I'm 0x4142 — I write about the things I'm building, the places I
      point my camera, and the sounds I can't stop looping. Expect technical
      write-ups, photos, and music, in no particular order.
    </p>
    <SocialIcons links={SOCIALS} />
  </home-intro>

  {recentPosts.length > 0 && (
      <home-posts>
        <h2>Recent posts</h2>
        <ul>
          {recentPosts.map((post) => <BlogCard post={post} />)}
        </ul>
      </home-posts>
    )}
</Layout>

<style>
  home-intro {
    display: block;

    h1 {
      font-size: var(--step-2);
      line-height: calc(var(--leading-offset) + 1em);
      font-weight: var(--font-weight-medium);
      color: var(--foreground);
    }

    [data-tagline] {
      margin-block-start: var(--space-3xs);
      color: var(--muted-foreground);
      font-size: var(--step-0);
    }

    > p:not([data-tagline]) {
      margin-block-start: var(--space-m);
      color: var(--muted-foreground);
    }

    :global(ul) {
      margin-block-start: var(--space-m);
    }
  }

  home-posts {
    display: block;
    margin-block-start: var(--space-xl);

    h2 {
      font-size: var(--step-1);
      font-weight: var(--font-weight-medium);
      color: var(--foreground);
      margin-block-end: var(--space-s);
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: var(--space-m);
    }
  }
</style>
```

- [ ] **Step 2: Run the build**

Run: `bun run build` (or `npx astro check && npx astro build`)
Expected: builds successfully, `dist/index.html` is generated and contains the new intro copy (not the old "er·u·dite" dictionary entry).

- [ ] **Step 3: Full-site manual verification**

Run: `bun dev` (or `npx astro dev`), then walk through:

- `/` — shows the "0x4142" heading, "Bytes, light, and sound." tagline, bio paragraph, social icons (GitHub/Email/RSS), and a "Recent posts" section listing the "Hello, world" placeholder post.
- `/blog`, `/photos`, `/music`, `/projects` — each reachable from the nav, each renders its one placeholder entry.
- `/photos` — lightbox still opens/closes correctly (re-verify after the nav/branding changes in Task 3 didn't regress it).
- `/music` — embedded player still loads and plays.
- `/authors/0x4142` — author profile page renders name/bio/avatar/GitHub link.
- `/rss.xml` and `/sitemap-index.xml` — both still generate without errors.
- No console errors in the browser devtools on any of the above pages.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "Replace homepage with a personal intro and recent-posts list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JTgvHDFv3BqVFDNv2q8Y5D"
```
