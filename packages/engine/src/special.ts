import { addDays, weekdayOf } from './dates'
import { chametzZmanim, dayInfo, isPublicFast, zmanimFor } from './day'
import type { DateString, LocalHoliday, Localized, Minutes, ShulSettings } from './types'

/** One time among a week's special zmanim, on its own date. */
export interface SpecialZman {
  id: string
  date: DateString
  name: Localized
  minutes: Minutes
}

/** A fast, or Erev Pesach, with the zmanim that go with it. */
export interface SpecialZmanimGroup {
  key: 'fast' | 'tishaBav' | 'pesach'
  title: Localized
  rows: SpecialZman[]
}

const WORDS = {
  fastBegins: { en: 'Fast begins', he: 'תחילת הצום' },
  fastEnds: { en: 'Fast ends', he: 'סיום הצום' },
  chatzos: { en: 'Chatzos', he: 'חצות' },
  eatMga: { en: 'Latest time to eat chametz (MGA)', he: 'סוף זמן אכילת חמץ מג״א' },
  eatGra: { en: 'Latest time to eat chametz (GRA)', he: 'סוף זמן אכילת חמץ גר״א' },
  burnMga: { en: 'Latest time to burn chametz (MGA)', he: 'סוף זמן ביעור חמץ מג״א' },
  burnGra: { en: 'Latest time to burn chametz (GRA)', he: 'סוף זמן ביעור חמץ גר״א' },
} satisfies Record<string, Localized>

const holidayName = (e: { render(l: string): string }): Localized => ({
  en: e.render('en'),
  he: e.render('he-x-NoNikud'),
})

/**
 * The extra zmanim for the `days` (default a week) starting `sunday`: for each public fast (not Yom Kippur) when it begins (alos; on Tish'a
 * B'Av the sunset before, plus chatzos) and ends (`zmanim.fastEnds`), and for Erev Pesach the last times to eat and burn
 * chametz. A Tish'a B'Av on Sunday begins Shabbos at sunset, so it belongs to the week before too. Empty most weeks.
 */
export function specialZmanim(
  sunday: DateString,
  settings: ShulSettings,
  localHolidays: LocalHoliday[] = [],
  days = 7,
): SpecialZmanimGroup[] {
  const groups: SpecialZmanimGroup[] = []
  for (let i = 0; i <= days; i++) {
    const date = addDays(sunday, i)
    const info = dayInfo(date, settings, localHolidays)
    const fast = info.holidays.find(isPublicFast)
    const tishaBav = fast?.getDesc() === "Tish'a B'Av"
    // The day after the range's fast is its only when it starts before, on Shabbos's sunset.
    if (fast && (i < days || tishaBav)) {
      const times = zmanimFor(date, settings)
      const begin = tishaBav ? zmanimFor(addDays(date, -1), settings).sunset : times.alos
      const row = (id: keyof typeof WORDS, at: Minutes | undefined, on = date): SpecialZman[] =>
        at === undefined ? [] : [{ id, date: on, name: WORDS[id], minutes: at }]
      groups.push({
        key: tishaBav ? 'tishaBav' : 'fast',
        title: holidayName(fast),
        rows: [
          ...row('fastBegins', begin, tishaBav ? addDays(date, -1) : date),
          ...(tishaBav ? row('chatzos', times.chatzos) : []),
          ...row('fastEnds', times.fastEnds),
        ],
      })
    }
    const erevPesach = i < days && info.holidays.find((e) => e.getDesc() === 'Erev Pesach')
    if (erevPesach) {
      const c = chametzZmanim(date, settings)
      // Erev Pesach on Shabbos: chametz is eaten that morning but burned on Friday.
      const burnDate = weekdayOf(date) === 6 ? addDays(date, -1) : date
      const burn = burnDate === date ? c : chametzZmanim(burnDate, settings)
      const rows = [
        ['eatMga', date, c.eatMga],
        ['eatGra', date, c.eatGra],
        ['burnMga', burnDate, burn.burnMga],
        ['burnGra', burnDate, burn.burnGra],
      ].flatMap(([id, on, minutes]) =>
        minutes === undefined
          ? []
          : [{ id: id as string, date: on as DateString, name: WORDS[id as keyof typeof WORDS], minutes: minutes as number }],
      )
      groups.push({ key: 'pesach', title: holidayName(erevPesach), rows })
    }
  }
  return groups
}
