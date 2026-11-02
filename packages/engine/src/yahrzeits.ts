import { HDate, HebrewCalendar, gematriya } from '@hebcal/core'

import { formatDate, hostDate } from './dates'
import type { DateString, HebrewDate, HebrewMonthDay, Yahrzeit, YahrzeitNames } from './types'

/** The civil date a Hebrew date falls on. */
export function hebrewToGregorian({ day, month, year }: HebrewDate): DateString {
  const g = new HDate(day, month, year).greg()
  return formatDate(g.getFullYear(), g.getMonth() + 1, g.getDate())
}

/** The Hebrew date of a civil date (the day, not the night before). */
export function gregorianToHebrew(date: DateString): HebrewDate {
  const h = new HDate(hostDate(date))
  return { day: h.getDate(), month: h.getMonth(), year: h.getFullYear() }
}

/** Whether a Hebrew date exists (no 30 Cheshvan in a short year, no Adar II in a plain one). */
export function isRealHebrewDate({ day, month, year }: HebrewDate): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(year) || year < 1 || day < 1) return false
  if (month < 1 || month > 13 || (month === 13 && !HDate.isLeapYear(year))) return false
  return day <= HDate.daysInMonth(month, year)
}

/** Whether a Hebrew day and month exist in some year (a year, if given, must have them). */
export function isRealMonthDay({ day, month, year }: HebrewMonthDay): boolean {
  if (year !== undefined) return isRealHebrewDate({ day, month, year })
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || month < 1 || month > 13)
    return false
  return originYear({ day, month }) !== undefined
}

/** A year (long ago) the day and month exist in, with the right kind of Adar, standing in for the unknown birth year. */
export function originYear({ day, month }: HebrewMonthDay): number | undefined {
  for (let year = 5000; year < 5100; year++) {
    const leap = HDate.isLeapYear(year)
    if (month === 13 && !leap) continue
    if (month === 12 && leap) continue
    if (isRealHebrewDate({ day, month, year })) return year
  }
  return undefined
}

/** The months of a Hebrew year in calendar order from Tishrei, as `{ month, name }` (Adar I and II in a leap year). */
export function hebrewMonths(year: number): { month: number; name: string }[] {
  const order = [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
  return order
    .filter((m) => m !== 13 || HDate.isLeapYear(year))
    .map((month) => ({ month, name: new HDate(1, month, year).getMonthName() }))
}

/** `18 Cheshvan` / `י״ח חשון`, without the year. */
export function hebrewDateText(date: DateString, lang: 'en' | 'he' = 'en'): string {
  const h = new HDate(hostDate(date))
  if (lang === 'en') return `${h.getDate()} ${h.getMonthName()}`
  const month = h.render('he-x-NoNikud', false).split(' ').slice(1).join(' ')
  return `${gematriya(h.getDate())} ${month}`
}

/** A yahrzeit as the date it is kept on in a Hebrew year (Hebcal's rules for Cheshvan, Kislev and Adar), if after the passing. */
function keptIn(y: Yahrzeit, hyear: number): DateString | undefined {
  // Without a year (or a civil date to find it from), a long-ago year the day exists in stands in for it.
  const year =
    y.hebrew.year ?? (y.gregorian ? gregorianToHebrew(y.gregorian).year : originYear(y.hebrew)!)
  const hd = HebrewCalendar.getYahrzeit(hyear, new HDate(y.hebrew.day, y.hebrew.month, year))
  if (!hd) return undefined
  const g = hd.greg()
  return formatDate(g.getFullYear(), g.getMonth() + 1, g.getDate())
}

export interface UpcomingYahrzeit {
  /** The civil day it is kept on (the observance begins the evening before). */
  date: DateString
  yahrzeit: Yahrzeit
}

/** The yahrzeits kept from `from` through `to` (inclusive), in date order. */
export function yahrzeitsBetween(list: Yahrzeit[] | undefined, from: DateString, to: DateString): UpcomingYahrzeit[] {
  if (!list?.length || to < from) return []
  const first = new HDate(hostDate(from)).getFullYear()
  const last = new HDate(hostDate(to)).getFullYear()
  const out: UpcomingYahrzeit[] = []
  for (const yahrzeit of list) {
    if (!isRealMonthDay(yahrzeit.hebrew)) continue
    for (let hyear = first; hyear <= last; hyear++) {
      const date = keptIn(yahrzeit, hyear)
      if (date && date >= from && date <= to) out.push({ date, yahrzeit })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** The name lines shown for someone, per the shul's choice, each falling back to the other name when blank. */
export function yahrzeitNameParts(
  y: Pick<Yahrzeit, 'hebrewName' | 'displayName'>,
  show: YahrzeitNames,
  displayText: string,
): string[] {
  const hebrew = y.hebrewName?.trim() ?? ''
  const display = displayText.trim()
  if (show === 'hebrew') return [hebrew || display].filter(Boolean)
  if (show === 'display') return [display || hebrew].filter(Boolean)
  return [display, hebrew].filter(Boolean)
}
