import { sampleSchedule, type Condition, type TimeExpr } from '@beitecha/engine'

import { conditionToForm, formToCondition, formToTime, parseClockInput, timeToForm } from '../forms'

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

  it('gives up (null) on what the form can’t say', () => {
    expect(conditionToForm({ all: [{ tag: 'fast' }, { weekday: [1] }] })).toBeNull() // AND of two positives
    expect(timeToForm({ offset: 5, of: { clock: '06:00' } })).toBeNull()
    expect(timeToForm({ earliest: [{ round: { zman: 'plag' }, to: 5, mode: 'down' }] })).toBeNull()
  })
})
