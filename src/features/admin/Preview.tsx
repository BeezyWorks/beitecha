import { SemanticColor, ScrollStack, Stack, Text, Touchable } from '@beezyworks/design'
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

import { Segments } from '@/components/Segments'
import { makeT } from '@/features/luach/language'
import { adminLabel } from './forms'
import { exceptionFor, OccurrenceRow } from './OccurrenceRow'
import { useAdmin } from './store'

const RANGES = { week: 7, month: 31 } as const

/**
 * The schedule's computed times, so every edit shows its effect at once, plus problems found over
 * the coming year. "Tricky days" jumps through the days schedules break on. Tap a row to change
 * that one day (saved at once); `schedule` may carry an unsaved edit, exceptions are always the saved ones.
 */
export function Preview({
  schedule,
  today,
  highlight,
}: {
  schedule: Schedule
  today: DateString
  highlight?: string
}) {
  const { clock, relative } = makeT('en', schedule.settings.timeFormat)
  const saved = useAdmin((s) => s.schedule)
  const [range, setRange] = useState<'week' | 'month' | 'tricky'>('week')
  const [only, setOnly] = useState(false)
  const [showIssues, setShowIssues] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const issues = useMemo(() => validate(schedule, today, 370), [schedule, today])
  const days = useMemo(() => {
    const cal = new Calendar(schedule)
    if (range !== 'tricky') return cal.range(today, RANGES[range], { includeInternal: true })
    return trickyDays(cal, today).map((d) => cal.day(d, { includeInternal: true }))
  }, [schedule, today, range])
  const highlighted = highlight ? schedule.events.find((e) => e.id === highlight) : undefined
  const filtering = only && !!highlighted
  const labelOf = (id: string, shown: string) => {
    const e = schedule.events.find((x) => x.id === id)
    return e ? adminLabel(e) : shown
  }
  const ruleOf = (i?: number) => (i === undefined ? '' : `line ${i + 1}`)

  return (
    <Stack fill>
      <Stack
        gap="sm"
        padding="md"
        borderBottomWidth="hairline"
        borderColor={SemanticColor.BorderDefault}
      >
        <Text variant="headline">The schedule</Text>
        {issues.length === 0 ? (
          <Text variant="caption" color={SemanticColor.TextSuccess}>
            No problems in the next year
          </Text>
        ) : (
          <Touchable onPress={() => setShowIssues((v) => !v)} accessibilityLabel="Show problems">
            <Text variant="caption" color={SemanticColor.TextDanger}>
              {issues.length === 1 ? '1 problem' : `${issues.length} problems`}
              {showIssues ? ' (hide)' : ''}
            </Text>
          </Touchable>
        )}
        {showIssues && (
          <Stack gap="xs">
            {issues.slice(0, 8).map((i, n) => (
              <Text key={n} variant="body">
                {i.date ? `${civilDateShort(i.date)}: ` : ''}
                {i.message}
              </Text>
            ))}
          </Stack>
        )}
        <Segments
          options={[
            { key: 'week', label: 'Next 7 days' },
            { key: 'month', label: 'Next month' },
            { key: 'tricky', label: 'Tricky days' },
          ]}
          value={range}
          onChange={setRange}
        />
        {highlighted && (
          <Segments
            options={[
              { key: 'all', label: 'Everything' },
              { key: 'only', label: `Only ${adminLabel(highlighted)}` },
            ]}
            value={only ? 'only' : 'all'}
            onChange={(k) => setOnly(k === 'only')}
          />
        )}
      </Stack>
      <Stack grow height={0}>
        <ScrollStack gap="md" padding="md">
          {days.map((d) => {
            const events = filtering ? d.events.filter((o) => o.eventId === highlight) : d.events
            if (filtering && !events.length) return null
            return (
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
                {events.map((o) => {
                  const key = `${d.date}|${o.eventId}`
                  const mine = o.eventId === highlight
                  const exception = saved ? exceptionFor(saved, d.date, o.eventId) : undefined
                  return (
                    <Stack key={o.eventId}>
                      <Touchable
                        onPress={() => setOpenKey(openKey === key ? null : key)}
                        accessibilityLabel={`Change ${labelOf(o.eventId, o.name.en)} on ${civilDateShort(d.date)}`}
                      >
                        <Stack direction="row" gap="sm" opacity={o.cancelled ? 0.5 : undefined}>
                          <Stack width={80}>
                            <Text
                              variant={mine ? 'bodyStrong' : 'body'}
                              color={
                                o.error
                                  ? SemanticColor.TextDanger
                                  : mine
                                    ? SemanticColor.TextAccent
                                    : undefined
                              }
                            >
                              {o.cancelled
                                ? '—'
                                : o.untimed && o.relative
                                  ? relative(o.relative)
                                  : o.minutes === null
                                    ? '!'
                                    : clock(o.minutes)}
                            </Text>
                          </Stack>
                          <Stack grow>
                            <Text
                              variant={mine ? 'bodyStrong' : 'body'}
                              color={mine ? SemanticColor.TextAccent : undefined}
                            >
                              {labelOf(o.eventId, o.name.en)}
                            </Text>
                          </Stack>
                          <Text
                            variant="caption"
                            color={o.error ? SemanticColor.TextDanger : SemanticColor.TextSecondary}
                          >
                            {o.error ??
                              (o.source === 'rule'
                                ? ruleOf(o.ruleIndex)
                                : o.source === 'added'
                                  ? 'one-time'
                                  : 'changed')}
                          </Text>
                        </Stack>
                      </Touchable>
                      {openKey === key && (
                        <OccurrenceRow actionsOnly date={d.date} o={o} exception={exception} />
                      )}
                    </Stack>
                  )
                })}
              </Stack>
            )
          })}
        </ScrollStack>
      </Stack>
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
