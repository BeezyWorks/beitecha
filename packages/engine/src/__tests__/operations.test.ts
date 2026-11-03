import { describe, expect, it } from 'vitest'

import {
  LIMITS,
  applyOperation,
  computeDay,
  foldName,
  isRemoval,
  operationScope,
  revertOperation,
  sampleSchedule,
  sanitizeLink,
  sanitizeText,
  type ApplyResult,
  type Operation,
  type Schedule,
} from '../index'

const today = '2026-10-28'
let n = 0
const ctx = (connectionId = 'conn1') => ({ today, connectionId, newId: () => `id${++n}` })
const run = (s: Schedule, op: Operation, connectionId?: string) => applyOperation(s, op, ctx(connectionId))
const ok = (r: ApplyResult) => {
  if ('error' in r) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r
}
const err = (r: ApplyResult) => {
  if (!('error' in r)) throw new Error('expected an error')
  return r.error
}
const base: Schedule = { ...sampleSchedule, notices: [], exceptions: [] }
const apply = (s: Schedule, op: Operation, connectionId?: string) => ok(run(s, op, connectionId)).schedule

describe('sanitizeText', () => {
  it('leaves Hebrew (with niqqud) and English alone', () => {
    const he = 'בְּרֵאשִׁית בָּרָא אֱלֹהִים'
    expect(sanitizeText(he)).toEqual({ ok: true, text: he })
    expect(sanitizeText("Rabbi Dovid's  shiur — 7:30 PM, “bring friends”!")).toEqual({
      ok: true,
      text: "Rabbi Dovid's shiur — 7:30 PM, “bring friends”!",
    })
  })

  it('strips controls, bidi, zero-width and tag characters', () => {
    const dirty = 'a\u0000b\u0007c\u202Ed\u2066e\u2069f\u200Bg\u200Fh\uFEFFi\u2060j\u0085k\u{E0041}l\u00ADm'
    expect(sanitizeText(dirty)).toEqual({ ok: true, text: 'abcdefghijklm' })
  })

  it('flattens newlines unless multiline', () => {
    expect(sanitizeText('a\n\nb\tc')).toEqual({ ok: true, text: 'a b c' })
    expect(sanitizeText('a\r\n\r\n\r\n\r\nb', { multiline: true })).toEqual({ ok: true, text: 'a\n\nb' })
  })

  it('rejects long words, long text and (when required) nothing', () => {
    expect(sanitizeText('x'.repeat(41)).ok).toBe(false)
    expect(sanitizeText('x'.repeat(40)).ok).toBe(true)
    expect(sanitizeText('word '.repeat(21)).ok).toBe(false) // 105 chars
    expect(sanitizeText('word '.repeat(100), { max: LIMITS.text }).ok).toBe(true)
    expect(sanitizeText('\u200B', { required: true }).ok).toBe(false)
    expect(sanitizeText(5).ok).toBe(false)
  })

  it('takes only https links', () => {
    expect(sanitizeLink('https://example.org/rsvp?x=1').ok).toBe(true)
    for (const bad of ['http://example.org', 'javascript:alert(1)', 'https://u:p@example.org', 'example.org', 'https://a b.org', 'https://localhost'])
      expect(sanitizeLink(bad).ok, bad).toBe(false)
  })

  it('folds case and diacritics, English and Hebrew', () => {
    expect(foldName('  José  COHEN ')).toBe('jose cohen')
    expect(foldName('שָׁלוֹם')).toBe(foldName('שלום'))
  })
})

describe('helpers', () => {
  it('names the scope and the removals', () => {
    expect(operationScope({ op: 'cholim.add' })).toBe('cholim')
    expect(operationScope({ op: 'change.cancel' })).toBe('changes')
    expect(isRemoval({ op: 'notice.delete' })).toBe(true)
    expect(isRemoval({ op: 'cholim.remove' })).toBe(true)
    expect(isRemoval({ op: 'cholim.renew' })).toBe(false)
  })

  it('rejects an unknown operation and leaves the schedule alone', () => {
    expect(err(run(base, { op: 'rules.replace' } as unknown as Operation)).code).toBe('invalid')
    expect(err(run(base, {} as Operation)).code).toBe('invalid')
  })

  it('round-trips origin through JSON and the calendar ignores it', () => {
    const s = apply(base, { op: 'event.create', name: 'Siyum', date: '2026-11-02', time: '20:00' })
    const again = JSON.parse(JSON.stringify(s)) as Schedule
    expect(again).toEqual(s)
    expect(computeDay(again, '2026-11-02').events.some((e) => e.eventId.startsWith('oneoff-'))).toBe(true)
  })
})

describe('sponsorships', () => {
  const create: Operation = { op: 'sponsor.create', ref: 'kiddush@2026-10-31', sponsoredBy: 'the Cohens', inHonorOf: "Dovid's bar mitzvah" }

  it('creates one by ref with origin, the admin way', () => {
    const r = ok(run(base, create))
    expect(r.target).toBe('kiddush@2026-10-31')
    expect(r.before).toEqual([])
    expect(r.after).toHaveLength(1)
    expect(r.schedule.notices[0]).toMatchObject({
      kind: 'sponsor',
      eventId: 'kiddush',
      from: '2026-10-31',
      sponsoredBy: { en: 'the Cohens' },
      inHonorOf: { en: "Dovid's bar mitzvah" },
      text: { en: "Dovid's bar mitzvah" },
      origin: { connectionId: 'conn1' },
    })
    expect(r.schedule.notices[0].to).toBeUndefined()
    expect(base.notices).toHaveLength(0)
  })

  it('takes eventId and date too, and refuses an event that is not on that day', () => {
    expect(apply(base, { op: 'sponsor.create', eventId: 'kiddush', date: '2026-10-31', sponsoredBy: 'X' }).notices).toHaveLength(1)
    expect(err(run(base, { op: 'sponsor.create', ref: 'kiddush@2026-10-29', sponsoredBy: 'X' })).code).toBe('not_found')
    expect(err(run(base, { op: 'sponsor.create', ref: 'nonesuch@2026-10-31', sponsoredBy: 'X' })).code).toBe('not_found')
    expect(err(run(base, { op: 'sponsor.create', ref: 'kiddush', sponsoredBy: 'X' })).code).toBe('invalid')
    expect(err(run(base, { op: 'sponsor.create', ref: 'kiddush@2026-10-31' })).code).toBe('invalid')
  })

  it('is one per event and date: a conflict unless replace', () => {
    const s = apply(base, create)
    const e = err(run(s, { ...create, sponsoredBy: 'the Levys' }))
    expect(e.code).toBe('conflict')
    expect(e.details).toMatchObject({ id: s.notices[0].id })
    const r = ok(run(s, { ...create, sponsoredBy: 'the Levys', replace: true }))
    expect(r.schedule.notices).toHaveLength(1)
    expect(r.schedule.notices[0]).toMatchObject({ id: s.notices[0].id, sponsoredBy: { en: 'the Levys' } })
    expect(r.before[0].item).toEqual(s.notices[0])
  })

  it('sponsors the notices for a run of days without an event', () => {
    const s = apply(base, { op: 'sponsor.create', from: '2026-10-25', to: '2026-10-31', sponsors: 'notices', text: 'Sponsored by the Golds' })
    expect(s.notices[0]).toMatchObject({ from: '2026-10-25', to: '2026-10-31', sponsors: 'notices' })
  })

  it('updates and deletes, by id or ref', () => {
    const s = apply(base, create)
    const u = apply(s, { op: 'sponsor.update', ref: 'kiddush@2026-10-31', inHonorOf: null, sponsoredBy: { en: 'the Cohen family', he: 'משפחת כהן' } })
    expect(u.notices[0].inHonorOf).toBeUndefined()
    expect(u.notices[0]).toMatchObject({ sponsoredBy: { en: 'the Cohen family', he: 'משפחת כהן' }, text: { en: '' } })
    expect(apply(u, { op: 'sponsor.delete', id: s.notices[0].id }).notices).toHaveLength(0)
    expect(err(run(u, { op: 'sponsor.delete', ref: 'kiddush@2026-11-07' })).code).toBe('not_found')
  })

  it('caps live sponsorships per connection', () => {
    let s: Schedule = base
    const days = ['2026-10-31', '2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26', '2027-01-02']
    for (const d of days) s = apply(s, { op: 'sponsor.create', ref: `kiddush@${d}`, sponsoredBy: 'X' })
    expect(err(run(s, { op: 'sponsor.create', ref: 'kiddush@2027-01-09', sponsoredBy: 'X' })).code).toBe('limit')
    expect(ok(run(s, { op: 'sponsor.create', ref: 'kiddush@2027-01-09', sponsoredBy: 'X' }, 'other')).schedule.notices).toHaveLength(11)
  })
})

describe('notices', () => {
  const create: Operation = { op: 'notice.create', kind: 'announcement', text: 'Kiddush club meets Sunday' }

  it('creates with from today and to from + 14 days', () => {
    const r = ok(run(base, create))
    expect(r.schedule.notices[0]).toMatchObject({ kind: 'announcement', from: today, to: '2026-11-11', text: { en: 'Kiddush club meets Sunday' }, origin: { connectionId: 'conn1' } })
  })

  it('limits to 90 days and checks the dates', () => {
    expect(err(run(base, { ...create, to: '2027-03-01' })).code).toBe('date_out_of_range')
    expect(apply(base, { ...create, to: '2027-01-26' }).notices[0].to).toBe('2027-01-26')
    expect(err(run(base, { ...create, from: '2026-11-05', to: '2026-11-01' })).code).toBe('invalid')
    expect(err(run(base, { ...create, from: '2026-10-01' })).code).toBe('date_out_of_range')
    expect(err(run(base, { ...create, from: '2028-01-01' })).code).toBe('date_out_of_range')
    expect(err(run(base, { ...create, kind: 'sponsor' as 'simcha' })).code).toBe('invalid')
  })

  it('takes a reminder for a one-time event down with the event', () => {
    const s = apply(base, { op: 'event.create', name: 'Siyum', date: '2026-11-02', time: '20:00' })
    const id = s.exceptions[0].type === 'add' ? s.exceptions[0].event.id : ''
    const r = apply(s, { op: 'notice.create', kind: 'reminder', text: 'Siyum Monday night', eventId: id })
    expect(r.notices[0].eventId).toBe(id)
    expect(r.notices[0].to).toBeUndefined()
    expect(err(run(s, { op: 'notice.create', kind: 'reminder', text: 'x', eventId: 'nope' })).code).toBe('not_found')
  })

  it('checks category and link, and cleans text', () => {
    expect(err(run(base, { ...create, category: 'nope' })).code).toBe('invalid')
    expect(err(run(base, { ...create, link: 'http://example.org' })).code).toBe('invalid')
    expect(err(run(base, { ...create, text: 'x'.repeat(501) })).code).toBe('invalid')
    expect(apply(base, { ...create, text: 'Hi\u202E there', link: 'https://example.org/x' }).notices[0]).toMatchObject({ text: { en: 'Hi there' }, link: 'https://example.org/x' })
  })

  it('allows five live notices per connection, and a new one once one is past', () => {
    let s: Schedule = base
    for (let i = 0; i < 5; i++) s = apply(s, { ...create, text: `Notice ${i}` })
    const e = err(run(s, create))
    expect(e.code).toBe('limit')
    expect(ok(run(s, create, 'conn2')).schedule.notices).toHaveLength(6)
    const gone = apply(s, { op: 'notice.delete', id: s.notices[0].id })
    expect(apply(gone, create).notices).toHaveLength(5)
    // A notice that has ended doesn't count.
    const past = { ...s, notices: s.notices.map((x, i) => (i === 0 ? { ...x, from: '2026-09-01', to: '2026-09-02' } : x)) }
    expect(apply(past, create).notices).toHaveLength(6)
  })

  it('updates and deletes, keeping the rest', () => {
    const s = apply(base, create)
    const id = s.notices[0].id
    const u = apply(s, { op: 'notice.update', id, text: 'Changed', title: 'Club', to: '2026-11-20' }, 'conn2')
    expect(u.notices[0]).toMatchObject({ id, text: { en: 'Changed' }, title: { en: 'Club' }, to: '2026-11-20', origin: { connectionId: 'conn2' } })
    expect(apply(u, { op: 'notice.update', id, title: null }).notices[0].title).toBeUndefined()
    expect(err(run(s, { op: 'notice.update', id: 'zzz', text: 'x' })).code).toBe('not_found')
    expect(apply(s, { op: 'notice.delete', id }).notices).toHaveLength(0)
  })

  it('does not touch sponsorships through notice operations', () => {
    const s = apply(base, { op: 'sponsor.create', ref: 'kiddush@2026-10-31', sponsoredBy: 'X' })
    expect(err(run(s, { op: 'notice.delete', id: s.notices[0].id })).code).toBe('not_found')
  })
})

describe('changes', () => {
  it('cancels a shiur with a note, as the admin does', () => {
    const r = ok(run(base, { op: 'change.cancel', ref: 'womens-shiur@2026-10-31', note: 'Back next week' }))
    expect(r.needsReview).toBeUndefined()
    expect(r.schedule.exceptions).toEqual([
      expect.objectContaining({ type: 'cancel', eventId: 'womens-shiur', date: '2026-10-31', note: { en: 'Back next week' }, origin: { connectionId: 'conn1' } }),
    ])
    const o = computeDay(r.schedule, '2026-10-31').events.find((e) => e.eventId === 'womens-shiur')
    expect(o?.cancelled).toBe(true)
  })

  it('retimes, replacing a cancel or an earlier retime and carrying its note', () => {
    let s = apply(base, { op: 'change.cancel', ref: 'womens-shiur@2026-10-31', note: 'Away' })
    const r = ok(run(s, { op: 'change.retime', ref: 'womens-shiur@2026-10-31', time: '16:30' }))
    s = r.schedule
    expect(s.exceptions).toHaveLength(1)
    expect(s.exceptions[0]).toMatchObject({ type: 'retime', time: { clock: '16:30' }, note: { en: 'Away' } })
    expect(r.before).toHaveLength(1)
    expect(computeDay(s, '2026-10-31').events.find((e) => e.eventId === 'womens-shiur')?.minutes).toBe(990)
    expect(err(run(s, { op: 'change.retime', ref: 'womens-shiur@2026-10-31', time: '25:99' })).code).toBe('invalid')
  })

  it('adds a note on its own, or onto the change already there', () => {
    const s = apply(base, { op: 'change.note', ref: 'kiddush@2026-10-31', note: 'In the social hall' })
    expect(s.exceptions[0]).toMatchObject({ type: 'note', note: { en: 'In the social hall' } })
    const c = apply(s, { op: 'change.cancel', ref: 'kiddush@2026-10-31' })
    expect(c.exceptions).toHaveLength(1)
    expect(c.exceptions[0].note).toEqual({ en: 'In the social hall' })
    const m = apply(c, { op: 'change.note', ref: 'kiddush@2026-10-31', note: 'Cancelled: no sponsor' })
    expect(m.exceptions[0]).toMatchObject({ type: 'cancel', note: { en: 'Cancelled: no sponsor' } })
  })

  it('deletes the changes on a ref, optionally of one kind', () => {
    const s = apply(base, { op: 'change.cancel', ref: 'womens-shiur@2026-10-31' })
    expect(err(run(s, { op: 'change.delete', ref: 'womens-shiur@2026-10-31', type: 'retime' })).code).toBe('not_found')
    expect(apply(s, { op: 'change.delete', ref: 'womens-shiur@2026-10-31' }).exceptions).toHaveLength(0)
    expect(err(run(base, { op: 'change.delete', ref: 'womens-shiur@2026-10-31' })).code).toBe('not_found')
  })

  it('flags a minyan retime or cancel for review, nothing else', () => {
    expect(ok(run(base, { op: 'change.retime', ref: 'mincha@2026-10-31', time: '17:00' })).needsReview).toMatch(/gabbai/)
    expect(ok(run(base, { op: 'change.cancel', ref: 'maariv@2026-10-31' })).needsReview).toBeDefined()
    expect(ok(run(base, { op: 'change.note', ref: 'maariv@2026-10-31', note: 'Late' })).needsReview).toBeUndefined()
    expect(ok(run(base, { op: 'change.retime', ref: 'kiddush@2026-10-31', time: '12:30' })).needsReview).toBeUndefined()
  })

  it('refuses a date more than a day back or a year ahead', () => {
    expect(err(run(base, { op: 'change.cancel', ref: 'shacharis@2026-10-26' })).code).toBe('date_out_of_range')
    expect(ok(run(base, { op: 'change.cancel', ref: 'shacharis@2026-10-27' })).target).toBe('shacharis@2026-10-27')
    expect(err(run(base, { op: 'change.cancel', ref: 'shacharis@2027-10-30' })).code).toBe('date_out_of_range')
    expect(err(run(base, { op: 'change.cancel', ref: 'shacharis@2026-02-30' })).code).toBe('invalid')
  })

  it('can change a one-time event too', () => {
    const s = apply(sampleSchedule, { op: 'change.retime', ref: 'bbq@2026-11-08', time: '13:00' })
    expect(computeDay(s, '2026-11-08').events.find((e) => e.eventId === 'bbq')?.minutes).toBe(780)
  })
})

describe('one-time events', () => {
  const create: Operation = { op: 'event.create', name: 'Siyum Hashas', date: '2026-11-02', time: '20:00', end: '21:30', room: 'Main hall', link: 'https://example.org/siyum' }

  it('creates one with origin and no rule', () => {
    const r = ok(run(base, create))
    const x = r.schedule.exceptions[0]
    expect(x).toMatchObject({ type: 'add', date: '2026-11-02', time: { clock: '20:00' }, end: { clock: '21:30' }, origin: { connectionId: 'conn1' } })
    expect(x.type === 'add' && x.event).toMatchObject({ name: { en: 'Siyum Hashas' }, kind: 'other', room: 'Main hall', origin: { connectionId: 'conn1' } })
    expect(x.type === 'add' && x.event.id).toBe(r.target)
    expect(computeDay(r.schedule, '2026-11-02').events.find((e) => e.eventId === r.target)?.minutes).toBe(1200)
  })

  it('checks time, end, link and dates', () => {
    expect(err(run(base, { ...create, end: '19:00' })).code).toBe('invalid')
    expect(err(run(base, { ...create, time: 'eight' })).code).toBe('invalid')
    expect(err(run(base, { ...create, link: 'http://x.org' })).code).toBe('invalid')
    expect(err(run(base, { ...create, date: '2025-01-01' })).code).toBe('date_out_of_range')
    expect(err(run(base, { ...create, name: '' })).code).toBe('invalid')
  })

  it('caps upcoming ones per connection', () => {
    let s: Schedule = base
    for (let i = 0; i < LIMITS.liveEvents; i++) s = apply(s, { ...create, name: `Event ${i}` })
    expect(err(run(s, create)).code).toBe('limit')
    expect(ok(run(s, create, 'other')).schedule.exceptions).toHaveLength(LIMITS.liveEvents + 1)
  })

  it('edits and deletes only what this connection created', () => {
    const r = ok(run(base, create))
    const id = r.target
    expect(err(run(r.schedule, { op: 'event.update', id, name: 'X' }, 'other')).code).toBe('forbidden')
    expect(err(run(r.schedule, { op: 'event.delete', id }, 'other')).code).toBe('forbidden')
    expect(err(run(sampleSchedule, { op: 'event.delete', id: 'bbq' })).code).toBe('forbidden')
    expect(err(run(sampleSchedule, { op: 'event.update', id: 'kiddush', name: 'X' })).code).toBe('not_found')
    const u = apply(r.schedule, { op: 'event.update', id, name: 'Siyum', time: '19:30', end: null, room: null })
    const x = u.exceptions[0]
    expect(x.type === 'add' && x).toMatchObject({ time: { clock: '19:30' }, event: { name: { en: 'Siyum' } } })
    expect(x.type === 'add' && x.end).toBeUndefined()
    expect(x.type === 'add' && x.event.room).toBeUndefined()
  })

  it('moves its cancel with it, and deletes everything about it', () => {
    let s = apply(base, create)
    const id = s.exceptions[0].type === 'add' ? s.exceptions[0].event.id : ''
    s = apply(s, { op: 'change.note', ref: `${id}@2026-11-02`, note: 'Bring a book' })
    s = apply(s, { op: 'notice.create', kind: 'reminder', text: 'Siyum', eventId: id })
    const moved = apply(s, { op: 'event.update', id, date: '2026-11-03' })
    expect(moved.exceptions.map((x) => x.date)).toEqual(['2026-11-03', '2026-11-03'])
    const gone = ok(run(s, { op: 'event.delete', id }))
    expect(gone.schedule.exceptions).toHaveLength(0)
    expect(gone.schedule.notices).toHaveLength(0)
    expect(gone.before).toHaveLength(3)
  })
})

describe('yahrzeits and occasions', () => {
  const add: Operation = { op: 'yahrzeit.add', hebrewName: 'משה בן אברהם', displayName: 'Moshe Cohen', hebrew: { day: 18, month: 8 } }

  it('adds a yahrzeit by Hebrew date, or by civil date with the Hebrew one derived', () => {
    const a = apply(base, add)
    expect(a.yahrzeits![0]).toMatchObject({ hebrewName: 'משה בן אברהם', displayName: { en: 'Moshe Cohen' }, hebrew: { day: 18, month: 8 }, origin: { connectionId: 'conn1' } })
    const b = apply(base, { op: 'yahrzeit.add', displayName: 'Sara Levy', gregorian: '2024-11-05' })
    expect(b.yahrzeits![0].hebrew).toEqual({ day: 4, month: 8, year: 5785 })
    expect(b.yahrzeits![0].gregorian).toBe('2024-11-05')
    const c = apply(base, { op: 'yahrzeit.add', displayName: 'Dan', hebrew: { day: 4, month: 8, year: 5785 } })
    expect(c.yahrzeits![0].gregorian).toBe('2024-11-05')
  })

  it('validates names and dates', () => {
    expect(err(run(base, { op: 'yahrzeit.add', hebrew: { day: 18, month: 8 } })).code).toBe('invalid')
    expect(err(run(base, { op: 'yahrzeit.add', displayName: 'X' })).code).toBe('invalid')
    expect(err(run(base, { op: 'yahrzeit.add', displayName: 'X', hebrew: { day: 31, month: 8 } })).code).toBe('invalid')
    expect(err(run(base, { op: 'yahrzeit.add', displayName: 'X', hebrew: { day: 30, month: 13 } })).code).toBe('invalid')
    expect(err(run(base, { op: 'yahrzeit.add', displayName: 'X', gregorian: '2024-02-30' })).code).toBe('invalid')
    expect(err(run(base, { op: 'yahrzeit.add', displayName: 'x'.repeat(101), gregorian: '2024-02-20' })).code).toBe('invalid')
  })

  it('refuses a duplicate', () => {
    const s = apply(base, add)
    const e = err(run(s, { ...add, displayName: 'moshe cohen' }))
    expect(e.code).toBe('conflict')
    expect(e.details).toMatchObject({ id: s.yahrzeits![0].id })
  })

  it('removes by id, or by a match over English and Hebrew that finds exactly one', () => {
    let s = apply(base, add)
    s = apply(s, { op: 'yahrzeit.add', displayName: { en: 'Moshe Levy', he: 'משה לוי' }, hebrew: { day: 3, month: 9 } })
    const ambiguous = err(run(s, { op: 'yahrzeit.delete', match: 'moshe' }))
    expect(ambiguous.code).toBe('ambiguous')
    const candidates = (ambiguous.details as { candidates: Record<string, unknown>[] }).candidates
    expect(candidates).toHaveLength(2)
    for (const c of candidates) expect(Object.keys(c).sort()).toEqual(['date', 'id', 'name'])
    expect(candidates[0].date).toBe('18 Cheshvan')
    expect(err(run(s, { op: 'yahrzeit.delete', match: 'nobody' })).code).toBe('not_found')
    expect(err(run(s, { op: 'yahrzeit.delete' })).code).toBe('invalid')
    const hebrew = ok(run(s, { op: 'yahrzeit.delete', match: 'לוֹי' }))
    expect(hebrew.schedule.yahrzeits).toHaveLength(1)
    expect(apply(s, { op: 'yahrzeit.delete', match: 'MOSHE COHEN' }).yahrzeits).toHaveLength(1)
    expect(apply(s, { op: 'yahrzeit.delete', id: s.yahrzeits![1].id }).yahrzeits).toHaveLength(1)
    expect(s.yahrzeits).toHaveLength(2)
  })

  it('edits a yahrzeit; a new date replaces both', () => {
    const s = apply(base, { op: 'yahrzeit.add', displayName: 'Dan', hebrew: { day: 4, month: 8, year: 5785 } })
    const u = apply(s, { op: 'yahrzeit.update', match: 'dan', hebrew: { day: 5, month: 8 }, displayName: 'Daniel' }, 'conn2')
    expect(u.yahrzeits![0]).toMatchObject({ displayName: { en: 'Daniel' }, hebrew: { day: 5, month: 8 }, origin: { connectionId: 'conn2' } })
    expect(u.yahrzeits![0].gregorian).toBeUndefined()
    const k = apply(s, { op: 'yahrzeit.update', match: 'dan', hideFromBulletin: true })
    expect(k.yahrzeits![0]).toMatchObject({ hebrew: { day: 4, month: 8, year: 5785 }, hideFromBulletin: true })
  })

  it('adds, edits and deletes birthdays and anniversaries into their own lists', () => {
    const b = apply(base, { op: 'occasion.add', kind: 'birthday', displayName: 'Dovid Levy', gregorian: '2013-11-14' })
    expect(b.birthdays![0]).toMatchObject({ gregorian: '2013-11-14', origin: { connectionId: 'conn1' } })
    expect(b.birthdays![0].hebrew).toBeUndefined()
    expect(b.anniversaries).toBeUndefined()
    const a = apply(b, { op: 'occasion.add', kind: 'anniversary', displayName: 'Dovid & Rivka', hebrew: { day: 15, month: 3 }, by: 'hebrew' })
    expect(a.anniversaries![0]).toMatchObject({ hebrew: { day: 15, month: 3 }, by: 'hebrew' })
    const u = apply(a, { op: 'occasion.update', kind: 'birthday', match: 'dovid', hebrew: { day: 11, month: 9, year: 5774 }, by: 'hebrew' })
    expect(u.birthdays![0]).toMatchObject({ hebrew: { day: 11, month: 9, year: 5774 }, by: 'hebrew' })
    expect(u.birthdays![0].gregorian).toBeUndefined()
    // Matching only looks in the list of that kind.
    expect(apply(a, { op: 'occasion.delete', kind: 'anniversary', match: 'rivka' }).anniversaries).toHaveLength(0)
    expect(err(run(a, { op: 'occasion.delete', kind: 'birthday', match: 'rivka' })).code).toBe('not_found')
    expect(err(run(base, { op: 'occasion.add', kind: 'birthday', displayName: 'X' })).code).toBe('invalid')
    expect(err(run(base, { op: 'occasion.add', kind: 'wedding' as 'birthday', displayName: 'X', gregorian: '2020-01-01' })).code).toBe('invalid')
    expect(err(run(base, { op: 'occasion.add', kind: 'birthday', displayName: 'X', hebrew: { day: 30, month: 4 } })).code).toBe('invalid')
  })
})

describe('refuah names', () => {
  it('adds with today, refuses a repeat, renews, removes', () => {
    let s = apply(base, { op: 'cholim.add', name: { en: 'Yosef Chaim ben Rivka', he: 'יוסף חיים בן רבקה' } })
    expect(s.cholim![0]).toMatchObject({ name: { en: 'Yosef Chaim ben Rivka' }, added: today })
    expect(s.cholim![0]).not.toHaveProperty('origin')
    expect(err(run(s, { op: 'cholim.add', name: 'yosef chaim ben rivka' })).code).toBe('conflict')
    s = { ...s, cholim: [{ ...s.cholim![0], added: '2026-08-01' }] }
    const renewed = apply(s, { op: 'cholim.renew', match: 'יוסף חיים' })
    expect(renewed.cholim![0].added).toBe(today)
    expect(apply(s, { op: 'cholim.remove', match: 'chaim' }).cholim).toEqual([])
  })

  it('is ambiguous with name and date only', () => {
    let s = apply(base, { op: 'cholim.add', name: 'Dovid ben Sara' })
    s = apply(s, { op: 'cholim.add', name: 'Dovid ben Leah' })
    const e = err(run(s, { op: 'cholim.remove', match: 'dovid' }))
    expect(e.code).toBe('ambiguous')
    expect((e.details as { candidates: unknown[] }).candidates).toEqual([
      { id: s.cholim![0].id, name: 'Dovid ben Sara', date: today },
      { id: s.cholim![1].id, name: 'Dovid ben Leah', date: today },
    ])
  })

  it('stops at 300 names', () => {
    const full: Schedule = { ...base, cholim: Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: { en: `Name ${i}` }, added: today })) }
    expect(err(run(full, { op: 'cholim.add', name: 'One more' })).code).toBe('limit')
    expect(apply(full, { op: 'cholim.remove', id: 'c7' }).cholim).toHaveLength(299)
  })
})

describe('revertOperation', () => {
  const same = (a: unknown, b: unknown) => expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)))

  it('undoes a create, an update and a delete', () => {
    const c = ok(run(base, { op: 'sponsor.create', ref: 'kiddush@2026-10-31', sponsoredBy: 'X' }))
    const r1 = revertOperation(c.schedule, { op: c.target as never, before: c.before, after: c.after })
    expect('schedule' in r1 && r1.schedule.notices).toEqual([])

    const u = ok(run(c.schedule, { op: 'sponsor.update', ref: 'kiddush@2026-10-31', sponsoredBy: 'Y' }))
    const r2 = revertOperation(u.schedule, u)
    if (!('schedule' in r2)) throw new Error('conflict')
    same(r2.schedule, c.schedule)

    const d = ok(run(c.schedule, { op: 'sponsor.delete', ref: 'kiddush@2026-10-31' }))
    const r3 = revertOperation(d.schedule, d)
    if (!('schedule' in r3)) throw new Error('conflict')
    same(r3.schedule, c.schedule)
  })

  it('restores what a replacing change took away', () => {
    const s = apply(base, { op: 'change.cancel', ref: 'womens-shiur@2026-10-31', note: 'Away' })
    const r = ok(run(s, { op: 'change.retime', ref: 'womens-shiur@2026-10-31', time: '16:00' }))
    const back = revertOperation(r.schedule, r)
    if (!('schedule' in back)) throw new Error('conflict')
    same(back.schedule.exceptions, s.exceptions)
  })

  it('undoes a multi-item event delete', () => {
    let s = apply(base, { op: 'event.create', name: 'Siyum', date: '2026-11-02', time: '20:00' })
    const id = s.exceptions[0].type === 'add' ? s.exceptions[0].event.id : ''
    s = apply(s, { op: 'change.note', ref: `${id}@2026-11-02`, note: 'x' })
    s = apply(s, { op: 'notice.create', kind: 'reminder', text: 'Siyum', eventId: id })
    const d = ok(run(s, { op: 'event.delete', id }))
    const back = revertOperation(d.schedule, d)
    if (!('schedule' in back)) throw new Error('conflict')
    expect(back.schedule.exceptions).toHaveLength(2)
    expect(back.schedule.notices).toHaveLength(1)
  })

  it('conflicts when the target changed since, or the place was taken', () => {
    const c = ok(run(base, { op: 'notice.create', kind: 'announcement', text: 'Hello' }))
    const edited = apply(c.schedule, { op: 'notice.update', id: c.target, text: 'Edited by the gabbai' })
    const r = revertOperation(edited, c)
    expect('conflict' in r && r.conflict.ids).toEqual([c.target])
    const gone = { ...c.schedule, notices: [] }
    expect('conflict' in revertOperation(gone, c)).toBe(true)

    const d = ok(run(c.schedule, { op: 'notice.delete', id: c.target }))
    const retaken = { ...d.schedule, notices: [{ ...(c.after[0].item as object), id: c.target } as never] }
    expect('conflict' in revertOperation(retaken, d)).toBe(true)
  })

  it('ignores key order after the admin re-saves', () => {
    const c = ok(run(base, { op: 'notice.create', kind: 'announcement', text: 'Hello' }))
    const n = c.schedule.notices[0]
    const reordered = { ...c.schedule, notices: [Object.fromEntries(Object.entries(n).reverse()) as never] }
    expect('schedule' in revertOperation(reordered, c)).toBe(true)
  })
})
