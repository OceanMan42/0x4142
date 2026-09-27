import { SITE } from "@/consts"
import { getFeed } from "@/lib/content"
import { feedTitle } from "@/lib/series"
import rss from "@astrojs/rss"
import type { APIContext } from "astro"

export async function GET(context: APIContext) {
  const items = await getFeed()
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    trailingSlash: false,
    items: items.map((item) => ({
      title: feedTitle(item),
      description: item.post.data.description,
      pubDate: item.post.data.date,
      link: `/blog/${item.post.id}`,
    })),
  })
}
