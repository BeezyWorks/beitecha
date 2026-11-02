import { describe, expect, it } from 'vitest'

import { occasionsBetween, resolveOccasion, isRealMonthDay } from '../occasions'
import { makeT } from '../wording'
import type { Occasion } from '../types'

describe('resolveOccasion', () => {
  it('derives the Hebrew date from a civil one and keeps it civil', () => {
    expect(resolveOccasion({ gregorian: '2020-11-05' })).toEqual({
      by: 'gregorian',
      hebrew: { day: 18, month: 8, year: 5781 },
      gregorian: '2020-11-05',
    })
  })
  it('derives the civil date from a Hebrew one with a year, kept Hebrew', () => {
    expect(resolveOccasion({ hebrew: { day: 18, month: 8, year: 5781 } })).toEqual({
      by: 'hebrew',
      hebrew: { day: 18, month: 8, year: 5781 },
      gregorian: '2020-11-05',
    })
  })
  it('has no civil date for a Hebrew date without a year', () => {
    expect(resolveOccasion({ hebrew: { day: 18, month: 8 } })).toEqual({
      by: 'hebrew',
      hebrew: { day: 18, month: 8 },
      gregorian: undefined,
    })
  })
  it('follows `by` when both dates are there', () => {
    const o = {
      hebrew: { day: 18, month: 8, year: 5781 },
      gregorian: '2020-11-05',
      by: 'gregorian',
    } as const
    expect(resolveOccasion(o).by).toBe('gregorian')
    expect(resolveOccasion({ ...o, by: undefined }).by).toBe('hebrew')
    expect(resolveOccasion({ hebrew: { day: 1, month: 7 }, by: 'gregorian' }).by).toBe('hebrew')
  })
})

describe('occasionsBetween', () => {
  const ids = (list: Occasion[], from: string, to: string) =>
    occasionsBetween(list, from, to).map((u) => u.occasion.id)
  it('finds a civil birthday every year, not the year of birth', () => {
    const o: Occasion = { id: 'a', displayName: { en: 'A' }, gregorian: '2020-11-05' }
    expect(ids([o], '2020-10-30', '2020-11-10')).toEqual([])
    expect(occasionsBetween([o], '2026-11-01', '2026-11-10')).toEqual([
      { date: '2026-11-05', occasion: o, by: 'gregorian' },
    ])
  })
  it('keeps 29 February on the 28th in common years', () => {
    const o: Occasion = { id: 'l', displayName: { en: 'L' }, gregorian: '2000-02-29' }
    expect(occasionsBetween([o], '2027-02-01', '2027-03-05')[0].date).toBe('2027-02-28')
    expect(occasionsBetween([o], '2028-02-01', '2028-03-05')[0].date).toBe('2028-02-29')
  })
  it('finds a Hebrew date with no year, every year', () => {
    const o: Occasion = { id: 'h', displayName: { en: 'H' }, hebrew: { day: 18, month: 8 } }
    expect(occasionsBetween([o], '2026-10-25', '2026-11-10')[0]).toMatchObject({
      date: '2026-10-29',
      by: 'hebrew',
    })
    expect(occasionsBetween([o], '2030-10-25', '2030-11-30')).toHaveLength(1)
  })
  it('handles Adar II and 30 Cheshvan with no year', () => {
    expect(isRealMonthDay({ day: 15, month: 13 })).toBe(true)
    expect(isRealMonthDay({ day: 30, month: 8 })).toBe(true)
    expect(isRealMonthDay({ day: 31, month: 8 })).toBe(false)
    const purim: Occasion = { id: 'p', displayName: { en: 'P' }, hebrew: { day: 14, month: 13 } }
    expect(occasionsBetween([purim], '2027-03-01', '2027-03-31')).toHaveLength(1)
  })
  it('lists in date order', () => {
    const a: Occasion = { id: 'a', displayName: { en: 'A' }, gregorian: '2000-11-20' }
    const b: Occasion = { id: 'b', displayName: { en: 'B' }, gregorian: '2001-11-06' }
    expect(ids([a, b], '2026-11-01', '2026-11-30')).toEqual(['b', 'a'])
  })
})

describe('how an occasion is shown', () => {
  const t = makeT('en', undefined, 'en')
  it('shows the date by its calendar', () => {
    expect(t.occasionDate('2026-11-05', 'gregorian')).toBe('Thu Nov 5')
    expect(t.occasionDate('2026-11-05', 'hebrew')).toBe('Thu 25 Cheshvan')
    expect(t.occasionTitle('birthday')).toBe('Upcoming birthdays')
    expect(t.occasionTitle('anniversary', { title: { en: 'Mazal tov' } })).toBe('Mazal tov')
  })
})
