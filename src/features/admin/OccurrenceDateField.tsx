import { CalendarGrid, SemanticColor, Stack, Text, useResolvedColor } from '@beezyworks/design'
import { addDays, Calendar, civilDateShort, type DateString, type Schedule } from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

/** What a day is called for a sponsor: the parsha on Shabbos, the Yom Tov, else just the date. */
export function occurrenceLabel(cal: Calendar, date: DateString): string {
  const day = cal.day(date)
  const tags = new Set(day.tags)
  const holiday = day.holidays[0]?.en
  const when = civilDateShort(date)
  if (tags.has('yomTov') && holiday)
    return `${holiday}${tags.has('shabbos') ? ' (Shabbos)' : ''} · ${when}`
  if (tags.has('shabbos'))
    return `Shabbos ${day.parsha ? `Parshas ${day.parsha.en}` : (holiday ?? '')} · ${when}`.replace(
      '  ',
      ' ',
    )
  return when
}

/** The first day from `from` that the event happens, within a year; else `from`. */
export function nextOccurrence(schedule: Schedule, eventId: string, from: DateString): DateString {
  const cal = new Calendar(schedule)
  for (let i = 0; i < 400; i++) {
    const d = addDays(from, i)
    try {
      if (cal.occurrences(d).some((o) => o.eventId === eventId && !o.cancelled)) return d
    } catch {
      // an event that can't be worked out that day doesn't happen
    }
  }
  return from
}

/**
 * A month calendar for choosing which occurrence of a recurring event a sponsorship is for: days the event
 * doesn't happen are greyed out, and the chosen day is named underneath ("Shabbos Parshas Noach").
 */
export function OccurrenceDateField({
  schedule,
  eventId,
  value,
  today,
  onChange,
}: {
  schedule: Schedule
  eventId: string
  value: DateString
  today: DateString
  onChange: (d: DateString) => void
}) {
  const cal = useMemo(() => new Calendar(schedule), [schedule])
  const [month, setMonth] = useState<DateString>(`${value.slice(0, 7)}-01`)
  const accent = useResolvedColor(SemanticColor.AccentPrimary)
  const onAccent = useResolvedColor(SemanticColor.TextOnAccent)
  const text = useResolvedColor(SemanticColor.TextPrimary)
  const faded = useResolvedColor(SemanticColor.TextTabInactive)
  const background = useResolvedColor(SemanticColor.SurfaceBackground)

  const happens = (d: DateString) => {
    try {
      return cal.occurrences(d).some((o) => o.eventId === eventId && !o.cancelled)
    } catch {
      return false
    }
  }

  const marked = useMemo(() => {
    const out: Record<string, object> = {}
    for (let i = -7; i < 42; i++) {
      const d = addDays(month, i)
      const ok = d >= today && happens(d)
      if (d === value)
        out[d] = { selected: true, selectedColor: accent, selectedTextColor: onAccent }
      else if (!ok) out[d] = { disabled: true, disableTouchEvent: true }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cal, month, value, today, eventId, accent, onAccent])

  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        Which one
      </Text>
      <CalendarGrid
        current={value}
        minDate={today}
        markedDates={marked}
        onDayPress={(d) => happens(d.dateString) && onChange(d.dateString)}
        onMonthChange={(m) => setMonth(`${m.dateString.slice(0, 7)}-01`)}
        theme={{
          calendarBackground: background,
          dayTextColor: text,
          textDisabledColor: faded,
          monthTextColor: text,
          arrowColor: accent,
          todayTextColor: accent,
          selectedDayBackgroundColor: accent,
          selectedDayTextColor: onAccent,
        }}
      />
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {happens(value) ? occurrenceLabel(cal, value) : 'Pick a highlighted day'}
      </Text>
    </Stack>
  )
}
