import { CalendarGrid, SemanticColor, Stack, Text, useResolvedColor } from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  hebrewDateText,
  type DateString,
  type Schedule,
} from '@beitecha/engine'
import React, { useMemo } from 'react'
import { Pressable, View } from 'react-native'

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

/** What a day is called for a sponsor: the parsha on Shabbos, the Yom Tov, else just the date. */
export function occurrenceLabel(cal: Calendar, date: DateString): { title: string; sub: string } {
  const day = cal.day(date)
  const tags = new Set(day.tags)
  const holiday = day.holidays[0]?.en
  const when = civilDateShort(date)
  const sub = `${when} · ${hebrewDateText(date, 'en')}`
  if (tags.has('yomTov') && holiday)
    return { title: `${holiday}${tags.has('shabbos') ? ' (Shabbos)' : ''}`, sub }
  if (tags.has('shabbos'))
    return {
      title: day.parsha ? `Shabbos Parshas ${day.parsha.en}` : `Shabbos ${holiday ?? ''}`.trim(),
      sub,
    }
  return { title: when, sub: hebrewDateText(date, 'en') }
}

/** The Hebrew day of the month in letters: "י״ח". */
const hebrewDay = (d: DateString) => hebrewDateText(d, 'he').split(' ')[0]

/** The Hebrew month or months a Gregorian month spans: "חשון – כסלו". */
function hebrewMonthsOf(first: DateString): string {
  const [y, m] = first.split('-').map(Number)
  const last = addDays(
    `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`,
    -1,
  )
  const name = (d: DateString) => hebrewDateText(d, 'he').split(' ').slice(1).join(' ')
  const a = name(first)
  const b = name(last)
  return a === b ? a : `${a} – ${b}`
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
  const accent = useResolvedColor(SemanticColor.AccentPrimary)
  const background = useResolvedColor(SemanticColor.SurfaceBackground)

  const happens = (d: DateString) => {
    try {
      return cal.occurrences(d).some((o) => o.eventId === eventId && !o.cancelled)
    } catch {
      return false
    }
  }

  const label = happens(value) ? occurrenceLabel(cal, value) : undefined
  const okOf = (d: DateString) => d >= today && happens(d)

  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        Which one (outlined days are available)
      </Text>
      <Text variant="title">{label?.title ?? 'Pick an outlined day'}</Text>
      {!!label?.sub && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {label.sub}
        </Text>
      )}
      <CalendarGrid
        current={value}
        minDate={today}
        renderHeader={(d: { toString: (f: string) => string }) => {
          const first = `${d.toString('yyyy-MM')}-01`
          return (
            <Stack align="center">
              <Text variant="headline">
                {MONTHS[Number(first.slice(5, 7)) - 1]} {first.slice(0, 4)}
              </Text>
              <Text variant="caption" rtl color={SemanticColor.TextSecondary}>
                {hebrewMonthsOf(first)}
              </Text>
            </Stack>
          )
        }}
        dayComponent={({ date }: { date?: { dateString: string; day: number } }) => {
          if (!date) return null
          const d = date.dateString
          const ok = okOf(d)
          const selected = d === value
          return (
            <Pressable
              disabled={!ok}
              onPress={() => onChange(d)}
              accessibilityLabel={d}
              style={{
                width: 38,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                borderWidth: 2,
                borderColor: ok ? accent : 'transparent',
                backgroundColor: selected ? accent : 'transparent',
                opacity: ok ? 1 : 0.45,
              }}
            >
              <View style={{ alignItems: 'center' }}>
                <Text
                  variant={ok ? 'bodyStrong' : 'body'}
                  color={
                    selected
                      ? SemanticColor.TextOnAccent
                      : ok
                        ? SemanticColor.TextPrimary
                        : SemanticColor.TextTabInactive
                  }
                >
                  {date.day}
                </Text>
                <Text
                  variant="caption"
                  rtl
                  color={selected ? SemanticColor.TextOnAccent : SemanticColor.TextSecondary}
                >
                  {hebrewDay(d)}
                </Text>
              </View>
            </Pressable>
          )
        }}
        theme={{ calendarBackground: background, arrowColor: accent }}
      />
    </Stack>
  )
}
