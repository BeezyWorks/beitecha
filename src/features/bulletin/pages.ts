import {
  type BulletinSection,
  LEGACY_BULLETIN_SECTIONS,
  type PrintSettings,
} from '@beitecha/engine'

type Layout = NonNullable<PrintSettings['layout']>

/** The sections an old combined one stands for, as far as `present` has them, in the automatic order. */
const LEGACY: Record<(typeof LEGACY_BULLETIN_SECTIONS)[number], (s: BulletinSection) => boolean> = {
  notices: (s) =>
    ['sponsors', 'simcha', 'condolence', 'announcements'].includes(s) ||
    s.startsWith('category:') ||
    s.startsWith('sponsors:'),
  remembrance: (s) => s === 'yahrzeits' || s === 'cholim',
  celebrations: (s) => s === 'birthdays' || s === 'anniversaries',
}

/** A layout with any old combined section replaced, in place and on its page, by the sections `known` has under it. */
export function expandLayout(layout: Layout, known: BulletinSection[]): Layout {
  const listed = new Set(layout.map((r) => r.section))
  return layout.flatMap((row) => {
    // A layout from before sponsors were split by what they sponsor: each group goes where the whole did.
    if (row.section === 'sponsors')
      return [
        ...known
          .filter((s) => s.startsWith('sponsors:') && !listed.has(s))
          .map((section) => ({ section, page: row.page })),
        row,
      ]
    const match = LEGACY[row.section as keyof typeof LEGACY]
    return match ? known.filter(match).map((section) => ({ section, page: row.page })) : [row]
  })
}

/**
 * The sections of a custom layout (`print.layout`) page by page. The listed sections that have something to print go
 * on their pages in the list's order; the rest follow in the automatic order (`present`'s), on the last page (the first
 * when nothing is listed). Pages come in numeric order, and empty ones are dropped.
 */
export function pagesOf(layout: Layout, present: BulletinSection[]): BulletinSection[][] {
  const pages = new Map<number, BulletinSection[]>()
  const placed = new Set<BulletinSection>()
  for (const { section, page } of expandLayout(layout, present)) {
    if (placed.has(section) || !present.includes(section)) continue
    placed.add(section)
    const n = Math.max(1, Math.floor(page))
    pages.set(n, [...(pages.get(n) ?? []), section])
  }
  const rest = present.filter((s) => !placed.has(s))
  if (rest.length > 0) {
    const last = Math.max(1, ...pages.keys())
    pages.set(last, [...(pages.get(last) ?? []), ...rest])
  }
  return [...pages.entries()].sort(([a], [b]) => a - b).map(([, sections]) => sections)
}
