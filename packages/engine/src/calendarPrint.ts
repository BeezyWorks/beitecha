import { HDate, Locale, flags, gematriya, months, type HolidayEvent } from '@hebcal/core'

import { addDays, formatDate, hostDate, parseDate, weekdayOf } from './dates'
import { customZmanName } from './custom'
import type { Calendar } from './schedule'
import { occasionsBetween } from './occasions'
import { yahrzeitsBetween } from './yahrzeits'
import type { Wording } from './wording'
import type {
  CalendarBasis,
  CalendarGroup,
  CalendarPrintSettings,
  DateString,
  Localized,
  Minutes,
  Occasion,
  Weekday,
  Yahrzeit,
  ZmanKey,
} from './types'

// What a printed month holds, before it has a page: its weeks of days, each with the day's numbers, holidays, the
// shul's own events, times and people. The app lays it out.

/** The kinds of day that can be turned off together, in the order they're listed. */
export const CALENDAR_GROUPS: CalendarGroup[] = [
  'yomTov',
  'cholHamoed',
  'fast',
  'minor',
  'other',
  'israeli',
  'civil',
]

export const CALENDAR_GROUP_LABELS: Record<CalendarGroup, string> = {
  yomTov: 'Yom Tov and its eve',
  cholHamoed: 'Chol Hamoed and Hoshana Raba',
  fast: 'Fasts',
  minor: 'Rosh Chodesh, Chanukah, Purim and the like',
  other: 'Other days (Bahab, Selichos…)',
  israeli: 'Israel’s memorial days',
  civil: 'Civil holidays',
}

/** The order a day's holidays are written in. */
const RANK: Record<CalendarGroup, number> = {
  yomTov: 1,
  cholHamoed: 2,
  fast: 3,
  minor: 4,
  israeli: 6,
  other: 7,
  civil: 8,
}

export interface CalendarHoliday {
  /** What turning it off turns off: a family of days (every Rosh Chodesh) shares one id. */
  id: string
  name: string
  group: CalendarGroup
  /** Whether it turns the day's number red. */
  marks: boolean
  rank: number
}

export interface CalendarLine {
  label?: string
  text: string
}

export interface CalendarPerson {
  kind: 'yahrzeit' | 'birthday' | 'anniversary'
  /** The person's id in the schedule, for leaving them off. */
  id: string
  /** "Yahrzeit", "Birthday"… */
  label: string
  text: string
}

export interface CalendarEventLine {
  /** The event's id in the schedule, for leaving it off. */
  id: string
  name: string
  time: string
}

export interface CalendarTimeLine {
  label: string
  time: string
  at: Minutes
}

export interface CalendarCell {
  date: DateString
  weekday: Weekday
  /** The big number, in the calendar the page is for. */
  primary: string
  /** The small one, in the other; with its month on a month's first day. */
  secondary: string
  shabbos: boolean
  parsha?: string
  omer?: string
  /** Every holiday of the day; the page drops the ones turned off. */
  holidays: CalendarHoliday[]
  events: CalendarEventLine[]
  /** Candle lighting, havdala, fast times and the zmanim chosen, in time order. */
  times: CalendarTimeLine[]
  people: CalendarPerson[]
}

export interface CalendarMonth {
  start: DateString
  end: DateString
  /** "November 2026", or "חשון תשפז". */
  title: string
  /** The same days in the other calendar. */
  subtitle: string
  /** Sunday first; a day outside the month is empty. */
  weeks: (CalendarCell | undefined)[][]
}

/** The shul's choices with their defaults. */
export function calendarOptions(c: CalendarPrintSettings | undefined) {
  return {
    basis: c?.basis ?? 'civil',
    paper: c?.paper ?? 'letter',
    orientation: c?.orientation ?? 'landscape',
    ink: c?.ink ?? 'color',
    parsha: c?.parsha !== false,
    omer: c?.omer !== false,
    restTimes: c?.restTimes !== false,
    fastTimes: c?.fastTimes !== false,
    dayZmanim: c?.dayZmanim ?? [],
    restZmanim: c?.restZmanim ?? [],
    hiddenGroups: new Set<CalendarGroup>(c?.hiddenGroups ?? []),
    hiddenHolidays: new Set(c?.hiddenHolidays ?? []),
    events: new Set(c?.events ?? []),
    oneTime: c?.oneTime !== false,
    yahrzeits: c?.yahrzeits !== false,
    birthdays: c?.birthdays !== false,
    anniversaries: c?.anniversaries !== false,
    hiddenPeople: new Set(c?.hiddenPeople ?? []),
    footer: c?.footer?.trim() ?? '',
    monthFooters: c?.monthFooters ?? {},
  }
}
export type CalendarOptions = ReturnType<typeof calendarOptions>

/** Whether a holiday is on the page, given what the shul turned off. */
export const isHolidayShown = (h: CalendarHoliday, o: Pick<CalendarOptions, 'hiddenGroups' | 'hiddenHolidays'>) =>
  !o.hiddenGroups.has(h.group) && !o.hiddenHolidays.has(h.id)

// ---------------------------------------------------------------------------
// Months

const civilMonthStart = (date: DateString) => {
  const { year, month } = parseDate(date)
  return formatDate(year, month, 1)
}

const civil = (g: Date): DateString => formatDate(g.getFullYear(), g.getMonth() + 1, g.getDate())

/** The first and last day of the month `date` is in. */
export function monthBounds(basis: CalendarBasis, date: DateString): { start: DateString; end: DateString } {
  if (basis === 'hebrew') {
    const hd = new HDate(hostDate(date))
    const start = new HDate(1, hd.getMonth(), hd.getFullYear())
    const end = new HDate(start.daysInMonth(), hd.getMonth(), hd.getFullYear())
    return { start: civil(start.greg()), end: civil(end.greg()) }
  }
  const start = civilMonthStart(date)
  const { year, month } = parseDate(start)
  const next = month === 12 ? formatDate(year + 1, 1, 1) : formatDate(year, month + 1, 1)
  return { start, end: addDays(next, -1) }
}

/** The first day of every month from the one `from` is in to the one `to` is in. */
export function monthStarts(basis: CalendarBasis, from: DateString, to: DateString): DateString[] {
  const last = monthBounds(basis, to).start
  const out: DateString[] = []
  let current = monthBounds(basis, from).start
  // A guard, were the two ever the wrong way round.
  while (current <= last && out.length < 120) {
    out.push(current)
    current = addDays(monthBounds(basis, current).end, 1)
  }
  return out
}

/** A day inside the month `months` after (or before) the one `date` is in. */
export function stepMonth(basis: CalendarBasis, date: DateString, by: number): DateString {
  let current = date
  for (let i = 0; i < Math.abs(by); i++) {
    const { start, end } = monthBounds(basis, current)
    current = by > 0 ? addDays(end, 1) : addDays(start, -1)
  }
  return current
}

const CIVIL_MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  he: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
}

const hebrewMonthName = (date: DateString, lang: 'en' | 'he') => {
  const hd = new HDate(hostDate(date))
  return lang === 'he' ? Locale.gettext(hd.getMonthName(), 'he-x-NoNikud') : hd.getMonthName()
}
const hebrewYear = (date: DateString, lang: 'en' | 'he') => {
  const year = new HDate(hostDate(date)).getFullYear()
  return lang === 'he' ? gematriya(year) : String(year)
}
const civilMonthName = (date: DateString, lang: 'en' | 'he') => CIVIL_MONTHS[lang][parseDate(date).month - 1]

/** The title of a month (or run of months) in the main calendar and the subtitle in the other. */
export function monthTitles(basis: CalendarBasis, start: DateString, end: DateString, lang: 'en' | 'he') {
  const civilTitle =
    civilMonthName(start, lang) === civilMonthName(end, lang)
      ? `${civilMonthName(start, lang)} ${parseDate(end).year}`
      : `${civilMonthName(start, lang)} – ${civilMonthName(end, lang)} ${parseDate(end).year}`
  const hebrewTitle =
    hebrewMonthName(start, lang) === hebrewMonthName(end, lang)
      ? `${hebrewMonthName(start, lang)} ${hebrewYear(end, lang)}`
      : `${hebrewMonthName(start, lang)} – ${hebrewMonthName(end, lang)} ${hebrewYear(end, lang)}`
  return basis === 'hebrew'
    ? { title: hebrewTitle, subtitle: civilTitle }
    : { title: civilTitle, subtitle: hebrewTitle }
}

/** A month's name for choosing it. */
export const monthLabel = (basis: CalendarBasis, date: DateString, lang: 'en' | 'he' = 'en') => {
  const { start, end } = monthBounds(basis, date)
  return monthTitles(basis, start, end, lang).title
}

// ---------------------------------------------------------------------------
// Holidays

/** hebcal flags, as the schedule's holidays are told apart: the same grouping the Siddur's printed calendar uses. */
/* eslint-disable no-bitwise */
export function classifyHoliday(event: HolidayEvent, name: string): CalendarHoliday {
  const f = event.getFlags()
  const desc = event.getDesc()
  const has = (flag: number) => (f & flag) !== 0
  const made = (group: CalendarGroup, family: string, marks: boolean, rank?: number): CalendarHoliday => ({
    id: `${group}:${family}`,
    name,
    group,
    marks,
    rank: rank ?? RANK[group],
  })

  if (has(flags.CHAG)) {
    const family = /Rosh Hashana/.test(desc)
      ? 'roshHashana'
      : /Yom Kippur/.test(desc)
        ? 'yomKippur'
        : /Sukkot/.test(desc)
          ? 'succos'
          : /Shmini/.test(desc)
            ? 'shminiAtzeres'
            : /Simchat/.test(desc)
              ? 'simchasTorah'
              : /Pesach/.test(desc)
                ? 'pesach'
                : /Shavuot/.test(desc)
                  ? 'shavuos'
                  : desc
    return made('yomTov', family, true)
  }
  if (has(flags.CHOL_HAMOED)) {
    return /Hoshana/.test(desc)
      ? made('cholHamoed', 'hoshanaRaba', true)
      : made('cholHamoed', 'cholHamoed', true)
  }
  if (has(flags.LIGHT_CANDLES) && has(flags.EREV)) return made('yomTov', 'erevYomTov', true)
  if (has(flags.MODERN_HOLIDAY)) {
    return /Yom HaAtzma'ut|Yom Yerushalayim/.test(desc)
      ? made('minor', desc, true)
      : made('israeli', desc, false)
  }
  if (/Tish'a B'Av/.test(desc)) return made('fast', 'tishaBav', true)
  if (has(flags.YOM_KIPPUR_KATAN)) return made('other', 'yomKippurKatan', false)
  if (has(flags.BEHAB)) return made('other', desc, false)
  if (has(flags.MAJOR_FAST) || has(flags.MINOR_FAST)) return made('fast', desc, true)
  if (has(flags.ROSH_CHODESH)) return made('minor', 'roshChodesh', true)
  if (has(flags.SPECIAL_SHABBAT)) return made('minor', desc, false, 0)
  if (/LaBehemot|Selichot/.test(desc)) return made('other', desc, false)
  if (has(flags.CHANUKAH_CANDLES) || /Chanukah|Chag HaBanot/.test(desc)) return made('minor', 'chanukah', true)
  if (/Purim/.test(desc)) return made('minor', 'purim', true)
  if (has(flags.MINOR_HOLIDAY)) return made('minor', desc, true)
  return made('other', desc, false)
}
/* eslint-enable no-bitwise */

const SKIPPED = flags.SHABBAT_MEVARCHIM | flags.MOLAD | flags.USER_EVENT | flags.HEBREW_DATE | flags.OMER_COUNT

/** Every holiday in the months, once each: what the shul can turn off. */
export function holidayChoices(months: CalendarMonth[]): (CalendarHoliday & { count: number })[] {
  const found = new Map<string, CalendarHoliday & { count: number }>()
  for (const month of months)
    for (const cell of month.weeks.flat())
      for (const h of cell?.holidays ?? []) {
        const known = found.get(h.id)
        if (known) known.count += 1
        else found.set(h.id, { ...h, count: 1 })
      }
  return [...found.values()].sort(
    (a, b) => CALENDAR_GROUPS.indexOf(a.group) - CALENDAR_GROUPS.indexOf(b.group) || a.name.localeCompare(b.name),
  )
}

/** A name for keying a month's own footer. */
export const monthKey = (month: Pick<CalendarMonth, 'start'>) => month.start

// ---------------------------------------------------------------------------
// Building

const WORDS = {
  en: { fast: 'Fast', omer: 'Omer', yahrzeit: 'Yahrzeit', birthday: 'Birthday', anniversary: 'Anniversary' },
  he: { fast: 'צום', omer: 'עומר', yahrzeit: 'יארצייט', birthday: 'יום הולדת', anniversary: 'יום נישואין' },
}

const omerDay = (hd: HDate) => {
  const day = hd.abs() - new HDate(15, months.NISAN, hd.getFullYear()).abs()
  return day >= 1 && day <= 49 ? day : undefined
}

const isRest = (tags: string[]) => tags.includes('shabbos') || tags.includes('yomTov')

/**
 * One month's weeks for the shul. Candle lighting is on the day it's lit (the eve, or the Friday of a Yom Tov that
 * runs into Shabbos; after nightfall on the second night), havdalah on the last day that can't be worked on, and a
 * fast's times on its own day.
 */
export function buildMonth(
  cal: Calendar,
  startDate: DateString,
  settings: CalendarPrintSettings | undefined,
  t: Wording,
): CalendarMonth {
  const o = calendarOptions(settings)
  const sh = cal.schedule
  const lang = t.lang
  const words = WORDS[lang]
  const { start, end } = monthBounds(o.basis, startDate)
  const customNames: Record<string, Localized> = Object.fromEntries(
    (sh.settings.zmanim?.custom ?? []).map((c) => [c.id, customZmanName(c)]),
  )

  const yahrzeits = o.yahrzeits
    ? yahrzeitsBetween(sh.yahrzeits?.filter((y) => !o.hiddenPeople.has(y.id)), start, end)
    : []
  const birthdays = o.birthdays
    ? occasionsBetween(sh.birthdays?.filter((b) => !o.hiddenPeople.has(b.id)), start, end)
    : []
  const anniversaries = o.anniversaries
    ? occasionsBetween(sh.anniversaries?.filter((a) => !o.hiddenPeople.has(a.id)), start, end)
    : []
  const nameOf = (p: Yahrzeit | Occasion, show: Parameters<Wording['yahrzeitNames']>[1]) =>
    t.yahrzeitNames(p, show).join(' · ')

  const cellFor = (date: DateString): CalendarCell => {
    const info = cal.info(date)
    const tags = [...info.tags]
    const tomorrowTags = [...cal.info(addDays(date, 1)).tags]
    const zmanim = cal.zmanimOn(date)
    const time = (m: Minutes) => t.clock(m)
    const times: CalendarTimeLine[] = []
    const push = (label: string, m: Minutes | undefined, text?: string) => {
      if (m !== undefined) times.push({ label, time: text ?? time(m), at: m })
    }

    if (o.restTimes) {
      const rest = isRest(tags)
      if (isRest(tomorrowTags)) {
        // The eve of a rest day lights before sunset; a rest day running into another (the second night of Yom Tov)
        // lights after nightfall, which is havdalah's time.
        if (!rest || info.weekday === 5) push(t.zman('candleLighting'), zmanim.candleLighting)
        else push(t.zman('candleLighting'), zmanim.havdalah)
      }
      if (rest && !isRest(tomorrowTags)) push(t.zman('havdalah'), zmanim.havdalah)
    }
    if (o.fastTimes && tags.includes('fast')) {
      const tishaBav = info.holidays.some((e) => /Tish'a B'Av/.test(e.getDesc()))
      const begins = tishaBav ? cal.zmanimOn(addDays(date, -1)).sunset : zmanim.alos
      if (begins !== undefined && zmanim.fastEnds !== undefined)
        push(words.fast, begins, `${time(begins)} – ${time(zmanim.fastEnds)}`)
    }
    const picked = [...o.dayZmanim, ...(isRest(tags) ? o.restZmanim : [])]
    for (const id of new Set<ZmanKey>(picked)) push(t.zman(id, customNames), zmanim[id])
    times.sort((a, b) => a.at - b.at)

    const holidays = info.holidays
      .filter((e) => (e.getFlags() & SKIPPED) === 0)
      .map((e) =>
        classifyHoliday(e, t.text({ en: e.render('en'), he: e.render('he-x-NoNikud') })),
      )
    for (const local of info.localHolidays) {
      holidays.push({
        id: `civil:${local.id ?? local.name.en}`,
        name: t.text(local.name),
        group: 'civil',
        marks: false,
        rank: RANK.civil,
      })
    }

    const events: CalendarEventLine[] = cal
      .occurrences(date)
      .filter(
        (e) =>
          !e.cancelled &&
          (e.minutes !== null || e.untimed) &&
          (o.events.has(e.eventId) || (o.oneTime && e.source === 'added')),
      )
      .map((e) => ({
        id: e.eventId,
        name: t.text(e.name),
        time: e.untimed && e.relative ? t.relative(e.relative) : t.timeRange(e.minutes!, e.endMinutes),
      }))

    const people: CalendarPerson[] = [
      ...yahrzeits
        .filter((y) => y.date === date)
        .map((y) => ({
          kind: 'yahrzeit' as const,
          id: y.yahrzeit.id,
          label: words.yahrzeit,
          text: nameOf(y.yahrzeit, sh.settings.yahrzeits?.names),
        })),
      ...birthdays
        .filter((b) => b.date === date)
        .map((b) => ({
          kind: 'birthday' as const,
          id: b.occasion.id,
          label: words.birthday,
          text: nameOf(b.occasion, sh.settings.birthdays?.names),
        })),
      ...anniversaries
        .filter((a) => a.date === date)
        .map((a) => ({
          kind: 'anniversary' as const,
          id: a.occasion.id,
          label: words.anniversary,
          text: nameOf(a.occasion, sh.settings.anniversaries?.names),
        })),
    ].filter((p) => p.text)

    const hd = info.hdate
    const civilDay = parseDate(date)
    const hebrewDay = lang === 'he' ? gematriya(hd.getDate()) : String(hd.getDate())
    const hebrewSecondary = hd.getDate() === 1 ? `${hebrewDay} ${hebrewMonthName(date, lang)}` : hebrewDay
    const civilSecondary =
      civilDay.day === 1 ? `${civilDay.day} ${civilMonthName(date, lang).slice(0, lang === 'he' ? 4 : 3)}` : String(civilDay.day)
    const hebrew = o.basis === 'hebrew'
    const omer = o.omer ? omerDay(hd) : undefined

    return {
      date,
      weekday: info.weekday,
      primary: hebrew ? hebrewDay : String(civilDay.day),
      secondary: hebrew ? civilSecondary : hebrewSecondary,
      shabbos: info.weekday === 6,
      parsha: o.parsha && info.weekday === 6 && cal.day(date).parsha ? t.text(cal.day(date).parsha!) : undefined,
      omer: omer ? `${words.omer} ${lang === 'he' ? gematriya(omer) : omer}` : undefined,
      holidays: holidays.sort((a, b) => a.rank - b.rank),
      events,
      times,
      people,
    }
  }

  const weeks: (CalendarCell | undefined)[][] = []
  let week: (CalendarCell | undefined)[] = Array.from({ length: weekdayOf(start) })
  for (let date = start; date <= end; date = addDays(date, 1)) {
    week.push(cellFor(date))
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push([...week, ...Array.from<undefined>({ length: 7 - week.length })])
  return { start, end, ...monthTitles(o.basis, start, end, lang), weeks }
}

/** The footer under a month: its own if it has one, else the one for every month. */
export const footerFor = (settings: CalendarPrintSettings | undefined, month: Pick<CalendarMonth, 'start'>) => {
  const own = settings?.monthFooters?.[monthKey(month)]?.trim()
  return own || settings?.footer?.trim() || ''
}
