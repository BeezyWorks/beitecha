import type { Operation } from '@beitecha/engine'

import {
  beforeAfter,
  describeOperation,
  expiryState,
  expiryText,
  newConnectionsByOthers,
  relativeTime,
  scopeList,
  sentence,
  sinceDate,
  sinceTime,
} from '../connect'
import type { Connection } from '@/lib/api'

const names = { event: (id: string) => (id === 'k' ? 'Shabbos Kiddush' : undefined) }

/** One of every operation the engine knows. */
const OPS: Operation[] = [
  { op: 'sponsor.create', ref: 'k@2026-11-07', sponsoredBy: 'The Levy family', inHonorOf: 'Dovid' },
  { op: 'sponsor.create', from: '2026-11-09', to: '2026-11-11', text: 'In memory of Sara' },
  { op: 'sponsor.create', from: '2026-11-09', sponsors: 'notices', text: 'x', replace: true },
  { op: 'sponsor.update', ref: 'k@2026-11-07', text: 'New text' },
  { op: 'sponsor.delete', ref: 'k@2026-11-07' },
  {
    op: 'notice.create',
    kind: 'announcement',
    title: 'BBQ',
    text: 'Sunday at 5',
    from: '2026-11-08',
  },
  { op: 'notice.create', kind: 'simcha', text: 'Mazal tov!' },
  { op: 'notice.update', id: 'n1', text: 'Moved indoors' },
  { op: 'notice.delete', id: 'n1' },
  { op: 'change.cancel', ref: 'k@2026-11-07', note: 'Snow' },
  { op: 'change.retime', ref: 'k@2026-11-07', time: '18:30' },
  { op: 'change.note', ref: 'k@2026-11-07', note: 'Bring a chair' },
  { op: 'change.delete', ref: 'k@2026-11-07', type: 'retime' },
  { op: 'event.create', name: 'Lecture', date: '2026-11-12', time: '20:00', room: 'Social hall' },
  { op: 'event.update', id: 'e1', time: '19:30' },
  { op: 'event.delete', id: 'e1' },
  { op: 'yahrzeit.add', displayName: 'Menachem Kohen', gregorian: '2020-11-05' },
  { op: 'yahrzeit.update', match: 'Menachem', gregorian: '2020-11-06' },
  { op: 'yahrzeit.delete', id: 'y1' },
  { op: 'occasion.add', kind: 'birthday', displayName: 'Sara', gregorian: '2015-03-02' },
  { op: 'occasion.update', kind: 'anniversary', match: 'Levy', gregorian: '2000-01-01' },
  { op: 'occasion.delete', kind: 'birthday', id: 'b1' },
  { op: 'cholim.add', name: { en: 'Rivka bas Sara', he: 'רבקה בת שרה' } },
  { op: 'cholim.remove', match: 'Rivka' },
  { op: 'cholim.renew', id: 'c1' },
]

describe('describeOperation', () => {
  it('says something readable for every operation', () => {
    for (const op of OPS) {
      const s = describeOperation(op, undefined, names)
      expect(s.length).toBeGreaterThan(8)
      expect(s).not.toMatch(/undefined|null|\[object/)
    }
  })

  it('covers every family the engine has', () => {
    const families = new Set(OPS.map((o) => o.op.split('.')[0]))
    expect([...families].sort()).toEqual([
      'change',
      'cholim',
      'event',
      'notice',
      'occasion',
      'sponsor',
      'yahrzeit',
    ])
  })

  it('names the event and the day of a dated target', () => {
    expect(describeOperation(OPS[0], undefined, names)).toBe(
      'Add a sponsorship for Shabbos Kiddush on Nov 7: The Levy family in honor of Dovid',
    )
    expect(describeOperation(OPS[10], undefined, names)).toBe(
      'Move Shabbos Kiddush on Nov 7 to 18:30',
    )
    expect(describeOperation(OPS[9], undefined, names)).toBe(
      'Cancel Shabbos Kiddush on Nov 7 (Snow)',
    )
  })

  it('says what a sponsorship without an event is for', () => {
    expect(describeOperation(OPS[1])).toContain('the day, Nov 9 to Nov 11')
    expect(describeOperation(OPS[2])).toContain('Replace the sponsorship for the notices')
  })

  it('falls back to a generic name for an event it cannot name', () => {
    expect(describeOperation(OPS[4])).toBe('Remove the sponsorship for the event on Nov 7')
  })

  it('names an edited item from the entries it replaced', () => {
    const before = [
      { list: 'notices' as const, item: { id: 'n1', title: { en: 'BBQ' }, text: { en: 'x' } } },
    ]
    expect(describeOperation({ op: 'notice.delete', id: 'n1' }, before)).toBe(
      'Remove the notice “BBQ”',
    )
    expect(describeOperation({ op: 'notice.update', id: 'n1', text: 'Indoors' }, before)).toBe(
      'Change the notice “BBQ”: text “Indoors”',
    )
  })

  it('prefers the match text for people, and Hebrew-only names work', () => {
    expect(describeOperation({ op: 'yahrzeit.delete', match: 'Kohen' })).toBe(
      'Remove the yahrzeit of “Kohen”',
    )
    expect(describeOperation({ op: 'yahrzeit.add', hebrewName: 'מנחם' })).toContain('מנחם')
    expect(describeOperation({ op: 'cholim.add', name: { en: '', he: 'רבקה' } })).toContain('רבקה')
  })

  it('does not throw on an unknown operation', () => {
    expect(describeOperation({ op: 'future.thing' } as unknown as Operation)).toContain(
      'future.thing',
    )
  })
})

describe('beforeAfter', () => {
  it('summarises entries and leaves out what is empty', () => {
    const n = (t: string) => ({ list: 'notices' as const, item: { id: t, text: { en: t } } })
    expect(beforeAfter([n('Old')], [n('New')])).toEqual({ was: 'Old', now: 'New' })
    expect(beforeAfter([], [n('New')])).toEqual({ now: 'New' })
    expect(beforeAfter([], [])).toEqual({})
  })
})

describe('times', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0)
  const H = 3_600_000
  const D = 24 * H
  it('says how long ago', () => {
    expect(relativeTime(null, now)).toBe('never')
    expect(relativeTime(now - 30_000, now)).toBe('just now')
    expect(relativeTime(now - 10 * 60_000, now)).toBe('10 min ago')
    expect(relativeTime(now - 5 * H, now)).toBe('5 hr ago')
    expect(relativeTime(now - 3 * D, now)).toBe('3 days ago')
    expect(relativeTime(now - 90 * D, now)).toBe('3 mo ago')
  })

  it('warns within 14 days of expiring', () => {
    expect(expiryState(null, now)).toEqual({ state: 'none' })
    expect(expiryState(now - 1, now)).toEqual({ state: 'expired' })
    expect(expiryState(now + 14 * D, now)).toEqual({ state: 'soon', days: 14 })
    expect(expiryState(now + 15 * D, now)).toEqual({ state: 'ok', days: 15 })
    expect(expiryText(expiryState(now + D / 2, now))).toBe('Expires tomorrow')
    expect(expiryText(expiryState(now + 20 * D, now))).toBe('Expires in 20 days')
  })

  it('starts "since" an hour, a day or a week back, or on a date', () => {
    expect(sinceTime('hour', now, 'America/New_York')).toBe(now - H)
    expect(sinceTime('week', now, 'America/New_York')).toBe(now - 7 * D)
    // 12:00 UTC is 07:00 in New York: today began 7 hours ago.
    expect(sinceTime('today', now, 'America/New_York')).toBe(now - 7 * H)
    expect(sinceDate('2026-11-01')).toBe(new Date(2026, 10, 1).getTime())
    expect(sinceDate('11/1')).toBeNull()
  })
})

describe('connections', () => {
  const now = Date.UTC(2026, 10, 3, 12, 0)
  const D = 24 * 3_600_000
  const c = (over: Partial<Connection>): Connection => ({
    id: 'a',
    userId: 'u',
    userName: 'Rivka',
    mine: false,
    kind: 'key',
    purpose: 'skill',
    label: 'Rivka’s Claude',
    prefix: 'bk_sec_abcd',
    mode: 'review',
    scopes: ['sponsors'],
    createdAt: now - 2 * D,
    expiresAt: now + 90 * D,
    revokedAt: null,
    lastUsedAt: null,
    lastIp: null,
    lastUserAgent: null,
    ...over,
  })

  it('flags other people’s connections from the last week, not mine, old or revoked ones', () => {
    const list = [
      c({ id: 'new' }),
      c({ id: 'mine', mine: true }),
      c({ id: 'old', createdAt: now - 8 * D }),
      c({ id: 'gone', revokedAt: now - D }),
    ]
    expect(newConnectionsByOthers(list, now).map((x) => x.id)).toEqual(['new'])
  })

  it('lists scopes in plain words', () => {
    expect(scopeList(['sponsors', 'occasions', 'cholim'])).toBe(
      'Sponsorships, Birthdays & anniversaries, Refuah shleimah',
    )
    expect(scopeList([])).toBe('Nothing')
  })

  it('capitalises the server’s message', () => {
    expect(sentence('it no longer fits: x')).toBe('It no longer fits: x')
  })
})
