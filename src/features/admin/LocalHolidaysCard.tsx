import {
  Button,
  Card,
  SegmentedControl,
  SemanticColor,
  Stack,
  Text,
  ToggleSwitch,
} from '@beezyworks/design'
import {
  builtInHolidays,
  CIVIL_CALENDARS,
  type CivilCalendar,
  civilCalendarOf,
  type LocalHoliday,
  type LocalHolidayDate,
  type ShulSettings,
  type Weekday,
  WEEKDAYS,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { NumberField } from '@/components/NumberField'
import { Select } from '@/components/Select'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const NTH = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', '-1': 'last' } as const

export function describeLocalDate(d: LocalHolidayDate): string {
  if ('on' in d) return d.on.join(', ') || 'No dates yet'
  if ('easter' in d) return 'Moves each year'
  if ('nth' in d)
    return `The ${NTH[String(d.nth) as keyof typeof NTH]} ${WEEKDAYS[d.weekday].en} of ${MONTHS[d.month - 1]}`
  if ('weekdayBefore' in d)
    return `The ${WEEKDAYS[d.weekdayBefore].en} before ${MONTHS[d.month - 1]} ${d.day}`
  const observed =
    d.observed === 'nearest'
      ? ' (weekend → nearest weekday)'
      : d.observed === 'next'
        ? ' (weekend → next free weekday)'
        : ''
  return `${MONTHS[d.month - 1]} ${d.day}${observed}`
}

type Shape = 'date' | 'weekday' | 'easter'

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * The civil holidays rules can use ("federal holidays start late"). The app knows the US and UK
 * calendars; the shul picks which days count and can add its own.
 */
export function LocalHolidaysCard({
  settings,
  onChange,
}: {
  settings: ShulSettings
  onChange: (s: ShulSettings) => void
}) {
  const holidays = settings.localHolidays ?? []
  const builtIn = builtInHolidays(settings)
  const ignored = settings.ignoredHolidays ?? []
  const setHolidays = (localHolidays: LocalHoliday[]) =>
    onChange({ ...settings, localHolidays: localHolidays.length ? localHolidays : undefined })
  const toggleBuiltIn = (id: string, counts: boolean) => {
    const next = counts ? ignored.filter((x) => x !== id) : [...ignored, id]
    onChange({ ...settings, ignoredHolidays: next.length ? next : undefined })
  }
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [shape, setShape] = useState<Shape>('date')
  const [month, setMonth] = useState(1)
  const [day, setDay] = useState<number | undefined>(1)
  const [observed, setObserved] = useState<'none' | 'nearest' | 'next'>('none')
  const [weekday, setWeekday] = useState<Weekday>(1)
  const [nth, setNth] = useState<1 | 2 | 3 | 4 | -1>(1)
  const [easter, setEaster] = useState<number | undefined>(0)

  const date = (): LocalHolidayDate | null => {
    if (shape === 'easter') return easter === undefined ? null : { easter }
    if (shape === 'weekday') return { month, weekday, nth }
    if (day === undefined || day < 1 || day > 31) return null
    return { month, day, ...(observed === 'none' ? {} : { observed }) }
  }
  const built = date()
  const take = (id: string) => {
    let unique = id || 'holiday'
    for (let n = 2; [...holidays, ...builtIn].some((h) => h.id === unique); n++)
      unique = `${id || 'holiday'}-${n}`
    return unique
  }
  const add = () => {
    if (!name.trim() || !built) return
    setHolidays([...holidays, { id: take(slug(name)), name: { en: name.trim() }, date: built }])
    setName('')
    setAdding(false)
  }

  return (
    <Card gap="md">
      <Text variant="sectionHeader">Local holidays</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Rules can use these (“On… Federal holidays”, or a single one like Thanksgiving), and they
        show beside the Jewish holidays.
      </Text>
      <Select<CivilCalendar>
        accessibilityLabel="Holiday calendar"
        options={[
          ...Object.entries(CIVIL_CALENDARS).map(([value, c]) => ({
            value: value as CivilCalendar,
            label: c.label,
          })),
          {
            value: 'none',
            label: settings.location.israel
              ? 'None (Israel: the Jewish calendar is the legal one)'
              : 'None',
          },
        ]}
        value={civilCalendarOf(settings)}
        onChange={(civilHolidays) =>
          onChange({ ...settings, civilHolidays, ignoredHolidays: undefined })
        }
      />
      {builtIn.map((h) => (
        <Stack key={h.id} direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">{h.name.en}</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {describeLocalDate(h.date)}
            </Text>
          </Stack>
          <ToggleSwitch
            value={!ignored.includes(h.id)}
            onValueChange={(on) => toggleBuiltIn(h.id, on)}
            accessibilityLabel={`Count ${h.name.en}`}
          />
        </Stack>
      ))}
      {holidays.length > 0 && (
        <Text variant="label" color={SemanticColor.TextSecondary}>
          The shul’s own
        </Text>
      )}
      {holidays.map((h) => (
        <Stack key={h.id} direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="bodyStrong">{h.name.en}</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {describeLocalDate(h.date)}
            </Text>
          </Stack>
          <Button
            variant="ghost"
            size="sm"
            title="Remove"
            onPress={() => setHolidays(holidays.filter((x) => x.id !== h.id))}
          />
        </Stack>
      ))}
      <Stack direction="row" wrap gap="sm">
        {!adding && (
          <Button
            variant="secondary"
            size="sm"
            title="Add a holiday of your own…"
            onPress={() => setAdding(true)}
          />
        )}
      </Stack>
      {adding && (
        <Stack gap="md">
          <Field label="Name" value={name} onChangeText={setName} placeholder="Thanksgiving" />
          <SegmentedControl<Shape>
            options={[
              { key: 'date', label: 'Same date' },
              { key: 'weekday', label: 'Weekday of a month' },
              { key: 'easter', label: 'Around Easter' },
            ]}
            value={shape}
            onChange={setShape}
          />
          {shape !== 'easter' && (
            <Select
              value={String(month)}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
              onChange={(v) => setMonth(+v)}
              accessibilityLabel="Month"
            />
          )}
          {shape === 'date' && (
            <>
              <NumberField label="Day of the month" value={day} onChange={setDay} />
              <Select
                value={observed}
                options={[
                  { value: 'none', label: 'Always on that date' },
                  { value: 'nearest', label: 'On a weekend: nearest weekday (US)' },
                  { value: 'next', label: 'On a weekend: next free weekday (UK)' },
                ]}
                onChange={setObserved}
                accessibilityLabel="When it falls on a weekend"
              />
            </>
          )}
          {shape === 'weekday' && (
            <Stack direction="row" gap="sm">
              <Stack grow>
                <Select
                  value={String(nth)}
                  options={Object.entries(NTH).map(([value, label]) => ({ value, label }))}
                  onChange={(v) => setNth(+v as typeof nth)}
                  accessibilityLabel="Which one"
                />
              </Stack>
              <Stack grow>
                <Select
                  value={String(weekday)}
                  options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w.en }))}
                  onChange={(v) => setWeekday(+v as Weekday)}
                  accessibilityLabel="Weekday"
                />
              </Stack>
            </Stack>
          )}
          {shape === 'easter' && (
            <NumberField
              label="Days after Easter Sunday"
              value={easter}
              onChange={setEaster}
              help="Negative for before, e.g. -2 is two days before Easter Sunday."
            />
          )}
          <Stack direction="row" gap="sm">
            <Button title="Add" disabled={!name.trim() || !built} onPress={add} />
            <Button variant="ghost" title="Cancel" onPress={() => setAdding(false)} />
          </Stack>
        </Stack>
      )}
    </Card>
  )
}
