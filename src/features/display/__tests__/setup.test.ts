import type { DaySchedule, Occurrence } from '@beitecha/engine'

import { paginate, splitColumns } from '../paging'
import {
  DEFAULT_SETUP,
  driftFor,
  findSetup,
  isAsleep,
  setupId,
  shabbosFocused,
  shabbosSpan,
} from '../setup'

const at = (minutes: number | null, cancelled = false) => ({ minutes, cancelled }) as Occurrence
const day = (...minutes: (number | null)[]) => ({ events: minutes.map((m) => at(m)) })
const h = (n: number) => n * 60

describe('isAsleep', () => {
  const d = day(h(6) + 30, h(13), h(19) + 30)
  it('auto sleeps an hour after the last event until an hour before the first', () => {
    expect(isAsleep('auto', d, h(20) + 29)).toBe(false)
    expect(isAsleep('auto', d, h(20) + 30)).toBe(true)
    expect(isAsleep(undefined, d, h(23))).toBe(true)
    expect(isAsleep('auto', d, h(5) + 29)).toBe(true)
    expect(isAsleep('auto', d, h(5) + 30)).toBe(false)
    expect(isAsleep('auto', d, h(12))).toBe(false)
  })
  it('ignores cancelled events and never sleeps on an empty day', () => {
    const cancelled = { events: [at(h(8)), at(h(14)), at(h(21), true)] }
    expect(isAsleep('auto', cancelled, h(14) + 59)).toBe(false)
    expect(isAsleep('auto', cancelled, h(15))).toBe(true)
    expect(isAsleep('auto', day(), h(3))).toBe(false)
    expect(isAsleep('auto', day(null), h(3))).toBe(false)
  })
  it('is never asleep when off', () => expect(isAsleep('off', d, h(2))).toBe(false))
  it('takes set hours, wrapping past midnight', () => {
    const night = { from: h(22), to: h(5) }
    expect(isAsleep(night, d, h(23))).toBe(true)
    expect(isAsleep(night, d, h(4))).toBe(true)
    expect(isAsleep(night, d, h(5))).toBe(false)
    expect(isAsleep(night, d, h(21))).toBe(false)
    const nap = { from: h(13), to: h(15) }
    expect(isAsleep(nap, d, h(14))).toBe(true)
    expect(isAsleep(nap, d, h(15))).toBe(false)
  })
})

describe('driftFor', () => {
  it('moves a pixel an hour on an LCD', () => {
    expect(driftFor(undefined, 0)).toEqual({ x: -1, y: -1 })
    expect(driftFor('lcd', h(1))).toEqual({ x: 0, y: -1 })
    expect(driftFor('unknown', h(3))).toEqual({ x: -1, y: 0 })
  })
  it('orbits up to 12px on an OLED, a step every ten minutes', () => {
    expect(driftFor('oled', 0)).toEqual({ x: 12, y: 0 })
    expect(driftFor('oled', 9)).toEqual({ x: 12, y: 0 })
    expect(driftFor('oled', h(6))).toEqual({ x: 0, y: 12 })
    expect(driftFor('oled', h(12))).toEqual({ x: -12, y: 0 })
    for (let m = 0; m < h(24); m += 10) {
      const { x, y } = driftFor('oled', m)
      expect(Math.max(Math.abs(x), Math.abs(y))).toBeLessThanOrEqual(12)
    }
  })
})

describe('findSetup and setupId', () => {
  const lobby = { id: 'lobby', name: 'Lobby' }
  const upstairs = { id: 'upstairs', name: 'Upstairs' }
  it('shows the first setup, or the default', () => {
    expect(findSetup(undefined)).toBe(DEFAULT_SETUP)
    expect(findSetup([])).toBe(DEFAULT_SETUP)
    expect(findSetup([lobby, upstairs])).toBe(lobby)
  })
  it('finds one by id, and nothing for an unknown id', () => {
    expect(findSetup([lobby, upstairs], 'upstairs')).toBe(upstairs)
    expect(findSetup([lobby], 'nope')).toBeUndefined()
    expect(findSetup(undefined, 'lobby')).toBeUndefined()
  })
  it('slugifies a name and keeps it unique', () => {
    expect(setupId('Upstairs, portrait', [])).toBe('upstairs-portrait')
    expect(setupId('  Main  Lobby! ', [])).toBe('main-lobby')
    expect(setupId('Lobby', ['lobby'])).toBe('lobby-2')
    expect(setupId('Lobby', ['lobby', 'lobby-2'])).toBe('lobby-3')
    expect(setupId('לובי', [])).toBe('display')
  })
})

describe('Shabbos', () => {
  const mk = (
    tags: string[],
    events: number[] = [],
    zmanim: Record<string, number> = {},
  ): DaySchedule => ({ tags, zmanim, events: events.map((m) => at(m)) }) as unknown as DaySchedule
  // Wednesday to the Thursday after: yesterday first.
  const week = (): DaySchedule[] => [
    mk([], [h(8)]), // Tue
    mk([], [h(8), h(19)]), // Wed
    mk([], [h(8), h(19)]), // Thu
    mk(['erevShabbos'], [h(8), h(18)]), // Fri
    mk(['shabbos'], [h(9), h(19)], { havdalah: h(20) }), // Sat
    mk([], [h(8)]), // Sun
    mk([], [h(8)]), // Mon
    mk([], [h(8)]), // Tue
    mk([], [h(8)]), // Wed
  ]
  const starting = (from: number) => week().slice(from)

  it('finds the coming Shabbos and the erev', () => {
    const days = starting(1) // yesterday Wed, today Thu
    const span = shabbosSpan(days, h(10))!
    expect(span.friday).toBe(days[2])
    expect(span.shabbos).toBe(days[3])
  })
  it('uses yesterday as the erev on Shabbos, until Havdalah', () => {
    const days = starting(3) // yesterday Fri, today Sat
    expect(shabbosSpan(days, h(12))!.friday).toBe(days[0])
    expect(shabbosSpan(days, h(20))).toBeUndefined()
  })
  it('lists Shabbos, not a Yom Tov Friday, when they run together', () => {
    const days = [mk(['erevYomTov']), mk(['yomTov', 'erevShabbos']), mk(['shabbos']), mk([])]
    const span = shabbosSpan(days, h(10))!
    expect(span.friday).toBe(days[1])
    expect(span.shabbos).toBe(days[2])
  })
  it('focuses from the last event on Thursday through Havdalah', () => {
    const focused = (from: number, m: number, mode?: 'auto' | 'always' | 'never') =>
      shabbosFocused(mode ?? 'auto', starting(from), m)
    expect(focused(0, h(21))).toBe(false) // Wed evening
    expect(focused(1, h(12))).toBe(false) // Thu before the last event
    expect(focused(1, h(19) + 1)).toBe(true) // Thu after it
    expect(focused(2, h(7))).toBe(true) // Fri
    expect(focused(3, h(11))).toBe(true) // Shabbos
    expect(focused(3, h(20))).toBe(false) // after Havdalah
    expect(focused(0, h(12), 'always')).toBe(true)
    expect(focused(2, h(12), 'never')).toBe(false)
  })
  it('starts a day early before an erev Yom Tov', () => {
    const days = [mk([]), mk([], [h(8), h(19)]), mk(['erevYomTov']), mk(['yomTov'])]
    expect(shabbosFocused('auto', days, h(12))).toBe(false)
    expect(shabbosFocused('auto', days, h(20))).toBe(true)
  })
})

describe('paginate', () => {
  it('is one page until the room is measured', () => {
    expect(paginate([50, 50, 50], 0)).toEqual([[0, 1, 2]])
    expect(paginate([], 100)).toEqual([])
  })
  it('fills a page, counting what sits between rows', () => {
    expect(paginate([40, 40, 40], 100, 10)).toEqual([[0, 1], [2]])
    expect(paginate([40, 40, 40], 140, 10)).toEqual([[0, 1, 2]])
  })
  it('always puts something on a page', () => expect(paginate([500, 20], 100)).toEqual([[0], [1]]))
  it('keeps a heading with what follows', () => {
    expect(paginate([30, 40, 30, 40], 80, 0, [true, false, true, false])).toEqual([
      [0, 1],
      [2, 3],
    ])
    expect(paginate([40, 30, 40], 75, 0, [false, true, false])).toEqual([[0], [1, 2]])
  })
})

describe('paginate headings', () => {
  it('never leaves a heading last on a page', () => {
    expect(paginate([30, 40, 30, 40, 40], 80, 0, [true, false, true, false, false])).toEqual([
      [0, 1],
      [2, 3],
      [4],
    ])
    expect(paginate([40, 30, 40], 80, 0, [false, true, false])).toEqual([[0], [1, 2]])
  })
})

describe('splitColumns', () => {
  it('cuts where the columns are most even', () => {
    expect(splitColumns([10, 10, 10, 10])).toBe(2)
    expect(splitColumns([30, 10, 10, 10])).toBe(1)
  })
  it('does not leave a heading at the foot of a column', () => {
    expect(splitColumns([10, 10, 10, 10], [false, true, false, false])).not.toBe(2)
  })
})
