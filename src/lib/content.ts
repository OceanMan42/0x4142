import { SITE } from "@/consts"
import { getCollection, type CollectionEntry } from "astro:content"
import {
  feed,
  featuredSeries,
  type FeedItem,
  type Series,
} from "@/lib/series"

export type BlogFeedItem = FeedItem<CollectionEntry<"blog">>

export const pageTitle = (title: string) => `${title} | ${SITE.title}`

const WORDS_PER_MINUTE = 200

/** Estimates reading time (in whole minutes, minimum 1) from a post's raw Markdown body. */
export function readingTime(body: string): number {
  const text = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/:::\S*/g, " ")
    .replace(/[#>*_~`]/g, " ")

  const words = text.split(/\s+/).filter(Boolean)
  return Math.max(1, Math.round(words.length / WORDS_PER_MINUTE))
}

/** Every blog entry visible in this build: drafts only in dev. */
export async function getBlogEntries(): Promise<CollectionEntry<"blog">[]> {
  return getCollection("blog", ({ data }) => import.meta.env.DEV || !data.draft)
}

/** Posts and series parts, newest first. See `feed` in series.ts. */
export async function getFeed(): Promise<BlogFeedItem[]> {
  return feed(await getBlogEntries())
}

/** Projects, newest first by start date. Drafts are hidden everywhere. */
export async function getProjects(): Promise<CollectionEntry<"projects">[]> {
  const projects = await getCollection("projects", ({ data }) => !data.draft)
  return projects.sort(
    (a, b) =>
      (b.data.startDate?.getTime() ?? 0) - (a.data.startDate?.getTime() ?? 0),
  )
}

/** Series with released parts, most recently updated first. */
export async function getSeries(): Promise<Series<CollectionEntry<"blog">>[]> {
  return featuredSeries(await getBlogEntries())
}

export async function getCTFs(): Promise<CollectionEntry<"ctfs">[]> {
  const writeups = await getCollection("ctfs", ({ data }) => !data.draft)
  return writeups.sort((a, b) => b.data.date.getTime() - a.data.date.getTime())
}

export async function getTags(): Promise<Map<string, BlogFeedItem[]>> {
  const tags = new Map<string, BlogFeedItem[]>()
  for (const item of await getFeed()) {
    for (const tag of new Set(item.post.data.tags ?? [])) {
      const tagged = tags.get(tag)
      if (tagged) tagged.push(item)
      else tags.set(tag, [item])
    }
  }
  return new Map(
    [...tags].sort(
      ([a, postsA], [b, postsB]) =>
        postsB.length - postsA.length || a.localeCompare(b),
    ),
  )
}
