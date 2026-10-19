import type { CivilCalendar, LocalHoliday, ShulSettings, Weekday } from './types'

/** What the shul shows for a day that's a public holiday only for its religious origin. */
export const PUBLIC_HOLIDAY = 'Public holiday'

const MON = 1
const THU = 4

/** US federal holidays, observed on the nearest weekday. */
export const US_HOLIDAYS: LocalHoliday[] = [
  { id: 'new-years-day', name: { en: "New Year's Day" }, date: { month: 1, day: 1, observed: 'nearest' } },
  { id: 'mlk-day', name: { en: 'Martin Luther King Jr. Day' }, date: { month: 1, weekday: MON, nth: 3 } },
  { id: 'presidents-day', name: { en: "Presidents' Day" }, date: { month: 2, weekday: MON, nth: 3 } },
  { id: 'memorial-day', name: { en: 'Memorial Day' }, date: { month: 5, weekday: MON, nth: -1 } },
  { id: 'juneteenth', name: { en: 'Juneteenth' }, date: { month: 6, day: 19, observed: 'nearest' } },
  { id: 'independence-day', name: { en: 'Fourth of July' }, date: { month: 7, day: 4, observed: 'nearest' } },
  { id: 'labor-day', name: { en: 'Labor Day' }, date: { month: 9, weekday: MON, nth: 1 } },
  { id: 'columbus-day', name: { en: 'Columbus Day' }, date: { month: 10, weekday: MON, nth: 2 } },
  { id: 'veterans-day', name: { en: 'Veterans Day' }, date: { month: 11, day: 11, observed: 'nearest' } },
  { id: 'thanksgiving', name: { en: 'Thanksgiving' }, date: { month: 11, weekday: THU, nth: 4 } },
  { id: 'christmas', name: { en: PUBLIC_HOLIDAY }, date: { month: 12, day: 25, observed: 'nearest' } },
]

/** UK (England and Wales) bank holidays; a weekend one moves to the next free weekday. */
export const UK_HOLIDAYS: LocalHoliday[] = [
  { id: 'new-years-day', name: { en: "New Year's Day" }, date: { month: 1, day: 1, observed: 'next' } },
  { id: 'good-friday', name: { en: PUBLIC_HOLIDAY }, date: { easter: -2 } },
  { id: 'easter-monday', name: { en: PUBLIC_HOLIDAY }, date: { easter: 1 } },
  { id: 'early-may', name: { en: 'Early May bank holiday' }, date: { month: 5, weekday: MON, nth: 1 } },
  { id: 'spring', name: { en: 'Spring bank holiday' }, date: { month: 5, weekday: MON, nth: -1 } },
  { id: 'summer', name: { en: 'Summer bank holiday' }, date: { month: 8, weekday: MON, nth: -1 } },
  { id: 'christmas', name: { en: PUBLIC_HOLIDAY }, date: { month: 12, day: 25, observed: 'next' } },
  { id: 'boxing-day', name: { en: PUBLIC_HOLIDAY }, date: { month: 12, day: 26, observed: 'next' } },
]

const day = (id: string, name: string, month: number, d: number, observed?: 'nearest' | 'next'): LocalHoliday => ({
  id,
  name: { en: name },
  date: { month, day: d, ...(observed ? { observed } : {}) },
})
const nth = (id: string, name: string, month: number, weekday: Weekday, n: 1 | 2 | 3 | 4 | -1): LocalHoliday => ({
  id,
  name: { en: name },
  date: { month, weekday, nth: n },
})
const easter = (id: string, name: string, days: number): LocalHoliday => ({ id, name: { en: name }, date: { easter: days } })

const patriotsDay = (id: string, name: string): LocalHoliday => ({
  id,
  name: { en: name },
  date: { month: 5, day: 25, weekdayBefore: MON },
})

/** Canada's federal statutory holidays; a weekend one moves to the next free weekday. */
export const CA_HOLIDAYS: LocalHoliday[] = [
  day('new-years-day', "New Year's Day", 1, 1, 'next'),
  easter('good-friday', PUBLIC_HOLIDAY, -2),
  patriotsDay('victoria-day', 'Victoria Day'),
  day('canada-day', 'Canada Day', 7, 1, 'next'),
  nth('labour-day', 'Labour Day', 9, MON, 1),
  day('truth-and-reconciliation', 'National Day for Truth and Reconciliation', 9, 30),
  nth('thanksgiving', 'Thanksgiving', 10, MON, 2),
  day('remembrance-day', 'Remembrance Day', 11, 11),
  day('christmas', PUBLIC_HOLIDAY, 12, 25, 'next'),
  day('boxing-day', PUBLIC_HOLIDAY, 12, 26, 'next'),
]

/** Quebec's public holidays. */
export const CA_QC_HOLIDAYS: LocalHoliday[] = [
  day('new-years-day', "New Year's Day", 1, 1),
  easter('good-friday', PUBLIC_HOLIDAY, -2),
  patriotsDay('patriotes-day', 'National Patriots’ Day'),
  day('fete-nationale', 'Fête nationale', 6, 24),
  day('canada-day', 'Canada Day', 7, 1),
  nth('labour-day', 'Labour Day', 9, MON, 1),
  nth('thanksgiving', 'Thanksgiving', 10, MON, 2),
  day('christmas', PUBLIC_HOLIDAY, 12, 25),
]

/** France's jours fériés. */
export const FR_HOLIDAYS: LocalHoliday[] = [
  day('new-years-day', "New Year's Day", 1, 1),
  easter('easter-monday', PUBLIC_HOLIDAY, 1),
  day('labour-day', 'Labour Day', 5, 1),
  day('victory-1945', 'Victory in Europe Day', 5, 8),
  easter('ascension', PUBLIC_HOLIDAY, 39),
  easter('whit-monday', PUBLIC_HOLIDAY, 50),
  day('bastille-day', 'Bastille Day', 7, 14),
  day('assumption', PUBLIC_HOLIDAY, 8, 15),
  day('all-saints', PUBLIC_HOLIDAY, 11, 1),
  day('armistice', 'Armistice Day', 11, 11),
  day('christmas', PUBLIC_HOLIDAY, 12, 25),
]

export const CIVIL_CALENDARS: Record<Exclude<CivilCalendar, 'none'>, { label: string; holidays: LocalHoliday[] }> = {
  us: { label: 'US federal', holidays: US_HOLIDAYS },
  uk: { label: 'UK bank holidays (England & Wales)', holidays: UK_HOLIDAYS },
  ca: { label: 'Canada (federal)', holidays: CA_HOLIDAYS },
  'ca-qc': { label: 'Quebec', holidays: CA_QC_HOLIDAYS },
  fr: { label: 'France (jours fériés)', holidays: FR_HOLIDAYS },
}

const US_ZONES = /^(America\/(New_York|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Detroit|Adak|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu|US\/)/

const CA_ZONES = /^America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Regina|Halifax|St_Johns|Moncton|Glace_Bay|Whitehorse|Yellowknife|Iqaluit)$/

/** The built-in calendar a time zone implies. */
export function inferCivilCalendar(timeZone: string): CivilCalendar {
  if (US_ZONES.test(timeZone)) return 'us'
  if (timeZone === 'Europe/London') return 'uk'
  if (timeZone === 'Europe/Paris') return 'fr'
  if (CA_ZONES.test(timeZone)) return 'ca' // Montreal shares Toronto's zone; Quebec is chosen by hand
  return 'none'
}

export const civilCalendarOf = (settings: ShulSettings): CivilCalendar =>
  settings.civilHolidays ?? inferCivilCalendar(settings.location.timeZone)

/** The built-in holidays of the shul's calendar, before it switches any off. */
export const builtInHolidays = (settings: ShulSettings): LocalHoliday[] => {
  const cal = civilCalendarOf(settings)
  return cal === 'none' ? [] : CIVIL_CALENDARS[cal].holidays
}

/** Everything the shul counts: its built-in calendar minus the ignored, with its own on top. */
export function effectiveHolidays(settings: ShulSettings): LocalHoliday[] {
  const own = settings.localHolidays ?? []
  const skip = new Set([...(settings.ignoredHolidays ?? []), ...own.map((h) => h.id)])
  return [...builtInHolidays(settings).filter((h) => !skip.has(h.id)), ...own]
}
