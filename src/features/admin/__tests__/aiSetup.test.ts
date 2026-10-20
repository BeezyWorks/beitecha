import { Calendar, sampleSchedule, validate, type EventDef } from '@beitecha/engine'

import { applyImport, buildAiPrompt, parseAiImport } from '../aiSetup'

const profile = { name: { en: 'Test Shul' } }

/** The example the prompt itself teaches, pulled back out of the prompt. */
function promptExample(): string {
  const prompt = buildAiPrompt(sampleSchedule, profile)
  const from = prompt.indexOf('An example (a typical shul):')
  const to = prompt.indexOf("The shul's current events")
  return prompt.slice(from, to)
}

describe('buildAiPrompt', () => {
  it('carries the schema, the shul’s current events and ends ready for a description', () => {
    const prompt = buildAiPrompt(sampleSchedule, profile)
    expect(prompt).toContain('Test Shul')
    expect(prompt).toContain('candleLighting')
    expect(prompt).toContain('aseresYemeiTeshuva')
    expect(prompt).toContain(`"id": "${sampleSchedule.events[0].id}"`)
    expect(prompt.trimEnd().endsWith('description of their schedule:')).toBe(true)
  })
})

describe('parseAiImport', () => {
  it('reads its own example back, and the engine agrees with it', () => {
    const result = parseAiImport(promptExample())
    if (!result.ok) throw new Error(result.errors.join('\n'))
    const schedule = { ...sampleSchedule, events: result.events, exceptions: [], notices: [] }
    expect(validate(schedule, '2026-09-01').filter((i) => i.level === 'error')).toEqual([])

    const cal = new Calendar(schedule)
    const at = (id: string, date: string) => cal.resolve(id, date).minutes
    expect(at('shacharis', '2026-10-21')).toBe(6 * 60 + 30) // Wednesday
    expect(at('shacharis', '2026-10-22')).toBe(6 * 60 + 15) // Thursday
    expect(at('shacharis', '2026-10-25')).toBe(8 * 60) // Sunday
    expect(at('shacharis', '2026-11-26')).toBe(8 * 60) // Thanksgiving (a Thursday)
    expect(at('shacharis-early', '2026-10-24')).toBe(7 * 60 + 30) // Shabbos
    expect(at('shacharis-early', '2026-09-12')).toBeNull() // Rosh Hashana on Shabbos
    expect(at('maariv', '2026-10-24')).not.toBeNull() // Motzei Shabbos
  })

  it('finds the JSON inside prose and fences, and takes the largest block', () => {
    const text =
      'Here you go:\n```json\n{"tag": "fast"}\n```\n```json\n{ "events": [{ "id": "a", "name": { "en": "A" }, "kind": "shiur", "rules": [{ "time": { "clock": "20:00" } }] }] }\n```\nEnjoy!'
    const result = parseAiImport(text)
    expect(result.ok && result.events.map((e) => e.id)).toEqual(['a'])
  })

  it('accepts a bare list', () => {
    const result = parseAiImport(
      '[{ "id": "a", "name": { "en": "A" }, "kind": "other", "rules": [] }]',
    )
    expect(result.ok).toBe(true)
  })

  it('names every problem so it can go back to the AI', () => {
    const result = parseAiImport(
      JSON.stringify({
        events: [
          {
            id: 'x',
            name: { en: 'Mincha' },
            kind: 'prayer',
            rules: [
              { when: { tag: 'mondays' }, time: { clock: '6:30pm' } },
              { when: { weekday: [7] }, time: { round: { zman: 'shkia' }, to: 5, mode: 'floor' } },
              { when: { weekday: [1], tag: 'fast' } },
            ],
          },
          { id: 'x', name: 'Maariv', kind: 'tefila', rules: [] },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      '"Mincha": "kind" must be tefila, shiur or other',
      '"Mincha" rule 1: unknown tag "mondays"',
      '"Mincha" rule 1: clock "6:30pm" must be "HH:MM", 24-hour',
      '"Mincha" rule 2: "weekday" must be a list of 0–6',
      '"Mincha" rule 2 › round: unknown zman "shkia"',
      '"Mincha" rule 2: "mode" must be "down", "up" or "nearest"',
      '"Mincha" rule 3: a condition has exactly one key, found weekday, tag',
      '"Mincha" rule 3: needs "time" (or null for "not on these days")',
      '"Maariv": id "x" is used twice',
    ])
  })

  it('says so when there is no JSON', () => {
    expect(parseAiImport('Sure! What time is Shacharis?')).toEqual({
      ok: false,
      errors: [expect.stringContaining('No JSON')],
    })
  })
})

describe('applyImport', () => {
  const ev = (id: string, en = id): EventDef => ({ id, name: { en }, kind: 'tefila', rules: [] })
  it('replaces the whole list', () => {
    expect(applyImport([ev('a'), ev('b')], [ev('c')], 'replace').map((e) => e.id)).toEqual(['c'])
  })
  it('merges by id, keeping order and appending new ones', () => {
    const out = applyImport([ev('a'), ev('b')], [ev('b', 'B2'), ev('c')], 'merge')
    expect(out.map((e) => e.name.en)).toEqual(['a', 'B2', 'c'])
  })
})
