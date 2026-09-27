// A series is a post (`<series>/index.md`, the series home) with sibling
// Markdown files as its parts (`<series>/<part>.md`). Each part is its own
// page and is listed in the feed on its own.

type Entry = {
  id: string
  data: { title: string; date: Date; order?: number }
}

export type Part<T extends Entry> = { entry: T; number: number }

export type SeriesNav<T extends Entry> = {
  parent: T
  number: number
  prev: T
  next?: T
}

export type FeedItem<T extends Entry> = {
  post: T
  series?: { parent: T; number: number }
}

export const isPart = (id: string) => id.includes("/")

const seriesOf = (id: string) => id.split("/")[0]

/** A series' parts in reading order: by `order`, then by date. */
export function partsOf<T extends Entry>(
  entries: T[],
  parentId: string,
): Part<T>[] {
  return entries
    .filter(({ id }) => isPart(id) && seriesOf(id) === parentId)
    .sort(
      (a, b) =>
        (a.data.order ?? Infinity) - (b.data.order ?? Infinity) ||
        a.data.date.getTime() - b.data.date.getTime(),
    )
    .map((entry, i) => ({ entry, number: entry.data.order ?? i + 1 }))
}

/** Where a part sits in its series. Undefined unless the series home exists. */
export function seriesNav<T extends Entry>(
  entries: T[],
  id: string,
): SeriesNav<T> | undefined {
  if (!isPart(id)) return undefined
  const parent = entries.find((entry) => entry.id === seriesOf(id))
  if (!parent) return undefined
  const parts = partsOf(entries, parent.id)
  const i = parts.findIndex(({ entry }) => entry.id === id)
  return {
    parent,
    number: parts[i].number,
    prev: i > 0 ? parts[i - 1].entry : parent,
    next: parts[i + 1]?.entry,
  }
}

/**
 * Every post and every part whose series home exists, newest first. Entries
 * from the same day keep reading order, so a series home precedes its parts.
 */
export function feed<T extends Entry>(entries: T[]): FeedItem<T>[] {
  const items = entries.flatMap((post): FeedItem<T>[] => {
    if (!isPart(post.id)) return [{ post }]
    const nav = seriesNav(entries, post.id)
    return nav
      ? [{ post, series: { parent: nav.parent, number: nav.number } }]
      : []
  })
  return items.sort(
    (a, b) =>
      b.post.data.date.getTime() - a.post.data.date.getTime() ||
      (a.series?.number ?? 0) - (b.series?.number ?? 0),
  )
}

/** A feed item's title, with a part prefixed by its series and number. */
export function feedTitle<T extends Entry>({ post, series }: FeedItem<T>) {
  return series
    ? `${series.parent.data.title}, Part ${series.number}: ${post.data.title}`
    : post.data.title
}
