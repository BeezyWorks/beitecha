import { resolveOccasion } from '@beitecha/engine'

import {
  occasionPrompt,
  occasionsToCsv,
  occasionsToJson,
  parseOccasions,
  sameOccasion,
} from '../aiOccasions'

const ok = (text: string) => {
  const r = parseOccasions('birthday', text)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.value
}

const csv = `hebrew_name,display_name,display_name_hebrew,hebrew_date,gregorian_date,show_as
מנחם בן מימון,Menachem Kohen,מנחם כהן,18 Cheshvan,,
,"Levy, Sarah",,,2014-03-14,
,Dovid Katz,,5 Sivan 5761,2001-05-27,gregorian
`

describe('parseOccasions', () => {
  it('reads a CSV: one date is enough, a Hebrew date needs no year', () => {
    const [a, b, c] = ok(csv)
    expect(a.hebrew).toEqual({ day: 18, month: 8 })
    expect(a.gregorian).toBeUndefined()
    expect(resolveOccasion(a).by).toBe('hebrew')
    expect(b.displayName?.en).toBe('Levy, Sarah')
    expect(b.hebrew).toBeUndefined()
    expect(resolveOccasion(b)).toMatchObject({ by: 'gregorian', hebrew: { day: 12, month: 13 } })
    expect(c).toMatchObject({
      hebrew: { day: 5, month: 3, year: 5761 },
      gregorian: '2001-05-27',
      by: 'gregorian',
    })
  })

  it('reads JSON, with a Hebrew date as a string or an object', () => {
    const list = ok(
      JSON.stringify({
        birthdays: [
          { displayName: 'A', hebrew: '18 Cheshvan' },
          { displayName: { en: 'B' }, hebrew: { day: 1, month: 'Adar II' }, by: 'hebrew' },
          { displayName: { en: 'C' }, gregorian: '2000-01-02' },
        ],
      }),
    )
    expect(list.map((o) => o.hebrew)).toEqual([
      { day: 18, month: 8 },
      { day: 1, month: 13 },
      undefined,
    ])
  })

  it('names the problems', () => {
    const r = parseOccasions(
      'anniversary',
      'display_name,hebrew_date\nA,31 Cheshvan\n,5 Sivan\nB,\n',
    )
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors).toEqual([
        'Row 2 (A): that Hebrew date doesn’t exist',
        'Row 3: needs a name',
        'Row 4 (B): needs a date, Hebrew or Gregorian',
      ])
  })

  it('needs a date column', () => {
    expect(parseOccasions('birthday', 'name\nA\n').ok).toBe(false)
  })
})

describe('export', () => {
  it('round-trips through CSV and JSON', () => {
    const list = ok(csv).map((o, i) => ({ ...o, id: String(i) }))
    for (const back of [ok(occasionsToCsv(list)), ok(occasionsToJson('birthday', list))]) {
      expect(back).toHaveLength(3)
      back.forEach((o, i) => {
        expect(sameOccasion(o, list[i])).toBe(true)
        expect(resolveOccasion(o).by).toBe(resolveOccasion(list[i]).by)
      })
    }
  })

  it('prompts per kind', () => {
    const profile = { name: { en: 'Shul' } } as never
    expect(occasionPrompt(profile, 'birthday', 'x')).toContain('list of birthdays')
    expect(occasionPrompt(profile, 'anniversary', 'x')).toContain('list of anniversaries')
  })
})
