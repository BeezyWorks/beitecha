import { HDate, HebrewCalendar } from '@hebcal/core'

import { addDays, hostDate, weekdayOf } from './dates'
import { dayInfo, displayHolidays, parshaFor } from './day'
import type { DateString, Localized, ShulSettings, Yahrzeit } from './types'
import {
  gregorianToHebrew,
  hebrewToGregorian,
  isRealHebrewDate,
  yahrzeitsBetween,
} from './yahrzeits'

/** How far past the last Shabbos to look for yahrzeits whose own Shabbos says no tzidkascha, so they move back to it. */
const LOOKAHEAD_DAYS = 120

export interface ElMalehName {
  yahrzeit: Yahrzeit
  /** The civil day the yahrzeit is kept on. */
  date: DateString
}

export interface ElMalehShabbos {
  /** The Shabbos. */
  date: DateString
  /** The parsha, or the holiday when the Shabbos has none. */
  title?: Localized
  names: ElMalehName[]
}

/** The first Shabbos on or after `date`. */
export function shabbosOnOrAfter(date: DateString): DateString {
  return addDays(date, (6 - weekdayOf(date) + 7) % 7)
}

/** The day before `date`'s Hebrew date comes round again next year, so a range from `date` holds every Hebrew day once. */
export function hebrewYearEnd(date: DateString): DateString {
  const { day, month, year } = gregorianToHebrew(date)
  for (let d = day; d >= 1; d--) {
    for (const m of month === 13 ? [13, 12] : month === 12 ? [12, 13] : [month]) {
      const h = { day: d, month: m, year: year + 1 }
      if (isRealHebrewDate(h)) return addDays(hebrewToGregorian(h), -1)
    }
  }
  return addDays(date, 364)
}

/** The next Shabbos, today included, that says tzidkascha (a skipped stretch such as Nisan is passed over). */
export function nextElMalehShabbos(date: DateString, israel: boolean): DateString {
  let s = shabbosOnOrAfter(date)
  for (let i = 0; i < 60 && !saysTzidkascha(s, israel); i++) s = addDays(s, 7)
  return s
}

/** Whether tzidkascha is said at Mincha on this Shabbos (no: before a day, or on a day, without tachanun for its own sake). */
export function saysTzidkascha(shabbos: DateString, israel: boolean): boolean {
  return HebrewCalendar.tachanun(new HDate(hostDate(shabbos)), israel).mincha
}

/**
 * The names to say El Maleh Rachamim for at Shabbos Mincha, from the next Shabbos that says tzidkascha on or after
 * `from` through the last Shabbos on or before `to`. A yahrzeit is said on the last Shabbos on or before it; where
 * tzidkascha is not said that Shabbos, on the last one before it that does. Nothing before the first Shabbos listed
 * is looked at: it is taken as already said. Only Shabbosos with names are returned.
 */
export function elMalehNames(
  yahrzeits: Yahrzeit[] | undefined,
  from: DateString,
  to: DateString,
  settings: ShulSettings,
): ElMalehShabbos[] {
  const first = nextElMalehShabbos(from, settings.location.israel)
  const last = addDays(shabbosOnOrAfter(to), weekdayOf(to) === 6 ? 0 : -7)
  if (last < first) return []
  const { israel } = settings.location
  const says = new Map<DateString, boolean>()
  const saysOn = (s: DateString) => {
    if (!says.has(s)) says.set(s, saysTzidkascha(s, israel))
    return says.get(s)!
  }
  const byShabbos = new Map<DateString, ElMalehName[]>()
  for (const { date, yahrzeit } of yahrzeitsBetween(
    yahrzeits,
    first,
    addDays(last, LOOKAHEAD_DAYS),
  )) {
    let s = addDays(date, -((weekdayOf(date) + 1) % 7))
    while (s > first && !saysOn(s)) s = addDays(s, -7)
    if (s > last) continue
    byShabbos.set(s, [...(byShabbos.get(s) ?? []), { yahrzeit, date }])
  }
  return [...byShabbos.keys()].sort().map((date) => {
    const parsha = parshaFor(date, settings)
    return {
      date,
      title: parsha ?? displayHolidays(dayInfo(date, settings))[0],
      names: byShabbos.get(date)!,
    }
  })
}

export interface ElMalehTarget extends ElMalehShabbos {
  /** Whether tzidkascha (so El Maleh Rachamim) is said at Mincha this Shabbos. */
  says: boolean
}

const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** Shabbosos from `from` (inclusive) whose parsha or holiday name contains `query` (any spelling's letters, English or Hebrew), within about a year. */
export function shabbosimNamed(
  query: string,
  from: DateString,
  settings: ShulSettings,
): DateString[] {
  const q = letters(query)
  if (!q) return []
  const out: DateString[] = []
  for (let s = shabbosOnOrAfter(from), i = 0; i < 56; s = addDays(s, 7), i++) {
    const title = parshaFor(s, settings) ?? displayHolidays(dayInfo(s, settings))[0]
    if (title && [title.en, title.he ?? ''].some((n) => letters(n).includes(q))) out.push(s)
  }
  return out
}

/**
 * What is said at El Maleh Rachamim on each of the given Shabbosos, counting on every earlier one from `today` having
 * been said too (so a name moved back from a skipped Shabbos is on the one before it). A Shabbos that does not say it
 * has no names.
 */
export function elMalehFor(
  yahrzeits: Yahrzeit[] | undefined,
  today: DateString,
  shabbosim: DateString[],
  settings: ShulSettings,
): ElMalehTarget[] {
  const last = [...shabbosim].sort().at(-1)
  const found = last ? elMalehNames(yahrzeits, today, last, settings) : []
  return shabbosim.map((date) => {
    const hit = found.find((f) => f.date === date)
    const title =
      hit?.title ?? parshaFor(date, settings) ?? displayHolidays(dayInfo(date, settings))[0]
    return {
      date,
      title,
      names: hit?.names ?? [],
      says: saysTzidkascha(date, settings.location.israel),
    }
  })
}
