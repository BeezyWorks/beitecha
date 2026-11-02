/** The admin's sections, grouped in the sidebar by what a gabbai is doing. */
export type SectionKey =
  | 'week'
  | 'minyanim'
  | 'shiurim'
  | 'programs'
  | 'events'
  | 'zmanim'
  | 'sponsorships'
  | 'announcements'
  | 'cholim'
  | 'yahrzeits'
  | 'birthdays'
  | 'anniversaries'
  | 'display'
  | 'bulletin'
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
      ],
    },
    {
      title: 'Announcements',
      sections: [
        { key: 'sponsorships', label: 'Sponsorships' },
        { key: 'announcements', label: 'Announcements' },
        { key: 'cholim', label: 'Refuah shleimah' },
        { key: 'yahrzeits', label: 'Yahrzeits' },
        { key: 'birthdays', label: 'Birthdays' },
        { key: 'anniversaries', label: 'Anniversaries' },
      ],
    },
  ]

/** Under "See it" in the sidebar: the surfaces the schedule shows on. */
export const SEE_IT_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'display', label: 'Lobby display' },
  { key: 'bulletin', label: 'Bulletin' },
]

/** The last group in the sidebar. */
export const SETTINGS_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'shul', label: 'Shul settings' },
  { key: 'team', label: 'Team & displays' },
  { key: 'zmanim', label: 'Zmanim' },
]

export const SECTIONS = [
  ...SECTION_GROUPS.flatMap((g) => g.sections),
  ...SEE_IT_SECTIONS,
  ...SETTINGS_SECTIONS,
]

export const isSection = (s: unknown): s is SectionKey => SECTIONS.some((x) => x.key === s)
