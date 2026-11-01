import type { DaySchedule, Notice } from '@beitecha/engine'

import type { useT } from './language'

type T = ReturnType<typeof useT>

/** A sponsorship with a sponsor named: shown as their name in bold, the dedication (if any) under it. */
export const hasSponsor = (n: Notice) => n.kind === 'sponsor' && !!n.sponsoredBy

export interface SponsorGroup {
  key: string
  /** "Kiddush Sponsors", "Announcement Sponsors". */
  title: string
  sponsors: Notice[]
}

/**
 * The sponsorships under one heading per thing sponsored: each event (by its name) and, together, the announcements
 * and the day. Those without a named sponsor are left for the caller to show as they were written.
 */
export function sponsorGroups(t: T, notices: Notice[], days: DaySchedule[]): SponsorGroup[] {
  const names = new Map<string, string>()
  for (const d of days)
    for (const e of d.events) if (!names.has(e.eventId)) names.set(e.eventId, t.text(e.name))
  const groups = new Map<string, SponsorGroup>()
  for (const n of notices) {
    if (!hasSponsor(n)) continue
    const event = n.eventId ? names.get(n.eventId) : undefined
    const key = event ? `event:${n.eventId}` : 'announcements'
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, title: event ?? '', sponsors: [] }))
    g.sponsors.push(n)
  }
  return [...groups.values()].map((g) => ({
    ...g,
    title:
      g.key === 'announcements'
        ? t.rtl
          ? t.s.sponsorships
          : 'Announcement Sponsors'
        : t.rtl
          ? g.title
          : `${g.title} ${g.sponsors.length > 1 ? 'Sponsors' : 'Sponsor'}`,
  }))
}
