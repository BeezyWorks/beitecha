import { sampleSchedule, type Condition, type Notice, type TimeExpr } from '@beitecha/engine'

import {
  audienceChoice,
  categoryChoice,
  conditionToForm,
  formToCondition,
  formToSaid,
  formToTime,
  linkProblem,
  noticeLinkProblem,
  noticeLinks,
  parseClockInput,
  parseMinutes,
  saidToForm,
  sponsorTarget,
  timeToForm,
  withNoticeKind,
  withNoticeLinks,
  withSponsorTarget,
} from '../forms'

describe('parseClockInput', () => {
  it.each([
    ['6:30', '06:30'],
    ['6:30pm', '18:30'],
    ['6:30 PM', '18:30'],
    ['12:00 am', '00:00'],
    ['12:15p', '12:15'],
    ['18:30', '18:30'],
    ['7pm', '19:00'],
    ['715', '07:15'],
  ])('%s → %s', (input, out) => expect(parseClockInput(input)).toBe(out))

  it.each(['25:00', '13pm', '6:75', 'soon'])('rejects %s', (input) => expect(parseClockInput(input)).toBeNull())
})

describe('round trips', () => {
  const rules = sampleSchedule.events.flatMap((e) => e.rules)

  it('every sample condition survives the form', () => {
    for (const r of rules) {
      const form = conditionToForm(r.when)
      expect(form).not.toBeNull()
      expect(formToCondition(form!)).toEqual(r.when)
    }
  })

  it('every sample time survives the form', () => {
    for (const r of rules) {
      if (!r.time) continue
      const form = timeToForm(r.time)
      expect(form).not.toBeNull()
      expect(formToTime(form!)).toEqual(r.time)
    }
  })

  it('every sample end time survives the form', () => {
    for (const r of rules) {
      if (!r.end) continue
      expect(formToTime(timeToForm(r.end)!)).toEqual(r.end)
    }
  })

  it('keeps "except" days', () => {
    const c: Condition = { all: [{ weekday: [0, 1, 2, 3, 4] }, { not: { any: [{ tag: 'roshChodesh' }, { tag: 'fast' }] } }] }
    expect(formToCondition(conditionToForm(c)!)).toEqual(c)
  })

  it('handles clamps and custom weeks', () => {
    const t: TimeExpr = {
      round: {
        clamp: { weekly: { offset: -10, of: { zman: 'sunset' } }, pick: 'latest', days: [0, 1, 2, 3] },
        min: { clock: '13:30' },
        max: { clock: '19:00' },
      },
      to: 15,
      mode: 'nearest',
    }
    expect(formToTime(timeToForm(t)!)).toEqual(t)
  })

  it('keeps rounding with the trend', () => {
    const t: TimeExpr = { round: { weekly: { offset: -10, of: { zman: 'plag' } }, pick: 'earliest' }, to: 5, mode: 'withTrend' }
    expect(formToTime(timeToForm(t)!)).toEqual(t)
  })

  it('gives up (null) on what the form can’t say', () => {
    expect(conditionToForm({ all: [{ tag: 'fast' }, { weekday: [1] }] })).toBeNull() // AND of two positives
    expect(timeToForm({ offset: 5, of: { clock: '06:00' } })).toBeNull()
    expect(timeToForm({ earliest: [{ round: { zman: 'plag' }, to: 5, mode: 'down' }] })).toBeNull()
  })
})

describe('local holidays in conditions', () => {
  it('round-trips a local holiday beside others', () => {
    const c: Condition = { all: [{ any: [{ localHoliday: 'thanksgiving' }, { tag: 'legalHoliday' }] }, { not: { weekday: [6] } }] }
    expect(formToCondition(conditionToForm(c)!)).toEqual(c)
  })
})

describe('event details', () => {
  it('shows the name’s guess until the gabbai picks', () => {
    expect(categoryChoice({ name: { en: 'Kiddush' }, kind: 'other' })).toEqual({ value: 'meal', guessed: true })
    expect(categoryChoice({ name: { en: 'Kiddush' }, kind: 'other', category: 'program' })).toEqual({ value: 'program', guessed: false })
    expect(categoryChoice({ name: { en: 'Daf Yomi' }, kind: 'shiur' })).toEqual({ value: undefined, guessed: false })
    expect(audienceChoice({ name: { en: 'Pirchei' }, kind: 'other' })).toEqual({ value: 'kids', guessed: true })
    expect(audienceChoice({ name: { en: 'Pirchei' }, kind: 'other', audience: 'everyone' })).toEqual({ value: 'everyone', guessed: false })
    expect(audienceChoice({ name: { en: 'Daf Yomi' }, kind: 'shiur' })).toEqual({ value: 'everyone', guessed: true })
  })

  it('reads a length and checks a link', () => {
    expect(parseMinutes('75')).toBe(75)
    expect(parseMinutes(' ')).toBeUndefined()
    expect(parseMinutes('1.5')).toBeNull()
    expect(parseMinutes('-5')).toBeNull()
    expect(linkProblem('')).toBeNull()
    expect(linkProblem('https://example.org/rsvp')).toBeNull()
    expect(linkProblem('example.org')).toBeTruthy()
    expect(linkProblem('javascript:alert(1)')).toBeTruthy()
  })
})

describe('how a time is said', () => {
  it('round-trips every choice', () => {
    expect(saidToForm(undefined)).toEqual({ mode: 'auto' })
    expect(saidToForm(null)).toEqual({ mode: 'none' })
    for (const r of [undefined, null, { between: ['mincha', 'maariv'] as [string, string] }, { after: 'maariv' }]) {
      expect(formToSaid(saidToForm(r))).toEqual(r)
    }
  })
})

describe('notices', () => {
  const base: Notice = { id: 'n', kind: 'sponsor', from: '2026-10-31', text: { en: 'The Cohens' } }

  it('says what a sponsorship is for', () => {
    expect(sponsorTarget(base)).toEqual({ kind: 'day' })
    const kiddush = withSponsorTarget(base, { kind: 'event', eventId: 'kiddush' })
    expect(kiddush).toEqual({ ...base, eventId: 'kiddush' })
    expect(sponsorTarget(kiddush)).toEqual({ kind: 'event', eventId: 'kiddush' })
    const notices = withSponsorTarget(kiddush, { kind: 'notices' })
    expect(notices).toEqual({ ...base, sponsors: 'notices' })
    expect(withSponsorTarget(notices, { kind: 'day' })).toEqual(base)
  })

  it('keeps only what the new kind uses', () => {
    const s = { ...base, eventId: 'bbq', sponsors: 'notices' as const }
    expect(withNoticeKind(s, 'reminder')).toEqual({ ...base, kind: 'reminder', eventId: 'bbq' })
    expect(withNoticeKind(s, 'simcha')).toEqual({ ...base, kind: 'simcha' })
  })

  it('files an announcement under a category, and nothing else', () => {
    const school = withNoticeKind(base, 'announcement', 'school')
    expect(school).toMatchObject({ kind: 'announcement', category: 'school' })
    expect(withNoticeKind(school, 'announcement')).not.toHaveProperty('category')
    expect(withNoticeKind(school, 'simcha')).not.toHaveProperty('category')
    expect(withNoticeKind(school, 'sponsor')).not.toHaveProperty('category')
  })
})

describe('notice links', () => {
  const base: Notice = { id: 'n', kind: 'announcement', from: '2026-11-06', text: { en: 'Shiur tonight' } }
  const shiur = { title: { en: 'Download the shiur' }, url: 'https://example.org/shiur' }

  it('brings up an older single link untitled', () => {
    expect(noticeLinks({ ...base, link: 'https://example.org' })).toEqual([{ title: { en: '' }, url: 'https://example.org' }])
    expect(noticeLinks(base)).toEqual([])
  })

  it('keeps link to the first and drops blank rows', () => {
    const sponsor = { title: { en: ' To sponsor ' }, url: 'https://example.org/give ' }
    expect(withNoticeLinks(base, [sponsor, { title: { en: '' }, url: '' }, shiur])).toEqual({
      ...base,
      links: [{ title: { en: 'To sponsor' }, url: 'https://example.org/give' }, shiur],
      link: 'https://example.org/give',
    })
    expect(withNoticeLinks({ ...base, link: 'https://x.org', links: [shiur] }, [])).toEqual(base)
  })

  it('wants a title and an https address', () => {
    expect(noticeLinkProblem(shiur)).toBeNull()
    expect(noticeLinkProblem({ title: { en: '' }, url: '' })).toBeNull()
    expect(noticeLinkProblem({ ...shiur, title: { en: ' ' } })).toMatch(/scanning/)
    expect(noticeLinkProblem({ ...shiur, url: 'example.org' })).toMatch(/https/)
  })
})
