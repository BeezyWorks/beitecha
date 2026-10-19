import type { DateString, Minutes, Weekday } from './types'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDate(date: DateString): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Bad date "${date}", expected YYYY-MM-DD`)
  return { year: +m[1], month: +m[2], day: +m[3] }
}

export function formatDate(year: number, month: number, day: number): DateString {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Calendar arithmetic on date strings (UTC-based, so no DST surprises). */
export function addDays(date: DateString, days: number): DateString {
  const { year, month, day } = parseDate(date)
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return formatDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function weekdayOf(date: DateString): Weekday {
  const { year, month, day } = parseDate(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday
}

/** The Sunday that starts `date`'s week. */
export function startOfWeek(date: DateString): DateString {
  return addDays(date, -weekdayOf(date))
}

/** A `Date` at local midnight of the host, which is what HDate reads its fields from. */
export function hostDate(date: DateString): Date {
  const { year, month, day } = parseDate(date)
  return new Date(year, month - 1, day)
}

export function parseClock(clock: string): Minutes {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock)
  if (!m || +m[1] > 23 || +m[2] > 59) throw new Error(`Bad time "${clock}", expected HH:MM`)
  return +m[1] * 60 + +m[2]
}

/** `HH:MM`, 24-hour. */
export function formatClock(minutes: Minutes): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** `6:30 AM` style. */
export function formatClock12(minutes: Minutes): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

function zonedParts(instant: Date, timeZone: string): Record<string, number> {
  const parts: Record<string, number> = {}
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = +p.value
  }
  return parts
}

/** Fractional minutes since local midnight of `date` in `timeZone`. */
export function minutesInZone(instant: Date, date: DateString, timeZone: string): number {
  const p = zonedParts(instant, timeZone)
  const dayShift = Math.round(
    (Date.UTC(p.year, p.month - 1, p.day) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
  )
  return dayShift * 1440 + p.hour * 60 + p.minute + p.second / 60
}

/** The zone's UTC offset in minutes at local noon of `date`. */
function offsetAt(date: DateString, timeZone: string): number {
  const noonUtc = new Date(`${date}T12:00:00Z`)
  const p = zonedParts(noonUtc, timeZone)
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - noonUtc.getTime()) / 60_000
}

export function isDst(date: DateString, timeZone: string): boolean {
  const { year } = parseDate(date)
  const standard = Math.min(
    offsetAt(formatDate(year, 1, 1), timeZone),
    offsetAt(formatDate(year, 7, 1), timeZone),
  )
  return offsetAt(date, timeZone) > standard
}

/** Today's date in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): DateString {
  const p = zonedParts(now, timeZone)
  return formatDate(p.year, p.month, p.day)
}

/** Minutes since local midnight right now in `timeZone`. */
export function nowMinutesIn(timeZone: string, now: Date = new Date()): Minutes {
  const p = zonedParts(now, timeZone)
  return p.hour * 60 + p.minute
}
