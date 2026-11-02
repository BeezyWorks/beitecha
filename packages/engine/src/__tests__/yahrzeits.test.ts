import { describe, expect, it } from 'vitest'

import { gregorianToHebrew, hebrewDateText, hebrewToGregorian, isRealHebrewDate, yahrzeitNameParts, yahrzeitsBetween } from '../yahrzeits'
import { makeT } from '../wording'
import type { Yahrzeit } from '../types'

const menachem: Yahrzeit = {
  id: 'm',
  hebrewName: 'מנחם בן מימון',
  displayName: { en: 'Menachem Kohen', he: 'מנחם כהן' },
  hebrew: { day: 18, month: 8, year: 5781 },
  gregorian: '2020-11-05',
}

describe('yahrzeit dates', () => {
  it('converts both ways', () => {
    expect(gregorianToHebrew('2020-11-05')).toEqual({ day: 18, month: 8, year: 5781 })
    expect(hebrewToGregorian({ day: 18, month: 8, year: 5781 })).toBe('2020-11-05')
  })
  it('rejects dates that do not exist', () => {
    expect(isRealHebrewDate({ day: 30, month: 6, year: 5784 })).toBe(false)
    expect(isRealHebrewDate({ day: 1, month: 13, year: 5785 })).toBe(false)
    expect(isRealHebrewDate({ day: 1, month: 13, year: 5784 })).toBe(true)
  })
  it('names the Hebrew day', () => {
    expect(hebrewDateText('2020-11-05')).toBe('18 Cheshvan')
    expect(hebrewDateText('2020-11-05', 'he')).toBe('י״ח חשון')
  })
})

describe('yahrzeitsBetween', () => {
  it('keeps one with no year and no civil date on the same Hebrew day every year', () => {
    const noYear: Yahrzeit = { id: 'n', displayName: { en: 'N' }, hebrew: { day: 18, month: 8 } }
    for (const hyear of [5787, 5788]) {
      const date = hebrewToGregorian({ day: 18, month: 8, year: hyear })
      expect(yahrzeitsBetween([noYear], date, date).map((u) => u.date)).toEqual([date])
    }
  })
  it('finds the next one, never the year of the passing', () => {
    expect(yahrzeitsBetween([menachem], '2020-10-30', '2020-11-10')).toEqual([])
    const next = yahrzeitsBetween([menachem], '2026-10-25', '2026-11-10')
    expect(next).toHaveLength(1)
    expect(next[0].date).toBe(hebrewToGregorian({ day: 18, month: 8, year: 5787 }))
  })
  it('finds one across a Hebrew new year', () => {
    const elul = { ...menachem, hebrew: { day: 29, month: 6, year: 5780 } }
    expect(yahrzeitsBetween([elul], '2026-09-01', '2026-09-30')).toHaveLength(1)
  })
  it('lists in date order', () => {
    const later = { ...menachem, id: 'l', hebrew: { day: 25, month: 8, year: 5700 } }
    const out = yahrzeitsBetween([later, menachem], '2026-10-25', '2026-11-20')
    expect(out.map((u) => u.yahrzeit.id)).toEqual(['m', 'l'])
  })
})

describe('what is shown', () => {
  const t = makeT('en', undefined, 'en')
  it('picks names', () => {
    expect(t.yahrzeitNames(menachem, 'hebrew')).toEqual(['מנחם בן מימון'])
    expect(t.yahrzeitNames(menachem, 'display')).toEqual(['Menachem Kohen'])
    expect(t.yahrzeitNames(menachem, 'both')).toEqual(['Menachem Kohen', 'מנחם בן מימון'])
    expect(yahrzeitNameParts({ displayName: { en: 'X' } }, 'hebrew', 'X')).toEqual(['X'])
  })
  it('picks dates', () => {
    expect(t.yahrzeitDate('2026-11-05', 'hebrew')).toBe('25 Cheshvan')
    expect(t.yahrzeitDate('2026-11-05', 'english')).toBe('Thu Nov 5')
    expect(t.yahrzeitDate('2026-11-05')).toBe('Thu Nov 5 · 25 Cheshvan')
  })
})
