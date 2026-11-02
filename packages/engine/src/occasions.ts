import { HDate, HebrewCalendar } from '@hebcal/core'

import { formatDate, hostDate, parseDate } from './dates'
import type { DateString, HebrewMonthDay, Occasion } from './types'
import { gregorianToHebrew, hebrewToGregorian, isRealHebrewDate, isRealMonthDay, originYear } from './yahrzeits'

export { isRealMonthDay }

/** A birthday or anniversary with both its dates worked out and which one it is kept by. */
export interface ResolvedOccasion {
  by: 'hebrew' | 'gregorian'
  hebrew?: HebrewMonthDay
  /** Absent for a Hebrew date without a year. */
  gregorian?: DateString
}

/**
 * Fills in whichever date is missing: a civil date gives the Hebrew date, a Hebrew date with a year gives the civil
 * one. Kept by the Hebrew calendar unless `by` says otherwise or only a civil date was given.
 */
export function resolveOccasion(
  o: Pick<Occasion, 'hebrew' | 'gregorian' | 'by'>,
): ResolvedOccasion {
  const hebrew: HebrewMonthDay | undefined =
    o.hebrew ?? (o.gregorian ? gregorianToHebrew(o.gregorian) : undefined)
  const gregorian =
    o.gregorian ??
    (o.hebrew?.year !== undefined && isRealHebrewDate({ ...o.hebrew, year: o.hebrew.year })
      ? hebrewToGregorian({ ...o.hebrew, year: o.hebrew.year })
      : undefined)
  const wanted = o.by ?? (o.hebrew ? 'hebrew' : 'gregorian')
  const by =
    wanted === 'gregorian' ? (gregorian ? 'gregorian' : 'hebrew') : hebrew ? 'hebrew' : 'gregorian'
  return { by, hebrew, gregorian }
}

const civil = (g: Date): DateString => formatDate(g.getFullYear(), g.getMonth() + 1, g.getDate())

/** The civil day `month`/`day` falls on in `year`; 29 February in a common year is kept on the 28th. */
function civilIn(year: number, month: number, day: number): DateString {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return formatDate(year, month, month === 2 && day === 29 && !leap ? 28 : day)
}

export interface UpcomingOccasion {
  /** The civil day it falls on this year. */
  date: DateString
  occasion: Occasion
  /** The calendar it is kept and shown by. */
  by: 'hebrew' | 'gregorian'
}

/** The birthdays or anniversaries that fall from `from` through `to` (inclusive), in date order. Never the year it began. */
export function occasionsBetween(
  list: Occasion[] | undefined,
  from: DateString,
  to: DateString,
): UpcomingOccasion[] {
  if (!list?.length || to < from) return []
  const out: UpcomingOccasion[] = []
  for (const occasion of list) {
    const r = resolveOccasion(occasion)
    if (r.by === 'gregorian' && r.gregorian) {
      const { year: began, month, day } = parseDate(r.gregorian)
      for (let year = parseDate(from).year; year <= parseDate(to).year; year++) {
        const date = civilIn(year, month, day)
        if (year > began && date >= from && date <= to)
          out.push({ date, occasion, by: 'gregorian' })
      }
    } else if (r.hebrew && isRealMonthDay(r.hebrew)) {
      const first = new HDate(hostDate(from)).getFullYear()
      const last = new HDate(hostDate(to)).getFullYear()
      const knownYear =
        r.hebrew.year ?? (r.gregorian ? gregorianToHebrew(r.gregorian).year : undefined)
      const origin = new HDate(r.hebrew.day, r.hebrew.month, knownYear ?? originYear(r.hebrew)!)
      for (let hyear = first; hyear <= last; hyear++) {
        const kept = HebrewCalendar.getBirthdayOrAnniversary(hyear, origin)
        if (!kept) continue
        const date = civil(kept.greg())
        if (date >= from && date <= to) out.push({ date, occasion, by: 'hebrew' })
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
