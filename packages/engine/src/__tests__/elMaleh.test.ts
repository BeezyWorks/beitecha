import { describe, expect, it } from 'vitest'

import { elMalehFor, elMalehNames, saysTzidkascha, shabbosimNamed, hebrewYearEnd } from '../elMaleh'
import { gregorianToHebrew } from '../yahrzeits'
import { sampleSchedule } from '../sample'
import type { Yahrzeit } from '../types'

const settings = sampleSchedule.settings
const person = (id: string, date: string): Yahrzeit => ({ id, hebrewName: id, hebrew: (({ day, month }) => ({ day, month }))(gregorianToHebrew(date)) })

describe('El Maleh Rachamim at Shabbos Mincha', () => {
  it('says it on the Shabbos before a yahrzeit', () => {
    // Shabbos 2026-11-14 (Toldot); a Wednesday yahrzeit 2026-11-18.
    const r = elMalehNames([person('a', '2026-11-18')], '2026-11-14', '2026-11-14', settings)
    expect(r.map((s) => s.date)).toEqual(['2026-11-14'])
    expect(r[0].names).toHaveLength(1)
    expect(r[0].title?.en).toBe('Toldot')
  })
  it('moves a name back when its Shabbos does not say tzidkascha', () => {
    // Shabbos 2026-12-12 is in Chanukah: no tzidkascha. A yahrzeit on 2026-12-14 goes to the one before.
    expect(saysTzidkascha('2026-12-12', false)).toBe(false)
    const r = elMalehNames([person('b', '2026-12-14')], '2026-11-28', '2026-12-12', settings)
    expect(r.map((s) => s.date)).toEqual(['2026-11-28'])
  })
  it('starts at the next Shabbos that says it and assumes the rest were said', () => {
    // 2027-04-17 is in Nisan, where none is said until 2027-05-15; a yahrzeit on 2027-05-01 was said long before.
    const r = elMalehNames([person('c', '2027-05-01'), person('e', '2027-05-19')], '2027-04-17', '2027-05-22', settings)
    expect(r.map((s) => s.date)).toEqual(['2027-05-15'])
    expect(r[0].names.map((n) => n.yahrzeit.id)).toEqual(['e'])
  })
  it('leaves out yahrzeits whose Shabbos is past the end', () => {
    expect(elMalehNames([person('d', '2026-12-30')], '2026-11-14', '2026-11-14', settings)).toEqual([])
  })
  it('answers for given Shabbosos, with none for one that does not say it', () => {
    const r = elMalehFor([person('b', '2026-12-14')], '2026-11-14', ['2026-11-28', '2026-12-12'], settings)
    expect(r.map((s) => [s.date, s.says, s.names.length])).toEqual([
      ['2026-11-28', true, 1],
      ['2026-12-12', false, 0],
    ])
  })
  it('finds a Shabbos by parsha', () => {
    expect(shabbosimNamed('eikev', '2027-07-01', settings)).toEqual(['2027-08-21'])
    expect(shabbosimNamed('Matot', '2027-07-01', settings)[0]).toBe('2027-07-31')
  })
  it('a year runs a full Hebrew year, so a late-Cheshvan yahrzeit is on it', () => {
    const end = hebrewYearEnd('2026-11-14')
    expect(end > '2027-11-30').toBe(true)
    const y: Yahrzeit = { id: 'c', hebrewName: 'c', hebrew: { day: 25, month: 8 } }
    expect(elMalehNames([y], '2026-11-14', end, settings)).toHaveLength(1)
    expect(elMalehNames([y], '2026-11-14', '2027-11-13', settings)).toHaveLength(0)
  })
})
