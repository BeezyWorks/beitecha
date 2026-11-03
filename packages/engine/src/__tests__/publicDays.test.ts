import { describe, expect, it } from 'vitest'

import { MAX_PUBLIC_DAYS, computeDay, computeDays, sampleSchedule, type Schedule } from '../index'

describe('computeDays', () => {
  it('gives the public shape for a Shabbos', () => {
    const { days, timeZone, language } = computeDays(sampleSchedule, '2026-10-31', '2026-10-31')
    expect(timeZone).toBe('America/New_York')
    expect(language).toBe('en')
    const [day] = days
    expect(day).toMatchObject({ date: '2026-10-31', weekday: 6, parsha: 'Parshas Vayera' })
    const mincha = day.events.find((e) => e.id === 'mincha')!
    expect(mincha).toMatchObject({ ref: 'mincha@2026-10-31', name: 'Mincha', kind: 'tefila', tefila: 'mincha', cancelled: false, source: 'rule' })
    expect(mincha.time).toEqual({ minutes: 1035, iso: '2026-10-31T17:15:00-04:00' })
    const shiur = day.events.find((e) => e.id === 'shiur')!
    expect(shiur).toMatchObject({ cancelled: true, source: 'exception', note: 'The Rav is away this week' })
    expect(day.events.find((e) => e.id === 'kiddush')).toMatchObject({ kind: 'other', category: 'meal' })
    expect(day.events.map((e) => e.time?.minutes)).toEqual([...day.events.map((e) => e.time?.minutes)].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(day.zmanim.length).toBeGreaterThan(3)
    expect(day.zmanim.every((z) => /-04:00$/.test(z.time.iso))).toBe(true)
  })

  it('says relative times, end times and one-time events', () => {
    const { days } = computeDays(sampleSchedule, '2026-10-31', '2026-11-08')
    expect(days).toHaveLength(9)
    const bbq = days[8].events.find((e) => e.id === 'bbq')!
    expect(bbq).toMatchObject({ source: 'added', location: 'Pine Park pavilion, 200 Pine St', link: 'https://example.org/bbq' })
    expect(bbq.end).toEqual({ minutes: 900, iso: '2026-11-08T15:00:00-05:00' })
    const shabbos = days[0].events.filter((e) => e.relative)
    for (const e of shabbos) expect(e.relative!.text).toMatch(/^(after|before|between)/)
  })

  it('never leaks rules, internal events, people or notices', () => {
    const s: Schedule = {
      ...sampleSchedule,
      events: [...sampleSchedule.events, { id: 'secret', name: { en: 'Board' }, kind: 'other', visibility: 'internal', rules: [{ time: { clock: '10:00' } }] }],
      yahrzeits: [{ id: 'y', displayName: { en: 'Secret Person' }, hebrew: { day: 1, month: 7 } }],
      cholim: [{ id: 'c', name: { en: 'Secret Choleh' }, added: '2026-01-01' }],
      birthdays: [{ id: 'b', displayName: { en: 'Secret Kid' }, gregorian: '2015-10-31' }],
    }
    const json = JSON.stringify(computeDays(s, '2026-10-25', '2026-11-08'))
    for (const word of ['Secret', 'secret', 'Board', 'rules', 'yahrzeit', 'clock', 'sponsoredBy']) expect(json, word).not.toContain(word)
  })

  it('writes in the shul language and names, or the asked ones', () => {
    const he: Schedule = { ...sampleSchedule, settings: { ...sampleSchedule.settings, language: 'he' } }
    const day = computeDays(he, '2026-10-31', '2026-10-31').days[0]
    expect(day.events.find((e) => e.id === 'mincha')!.name).toBe('מנחה')
    expect(day.hebrew.text).toMatch(/[א-ת]/)
    const en = computeDays(he, '2026-10-31', '2026-10-31', { lang: 'en' }).days[0]
    expect(en.events.find((e) => e.id === 'mincha')!.name).toBe('Mincha')
    expect(computeDays(sampleSchedule, '2026-10-31', '2026-10-31', { lang: 'en', names: 'he' }).days[0].events.find((e) => e.id === 'mincha')!.name).toBe('מנחה')
    expect(computeDays(sampleSchedule, '2026-10-31', '2026-10-31', { zmanim: false }).days[0].zmanim).toEqual([])
  })

  it('carries the UTC offset of the date, across a clock change', () => {
    // US clocks fell back on 1 Nov 2026 (2:00 AM EDT -> 1:00 AM EST).
    const { days } = computeDays(sampleSchedule, '2026-10-31', '2026-11-02')
    expect(days[0].events.find((e) => e.id === 'maariv')!.time!.iso).toMatch(/-04:00$/)
    expect(days[1].events.find((e) => e.id === 'shacharis')!.time!.iso).toBe('2026-11-01T07:30:00-05:00')
    expect(days[2].events.find((e) => e.id === 'shacharis')!.time!.iso).toBe('2026-11-02T06:15:00-05:00')
    // Spring forward on 8 Mar 2026: 6:30 is already EDT.
    const spring = computeDays(sampleSchedule, '2026-03-07', '2026-03-08').days
    expect(spring[0].events.find((e) => e.id === 'shacharis')!.time!.iso).toMatch(/-05:00$/)
    expect(spring[1].events.find((e) => e.id === 'shacharis')!.time!.iso).toMatch(/-04:00$/)
  })

  it('offsets a time before the clocks change that same day', () => {
    const s: Schedule = { ...sampleSchedule, exceptions: [{ id: 'a', date: '2026-03-08', type: 'add', event: { id: 'early', name: { en: 'Early' }, kind: 'other' }, time: { clock: '01:30' } }, { id: 'b', date: '2026-03-08', type: 'add', event: { id: 'late', name: { en: 'Late' }, kind: 'other' }, time: { clock: '03:30' } }] }
    const day = computeDays(s, '2026-03-08', '2026-03-08').days[0]
    expect(day.events.find((e) => e.id === 'early')!.time!.iso).toBe('2026-03-08T01:30:00-05:00')
    expect(day.events.find((e) => e.id === 'late')!.time!.iso).toBe('2026-03-08T03:30:00-04:00')
  })

  it('uses a non-US zone with a half-hour offset', () => {
    const s: Schedule = { ...sampleSchedule, settings: { ...sampleSchedule.settings, location: { latitude: 28.6, longitude: 77.2, timeZone: 'Asia/Kolkata', israel: false } } }
    expect(computeDays(s, '2026-10-29', '2026-10-29').days[0].events[0].time!.iso).toMatch(/\+05:30$/)
  })

  it('agrees with the calendar and is the same under any machine zone', () => {
    const original = process.env.TZ
    try {
      const results = ['America/New_York', 'Asia/Tokyo', 'UTC'].map((tz) => {
        process.env.TZ = tz
        return JSON.stringify(computeDays(sampleSchedule, '2026-10-28', '2026-11-03'))
      })
      expect(new Set(results).size).toBe(1)
    } finally {
      process.env.TZ = original
    }
    const mins = computeDays(sampleSchedule, '2026-10-29', '2026-10-29').days[0].events.map((e) => e.time?.minutes)
    expect(mins).toEqual(computeDay(sampleSchedule, '2026-10-29').events.filter((e) => e.minutes !== null).map((e) => e.minutes))
  })

  it('checks the range', () => {
    expect(() => computeDays(sampleSchedule, '2026-10-31', '2026-10-30')).toThrow(RangeError)
    expect(() => computeDays(sampleSchedule, '2026-01-01', '2026-03-31')).toThrow(RangeError)
    expect(computeDays(sampleSchedule, '2026-01-01', '2026-03-03').days).toHaveLength(MAX_PUBLIC_DAYS)
    expect(() => computeDays(sampleSchedule, 'nope', '2026-03-03')).toThrow()
  })
})
