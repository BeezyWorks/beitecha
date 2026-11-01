import { sampleSchedule } from '@beitecha/engine'

import { eventPrompt, noticePrompt, oneTimePrompt, parseEvents, parseNotices, parseOneTime, parseRule, rulePrompt } from '../aiItems'

const profile = { name: { en: 'Test Shul' } }
const today = '2026-11-02'
const event = sampleSchedule.events[0]

describe('prompts', () => {
  it('end with the gabbai’s request, and carry what each one is about', () => {
    const p = eventPrompt(sampleSchedule, profile, event, 'Make it 6:20 on Mondays')
    expect(p).toContain(`"id": "${event.id}"`)
    expect(p).toContain('candleLighting')
    expect(p.trimEnd().endsWith('Make it 6:20 on Mondays')).toBe(true)
    expect(rulePrompt(sampleSchedule, profile, event, 0, 'x')).toContain('The rule to rewrite (rule 1)')
    expect(rulePrompt(sampleSchedule, profile, event, null, '')).toContain('next message')
  })

  it('give one-time events and notices the coming dates', () => {
    expect(oneTimePrompt(sampleSchedule, profile, today, 'Dinner')).toContain('2026-11-07 Shabbos')
    expect(noticePrompt(sampleSchedule, profile, today, 'Kiddush')).toContain('Parshas')
  })
})

describe('parseEvents', () => {
  it('takes a single event or a list, and names what’s wrong', () => {
    const ok = parseEvents('```json\n' + JSON.stringify(event) + '\n```')
    expect(ok.ok && ok.value.map((e) => e.id)).toEqual([event.id])
    const bad = parseEvents('{ "events": [{ "id": "x", "name": { "en": "X" }, "kind": "shiur", "rules": [{ "time": { "clock": "25:00" } }] }] }')
    expect(!bad.ok && bad.errors.join()).toContain('HH:MM')
  })
})

describe('parseRule', () => {
  it('reads { rule }, a bare rule, and checks it', () => {
    const r = parseRule('Here you go:\n```json\n{ "rule": { "when": { "tag": "fast" }, "time": { "clock": "06:15" } } }\n```')
    expect(r).toEqual({ ok: true, value: { when: { tag: 'fast' }, time: { clock: '06:15' } } })
    expect(parseRule('{ "when": { "weekday": [0] }, "time": null }').ok).toBe(true)
    const bad = parseRule('{ "rule": { "when": { "tag": "tuesdays" }, "time": { "clock": "06:15" } } }')
    expect(!bad.ok && bad.errors.join()).toContain('unknown tag')
    expect(parseRule('{ "nope": 1 }').ok).toBe(false)
    // Pasted twice, with words around it.
    const twice = 'Sure! { "rule": { "time": { "clock": "06:10" } } } That makes it 6:10.'
    expect(parseRule(twice + twice)).toEqual({ ok: true, value: { time: { clock: '06:10' } } })
  })
})

describe('parseOneTime', () => {
  it('builds one-time events and leaves out what isn’t said', () => {
    const r = parseOneTime('{ "events": [{ "date": "2026-12-20", "name": "Chanukah party", "time": "17:30", "end": "19:00", "audience": "kids" }] }')
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.value[0]).toEqual({
      id: '',
      date: '2026-12-20',
      type: 'add',
      event: { id: '', name: { en: 'Chanukah party' }, kind: 'other', audience: 'kids' },
      time: { clock: '17:30' },
      end: { clock: '19:00' },
    })
    const bad = parseOneTime('{ "events": [{ "date": "Dec 20", "name": "Party", "time": "5:30pm" }] }')
    expect(!bad.ok && bad.errors.length).toBe(2)
  })
})

describe('parseNotices', () => {
  it('reads sponsorships and checks the event they’re for', () => {
    const r = parseNotices(
      '{ "notices": [{ "kind": "sponsor", "from": "2026-11-07", "eventId": "kiddush", "title": { "en": "Kiddush" }, "text": { "en": "The Cohens" } }] }',
      ['kiddush'],
    )
    expect(r).toEqual({
      ok: true,
      value: [{ id: '', kind: 'sponsor', from: '2026-11-07', eventId: 'kiddush', title: { en: 'Kiddush' }, text: { en: 'The Cohens' } }],
    })
    const bad = parseNotices('[{ "kind": "sponsor", "from": "2026-11-07", "eventId": "melava", "text": "x" }]', ['kiddush'])
    expect(!bad.ok && bad.errors.join()).toContain('no event "melava"')
  })

  it('files announcements under the shul’s categories', () => {
    const r = parseNotices('[{ "kind": "announcement", "category": "school", "from": "2026-11-07", "text": { "en": "PTA tonight" } }]', [], ['school'])
    expect(r.ok && r.value[0].category).toBe('school')
    const bad = parseNotices('[{ "kind": "simcha", "category": "gone", "from": "2026-11-07", "text": { "en": "x" } }]', [], ['school'])
    expect(!bad.ok && bad.errors.join()).toContain('no category "gone"')
  })
})
