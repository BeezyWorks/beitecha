import { parseYahrzeits, yahrzeitPrompt, yahrzeitsToCsv, yahrzeitsToJson } from '../aiYahrzeits'

const ok = (text: string) => {
  const r = parseYahrzeits(text)
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.value
}

const csv = `hebrew_name,display_name,display_name_hebrew,hebrew_date,gregorian_date
מנחם בן מימון,Menachem Kohen,מנחם כהן,18 Cheshvan 5781,2020-11-05
,"Levy, Sarah",,,2019-03-14
`

describe('parseYahrzeits', () => {
  it('reads a CSV and derives the missing date', () => {
    const [a, b] = ok(csv)
    expect(a).toMatchObject({
      hebrewName: 'מנחם בן מימון',
      displayName: { en: 'Menachem Kohen', he: 'מנחם כהן' },
      hebrew: { day: 18, month: 8, year: 5781 },
      gregorian: '2020-11-05',
    })
    expect(b.displayName?.en).toBe('Levy, Sarah')
    expect(b.hebrew).toEqual({ day: 7, month: 13, year: 5779 })
  })

  it('finds the CSV in an AI’s answer', () => {
    expect(ok(`Here you go:\n\n\`\`\`csv\n${csv}\`\`\`\nI skipped one row.`)).toHaveLength(2)
  })

  it('takes tab-separated rows pasted from Excel, and split Hebrew date columns', () => {
    const tsv = 'Name\tHebrew Day\tHebrew Month\tHebrew Year\nSarah Levy\t7\tAdar\t5780\n'
    expect(ok(tsv)[0].hebrew).toEqual({ day: 7, month: 12, year: 5780 })
  })

  it('reads plain Adar in a leap year as Adar II', () => {
    expect(ok('name,hebrew_date\nX,5 Adar 5784\n')[0].hebrew.month).toBe(13)
    expect(ok('name,hebrew_date\nX,5 Adar I 5784\n')[0].hebrew.month).toBe(12)
  })

  it('says which rows are wrong', () => {
    const r = parseYahrzeits(
      'display_name,hebrew_date,gregorian_date\nA,,\n,1 Nisan 5781,\nB,30 Elul 5782,\nC,,05/11/2020\n',
    )
    expect(r.ok).toBe(false)
    if (!r.ok)
      expect(r.errors).toEqual([
        'Row 2 (A): needs a date, Hebrew or Gregorian',
        'Row 3: needs a name',
        'Row 4 (B): that Hebrew date doesn’t exist',
        'Row 5 (C): the Gregorian date must be YYYY-MM-DD',
      ])
  })

  it('reads JSON, with month names or numbers', () => {
    const json =
      '{"yahrzeits":[{"hebrewName":"X בן Y","hebrew":{"day":18,"month":"Cheshvan","year":5781}},{"displayName":{"en":"Z"},"gregorian":"2020-11-05"}]}'
    const [a, b] = ok(json)
    expect(a.gregorian).toBe('2020-11-05')
    expect(b.hebrew.month).toBe(8)
  })
})

describe('export', () => {
  it('round-trips through CSV and JSON', () => {
    const people = ok(csv).map((p, i) => ({ ...p, id: String(i) }))
    const strip = (l: typeof people) => l.map(({ id, ...p }) => p)
    expect(strip(ok(yahrzeitsToCsv(people)))).toEqual(strip(people))
    expect(strip(ok(yahrzeitsToJson(people)))).toEqual(strip(people))
  })
  it('has a prompt that carries the format and the list', () => {
    const p = yahrzeitPrompt({ name: { en: 'Test Shul' } }, 'Sarah, 3/14/2019')
    expect(p).toContain('hebrew_name,display_name,display_name_hebrew,hebrew_date,gregorian_date')
    expect(p.trimEnd().endsWith('Sarah, 3/14/2019')).toBe(true)
  })
})
