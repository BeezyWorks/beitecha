import {
  HDate,
  HebrewCalendar,
  Locale,
  Location,
  Zmanim,
  flags,
  getSedra,
  months,
  type HolidayEvent,
} from '@hebcal/core'

import { addDays, hostDate, isDst, minutesInZone, startOfWeek, weekdayOf } from './dates'
import type { DateString, DayTag, LocalHoliday, Localized, Minutes, ShulSettings, Weekday, ZmanId } from './types'

export interface DayInfo {
  date: DateString
  weekday: Weekday
  hdate: HDate
  holidays: HolidayEvent[]
  /** The shul's own civil holidays on this date. */
  localHolidays: LocalHoliday[]
  tags: Set<DayTag>
}

function holidaysOn(hd: HDate, il: boolean): HolidayEvent[] {
  return HebrewCalendar.getHolidaysOnDate(hd, il) ?? []
}

const has = (evs: HolidayEvent[], mask: number) => evs.some((e) => (e.getFlags() & mask) !== 0)

/**
 * A fast day the shul davens differently on. Not Yom Kippur (it's Yom Tov), not Erev
 * Tish'a B'Av (Hebcal flags the fast's eve), not BeHaB or Bechoros (individuals' fasts).
 */
const isPublicFast = (e: HolidayEvent) =>
  (e.getFlags() & (flags.MINOR_FAST | flags.MAJOR_FAST)) !== 0 &&
  (e.getFlags() & (flags.CHAG | flags.EREV | flags.BEHAB)) === 0 &&
  e.getDesc() !== "Ta'anit Bechorot"

function inChanukah(hd: HDate): boolean {
  // Kislev and Teves share a Hebrew year, so 25 Kislev of this year starts it.
  const start = new HDate(25, months.KISLEV, hd.getFullYear())
  const diff = hd.abs() - start.abs()
  return diff >= 0 && diff < 8
}

function inOmer(hd: HDate): boolean {
  const m = hd.getMonth()
  const d = hd.getDate()
  return (m === months.NISAN && d >= 16) || m === months.IYYAR || (m === months.SIVAN && d <= 5)
}

/** Selichos mornings: Ashkenaz from the Sunday at least four days before Rosh Hashana,
 * Sefard from 2 Elul; both through Erev Yom Kippur, skipping Shabbos and Yom Tov. */
function isSelichos(date: DateString, hd: HDate, settings: ShulSettings, yomTov: boolean): boolean {
  const minhag = settings.selichos ?? 'ashkenaz'
  if (minhag === 'none' || yomTov || weekdayOf(date) === 6) return false
  const m = hd.getMonth()
  const d = hd.getDate()
  if (m === months.TISHREI) return d <= 9
  if (m !== months.ELUL) return false
  if (minhag === 'sefard') return d >= 2
  const roshHashana = new HDate(1, months.TISHREI, hd.getFullYear() + 1)
  const daysUntil = roshHashana.abs() - hd.abs()
  const rhDate = addDays(date, daysUntil)
  return date >= startOfWeek(addDays(rhDate, -4))
}

export function dayInfo(date: DateString, settings: ShulSettings, localHolidays: LocalHoliday[] = []): DayInfo {
  const { israel, timeZone } = settings.location
  const hdate = new HDate(hostDate(date))
  const weekday = weekdayOf(date)
  const holidays = holidaysOn(hdate, israel)
  const tomorrow = holidaysOn(hdate.next(), israel)
  const yomTov = has(holidays, flags.CHAG)
  const yomTovTomorrow = has(tomorrow, flags.CHAG)

  const tags = new Set<DayTag>()
  if (weekday === 6) tags.add('shabbos')
  if (weekday === 5) tags.add('erevShabbos')
  if (weekday === 6 && !yomTovTomorrow) tags.add('motzeiShabbos')
  if (yomTov) tags.add('yomTov')
  if (yomTovTomorrow && !yomTov) tags.add('erevYomTov')
  if (yomTov && !yomTovTomorrow && weekday !== 5) tags.add('motzeiYomTov')
  if (has(holidays, flags.CHOL_HAMOED)) tags.add('cholHamoed')
  if (has(holidays, flags.ROSH_CHODESH)) tags.add('roshChodesh')
  if (holidays.some(isPublicFast)) tags.add('fast')
  if (inChanukah(hdate)) tags.add('chanukah')
  if (holidays.some((e) => e.getDesc() === 'Purim')) tags.add('purim')
  if (!HebrewCalendar.tachanun(hdate, israel).shacharit) tags.add('noTachanun')
  if (isSelichos(date, hdate, settings, yomTov)) tags.add('selichos')
  if (hdate.getMonth() === months.TISHREI && hdate.getDate() <= 10) tags.add('aseresYemeiTeshuva')
  if (inOmer(hdate)) tags.add('omer')
  if (isDst(date, timeZone)) tags.add('dst')
  if (localHolidays.length) tags.add('legalHoliday')

  return { date, weekday, hdate, holidays, localHolidays, tags }
}

export function holidayMatches(info: DayInfo, name: string): boolean {
  const n = name.toLowerCase()
  return info.holidays.some(
    (e) => e.getDesc().toLowerCase() === n || e.basename().toLowerCase() === n,
  )
}

/** Holidays worth showing on a luach (no Shabbos Mevarchim/molad noise). */
export function displayHolidays(info: DayInfo): Localized[] {
  const hidden = flags.SHABBAT_MEVARCHIM | flags.MOLAD | flags.USER_EVENT | flags.HEBREW_DATE
  return [
    ...info.holidays
      .filter((e) => (e.getFlags() & hidden) === 0)
      .map((e) => ({ en: e.render('en'), he: e.render('he-x-NoNikud') })),
    ...info.localHolidays.map((h) => h.name),
  ]
}

export function parshaFor(date: DateString, settings: ShulSettings): Localized | undefined {
  const shabbos = new HDate(hostDate(addDays(date, 6 - weekdayOf(date))))
  const result = getSedra(shabbos.getFullYear(), settings.location.israel).lookup(shabbos)
  if (result.chag) return undefined
  return {
    en: result.parsha.join('-'),
    he: result.parsha.map((p) => Locale.gettext(p, 'he-x-NoNikud')).join('-'),
  }
}

export function hebrewDateOf(info: DayInfo) {
  const hd = info.hdate
  return {
    day: hd.getDate(),
    month: hd.getMonthName(),
    year: hd.getFullYear(),
    en: hd.render('en'),
    he: hd.renderGematriya(true),
  }
}

// ---------------------------------------------------------------------------
// Zmanim

/**
 * Zmanim are rounded to whole minutes the safe way: times you must act *before*
 * (sof zman, sunset, candle lighting) round down; times you must wait *for*
 * (alos, sunrise, tzeis, havdalah, chatzos, mincha) round up.
 */
const ROUND_UP: ReadonlySet<ZmanId> = new Set([
  'alos',
  'misheyakir',
  'sunrise',
  'chatzos',
  'minchaGedola',
  'minchaKetana',
  'plag',
  'tzeis',
  'havdalah',
])

export function zmanimFor(date: DateString, settings: ShulSettings): Partial<Record<ZmanId, Minutes>> {
  const { latitude, longitude, elevation, timeZone, israel } = settings.location
  const opts = settings.zmanim ?? {}
  const loc = new Location(latitude, longitude, israel, timeZone, undefined, undefined, undefined, elevation ?? 0)
  const z = new Zmanim(loc, new HDate(hostDate(date)), opts.useElevation ?? false)
  const tzeisAngle = opts.tzeisAngle ?? 8.5
  const havdalah = opts.havdalah ?? { angle: 8.5 }
  const candleMinutes = opts.candleLightingMinutes ?? 18

  const raw: Record<ZmanId, () => Date> = {
    alos: () => z.alotHaShachar(),
    misheyakir: () => z.misheyakir(),
    sunrise: () => z.sunrise(),
    sofZmanShmaMga: () => z.sofZmanShmaMGA(),
    sofZmanShma: () => z.sofZmanShma(),
    sofZmanTefilaMga: () => z.sofZmanTfillaMGA(),
    sofZmanTefila: () => z.sofZmanTfilla(),
    chatzos: () => z.chatzot(),
    minchaGedola: () => z.minchaGedola(),
    minchaKetana: () => z.minchaKetana(),
    plag: () => z.plagHaMincha(),
    candleLighting: () => new Date(z.sunset().getTime() - candleMinutes * 60_000),
    sunset: () => z.sunset(),
    tzeis: () => z.tzeit(tzeisAngle),
    havdalah: () =>
      'minutes' in havdalah
        ? new Date(z.sunset().getTime() + havdalah.minutes * 60_000)
        : z.tzeit(havdalah.angle),
  }

  const out: Partial<Record<ZmanId, Minutes>> = {}
  for (const id of Object.keys(raw) as ZmanId[]) {
    const instant = raw[id]()
    // Polar days have no sunrise/sunset; hebcal returns an invalid Date.
    if (Number.isNaN(instant.getTime())) continue
    const exact = minutesInZone(instant, date, timeZone)
    out[id] = ROUND_UP.has(id) ? Math.ceil(exact - 1e-9) : Math.floor(exact)
  }
  return out
}
