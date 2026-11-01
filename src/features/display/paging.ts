/**
 * Splits items of known `heights` into pages that fit `avail` px, `sep` between neighbours. An item flagged in
 * `keep` (a heading) is never a page's last: it goes over with the one after it. Everything is one page until the room is measured.
 */
export function paginate(
  heights: number[],
  avail: number,
  sep = 0,
  keep: boolean[] = [],
): number[][] {
  if (!heights.length) return []
  if (avail <= 0) return [heights.map((_, i) => i)]
  const pages: number[][] = []
  let page: number[] = []
  let used = 0
  heights.forEach((h, i) => {
    const add = h + (page.length ? sep : 0)
    if (page.length && used + add > avail) {
      // Headings at the foot of the page go over with what they head.
      let from = page.length
      while (from > 1 && keep[page[from - 1]]) from--
      const moved = page.splice(from)
      pages.push(page)
      page = [...moved, i]
      used = page.reduce((sum, n, k) => sum + heights[n] + (k ? sep : 0), 0)
    } else {
      page.push(i)
      used += add
    }
  })
  pages.push(page)
  return pages
}

/** Where to cut a list of `heights` in two columns so the taller is as short as it can be, never right after a `keep`. */
export function splitColumns(heights: number[], keep: boolean[] = []): number {
  const total = heights.reduce((a, b) => a + b, 0)
  let best = heights.length
  let bestHeight = Infinity
  let before = 0
  for (let i = 1; i < heights.length; i++) {
    before += heights[i - 1]
    if (keep[i - 1]) continue
    const taller = Math.max(before, total - before)
    if (taller < bestHeight) {
      best = i
      bestHeight = taller
    }
  }
  return best
}
