import type { CivilCalendar, LocalHoliday, ShulSettings } from './types'

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
  { id: 'christmas', name: { en: 'Christmas' }, date: { month: 12, day: 25, observed: 'nearest' } },
]

/** UK (England and Wales) bank holidays; a weekend one moves to the next free weekday. */
export const UK_HOLIDAYS: LocalHoliday[] = [
  { id: 'new-years-day', name: { en: "New Year's Day" }, date: { month: 1, day: 1, observed: 'next' } },
  { id: 'good-friday', name: { en: 'Good Friday' }, date: { easter: -2 } },
  { id: 'easter-monday', name: { en: 'Easter Monday' }, date: { easter: 1 } },
  { id: 'early-may', name: { en: 'Early May bank holiday' }, date: { month: 5, weekday: MON, nth: 1 } },
  { id: 'spring', name: { en: 'Spring bank holiday' }, date: { month: 5, weekday: MON, nth: -1 } },
  { id: 'summer', name: { en: 'Summer bank holiday' }, date: { month: 8, weekday: MON, nth: -1 } },
  { id: 'christmas', name: { en: 'Christmas Day' }, date: { month: 12, day: 25, observed: 'next' } },
  { id: 'boxing-day', name: { en: 'Boxing Day' }, date: { month: 12, day: 26, observed: 'next' } },
]

export const LOCAL_HOLIDAY_PRESETS = {
  us: { label: 'US federal holidays', holidays: US_HOLIDAYS },
  uk: { label: 'UK bank holidays (England & Wales)', holidays: UK_HOLIDAYS },
} as const

const US_ZONES = /^(America\/(New_York|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Detroit|Adak|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu|US\/)/

/** The built-in calendar a time zone implies. */
export function inferCivilCalendar(timeZone: string): CivilCalendar {
  if (US_ZONES.test(timeZone)) return 'us'
  if (timeZone === 'Europe/London') return 'uk'
  return 'none'
}

export const civilCalendarOf = (settings: ShulSettings): CivilCalendar =>
  settings.civilHolidays ?? inferCivilCalendar(settings.location.timeZone)

/** The built-in holidays of the shul's calendar, before it switches any off. */
export const builtInHolidays = (settings: ShulSettings): LocalHoliday[] => {
  const cal = civilCalendarOf(settings)
  return cal === 'us' ? US_HOLIDAYS : cal === 'uk' ? UK_HOLIDAYS : []
}

/** Everything the shul counts: its built-in calendar minus the ignored, with its own on top. */
export function effectiveHolidays(settings: ShulSettings): LocalHoliday[] {
  const own = settings.localHolidays ?? []
  const skip = new Set([...(settings.ignoredHolidays ?? []), ...own.map((h) => h.id)])
  return [...builtInHolidays(settings).filter((h) => !skip.has(h.id)), ...own]
}
