# 0x4142

Personal site: security write-ups, CTF write-ups, and projects.
Built with [Astro](https://astro.build/) on top of
[astro-erudite](https://github.com/jktrn/astro-erudite), an unstyled static
blogging template with no UI framework and native CSS.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open `http://localhost:4321`. Other commands:

   | Command                | Description                                       |
   | ----------------------- | -------------------------------------------------- |
   | `npm run build`         | Type-check (`astro check`) and build to `dist/`    |
   | `npm run preview`       | Serve the production build locally                 |
   | `npm run astro`         | Run Astro CLI commands                              |
   | `npm run format`        | Format all files with [Biome](https://biomejs.dev/) |
   | `npm run format:check`  | Check formatting without writing                    |

### Site configuration

`src/consts.ts` holds site metadata, nav links, and social links:

```ts
export const SITE = {
  title: "0x4142",
  description: "Security write-ups, CTF write-ups, and projects by 0x4142.",
  tagline: "",
  locale: "en-US",
  dir: "ltr",
  defaultPageImage: "/static/og-default.png",
  defaultPostImage: "/static/og-default.png",
} as const

export const NAVIGATION = [
  { href: "/blog", label: "Blog" },
  // ...
]

export const SOCIALS: { href: string; label: string; icon: SvgComponent }[] = [
  { href: "https://github.com/OceanMan42", label: "GitHub", icon: GitHub },
  // ...
]
```

The production URL is set in `astro.config.ts` as the `site` field, used for
the sitemap, RSS feed, and canonical URLs.

### Color palette

Colors are defined in `src/styles/color.css` using the
[Radix Colors](https://www.radix-ui.com/colors) scales. Each step carries a
light/dark pair via [`light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/light-dark)
and the semantic tokens point at the scale, so the site respects system
preference out of the box and the theme toggle only stores an override:

```css
:root {
  --gray-1:  light-dark(#fcfcfc, #111111);
  /* ... */
  --gray-12: light-dark(#202020, #eeeeee);

  --background:       var(--gray-1);
  --foreground:       var(--gray-12);
  --muted-foreground: var(--gray-11);
  --border:           var(--gray-6);
  /* ... */

  color-scheme: light dark;
}
```

### Favicons

The favicon is a `#_` root prompt drawn from plain rectangles, so it doesn't
depend on any installed font. `public/favicon.svg` is the source; the sidebar
logo `src/assets/logo.svg` uses the same shapes without the tile and follows
the text color. The other icons are exported from it:

```sh
rsvg-convert -w 96 -h 96 public/favicon.svg -o public/favicon-96x96.png
for s in 16 32 48; do rsvg-convert -w $s -h $s public/favicon.svg -o /tmp/ico-$s.png; done
magick /tmp/ico-16.png /tmp/ico-32.png /tmp/ico-48.png public/favicon.ico
```

`apple-touch-icon.png` (180px) and the `web-app-manifest-*.png` icons use a
full-bleed square tile with the glyph scaled to 80% and 70% respectively, so
it stays inside the rounded and maskable safe zones.

### Default social image

`public/static/og-default.png` (1200 &times; 630) is the Open Graph image used
for pages, and for posts and CTF write-ups without their own `image`. Its
source is `docs/og-default.svg`. After editing the SVG, regenerate the PNG:

```sh
rsvg-convert -w 1200 -h 630 docs/og-default.svg -o public/static/og-default.png
```

## Adding content

### Blog posts

Add posts as Markdown files in `src/content/blog/`, either a bare
`your-post.md` or a `your-post/index.md` folder (which lets you colocate
assets). Frontmatter:

```yml
---
title: "Your Post Title"
description: "A brief description of your post!"
date: 2026-01-01
authors:
  - "0x4142"
image: ./assets/banner.png
tags:
  - tag1
  - tag2
---
```

| Field         | Type (Zod)               | Requirements                                                                                                                                                | Required |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `title`       | `string`                 | Should be ≤60 characters.                                                                                                                                     | Yes      |
| `description` | `string`                 | Should be ≤155 characters.                                                                                                                                    | Yes      |
| `date`        | `coerce.date()`          | Must be in `YYYY-MM-DD` format.                                                                                                                               | Yes      |
| `order`       | `number`                 | Sort order for subposts within a series. Defaults to `0` if not provided.                                                                                     | Optional |
| `tags`        | `string[]`               | Preferably use kebab-case for these.                                                                                                                          | Optional |
| `authors`     | `reference("authors")[]` | Each entry must match the id of a file in `src/content/authors/` (e.g. `jane-doe.md` → `jane-doe`). Validated at build time.                                  | Yes      |
| `image`       | `image()`                | Should be exactly 1200px &times; 630px.                                                                                                                       | Optional |
| `draft`       | `boolean`                | Defaults to `false`. A `_`-prefixed filename also hides a post from the content loader entirely.                                                              | Optional |

> [!WARNING]
> Since the site's name looks like a hex number (as `0x4142` does), quote it
> whenever it appears as a YAML value (e.g. `authors: - "0x4142"`), or the
> YAML parser will read it as the integer `16706` instead of the string
> `"0x4142"`, and the build will fail with a schema validation error.

#### Subposts

A post becomes a series by nesting sibling Markdown files next to its
`index.md`:

```
src/content/blog/
├── a-standalone-post.md
└── my-series/
    ├── index.md
    ├── getting-started.md
    └── going-further.md
```

The series renders as one continuous scrollable document, with the address
bar syncing as you scroll between parts; every subpost still gets its own URL
(`/blog/my-series/getting-started`). Use `order` to control sequence. Only one
level of nesting is supported.

#### Markdown extensions

- Callouts use directive syntax with five variants (`note`, `tip`, `warning`,
  `caution`, `important`), rendered as collapsible `<details>`. Append
  `{closed}` to start one collapsed:

  ```markdown
  :::note[An optional custom title]
  Hello, world!
  :::
  ```

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
  missing or invalid capture fails `npm run dev` and `npm run build` at
  startup. Astro's content cache only tracks the `.md` files, so both
  scripts pass `--force` to re-render every post from the current captures.
  After re-capturing, restart `npm run dev` to pick up the new files.

- Math is written as `$inline$` or `$$display$$` LaTeX, rendered to MathML at
  build time.
- Inline code ending in an annotation gets syntax highlighting:
  `` `const x = 1{:ts}` `` highlights as TypeScript, and `` `text{:.string}` ``
  paints with the theme's color for a TextMate scope.
- Raw HTML/SVG in the Markdown body passes through untouched, which is how
  the hand-drawn diagrams in longer write-ups are built.

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

### Authors

Add author profiles in `src/content/authors/` as Markdown files. A file named
`[author-name].md` is referenced from a post's `authors` field by its id
(`"author-name"`):

```yml
---
name: "0x4142"
avatar: "https://github.com/OceanMan42.png"
bio: "Security write-ups, CTFs, and projects."
mail: "banurag97@gmail.com"
socials:
  github: "https://github.com/OceanMan42"
---
```

| Field      | Type (Zod)                          | Requirements                                                          | Required |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------- | -------- |
| `name`     | `string`                             | n/a                                                                     | Yes      |
| `pronouns` | `string`                             | n/a                                                                     | Optional |
| `avatar`   | `url()` or `string.startsWith("/")`  | A valid URL or a path starting with `/`.                                | Yes      |
| `bio`      | `string`                             | n/a                                                                     | Optional |
| `mail`     | `email()`                            | Must be a valid email address.                                          | Optional |
| `socials`  | `record(string, url())`              | A map of any label to a valid URL, matched to an icon in `SocialIcons.astro`. | Optional |

### CTFs

Add write-ups in `src/content/ctfs/` as Markdown files. Each file gets its
own page at `/ctfs/[id]` with the same table of contents, reading time, and
scroll progress bar as blog posts.

```yml
---
title: "baby-rop"
description: "A ret2libc chain through a 32-byte stack buffer."
date: 2026-01-01
event: "Example CTF 2026"
category: "pwn"
difficulty: "medium"
placement: "Solved"
authors:
  - "0x4142"
tags:
  - rop
  - x86-64
---
```

| Field         | Type (Zod)               | Requirements                                                             | Required |
| ------------- | ------------------------ | --------------------------------------------------------------------------- | -------- |
| `title`       | `string`                 | Usually the challenge name.                                                  | Yes      |
| `description` | `string`                 | n/a                                                                          | Yes      |
| `date`        | `coerce.date()`          | Must be in `YYYY-MM-DD` format.                                              | Yes      |
| `event`       | `string`                 | The CTF/competition name.                                                    | Yes      |
| `category`    | `string`                 | e.g. `pwn`, `web`, `crypto`, `rev`, `forensics`.                              | Yes      |
| `difficulty`  | `string`                 | Freeform, e.g. `easy` or a point value.                                      | Optional |
| `placement`   | `string`                 | e.g. `Solved`, `1st place`, `Unsolved (writeup after)`.                       | Optional |
| `tags`        | `string[]`               | Preferably kebab-case.                                                        | Optional |
| `authors`     | `reference("authors")[]` | Same rules as blog posts.                                                     | Yes      |
| `image`       | `image()`                | Should be exactly 1200px &times; 630px.                                      | Optional |
| `draft`       | `boolean`                | Defaults to `false`.                                                         | Optional |

### Projects

Add projects in `src/content/projects/` as Markdown files. Each file becomes
one entry on `/projects`, linking out to the project itself.

```yml
---
name: "Project name"
description: "One or two sentences on what it does."
link: "https://github.com/OceanMan42/project"
image: ./assets/screenshot.png
tags:
  - rust
startDate: 2026-01-01
---
```

| Field         | Type (Zod)      | Requirements                                                         | Required |
| ------------- | ---------------- | --------------------------------------------------------------------- | -------- |
| `name`        | `string`         | n/a                                                                    | Yes      |
| `description` | `string`         | n/a                                                                    | Yes      |
| `link`        | `url()`          | Where the entry links to. Its hostname is shown in the card.           | Yes      |
| `tags`        | `string[]`       | Preferably kebab-case.                                                 | Optional |
| `image`       | `image()`        | Shown beside the entry; ideally 1200px &times; 630px.                  | Optional |
| `startDate`   | `coerce.date()`  | Must be in `YYYY-MM-DD` format. Controls sort order (newest first).    | Optional |
| `endDate`     | `coerce.date()`  | Omit for ongoing projects (shown as "Present").                        | Optional |

### Hidden sections: Photos and Music

Photos and Music are currently hidden. Their collections and components are
kept, but their pages live in `src/pages/_photos/` and `src/pages/_music/`,
and Astro does not build routes from `_`-prefixed folders. To bring one back:

1. Rename the folder to drop the underscore (e.g. `git mv src/pages/_photos src/pages/photos`).
2. Add its link back to `NAVIGATION` in `src/consts.ts`.

### Photos

Add photos in `src/content/photos/` as Markdown files. Each file is one photo
shown in the `/photos` grid; clicking a thumbnail opens it full-size in a
lightbox with its caption.

```yml
---
title: "Golden hour, Lisbon"
description: "Shot from the hill above Alfama, October."
date: 2026-01-01
image: ./assets/photo.jpg
tags:
  - travel
---
```

| Field         | Type (Zod)      | Requirements                                                        | Required |
| ------------- | ---------------- | -------------------------------------------------------------------- | -------- |
| `title`       | `string`         | Shown as the image's alt text and lightbox caption fallback.          | Yes      |
| `description` | `string`         | Shown as the lightbox caption, if present.                            | Optional |
| `date`        | `coerce.date()`  | Must be in `YYYY-MM-DD` format. Controls sort order (newest first).   | Yes      |
| `image`       | `image()`        | The photo file itself.                                                | Yes      |
| `tags`        | `string[]`       | Preferably kebab-case.                                                 | Optional |
| `draft`       | `boolean`        | Defaults to `false`.                                                   | Optional |

### Music

Add tracks in `src/content/music/` as Markdown files. Each file becomes one
entry on `/music` with an embedded player.

`embedUrl` must be the platform's **embed-flavored** URL, not a normal share
link: the page renders it directly into an `<iframe src={embedUrl}>` with no
per-provider processing:

- **Spotify**: Share → Embed track/album → copy the `src` from the generated
  `<iframe>` (`https://open.spotify.com/embed/track/...`).
- **YouTube**: Share → Embed → copy the `src`
  (`https://www.youtube.com/embed/VIDEO_ID`).
- **SoundCloud**: Share → Embed panel, copy the `src` out of the `<iframe>`.
- **Bandcamp**: the track/album's Share/Embed link, copy the `src` out of the
  `<iframe>`.

```yml
---
title: "Track title"
artist: "Artist name"
description: "A short note about the track."
date: 2026-01-01
embedUrl: "https://open.spotify.com/embed/track/xxxxxxxxxxxxxxxxxxxxxx"
image: ./assets/cover.jpg
tags:
  - demo
---
```

| Field         | Type (Zod)      | Requirements                                                        | Required |
| ------------- | ---------------- | ---------------------------------------------------------------------- | -------- |
| `title`       | `string`         | n/a                                                                     | Yes      |
| `artist`      | `string`         | Omitted from display if not provided.                                  | Optional |
| `description` | `string`         | n/a                                                                     | Optional |
| `date`        | `coerce.date()`  | Must be in `YYYY-MM-DD` format. Controls sort order (newest first).     | Yes      |
| `embedUrl`    | `url()`          | Must be an embed-flavored URL, see the platform notes above.           | Yes      |
| `image`       | `image()`        | Optional cover art shown above the player.                              | Optional |
| `tags`        | `string[]`       | Preferably kebab-case.                                                  | Optional |
| `draft`       | `boolean`        | Defaults to `false`.                                                   | Optional |

## License

Built on [astro-erudite](https://github.com/jktrn/astro-erudite) by
[enscribe](https://enscribe.dev), open source under the [MIT License](LICENSE).
