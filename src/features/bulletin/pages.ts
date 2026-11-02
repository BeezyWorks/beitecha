import { BULLETIN_SECTIONS, type BulletinSection, type PrintSettings } from '@beitecha/engine'

/**
 * The sections of a custom layout (`print.layout`) page by page. The listed sections that have something to print go
 * on their pages in the list's order; the rest follow in the automatic order, on the last page (the first when nothing
 * is listed). Pages come in numeric order, and empty ones are dropped.
 */
export function pagesOf(
  layout: NonNullable<PrintSettings['layout']>,
  present: BulletinSection[],
): BulletinSection[][] {
  const pages = new Map<number, BulletinSection[]>()
  const placed = new Set<BulletinSection>()
  for (const { section, page } of layout) {
    if (placed.has(section) || !present.includes(section)) continue
    placed.add(section)
    const n = Math.max(1, Math.floor(page))
    pages.set(n, [...(pages.get(n) ?? []), section])
  }
  const rest = BULLETIN_SECTIONS.filter((s) => present.includes(s) && !placed.has(s))
  if (rest.length > 0) {
    const last = Math.max(1, ...pages.keys())
    pages.set(last, [...(pages.get(last) ?? []), ...rest])
  }
  return [...pages.entries()].sort(([a], [b]) => a - b).map(([, sections]) => sections)
}
