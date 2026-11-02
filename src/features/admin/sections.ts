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
  | 'yahrzeits'
  | 'birthdays'
  | 'anniversaries'
  | 'display'
  | 'print'
  | 'shul'
  | 'team'

export const SECTION_GROUPS: { title?: string; sections: { key: SectionKey; label: string }[] }[] =
  [
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
        { key: 'yahrzeits', label: 'Yahrzeits' },
        { key: 'birthdays', label: 'Birthdays' },
        { key: 'anniversaries', label: 'Anniversaries' },
      ],
    },
    {
      title: 'Shul',
      sections: [
        { key: 'display', label: 'Lobby display' },
        { key: 'shul', label: 'Shul settings' },
        { key: 'team', label: 'Team & displays' },
      ],
    },
  ]

/** Under "See it" in the sidebar: the sheet as it prints. */
export const PRINT_SECTION = { key: 'print' as const, label: 'Print' }

export const SECTIONS = [...SECTION_GROUPS.flatMap((g) => g.sections), PRINT_SECTION]

export const isSection = (s: unknown): s is SectionKey => SECTIONS.some((x) => x.key === s)
