import { HDate, months } from '@hebcal/core'
import { afterEach, describe, expect, it } from 'vitest'

import { dayInfo } from '../day'
import { addDays, hostDate } from '../dates'
import {
  CA_HOLIDAYS,
  CIVIL_CALENDARS,
  PUBLIC_HOLIDAY,
  Calendar,
  FR_HOLIDAYS,
  UK_HOLIDAYS,
  US_HOLIDAYS,
  computeDay,
  formatClock,
  formatTime,
  timeFormatProblem,
  inferCivilCalendar,
  localHolidayDates,
  localize,
  nameStyle,
  sampleSchedule,
  starterSchedule,
  validate,
} from '../index'
import type { EventDef, LocalHoliday, Schedule, ShulSettings } from '../types'

const settings = sampleSchedule.settings
const tags = (date: string, s: ShulSettings = settings) => [...dayInfo(date, s).tags]
const timeOf = (schedule: Schedule, eventId: string, date: string) => {
  const o = computeDay(schedule, date).events.find((e) => e.eventId === eventId)
  return o?.minutes == null ? undefined : formatClock(o.minutes)
}
const withEvents = (events: EventDef[], extra: Partial<Schedule> = {}): Schedule => ({
  ...sampleSchedule,
  events,
  exceptions: [],
  notices: [],
  ...extra,
})
const gregOf = (hd: HDate) => {
  const d = hd.greg()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('day tags', () => {
  it('only counts public fasts', () => {
    expect(tags('2026-10-19')).not.toContain('fast') // BeHaB
    expect(tags('2027-04-21')).not.toContain('fast') // Ta'anis Bechoros
    expect(tags('2027-08-11')).not.toContain('fast') // Erev Tish'a B'Av
    expect(tags('2027-08-12')).toContain('fast') // Tish'a B'Av
    expect(tags('2026-12-20')).toContain('fast') // Asara B'Teves on a Sunday
    expect(tags('2026-09-21')).not.toContain('fast') // Yom Kippur…
    expect(tags('2026-09-21')).toContain('yomTov') // …is Yom Tov
  })

  it('handles Rosh Hashana on Shabbos', () => {
    expect(tags('2027-10-01')).toEqual(expect.arrayContaining(['erevShabbos', 'erevYomTov']))
    const rh1 = tags('2027-10-02')
    expect(rh1).toEqual(expect.arrayContaining(['shabbos', 'yomTov']))
    expect(rh1).not.toContain('motzeiShabbos') // Yom Tov continues
    expect(tags('2027-10-03')).toContain('motzeiYomTov')
  })

  it('runs Chanukah from 25 Kislev for eight days', () => {
    expect(tags('2026-12-04')).not.toContain('chanukah') // 24 Kislev: first candle that night
    expect(tags('2026-12-05')).toContain('chanukah')
    expect(tags('2026-12-12')).toContain('chanukah') // 2 Teves (Kislev had 30 days)
    expect(tags('2026-12-13')).not.toContain('chanukah')
  })

  it('starts Ashkenaz selichos on the Sunday at least four days before Rosh Hashana', () => {
    // Rosh Hashana 5788 is Shabbos 2 Oct 2027.
    expect(tags('2027-09-19')).not.toContain('selichos')
    expect(tags('2027-09-26')).toContain('selichos')
    expect(tags('2027-10-02')).not.toContain('selichos') // Rosh Hashana
    expect(tags('2027-10-04')).toContain('selichos') // Tzom Gedalia
    expect(tags('2027-10-10')).toContain('selichos') // Erev Yom Kippur
    expect(tags('2027-10-11')).not.toContain('selichos')
  })

  it('pushes Ashkenaz selichos back a week when Rosh Hashana is Monday or Tuesday', () => {
    // Rosh Hashana 5790 is Monday 10 Sep 2029: the Sunday before is too close.
    expect(tags('2029-08-26')).not.toContain('selichos')
    expect(tags('2029-09-01')).not.toContain('selichos') // Shabbos
    expect(tags('2029-09-02')).toContain('selichos')
    expect(tags('2029-09-09')).toContain('selichos') // Erev Rosh Hashana
  })

  it('starts Sefard selichos on 2 Elul', () => {
    const sefard = { ...settings, selichos: 'sefard' as const }
    let elul2 = gregOf(new HDate(2, months.ELUL, 5787))
    if (new Date(`${elul2}T12:00:00Z`).getUTCDay() === 6) elul2 = addDays(elul2, 1)
    expect(tags(elul2, sefard)).toContain('selichos')
    expect(tags(addDays(gregOf(new HDate(2, months.ELUL, 5787)), -1), sefard)).not.toContain('selichos')
  })

  it('follows the Israel holiday schedule', () => {
    const il = { ...settings, location: { ...settings.location, israel: true } }
    expect(tags('2027-04-23')).toContain('yomTov') // Pesach II in chutz la'aretz
    expect(tags('2027-04-23', il)).toContain('cholHamoed')
    expect(tags('2027-04-23', il)).not.toContain('yomTov')
  })

  it('tags DST', () => {
    expect(tags('2026-10-31')).toContain('dst')
    expect(tags('2026-11-01')).not.toContain('dst')
  })
})

describe('rules', () => {
  it('uses the first rule that matches', () => {
    expect(timeOf(sampleSchedule, 'shacharis', '2026-10-18')).toBe('07:30') // Sunday
    expect(timeOf(sampleSchedule, 'shacharis', '2026-10-19')).toBe('06:15') // Monday
    expect(timeOf(sampleSchedule, 'shacharis', '2026-10-20')).toBe('06:30') // Tuesday
    expect(timeOf(sampleSchedule, 'shacharis', '2026-12-10')).toBe('06:15') // Rosh Chodesh, Thursday
    expect(timeOf(sampleSchedule, 'shacharis', '2026-10-24')).toBe('09:00') // Shabbos
    expect(timeOf(sampleSchedule, 'shacharis', '2027-09-26')).toBe('06:00') // Selichos
  })

  it('reports which rule matched', () => {
    const o = computeDay(sampleSchedule, '2026-10-19').events.find((e) => e.eventId === 'shacharis')
    expect(o?.ruleIndex).toBe(2)
  })

  it('leaves out events with no matching rule or a null rule', () => {
    const ids = computeDay(sampleSchedule, '2026-10-23').events.map((e) => e.eventId) // Friday
    expect(ids).not.toContain('maariv')
    expect(ids).not.toContain('shiur')
  })

  it('takes the earliest of candle lighting, plag and a cap, rounded down', () => {
    // Winter: plag (16:58) is earliest → 16:55.
    expect(timeOf(sampleSchedule, 'mincha', '2026-10-23')).toBe('16:55')
    // Summer: plag 18:57 → 18:55.
    expect(timeOf(sampleSchedule, 'mincha', '2027-06-25')).toBe('18:55')
    const capped = withEvents([
      {
        id: 'mincha',
        name: { en: 'Mincha' },
        kind: 'tefila',
        rules: [{ time: { earliest: [{ zman: 'candleLighting' }, { clock: '19:15' }] } }],
      },
    ])
    expect(timeOf(capped, 'mincha', '2027-06-25')).toBe('19:15') // candle lighting is 20:11
  })

  it('keeps a weekly time steady through the week', () => {
    const week = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']
    expect(new Set(week.map((d) => timeOf(sampleSchedule, 'mincha', d)))).toEqual(new Set(['17:50']))
    // Earliest sunset that week is Thursday's 18:06 → 17:51 → 17:50.
  })

  it('clamps', () => {
    const s = withEvents([
      {
        id: 'e',
        name: { en: 'E' },
        kind: 'other',
        rules: [{ time: { clamp: { zman: 'sunset' }, min: { clock: '18:30' }, max: { clock: '19:00' } } }],
      },
    ])
    expect(timeOf(s, 'e', '2026-12-20')).toBe('18:30') // sunset 16:34
    expect(timeOf(s, 'e', '2027-06-25')).toBe('19:00') // sunset 20:29
  })

  it('anchors events on other events', () => {
    expect(timeOf(sampleSchedule, 'shiur', '2026-10-24')).toBe('16:50') // mincha 17:20 − 30
  })

  it('reports a cycle instead of throwing', () => {
    const s = withEvents([
      { id: 'a', name: { en: 'A' }, kind: 'other', rules: [{ time: { offset: 5, of: { event: 'b' } } }] },
      { id: 'b', name: { en: 'B' }, kind: 'other', rules: [{ time: { offset: 5, of: { event: 'a' } } }] },
    ])
    const a = computeDay(s, '2026-10-20').events.find((e) => e.eventId === 'a')
    expect(a?.minutes).toBeNull()
    expect(a?.error).toMatch(/depends on itself/)
  })
})

describe('exceptions', () => {
  it('cancels with a note and keeps the occurrence', () => {
    const o = computeDay(sampleSchedule, '2026-10-31').events.find((e) => e.eventId === 'shiur')
    expect(o).toMatchObject({ cancelled: true, source: 'exception', note: { en: 'The Rav is away this week' } })
  })

  it('moves an event and everything anchored on it', () => {
    const s: Schedule = {
      ...sampleSchedule,
      exceptions: [{ id: 'm', date: '2026-10-24', type: 'retime', eventId: 'mincha', time: { clock: '16:00' } }],
    }
    expect(timeOf(s, 'mincha', '2026-10-24')).toBe('16:00')
    expect(timeOf(s, 'shiur', '2026-10-24')).toBe('15:30')
  })

  it('drops events anchored on a cancelled one', () => {
    const s: Schedule = {
      ...sampleSchedule,
      exceptions: [{ id: 'm', date: '2026-10-24', type: 'cancel', eventId: 'mincha' }],
    }
    const ids = computeDay(s, '2026-10-24').events.map((e) => e.eventId)
    expect(ids).toContain('mincha')
    expect(ids).not.toContain('shiur')
  })

  it('adds one-off events', () => {
    const s: Schedule = {
      ...sampleSchedule,
      exceptions: [
        {
          id: 's',
          date: '2026-10-20',
          type: 'add',
          event: { id: 'siyum', name: { en: 'Siyum' }, kind: 'other' },
          time: { offset: 15, of: { event: 'maariv' } },
        },
      ],
    }
    expect(timeOf(s, 'siyum', '2026-10-20')).toBe('21:15')
    expect(timeOf(s, 'siyum', '2026-10-21')).toBeUndefined()
  })
})

describe('notices', () => {
  it('shows a notice from its first to its last day', () => {
    const s: Schedule = {
      ...sampleSchedule,
      notices: [{ id: 'n', kind: 'announcement', from: '2026-10-20', to: '2026-10-22', text: { en: 'Hi' } }],
    }
    const cal = new Calendar(s)
    expect(cal.notices('2026-10-19')).toHaveLength(0)
    expect(cal.notices('2026-10-20')).toHaveLength(1)
    expect(cal.notices('2026-10-22')).toHaveLength(1)
    expect(cal.notices('2026-10-23')).toHaveLength(0)
  })
})

describe('validate', () => {
  it('passes the sample', () => {
    expect(validate(sampleSchedule, '2026-10-01', 400).filter((i) => i.level === 'error')).toEqual([])
  })

  it('flags unknown references and exceptions that do nothing', () => {
    const s: Schedule = {
      ...sampleSchedule,
      events: [
        ...sampleSchedule.events,
        { id: 'x', name: { en: 'X' }, kind: 'other', rules: [{ time: { event: 'nope' } }] },
      ],
      exceptions: [
        { id: 'tue', date: '2026-10-20', type: 'cancel', eventId: 'shiur' }, // shiur is Shabbos only
        { id: 'gone', date: '2026-10-20', type: 'cancel', eventId: 'deleted' },
      ],
    }
    const issues = validate(s, '2026-10-18', 7)
    expect(issues.some((i) => i.eventId === 'x' && /unknown event "nope"/.test(i.message))).toBe(true)
    expect(issues.some((i) => i.exceptionId === 'tue' && /does nothing/.test(i.message))).toBe(true)
    expect(issues.some((i) => i.exceptionId === 'gone' && /deleted event/.test(i.message))).toBe(true)
  })
})

describe('time zones', () => {
  const original = process.env.TZ
  afterEach(() => {
    process.env.TZ = original
  })

  it("gives the shul's local times whatever zone the computer is in", () => {
    const results = ['America/New_York', 'Asia/Tokyo', 'Pacific/Honolulu', 'UTC', 'Asia/Jerusalem'].map((tz) => {
      process.env.TZ = tz
      expect(hostDate('2026-10-20').getDate()).toBe(20)
      return JSON.stringify(new Calendar(sampleSchedule).range('2026-10-18', 14))
    })
    expect(new Set(results).size).toBe(1)
  })

  it('computes zmanim in the shul zone', () => {
    const jerusalem: Schedule = {
      ...sampleSchedule,
      settings: {
        location: { latitude: 31.778, longitude: 35.235, timeZone: 'Asia/Jerusalem', israel: true },
      },
    }
    const z = computeDay(jerusalem, '2026-12-21').zmanim
    // Jerusalem's winter sunset is around 16:40 local.
    expect(z.sunset).toBeGreaterThan(16 * 60 + 30)
    expect(z.sunset).toBeLessThan(16 * 60 + 50)
  })

  it('hides zmanim from the day but still lets rules anchor on them', () => {
    const hidden: Schedule = {
      ...sampleSchedule,
      settings: { ...sampleSchedule.settings, zmanim: { hidden: ['sofZmanShma', 'sunset'] } },
    }
    const day = computeDay(hidden, '2026-10-21')
    expect(day.zmanim.sofZmanShma).toBeUndefined()
    expect(day.zmanim.sunset).toBeUndefined()
    expect(day.zmanim.sunrise).toBeDefined()
    expect(new Calendar(hidden).zmanimOn('2026-10-21').sunset).toBeDefined()
  })
})

describe('local holidays', () => {
  const withLocal = (holidays: LocalHoliday[], civil: ShulSettings['civilHolidays'] = 'none'): Schedule =>
    withEvents(
      [
        {
          id: 'shacharis',
          name: { en: 'Shacharis' },
          kind: 'tefila',
          rules: [
            { when: { localHoliday: 'thanksgiving' }, time: { clock: '08:00' } },
            { when: { tag: 'legalHoliday' }, time: { clock: '07:30' } },
            { time: { clock: '06:30' } },
          ],
        },
      ],
      { settings: { ...sampleSchedule.settings, civilHolidays: civil, localHolidays: holidays } },
    )
  const dates = (holidays: LocalHoliday[], year: number) =>
    [...localHolidayDates(holidays, year)].map(([d, hs]) => `${d} ${hs.map((h) => h.id).join('+')}`)

  it('finds Thanksgiving and keys rules, the tag and the heading off it', () => {
    const s = withLocal([], 'us')
    expect(timeOf(s, 'shacharis', '2026-11-26')).toBe('08:00')
    expect(timeOf(s, 'shacharis', '2026-07-03')).toBe('07:30') // Fourth of July observed on Friday
    expect(timeOf(s, 'shacharis', '2026-07-04')).toBe('06:30')
    expect(computeDay(s, '2026-11-26').holidays.map((h) => h.en)).toContain('Thanksgiving')
    expect(computeDay(s, '2026-11-26').tags).toContain('legalHoliday')
    expect(computeDay(s, '2026-11-27').tags).not.toContain('legalHoliday')
  })

  it('applies US observed days across the new year', () => {
    // 1 Jan 2028 is a Saturday, observed Friday 31 Dec 2027.
    expect(timeOf(withLocal([], 'us'), 'shacharis', '2027-12-31')).toBe('07:30')
    expect(timeOf(withLocal([], 'us'), 'shacharis', '2028-01-01')).toBe('06:30')
  })

  it('does UK substitute days and Easter-based ones', () => {
    // Dec 25 2027 is a Saturday, Dec 26 a Sunday.
    expect(dates(UK_HOLIDAYS, 2027).filter((d) => d.includes('christmas') || d.includes('boxing-day'))).toEqual([
      '2027-12-27 christmas',
      '2027-12-28 boxing-day',
    ])
    expect(dates(UK_HOLIDAYS, 2026)).toEqual(expect.arrayContaining(['2026-04-03 good-friday', '2026-04-06 easter-monday']))
    expect(dates(UK_HOLIDAYS, 2026)).toContain('2026-08-31 summer')
  })

  it('takes explicit dates and ignores impossible ones', () => {
    const odd: LocalHoliday[] = [
      { id: 'jubilee', name: { en: 'Jubilee' }, date: { on: ['2026-06-04'] } },
      { id: 'feb30', name: { en: 'Nope' }, date: { month: 2, day: 30 } },
    ]
    expect(dates(odd, 2026)).toEqual(['2026-06-04 jubilee'])
    const issues = validate(withLocal(odd), '2026-01-01', 7)
    expect(issues.map((i) => i.message)).toEqual(
      expect.arrayContaining(['Local holiday "Nope" never lands on a date']),
    )
  })

  it('flags rules naming a local holiday the shul never defined', () => {
    const issues = validate(withLocal([]), '2026-01-01', 7)
    expect(issues.some((i) => i.level === 'error' && i.message.includes('unknown local holiday "thanksgiving"'))).toBe(true)
  })
})

describe('built-in civil calendar', () => {
  const rules: EventDef[] = [
    {
      id: 'shacharis',
      name: { en: 'Shacharis' },
      kind: 'tefila',
      rules: [{ when: { tag: 'legalHoliday' }, time: { clock: '08:00' } }, { time: { clock: '06:30' } }],
    },
  ]
  const shul = (settings: Partial<ShulSettings>) =>
    withEvents(rules, { settings: { ...sampleSchedule.settings, ...settings } })

  it('knows Thanksgiving without the shul defining anything', () => {
    // sampleSchedule is in New York, so the US calendar applies by time zone.
    expect(timeOf(shul({ civilHolidays: undefined }), 'shacharis', '2026-11-26')).toBe('08:00')
  })

  it('follows the zone, and can be switched off or changed', () => {
    const london = { ...sampleSchedule.settings.location, timeZone: 'Europe/London' }
    expect(timeOf(shul({ location: london, civilHolidays: undefined }), 'shacharis', '2026-12-28')).toBe('08:00') // Dec 26, moved
    expect(timeOf(shul({ location: london, civilHolidays: undefined }), 'shacharis', '2026-11-26')).toBe('06:30')
    expect(timeOf(shul({ civilHolidays: 'none' }), 'shacharis', '2026-11-26')).toBe('06:30')
    expect(timeOf(shul({ civilHolidays: 'uk' }), 'shacharis', '2026-11-26')).toBe('06:30')
  })

  it("lets a shul drop the ones it doesn't count and override others", () => {
    expect(timeOf(shul({ ignoredHolidays: ['thanksgiving'] }), 'shacharis', '2026-11-26')).toBe('06:30')
    const moved = shul({ localHolidays: [{ id: 'thanksgiving', name: { en: 'Thanksgiving' }, date: { on: ['2026-11-27'] } }] })
    expect(timeOf(moved, 'shacharis', '2026-11-26')).toBe('06:30')
    expect(timeOf(moved, 'shacharis', '2026-11-27')).toBe('08:00')
  })
})

describe('Canada and France', () => {
  const dates = (holidays: LocalHoliday[], year: number) =>
    [...localHolidayDates(holidays, year)].map(([d, hs]) => `${d} ${hs.map((h) => h.id).join('+')}`)

  it("finds Victoria Day, the Monday before 25 May, even when 25 May is a Monday", () => {
    expect(dates(CA_HOLIDAYS, 2026)).toContain('2026-05-18 victoria-day')
    expect(dates(CA_HOLIDAYS, 2027)).toContain('2027-05-24 victoria-day')
    expect(dates(CA_HOLIDAYS, 2022)).toContain('2022-05-23 victoria-day') // 25 May 2022 was a Wednesday
    expect(dates(CA_HOLIDAYS, 2021)).toContain('2021-05-24 victoria-day') // 24 May is itself the Monday
  })

  it('has Canadian Thanksgiving in October and Dec 26 moved off a weekend', () => {
    expect(dates(CA_HOLIDAYS, 2026)).toContain('2026-10-12 thanksgiving')
    expect(dates(CA_HOLIDAYS, 2026)).toContain('2026-12-28 boxing-day') // Dec 26 2026 is a Saturday
  })

  it('computes the French Easter-based days', () => {
    expect(dates(FR_HOLIDAYS, 2026)).toEqual(
      expect.arrayContaining(['2026-04-06 easter-monday', '2026-05-14 ascension', '2026-05-25 whit-monday']),
    )
  })

  it('chooses a calendar by time zone', () => {
    expect([ 'America/Toronto', 'Europe/Paris', 'Europe/London', 'America/Chicago', 'Asia/Jerusalem' ].map(inferCivilCalendar)).toEqual(['ca', 'fr', 'uk', 'us', 'none'])
  })
})

describe('religious public holidays', () => {
  it("never name another faith's holy days", () => {
    const names = Object.values(CIVIL_CALENDARS).flatMap((c) => c.holidays.map((h) => `${h.name.en} ${h.name.he ?? ''}`))
    expect(names.filter((n) => /christ|easter|good friday|boxing|ascension|whit|assum|saints|noël|pâques|toussaint|pentec/i.test(n))).toEqual([])
    expect(CIVIL_CALENDARS.us.holidays.find((h) => h.id === 'christmas')?.name.en).toBe(PUBLIC_HOLIDAY)
  })
})

describe('starter schedule', () => {
  const onDate = (schedule: Schedule, date: string) => computeDay(schedule, date).events
  const label = (o: { name: { en: string }; note?: { en: string } }) => o.note?.en ?? o.name.en

  it('davens Mincha/Maariv as one minyan by default, with Maariv alone on Motzei Shabbos', () => {
    const schedule = starterSchedule(settings)
    expect(schedule.events.map((e) => e.name.en)).toEqual(['Shacharis', 'Mincha/Maariv', 'Maariv'])
    expect(schedule.events[1].name.he).toBe('מנחה וערבית')
    expect(validate(schedule, '2026-10-20').filter((i) => i.level === 'error')).toEqual([])
    // Tuesday: one combined minyan.
    expect(onDate(schedule, '2026-10-20').map((o) => o.name.en)).toEqual(['Shacharis', 'Mincha/Maariv'])
    // Friday and Shabbos: Mincha only, plus Maariv at havdalah on Shabbos (its date carries motzeiShabbos).
    expect(onDate(schedule, '2026-10-23').map(label)).toEqual(['Shacharis', 'Mincha'])
    expect(onDate(schedule, '2026-10-24').map(label)).toEqual(['Shacharis', 'Mincha', 'Maariv'])
    expect(timeOf(schedule, 'maariv', '2026-10-24')).toBeDefined()
    expect(timeOf(schedule, 'maariv', '2026-10-20')).toBeUndefined()
  })

  it('can keep Mincha and Maariv apart, with Maariv called Aravis in Hebrew', () => {
    const schedule = starterSchedule(settings, { minchaMaariv: 'separate' })
    expect(schedule.events.map((e) => e.id)).toEqual(['shacharis', 'mincha', 'maariv'])
    expect(schedule.events[2].name.he).toBe('ערבית')
    expect(timeOf(schedule, 'maariv', '2026-10-20')).toBe(timeOf(schedule, 'mincha', '2026-10-20'))
  })
})

describe('localize', () => {
  it('picks Hebrew when asked and present, otherwise English', () => {
    expect(localize({ en: 'Maariv', he: 'ערבית' }, 'he')).toBe('ערבית')
    expect(localize({ en: 'Rav’s Shiur' }, 'he')).toBe('Rav’s Shiur')
    expect(localize({ en: 'Maariv', he: 'ערבית' })).toBe('Maariv')
    expect(localize({ en: 'Maariv', he: 'ערבית' }, 'both')).toBe('Maariv')
  })

  it('shows names by `names`, else by what `language` implies', () => {
    expect(nameStyle({})).toBe('both')
    expect(nameStyle({ language: 'en' })).toBe('both')
    expect(nameStyle({ language: 'he' })).toBe('he')
    // English labels and dates, Hebrew davening names.
    expect(nameStyle({ language: 'en', names: 'he' })).toBe('he')
    expect(nameStyle({ language: 'he', names: 'en' })).toBe('en')
  })
})

describe('formatTime', () => {
  const at = (h: number, m: number) => h * 60 + m
  it('formats the usual styles', () => {
    expect(formatTime(at(15, 5))).toBe('3:05')
    expect(formatTime(at(15, 5), 'h:mm A')).toBe('3:05 PM')
    expect(formatTime(at(15, 5), 'h:mm a')).toBe('3:05 pm')
    expect(formatTime(at(15, 5), 'h:mmAA')).toBe('3:05P')
    expect(formatTime(at(15, 5), 'HH:mm')).toBe('15:05')
    expect(formatTime(at(5, 5), 'HH:mm')).toBe('05:05')
    expect(formatTime(at(5, 5), 'H:mm')).toBe('5:05')
  })
  it('handles midnight, noon, wrapping and [literals]', () => {
    expect(formatTime(0, 'h:mm A')).toBe('12:00 AM')
    expect(formatTime(at(12, 0), 'h:mm a')).toBe('12:00 pm')
    expect(formatTime(0, 'kk:mm')).toBe('24:00')
    expect(formatTime(at(24, 30), 'HH:mm')).toBe('00:30')
    expect(formatTime(at(15, 5), 'h:mm [at night]')).toBe('3:05 at night')
  })
  it('rejects formats without an hour and minutes', () => {
    expect(timeFormatProblem('h:mm A')).toBeNull()
    expect(timeFormatProblem('')).not.toBeNull()
    expect(timeFormatProblem('mm')).not.toBeNull()
    expect(timeFormatProblem('h')).not.toBeNull()
    expect(timeFormatProblem('[h]:[mm]')).not.toBeNull()
  })
})
