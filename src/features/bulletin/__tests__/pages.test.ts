import { pagesOf } from '../pages'

const all = ['shabbos', 'notices', 'weekdays', 'shiurim'] as const

describe('pagesOf', () => {
  it('puts sections on their pages in the list order', () => {
    expect(
      pagesOf(
        [
          { section: 'notices', page: 1 },
          { section: 'shabbos', page: 1 },
          { section: 'weekdays', page: 2 },
          { section: 'shiurim', page: 2 },
        ],
        [...all],
      ),
    ).toEqual([
      ['notices', 'shabbos'],
      ['weekdays', 'shiurim'],
    ])
  })

  it('skips empty sections and pages, and puts unlisted ones last', () => {
    expect(
      pagesOf(
        [
          { section: 'shabbos', page: 1 },
          { section: 'notices', page: 3 },
        ],
        ['shabbos', 'weekdays', 'shiurim'],
      ),
    ).toEqual([['shabbos', 'weekdays', 'shiurim']])
  })
})
