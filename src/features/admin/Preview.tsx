import { Card, Chip, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  type DateString,
  type Schedule,
  validate,
  WEEKDAY_SHORT,
} from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

import { makeT } from '@/features/luach/language'

const RANGES = { week: 7, month: 31 } as const

/**
 * The draft's computed times, so every edit shows its effect at once, plus problems
 * found over the coming year. "Tricky days" jumps through the days schedules break on.
 */
export function Preview({ schedule, today }: { schedule: Schedule; today: DateString }) {
  const { clock } = makeT('en', schedule.settings.timeFormat)
  const [range, setRange] = useState<'week' | 'month' | 'tricky'>('week')
  const issues = useMemo(() => validate(schedule, today, 370), [schedule, today])
  const days = useMemo(() => {
    const cal = new Calendar(schedule)
    if (range !== 'tricky') return cal.range(today, RANGES[range], { includeInternal: true })
    return trickyDays(cal, today).map((d) => cal.day(d, { includeInternal: true }))
  }, [schedule, today, range])
  const ruleOf = (eventId: string, i?: number) => (i === undefined ? '' : `rule ${i + 1}`)

  return (
    <Stack gap="md">
      {issues.length > 0 && (
        <Card gap="xs" background={SemanticColor.AccentAlertFaded}>
          <Text variant="headline">
            {issues.length === 1 ? '1 problem' : `${issues.length} problems`}
          </Text>
          {issues.slice(0, 8).map((i, n) => (
            <Text key={n} variant="body">
              {i.date ? `${civilDateShort(i.date)}: ` : ''}
              {i.message}
            </Text>
          ))}
        </Card>
      )}
      <Stack direction="row" gap="xs" wrap>
        <Chip label="Next 7 days" selected={range === 'week'} onPress={() => setRange('week')} />
        <Chip label="Next month" selected={range === 'month'} onPress={() => setRange('month')} />
        <Chip
          label="Tricky days"
          selected={range === 'tricky'}
          onPress={() => setRange('tricky')}
        />
      </Stack>
      {days.map((d) => (
        <Stack
          key={d.date}
          gap="xs"
          paddingVertical="xs"
          borderBottomWidth="hairline"
          borderColor={SemanticColor.BorderDefault}
        >
          <Stack direction="row" gap="sm" align="center" wrap>
            <Text variant="bodyStrong">
              {WEEKDAY_SHORT[d.weekday]} {civilDateShort(d.date)}
            </Text>
            <Text variant="caption" rtl color={SemanticColor.TextAccent}>
              {d.hebrew.he}
            </Text>
            <Text variant="caption" color={SemanticColor.TextAccent}>
              {d.holidays.map((h) => h.en).join(' · ')}
            </Text>
          </Stack>
          {d.events.map((o) => (
            <Stack key={o.eventId} direction="row" gap="sm">
              <Stack width={80}>
                <Text
                  variant="body"
                  color={o.cancelled || o.error ? SemanticColor.TextDanger : undefined}
                >
                  {o.cancelled ? '—' : o.minutes === null ? '!' : clock(o.minutes)}
                </Text>
              </Stack>
              <Text variant="body">{o.name.en}</Text>
              <Stack grow />
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {o.error ??
                  (o.source === 'rule'
                    ? ruleOf(o.eventId, o.ruleIndex)
                    : o.source === 'added'
                      ? 'one-time'
                      : 'changed')}
              </Text>
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}

/** The next occurrence of each kind of day that tends to break a schedule. */
function trickyDays(cal: Calendar, from: DateString): DateString[] {
  const wanted: ((date: DateString) => boolean)[] = [
    (d) => cal.info(d).tags.has('roshChodesh') && cal.info(d).weekday === 0,
    (d) => cal.info(d).tags.has('roshChodesh') && cal.info(d).weekday === 5,
    (d) => cal.info(d).tags.has('fast') && cal.info(d).weekday === 0,
    (d) => cal.info(d).tags.has('fast') && cal.info(d).weekday === 5,
    (d) => cal.info(d).tags.has('erevYomTov') && cal.info(d).weekday === 5,
    (d) => cal.info(d).tags.has('yomTov') && cal.info(d).weekday === 5,
    (d) => cal.info(d).tags.has('erevYomTov') && cal.info(d).weekday === 6,
    (d) => cal.info(d).tags.has('cholHamoed') && cal.info(d).weekday === 0,
    (d) => cal.info(d).tags.has('chanukah') && cal.info(d).weekday === 5,
    (d) => cal.info(d).tags.has('purim') && cal.info(d).weekday === 0,
    (d) => cal.info(d).tags.has('selichos') && cal.info(d).weekday === 0,
    (d) =>
      cal.info(d).holidays.some((h) => h.getDesc() === "Tish'a B'Av") && cal.info(d).weekday === 0,
    (d) => cal.info(d).holidays.some((h) => h.getDesc() === 'Erev Pesach'),
    (d) => cal.info(d).tags.has('dst') !== cal.info(addDays(d, -1)).tags.has('dst'),
  ]
  const found = new Set<DateString>()
  const pending = new Set(wanted.keys())
  for (let i = 0; i < 400 * 3 && pending.size; i++) {
    const d = addDays(from, i)
    for (const k of [...pending]) {
      if (wanted[k](d)) {
        found.add(d)
        pending.delete(k)
      }
    }
  }
  return [...found].sort()
}
