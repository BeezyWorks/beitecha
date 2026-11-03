import { describe, expect, it } from 'vitest'

import { buildMonth, footerFor, holidayChoices, isHolidayShown, calendarOptions, monthBounds, monthStarts } from '../calendarPrint'
import { sampleSchedule } from '../sample'
import { Calendar } from '../schedule'
import { makeT } from '../wording'
import type { Schedule } from '../types'

const withPeople: Schedule = {
  ...sampleSchedule,
  yahrzeits: [
    { id: 'y1', displayName: { en: 'Menachem Kohen' }, hebrew: { day: 18, month: 9, year: 5781 }, gregorian: '2020-12-04' },
    { id: 'y2', displayName: { en: 'Sarah Levi' }, hebrew: { day: 19, month: 9, year: 5780 } },
  ],
  birthdays: [{ id: 'b1', displayName: { en: 'Dovid Katz' }, gregorian: '2000-11-12' }],
  anniversaries: [{ id: 'a1', displayName: { en: 'Moshe & Rivka' }, gregorian: '2010-11-20' }],
}
const t = makeT('en')
const cells = (m: ReturnType<typeof buildMonth>) => m.weeks.flat().filter((c) => !!c)

describe('month bounds', () => {
  it('civil and Hebrew', () => {
    expect(monthBounds('civil', '2026-11-18')).toEqual({ start: '2026-11-01', end: '2026-11-30' })
    expect(monthBounds('hebrew', '2026-11-03')).toEqual({ start: '2026-10-12', end: '2026-11-10' })
    expect(monthStarts('civil', '2026-11-05', '2027-01-02')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
})

describe('buildMonth', () => {
  const month = buildMonth(new Calendar(withPeople), '2026-11-01', undefined, t)
  it('lays weeks out Sunday first', () => {
    expect(month.title).toBe('November 2026')
    expect(month.weeks[0].findIndex((c) => c)).toBe(0)
    expect(cells(month)).toHaveLength(30)
  })
  it('puts candle lighting on Friday and havdalah on Shabbos, with the parsha', () => {
    const fri = cells(month).find((c) => c!.date === '2026-11-06')!
    const shabbos = cells(month).find((c) => c!.date === '2026-11-07')!
    expect(fri.times.map((x) => x.label)).toEqual(['Candle lighting'])
    expect(shabbos.times.map((x) => x.label)).toEqual(['Havdalah'])
    expect(shabbos.parsha).toBeTruthy()
    expect(fri.parsha).toBeUndefined()
  })
  it('names Rosh Chodesh Kislev', () => {
    const names = cells(month).flatMap((c) => c!.holidays.map((h) => h.id))
    expect(names).toContain('minor:roshChodesh')
  })
  it('lists people on their days, and leaves chosen ones off', () => {
    const on = (m: typeof month, date: string) => cells(m).find((c) => c!.date === date)!.people.map((p) => p.id)
    expect(on(month, '2026-11-12')).toEqual(['b1'])
    expect(on(month, '2026-11-20')).toEqual(['a1'])
    expect(cells(month).flatMap((c) => c!.people.filter((p) => p.kind === 'yahrzeit').map((p) => p.id)).sort()).toEqual(['y1', 'y2'])
    const without = buildMonth(new Calendar(withPeople), '2026-11-01', { hiddenPeople: ['y1', 'b1'], anniversaries: false }, t)
    const all = cells(without).flatMap((c) => c!.people.map((p) => p.id))
    expect(all).toEqual(['y2'])
  })
  it('writes only the events picked', () => {
    const none = buildMonth(new Calendar(sampleSchedule), '2026-11-01', { oneTime: false }, t)
    expect(cells(none).every((c) => c!.events.length === 0)).toBe(true)
    const picked = buildMonth(new Calendar(sampleSchedule), '2026-11-01', { events: ['shacharis'] }, t)
    const monday = cells(picked).find((c) => c!.date === '2026-11-02')!
    expect(monday.events.length).toBeGreaterThan(0)
    expect(monday.events.every((e) => e.id === 'shacharis')).toBe(true)
  })
  it('adds chosen zmanim, in time order', () => {
    const m = buildMonth(new Calendar(sampleSchedule), '2026-11-01', { dayZmanim: ['sunrise', 'alos'] }, t)
    const day = cells(m).find((c) => c!.date === '2026-11-02')!
    expect(day.times.map((x) => x.at)).toEqual([...day.times.map((x) => x.at)].sort((a, b) => a - b))
    expect(day.times).toHaveLength(2)
  })
  it('counts the omer and times a fast', () => {
    const iyar = buildMonth(new Calendar(sampleSchedule), '2027-05-01', undefined, t)
    expect(cells(iyar).some((c) => c!.omer)).toBe(true)
    const tammuz = buildMonth(new Calendar(sampleSchedule), '2027-07-01', undefined, t)
    expect(cells(tammuz).flatMap((c) => c!.times).some((x) => x.label === 'Fast')).toBe(true)
  })
  it('turns holidays off by kind or by name', () => {
    const choices = holidayChoices([month])
    expect(choices.length).toBeGreaterThan(0)
    const rc = choices.find((c) => c.id === 'minor:roshChodesh')!
    expect(isHolidayShown(rc, calendarOptions({ hiddenGroups: ['minor'] }))).toBe(false)
    expect(isHolidayShown(rc, calendarOptions({ hiddenHolidays: [rc.id] }))).toBe(false)
    expect(isHolidayShown(rc, calendarOptions(undefined))).toBe(true)
  })
  it('is the same in Hebrew language and basis', () => {
    const he = buildMonth(new Calendar(sampleSchedule), '2026-11-03', { basis: 'hebrew' }, makeT('he'))
    expect(he.title).toBe('חשון תשפ״ז')
    expect(he.weeks.flat().find((c) => c)!.primary).toBe('א׳')
  })
})

describe('footers', () => {
  it('uses a month’s own, else the general one', () => {
    const s = { footer: 'All', monthFooters: { '2026-11-01': 'Just November', '2026-12-01': ' ' } }
    expect(footerFor(s, { start: '2026-11-01' })).toBe('Just November')
    expect(footerFor(s, { start: '2026-12-01' })).toBe('All')
    expect(footerFor(undefined, { start: '2026-12-01' })).toBe('')
  })
})
