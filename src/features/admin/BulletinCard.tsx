import { Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
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

  return (
    <Card gap="md">
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
