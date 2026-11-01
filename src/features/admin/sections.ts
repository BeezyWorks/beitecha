/** The admin's sections, grouped in the sidebar by what a gabbai is doing. */
export type SectionKey =
  | 'week'
  | 'minyanim'
  | 'shiurim'
  | 'programs'
  | 'events'
  | 'zmanim'
  | 'notices'
  | 'cholim'
  | 'shul'
  | 'team'

export const SECTION_GROUPS: { title?: string; sections: { key: SectionKey; label: string }[] }[] = [
  { sections: [{ key: 'week', label: 'This week' }] },
  {
    title: 'Schedule',
    sections: [
      { key: 'minyanim', label: 'Minyanim' },
      { key: 'shiurim', label: 'Shiurim' },
      { key: 'programs', label: 'Kiddush & programs' },
      { key: 'events', label: 'Dates & events' },
      { key: 'zmanim', label: 'Zmanim' },
    ],
  },
  {
    title: 'Announcements',
    sections: [
      { key: 'notices', label: 'Sponsors & notices' },
      { key: 'cholim', label: 'Refuah shleimah' },
    ],
  },
  {
    title: 'Shul',
    sections: [
      { key: 'shul', label: 'Shul settings' },
      { key: 'team', label: 'Team & displays' },
    ],
  },
]

export const SECTIONS = SECTION_GROUPS.flatMap((g) => g.sections)

export const isSection = (s: unknown): s is SectionKey => SECTIONS.some((x) => x.key === s)
