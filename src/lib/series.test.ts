import { describe, expect, it } from "vitest"
import {
  feed,
  featuredSeries,
  feedTitle,
  isPart,
  partsOf,
  seriesNav,
} from "./series"

const entry = (id: string, date: string, order?: number) => ({
  id,
  data: { title: id.toUpperCase(), date: new Date(date), order },
})

const intro = entry("re", "2026-09-26")
const one = entry("re/one", "2026-09-26", 1)
const two = entry("re/two", "2026-10-10", 2)
const three = entry("re/three", "2026-10-24", 3)
const solo = entry("solo", "2026-10-01")
const orphan = entry("gone/part", "2026-10-02", 1)
const all = [three, solo, intro, orphan, one, two]

describe("isPart", () => {
  it("is true only for entries nested under a series", () => {
    expect(isPart("re/one")).toBe(true)
    expect(isPart("re")).toBe(false)
  })
})

describe("partsOf", () => {
  it("returns a series' parts in order, numbered by their order field", () => {
    expect(partsOf(all, "re")).toEqual([
      { entry: one, number: 1 },
      { entry: two, number: 2 },
      { entry: three, number: 3 },
    ])
  })

  it("falls back to position, then date, when order is missing", () => {
    const a = entry("s/a", "2026-01-02")
    const b = entry("s/b", "2026-01-01")
    expect(partsOf([a, b], "s").map((p) => [p.entry.id, p.number])).toEqual([
      ["s/b", 1],
      ["s/a", 2],
    ])
  })

  it("is empty for a post that is not a series", () => {
    expect(partsOf(all, "solo")).toEqual([])
  })
})

describe("seriesNav", () => {
  it("links the first part back to the series home", () => {
    const nav = seriesNav(all, "re/one")
    expect(nav?.parent).toBe(intro)
    expect(nav?.number).toBe(1)
    expect(nav?.prev).toBe(intro)
    expect(nav?.next).toBe(two)
  })

  it("has no next part after the last one", () => {
    const nav = seriesNav(all, "re/three")
    expect(nav?.prev).toBe(two)
    expect(nav?.next).toBeUndefined()
  })

  it("is undefined for a part whose series home is not published", () => {
    expect(seriesNav(all, "gone/part")).toBeUndefined()
  })

  it("is undefined for a top-level post", () => {
    expect(seriesNav(all, "solo")).toBeUndefined()
  })
})

describe("feed", () => {
  it("lists posts and parts newest first, in reading order on the same day", () => {
    expect(feed(all).map((item) => item.post.id)).toEqual([
      "re/three",
      "re/two",
      "solo",
      "re",
      "re/one",
    ])
  })

  it("tags each part with its series and number", () => {
    const item = feed(all).find((i) => i.post.id === "re/two")
    expect(item?.series).toEqual({ parent: intro, number: 2 })
    expect(feed(all).find((i) => i.post.id === "solo")?.series).toBeUndefined()
  })

  it("leaves out parts whose series home is not published", () => {
    expect(feed(all).some((item) => item.post.id === "gone/part")).toBe(false)
  })
})

describe("feedTitle", () => {
  it("prefixes a part with its series and number", () => {
    const item = feed(all).find((i) => i.post.id === "re/one")
    expect(item && feedTitle(item)).toBe("RE, Part 1: RE/ONE")
  })

  it("leaves other posts as they are", () => {
    expect(feedTitle({ post: solo })).toBe("SOLO")
  })
})

describe("featuredSeries", () => {
  it("lists series with released parts, most recently updated first", () => {
    const other = entry("other", "2026-11-01")
    const otherPart = entry("other/p", "2026-11-02", 1)
    const series = featuredSeries([...all, other, otherPart])
    expect(series.map(({ parent }) => parent.id)).toEqual(["other", "re"])
    expect(series[1].parts.map(({ entry }) => entry.id)).toEqual([
      "re/one",
      "re/two",
      "re/three",
    ])
  })

  it("leaves out posts without parts and series without a home", () => {
    const ids = featuredSeries(all).map(({ parent }) => parent.id)
    expect(ids).toEqual(["re"])
  })
})
