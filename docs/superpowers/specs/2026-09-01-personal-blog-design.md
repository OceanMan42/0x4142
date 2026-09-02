# 0x4142 personal blog — design spec

Date: 2026-09-01

## Purpose

Turn the `astro-erudite` template into a personal site for banurag97
(site name **0x4142**) that publishes three kinds of content:

1. Technical write-ups (the primary, nav-first section)
2. Photos
3. Music

The template already covers write-ups almost entirely (blog collection,
subposts, TOC, code highlighting, math, callouts, tags, authors, RSS,
sitemap). Photos and music are new subsystems modeled tightly on the
template's existing `projects` collection pattern (schema in
`content.config.ts` → page in `src/pages/` → card/grid component in
`src/components/`), so the site stays consistent with itself.

## Constraints / decisions already made

- Write-ups are the primary content type; nav order reflects that.
- Photos: single grid page with lightbox (no per-photo permalinks).
- Music: embedded players (Bandcamp/SoundCloud/Spotify/YouTube), not
  self-hosted audio files.
- Deployment target undecided — `astro.config.ts`'s `site` field stays
  a placeholder; no adapter work in scope.
- Keep the `projects` section as a fourth nav item (portfolio/side
  projects), unchanged in schema.
- Drop the `Authors` link from nav (single-author site) — the
  collection and per-post byline/avatar rendering stay functional,
  just not linked as a standalone directory page.
- Tagline: "Bytes, light, and sound."

## Content model

Both new collections follow the exact `defineCollection` shape used by
`projects` in `src/content.config.ts` (glob loader, `pattern:
"**/[^_]*.md"`, Zod schema).

### `photos` — `src/content/photos/*.md`

| Field | Type | Required |
|---|---|---|
| `title` | `string` | Yes |
| `description` | `string` | Optional (caption shown in lightbox) |
| `date` | `coerce.date()` | Yes |
| `image` | `image()` | Yes |
| `tags` | `string[]` | Optional |
| `draft` | `boolean` | Optional, defaults `false` |

One markdown file per photo. Markdown body is unused (frontmatter-only
entries), consistent with how `projects` is authored.

### `music` — `src/content/music/*.md`

| Field | Type | Required |
|---|---|---|
| `title` | `string` | Yes |
| `artist` | `string` | Optional, defaults to site owner |
| `description` | `string` | Optional |
| `date` | `coerce.date()` | Yes |
| `embedUrl` | `url()` | Yes — the platform's *embed-flavored* URL (see below), not a normal share link |
| `image` | `image()` | Optional cover art fallback shown before the iframe loads |
| `tags` | `string[]` | Optional |
| `draft` | `boolean` | Optional, defaults `false` |

`embedUrl` must already be an iframe-embeddable URL. The README will
document how to obtain one per platform:

- **Spotify**: Share → Embed track/album → copy the `src` from the
  generated `<iframe>` (looks like `https://open.spotify.com/embed/track/...`).
- **YouTube**: Share → Embed → copy the `src`
  (`https://www.youtube.com/embed/VIDEO_ID`).
- **SoundCloud**: use the "Share" → "Embed" panel, copy the `src` out
  of the provided `<iframe>` code.
- **Bandcamp**: use the track/album's "Share/Embed" link, copy the
  `src` out of the provided `<iframe>` code.

This avoids writing/maintaining per-provider URL-rewriting logic —
each entry just needs one correct URL, validated as a URL by the
schema, and rendered directly into an `<iframe src={embedUrl}>`.

## Pages & components

- **`src/pages/photos/index.astro`** — responsive CSS grid (no new
  dependency; native CSS `grid`) of thumbnails from the `photos`
  collection, sorted by `date` desc, filtered to `!draft`. Each
  thumbnail is a `<button>`/clickable element that opens a full-size
  lightbox overlay.
  - **Lightbox**: an autonomous custom element (e.g. `<photo-lightbox>`)
    plus a `<script>` in the page, following the exact vanilla-JS
    pattern used by `ThemeToggle.astro` / `ScrollToTop.astro` (query
    `data-*` hooks, no framework, no new dependency). Behavior: click
    thumbnail → overlay shows full image + caption; closes on Esc,
    click-on-backdrop, or a close button. Body scroll locked while
    open.
- **`src/pages/music/index.astro`** — vertical list, same structural
  pattern as `/blog` and `/projects` (`getCollection` → sort by `date`
  desc → map to a card component), filtered to `!draft`.
  - **`src/components/MusicCard.astro`** — modeled on
    `ProjectCard.astro`/`BlogCard.astro`'s layout conventions (autonomous
    custom elements for meta rows, same CSS custom-property usage):
    title, artist, formatted date, description, tags, and a lazy-loaded
    (`loading="lazy"`) `<iframe>` pointed at `embedUrl`. Cover `image`
    (if present) is used as a poster shown until the iframe is
    interacted with, or simply rendered above the iframe — implementation
    detail decided during coding, not a behavior change.

### Navigation (`src/consts.ts`)

```ts
export const NAVIGATION = [
  { href: "/blog", label: "Blog" },
  { href: "/photos", label: "Photos" },
  { href: "/music", label: "Music" },
  { href: "/projects", label: "Projects" },
]
```

(`/authors/[...id].astro` per-author profile pages and the byline/avatar
on posts keep working; only the `/authors` directory link is dropped
from nav — no change to `src/pages/authors/`.)

### Collection registration (`src/content.config.ts`)

Add `photos` and `music` collections following the `projects`
collection's exact shape, and export them from `collections`.

## Branding

- `SITE.title` → `"0x4142"`
- `SITE.description` → `"Bytes, light, and sound."`
- `SOCIALS` in `consts.ts` — replace template author's GitHub/Twitter/
  email links with the user's real ones (gathered at implementation
  time, not guessed).
- `src/content/authors/enscribe.md` replaced with the user's own
  author profile (name, bio, avatar, socials) — details gathered at
  implementation time.

## Content seeding & cleanup

- Remove template demo content: `src/content/blog/introducing-v2/`,
  `src/content/blog/v1-posts/`, `src/content/projects/project-a.md`,
  `project-b.md`, `project-c.md` (and `placeholder.png` if unused
  afterward).
- Leave one clearly-marked minimal placeholder entry in each of
  `blog`, `photos`, `music`, `projects` so the collections aren't
  empty (avoids edge cases in list pages) and so the user has a
  working frontmatter example to copy — each placeholder is easy to
  identify and delete once real content is added.

## Testing

- `astro check` and `bun run build` must both pass (validates the new
  Zod schemas against seeded content).
- Manual verification in `bun dev`:
  - `/photos` grid renders; click opens lightbox with correct image +
    caption; Esc, backdrop click, and close button all dismiss it;
    background scroll is locked while open.
  - `/music` list renders; embedded player actually loads and plays for
    at least one entry per supported platform used in seed content.
  - All `NAVIGATION` links resolve (`/blog`, `/photos`, `/music`,
    `/projects`).
  - RSS (`/rss.xml`) and sitemap generation still work (blog-only,
    should be unaffected by these changes).

## Out of scope

- Deployment/hosting configuration (adapter choice, `site` URL,
  custom domain) — deferred until the user picks a host.
- Per-photo permalink pages (grid + lightbox only, per decision above).
- Self-hosted audio files / native `<audio>` player.
- Any redesign of existing blog/projects/authors visual style — new
  pages match the existing design system's tokens and conventions,
  no new CSS framework or design language introduced.
