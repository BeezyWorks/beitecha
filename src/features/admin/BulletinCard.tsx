import { Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  BULLETIN_SECTIONS,
  type BulletinSection,
  DEFAULT_SHABBOS_ZMANIM,
  type PrintSettings,
  type ShulSettings,
  ZMAN_IDS,
  type ZmanKey,
} from '@beitecha/engine'
import React from 'react'

import { Select } from '@/components/Select'
import { zmanLabel } from './forms'

const ADD = ''

const SECTION_NAMES: Record<BulletinSection, string> = {
  shabbos: 'Shabbos',
  specialZmanim: 'Fast & Pesach zmanim',
  notices: 'Sponsors & announcements',
  weekdays: 'Weekday minyanim',
  zmanimTable: 'Zmanim table',
  shiurim: 'Shiurim',
  comingUp: 'Coming up',
  remembrance: 'Yahrzeits & refuah shleimah',
  celebrations: 'Birthdays & anniversaries',
  contact: 'Contact info',
}

/** The automatic layout as a list: the times on the first page, the rest on the second. */
const AUTO_LAYOUT: { section: BulletinSection; page: number }[] = BULLETIN_SECTIONS.map(
  (section) => ({
    section,
    page: ['shabbos', 'specialZmanim', 'weekdays', 'zmanimTable'].includes(section) ? 1 : 2,
  }),
)
const PAGE_CHOICES = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `Page ${n}` }))

const SHOWN: {
  key:
    | 'zmanimTable'
    | 'shiurim'
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

/** the bulletin: whether it has the zmanim table, and which zmanim sit among the Shabbos minyanim. */
export function BulletinCard({
  settings,
  onChange,
}: {
  settings: ShulSettings
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

  const layout = print.layout
  const move = (i: number, by: number) => {
    if (!layout) return
    const next = [...layout]
    const [item] = next.splice(i, 1)
    next.splice(i + by, 0, item)
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
          onValueChange={(on) => set({ layout: on ? AUTO_LAYOUT : undefined })}
          accessibilityLabel="Choose what goes on each page"
        />
      </Stack>
      {layout && (
        <>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Each section goes on its page, top to bottom in this order. A section with nothing to
            show that week, or a page left empty, is skipped. Content shrinks to fit its page.
          </Text>
          {layout.map((row, i) => (
            <Stack key={row.section} direction="row" align="center" gap="md">
              <Stack grow>
                <Text variant="body">{SECTION_NAMES[row.section]}</Text>
              </Stack>
              <Select
                accessibilityLabel={`Page for ${SECTION_NAMES[row.section]}`}
                value={String(row.page)}
                options={PAGE_CHOICES}
                onChange={(v) => setPage(i, Number(v))}
              />
              <Button
                variant="ghost"
                size="sm"
                title="Up"
                disabled={i === 0}
                onPress={() => move(i, -1)}
              />
              <Button
                variant="ghost"
                size="sm"
                title="Down"
                disabled={i === layout.length - 1}
                onPress={() => move(i, 1)}
              />
            </Stack>
          ))}
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
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Zmanim listed among the Shabbos minyanim, each at its time. A hidden zman still shows here,
        so you can hide the built-in havdalah and list a zman of your own instead.
      </Text>
      {column('friday', 'Friday night')}
      {column('shabbos', 'Shabbos day')}
    </Card>
  )
}
