import { addDays, formatDate, parseDate, weekdayOf } from './dates'
import type { DateString, LocalHoliday, LocalHolidayDate, Weekday } from './types'

/** Western (Gregorian) Easter Sunday, by the anonymous Gregorian algorithm. */
export function easterSunday(year: number): DateString {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return formatDate(year, month, day)
}

const isWeekend = (date: DateString) => [0, 6].includes(weekdayOf(date))

function validCivil(year: number, month: number, day: number): DateString | null {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return formatDate(year, month, day)
}

function nthWeekday(year: number, month: number, weekday: Weekday, nth: number): DateString | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (nth === -1) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const lastDate = formatDate(year, month, last)
    return addDays(lastDate, -((weekdayOf(lastDate) - weekday + 7) % 7))
  }
  if (nth < 1 || nth > 4) return null
  const first = formatDate(year, month, 1)
  return addDays(first, (weekday - weekdayOf(first) + 7) % 7 + (nth - 1) * 7)
}

/** The civil date a holiday's rule gives in `year` (before any weekend shift), or null when invalid. */
function nominal(date: LocalHolidayDate, year: number): DateString | null {
  if ('on' in date) return null
  if ('easter' in date) return Number.isInteger(date.easter) ? addDays(easterSunday(year), date.easter) : null
  if ('nth' in date) return nthWeekday(year, date.month, date.weekday, date.nth)
  const civil = validCivil(year, date.month, date.day)
  if (civil && 'weekdayBefore' in date) return addDays(civil, -(((weekdayOf(civil) - date.weekdayBefore + 7) % 7) || 7))
  return civil
}

/** Every date `holidays` land on in `year`, in list order (so `observed: 'next'` skips earlier ones). */
export function localHolidayDates(holidays: LocalHoliday[], year: number): Map<DateString, LocalHoliday[]> {
  const out = new Map<DateString, LocalHoliday[]>()
  const put = (date: DateString, h: LocalHoliday) => out.set(date, [...(out.get(date) ?? []), h])
  for (const h of holidays) {
    if ('on' in h.date) {
      for (const d of h.date.on) if (d.startsWith(`${year}-`)) put(d, h)
      continue
    }
    let date = nominal(h.date, year)
    if (!date) continue
    const observed = 'observed' in h.date ? h.date.observed : undefined
    if (observed === 'nearest' && isWeekend(date)) date = addDays(date, weekdayOf(date) === 6 ? -1 : 1)
    if (observed === 'next') while (isWeekend(date) || out.has(date)) date = addDays(date, 1)
    put(date, h)
  }
  return out
}

/** Looks up the local holidays on any date, working out each year once. */
export class LocalHolidays {
  private readonly years = new Map<number, Map<DateString, LocalHoliday[]>>()

  constructor(private readonly holidays: LocalHoliday[] = []) {}

  on(date: DateString): LocalHoliday[] {
    if (!this.holidays.length) return []
    const year = parseDate(date).year
    // A New Year's Day observed on the previous Friday lands in the year before.
    return [year - 1, year, year + 1].flatMap((y) => this.year(y).get(date) ?? [])
  }

  private year(y: number) {
    let m = this.years.get(y)
    if (!m) {
      m = localHolidayDates(this.holidays, y)
      this.years.set(y, m)
    }
    return m
  }
}
