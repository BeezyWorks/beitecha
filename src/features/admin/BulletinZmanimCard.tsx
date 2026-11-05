import { Button, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  DEFAULT_SHABBOS_ZMANIM,
  type PrintSettings,
  type ShulSettings,
  ZMAN_IDS,
  type ZmanKey,
} from '@beitecha/engine'
import React from 'react'

import { Select } from '@/components/Select'
import { CollapsibleCard } from './CollapsibleCard'
import { zmanLabel } from './forms'

const ADD = ''

/** The bulletin's zmanim listed among the Shabbos minyanim, each at its time. */
export function BulletinZmanimCard({
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
    <CollapsibleCard id="bulletin-card-zmanim" title="Highlighted Zmanim">
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Zmanim listed among the Shabbos minyanim, each at its time. A hidden zman still shows here,
        so you can hide the built-in havdalah and list a zman of your own instead.
      </Text>
      {column('friday', 'Friday night')}
      {column('shabbos', 'Shabbos day')}
    </CollapsibleCard>
  )
}
