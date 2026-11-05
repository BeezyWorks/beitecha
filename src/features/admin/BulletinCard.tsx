import { Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  BULLETIN_SECTIONS,
  type BulletinSection,
  BULLETIN_DAY_NAMES,
  DEFAULT_SHABBOS_ZMANIM,
  guessCategory,
  type EventDef,
  type Notice,
  type NoticeCategory,
  type PrintSettings,
  type ShulSettings,
  ZMAN_IDS,
  type ZmanKey,
} from '@beitecha/engine'
import React from 'react'

import { DragList } from '@/components/DragList'
import { Select } from '@/components/Select'
import { expandLayout } from '@/features/bulletin/pages'
import { zmanLabel } from './forms'

const ADD = ''

const SECTION_NAMES: Record<(typeof BULLETIN_SECTIONS)[number], string> = {
  shabbos: 'Shabbos',
  specialZmanim: 'Fast & Pesach zmanim',
  weekdays: 'Weekday minyanim',
  zmanimTable: 'Zmanim table',
  shiurim: 'Shiurim',
  programs: 'Programs',
  comingUp: 'Coming up',
  sponsors: 'Sponsors',
  simcha: 'Mazal tov',
  condolence: 'Condolences',
  announcements: 'Announcements',
  yahrzeits: 'Yahrzeits',
  cholim: 'Refuah shleimah',
  birthdays: 'Birthdays',
  anniversaries: 'Anniversaries',
  contact: 'Contact info',
}

/** What can be sponsored, each its own section: the announcements, the meals and anything with a sponsorship. */
export interface Sponsorable {
  section: BulletinSection
  name: string
}

export function sponsorables(events: EventDef[], notices: Notice[]): Sponsorable[] {
  const sponsored = new Set(
    notices.flatMap((n) => (n.kind === 'sponsor' && n.eventId ? [n.eventId] : [])),
  )
  return [
    { section: 'sponsors:announcements', name: 'Announcement sponsors' },
    ...events
      .filter((e) => sponsored.has(e.id) || guessCategory(e) === 'meal')
      .map((e) => ({
        section: `sponsors:event:${e.id}` as const,
        name: `${e.adminName ?? e.name.en} sponsors`,
      })),
  ]
}

interface Names {
  categories: NoticeCategory[]
  sponsoring: Sponsorable[]
}

const sectionName = (section: BulletinSection, { categories, sponsoring }: Names) =>
  section in SECTION_NAMES
    ? SECTION_NAMES[section as keyof typeof SECTION_NAMES]
    : (categories.find((c) => `category:${c.id}` === section)?.name.en ??
      sponsoring.find((x) => x.section === section)?.name ??
      section)

/** Every section, announcement categories and sponsorships included, in the automatic order. */
const allSections = ({ categories, sponsoring }: Names): BulletinSection[] => {
  const at = BULLETIN_SECTIONS.indexOf('announcements')
  const sp = BULLETIN_SECTIONS.indexOf('sponsors')
  return [
    ...BULLETIN_SECTIONS.slice(0, sp),
    ...sponsoring.map((x) => x.section),
    ...BULLETIN_SECTIONS.slice(sp, at),
    ...categories.map((c) => `category:${c.id}` as const),
    ...BULLETIN_SECTIONS.slice(at),
  ]
}

/** The automatic layout as a list: the times on the first page, the rest on the second. */
const autoLayout = (names: Names) =>
  allSections(names).map((section) => ({
    section,
    page: ['shabbos', 'specialZmanim', 'weekdays', 'zmanimTable'].includes(section) ? 1 : 2,
  }))
const PAGE_CHOICES = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Page ${n}` }))

const SHOWN: {
  key:
    | 'zmanimTable'
    | 'shiurim'
    | 'programs'
    | 'comingUp'
    | 'notices'
    | 'yahrzeits'
    | 'birthdays'
    | 'anniversaries'
    | 'cholim'
    | 'contact'
    | 'specialZmanim'
  label: string
  help: string
}[] = [
  {
    key: 'zmanimTable',
    label: 'Zmanim table',
    help: 'The week’s zmanim, day by day, on the front.',
  },
  { key: 'shiurim', label: 'Shiurim', help: 'The week’s shiurim.' },
  { key: 'programs', label: 'Programs', help: 'The week’s weekday programs, like mahjong.' },
  {
    key: 'comingUp',
    label: 'Coming up',
    help: 'Dated events a few weeks ahead, and any set to always.',
  },
  {
    key: 'notices',
    label: 'Sponsors & announcements',
    help: 'Including sponsors on minyanim and shiurim.',
  },
  { key: 'yahrzeits', label: 'Yahrzeits', help: 'Those kept this week.' },
  { key: 'birthdays', label: 'Birthdays', help: 'Those this week.' },
  { key: 'anniversaries', label: 'Anniversaries', help: 'Those this week.' },
  { key: 'cholim', label: 'Refuah shleimah', help: 'The list for the Mi Shebeirach.' },
  {
    key: 'contact',
    label: 'Contact info',
    help: 'The rabbi, rabbis emeritus, phones and emails from Shul settings.',
  },
  {
    key: 'specialZmanim',
    label: 'Fast & Pesach zmanim',
    help: 'Below Shabbos in weeks with a fast or Erev Pesach.',
  },
]

/** `layout` with its combined sections split up and the sections it leaves out added (after the rest, on the last page). */
function completeLayout(layout: NonNullable<PrintSettings['layout']>, names: Names) {
  const known = allSections(names)
  const rows = expandLayout(layout, known).filter((r) => known.includes(r.section))
  const last = Math.max(1, ...rows.map((r) => r.page))
  return [
    ...rows,
    ...known
      .filter((s) => !rows.some((r) => r.section === s))
      .map((section) => ({ section, page: last })),
  ]
}

/** the bulletin: whether it has the zmanim table, and which zmanim sit among the Shabbos minyanim. */
export function BulletinCard({
  settings,
  events,
  notices,
  onChange,
}: {
  settings: ShulSettings
  events: EventDef[]
  notices: Notice[]
  onChange: (settings: ShulSettings) => void
}) {
  const print = settings.print ?? {}
  const custom = settings.zmanim?.custom ?? []
  const picked = print.shabbosZmanim ?? DEFAULT_SHABBOS_ZMANIM
  const known = [...ZMAN_IDS, ...custom.map((c) => c.id)]
  const set = (patch: Partial<PrintSettings>) =>
    onChange({ ...settings, print: { ...print, ...patch } })
  const setDay = (day: 'friday' | 'shabbos', ids: ZmanKey[]) =>
    set({ shabbosZmanim: { ...picked, [day]: ids } })

  const column = (day: 'friday' | 'shabbos', label: string) => {
    // A custom zman that was since removed just drops out.
    const ids = picked[day].filter((id) => known.includes(id))
    return (
      <Stack gap="sm">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          {label}
        </Text>
        {ids.map((id) => (
          <Stack key={id} direction="row" align="center" gap="md">
            <Stack grow>
              <Text variant="body">{zmanLabel(id, custom)}</Text>
            </Stack>
            <Button
              variant="ghost"
              size="sm"
              title="Remove"
              onPress={() =>
                setDay(
                  day,
                  ids.filter((x) => x !== id),
                )
              }
            />
          </Stack>
        ))}
        <Select
          accessibilityLabel={`Add a zman to ${label}`}
          value={ADD}
          options={[
            { value: ADD, label: 'Add a zman…' },
            ...known
              .filter((id) => !ids.includes(id))
              .map((id) => ({ value: id, label: zmanLabel(id, custom) })),
          ]}
          onChange={(id) => id !== ADD && setDay(day, [...ids, id])}
        />
      </Stack>
    )
  }

  const names: Names = {
    categories: settings.noticeCategories ?? [],
    sponsoring: sponsorables(events, notices),
  }
  // A layout saved before the sections were split, and any section it doesn't list yet, shown as the rows they are.
  const layout = print.layout && completeLayout(print.layout, names)
  const move = (from: number, to: number) => {
    if (!layout) return
    const next = [...layout]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    set({ layout: next })
  }
  const setPage = (i: number, page: number) =>
    set({ layout: layout?.map((row, j) => (j === i ? { ...row, page } : row)) })

  return (
    <Card gap="md">
      <Text variant="sectionHeader">Bulletin: page layout</Text>
      <Stack direction="row" align="center" gap="md">
        <Stack grow>
          <Text variant="body">Choose what goes on each page</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Off: the times go on the front and the announcements behind.
          </Text>
        </Stack>
        <ToggleSwitch
          value={!!layout}
          onValueChange={(on) => set({ layout: on ? autoLayout(names) : undefined })}
          accessibilityLabel="Choose what goes on each page"
        />
      </Stack>
      {layout && (
        <>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Each section goes on its page, top to bottom in this order. Drag to reorder. A section
            with nothing to show that week, or a page left empty, is skipped. Content shrinks to fit
            its page.
          </Text>
          <DragList onMove={move}>
            {layout.map((row, i) => (
              <Stack key={row.section} direction="row" align="center" gap="md">
                <Stack grow>
                  <Text variant="body">{sectionName(row.section, names)}</Text>
                </Stack>
                <Select
                  accessibilityLabel={`Page for ${sectionName(row.section, names)}`}
                  value={String(row.page)}
                  options={PAGE_CHOICES}
                  onChange={(v) => setPage(i, Number(v))}
                />
              </Stack>
            ))}
          </DragList>
        </>
      )}
      <Text variant="sectionHeader">Bulletin: what to show</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        What goes on the sheet. Anything with nothing to show that week is left out anyway.
      </Text>
      {SHOWN.map(({ key, label, help }) => (
        <Stack key={key} direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">{label}</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {help}
            </Text>
          </Stack>
          <ToggleSwitch
            value={print[key] !== false}
            onValueChange={(on) => set({ [key]: on ? undefined : false })}
            accessibilityLabel={label}
          />
        </Stack>
      ))}
      <Text variant="sectionHeader">Bulletin: days named in the headings</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Turn off the days you don’t want named above the weekday columns. The days still print.
      </Text>
      {BULLETIN_DAY_NAMES.map(({ key, label }) => {
        const hidden = print.hideDays ?? []
        return (
          <Stack key={key} direction="row" align="center" gap="md">
            <Stack grow>
              <Text variant="body">{label}</Text>
            </Stack>
            <ToggleSwitch
              value={!hidden.includes(key)}
              onValueChange={(on) => {
                const next = on ? hidden.filter((k) => k !== key) : [...hidden, key]
                set({ hideDays: next.length ? next : undefined })
              }}
              accessibilityLabel={label}
            />
          </Stack>
        )
      })}
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Zmanim listed among the Shabbos minyanim, each at its time. A hidden zman still shows here,
        so you can hide the built-in havdalah and list a zman of your own instead.
      </Text>
      {column('friday', 'Friday night')}
      {column('shabbos', 'Shabbos day')}
    </Card>
  )
}
