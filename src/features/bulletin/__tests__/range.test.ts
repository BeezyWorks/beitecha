import { rangeFromParams, shiftRange, spanOf, weekContaining } from '../range'

describe('bulletin range', () => {
  it('defaults to Sunday through Shabbos', () => {
    // 2026-11-04 is a Wednesday.
    expect(weekContaining('2026-11-04', undefined)).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
    })
  })
  it('runs Friday to Thursday', () => {
    const print = { weekStart: 5, weekEnd: 4 } as const
    expect(weekContaining('2026-11-04', print)).toEqual({ from: '2026-10-30', to: '2026-11-05' })
    expect(weekContaining('2026-11-06', print)).toEqual({ from: '2026-11-06', to: '2026-11-12' })
  })
  it('takes its own dates, capped, and moves by its length', () => {
    const r = rangeFromParams({ from: '2026-11-02', to: '2026-11-04' }, '2026-11-01', undefined)
    expect(spanOf(r)).toBe(3)
    expect(shiftRange(r, 1)).toEqual({ from: '2026-11-05', to: '2026-11-07' })
    expect(
      spanOf(rangeFromParams({ from: '2026-11-02', to: '2027-01-01' }, '2026-11-01', undefined)),
    ).toBe(14)
    expect(
      rangeFromParams({ from: '2026-11-04', to: '2026-11-02' }, '2026-11-01', undefined),
    ).toEqual({ from: '2026-11-01', to: '2026-11-07' })
  })
})
