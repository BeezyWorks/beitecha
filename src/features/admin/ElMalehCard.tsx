import { Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  elMalehNames,
  hebrewYearEnd,
  nextElMalehShabbos,
  type DateString,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { renderElMalehHtml } from './elMalehHtml'
import { useAdmin } from './store'
import { Segments } from '@/components/Segments'

const RANGES = [
  { key: 'week', label: 'Next Shabbos', days: 0 },
  { key: 'month', label: 'Month', days: 28 },
  { key: 'two', label: '2 months', days: 56 },
  { key: 'year', label: 'Year', days: 0 },
]

/** A sheet of the names for El Maleh Rachamim at Shabbos Mincha, under each Shabbos's parsha. */
export function ElMalehCard({ today }: { today: DateString }) {
  const schedule = useAdmin((s) => s.schedule)
  const shulName = useAdmin((s) => s.profile?.name.en) ?? ''
  const [range, setRange] = useState('week')
  if (!schedule) return null
  const choice = RANGES.find((r) => r.key === range)!
  const first = nextElMalehShabbos(today, schedule.settings.location.israel)
  const shabbosim = elMalehNames(
    schedule.yahrzeits,
    first,
    choice.key === 'year' ? hebrewYearEnd(first) : addDays(first, choice.days),
    schedule.settings,
  )
  const count = shabbosim.reduce((n, s) => n + s.names.length, 0)

  const print = () => {
    const html = renderElMalehHtml({
      shul: shulName,
      range: choice.label,
      shabbosim,
      language: schedule.settings.language === 'he' ? 'he' : 'en',
    })
    const hidden = document.createElement('iframe')
    hidden.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
    hidden.srcdoc = html
    hidden.onload = () => {
      hidden.contentWindow?.focus()
      hidden.contentWindow?.print()
      setTimeout(() => hidden.remove(), 60_000)
    }
    document.body.appendChild(hidden)
  }

  return (
    <Card gap="md">
      <Stack gap="xs">
        <Text variant="title">El Maleh Rachamim sheet</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Names to say at Mincha on Shabbos, under each parsha, starting from the next Shabbos that
          says Tzidkascha. A name goes on the last Shabbos before its yahrzeit where it is said, so
          those in a stretch without it are said on the Shabbos before it.
        </Text>
      </Stack>
      <Segments
        accessibilityLabel="How far ahead"
        options={RANGES.map((r) => ({ key: r.key, label: r.label }))}
        value={range}
        onChange={setRange}
      />
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {count} {count === 1 ? 'name' : 'names'} on {shabbosim.length}{' '}
        {shabbosim.length === 1 ? 'Shabbos' : 'Shabbosos'}
      </Text>
      <Stack direction="row">
        <Button variant="primary" title="Print" icon="print" onPress={print} />
      </Stack>
    </Card>
  )
}
