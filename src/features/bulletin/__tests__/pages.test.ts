import { expandLayout, pagesOf } from '../pages'

const all = ['shabbos', 'sponsors', 'weekdays', 'shiurim'] as const

describe('pagesOf', () => {
  it('puts sections on their pages in the list order', () => {
    expect(
      pagesOf(
        [
          { section: 'sponsors', page: 1 },
          { section: 'shabbos', page: 1 },
          { section: 'weekdays', page: 2 },
          { section: 'shiurim', page: 2 },
        ],
        [...all],
      ),
    ).toEqual([
      ['sponsors', 'shabbos'],
      ['weekdays', 'shiurim'],
    ])
  })

  it('skips empty sections and pages, and puts unlisted ones last', () => {
    expect(
      pagesOf(
        [
          { section: 'shabbos', page: 1 },
          { section: 'sponsors', page: 3 },
        ],
        ['shabbos', 'weekdays', 'shiurim'],
      ),
    ).toEqual([['shabbos', 'weekdays', 'shiurim']])
  })

  it('lets a saved combined section stand for the parts that replaced it', () => {
    expect(
      pagesOf(
        [
          { section: 'notices', page: 2 },
          { section: 'shabbos', page: 1 },
        ],
        ['shabbos', 'sponsors', 'category:kiddush', 'announcements', 'yahrzeits'],
      ),
    ).toEqual([['shabbos'], ['sponsors', 'category:kiddush', 'announcements', 'yahrzeits']])
    expect(
      expandLayout([{ section: 'remembrance', page: 2 }], ['yahrzeits', 'cholim', 'contact']),
    ).toEqual([
      { section: 'yahrzeits', page: 2 },
      { section: 'cholim', page: 2 },
    ])
  })
})

describe('sponsorship sections', () => {
  const present = [
    'shabbos',
    'sponsors:announcements',
    'sponsors:event:kiddush',
    'sponsors:event:hashkama',
    'announcements',
  ] as const

  it('orders each thing sponsored on its own', () => {
    expect(
      pagesOf(
        [
          { section: 'sponsors:announcements', page: 1 },
          { section: 'shabbos', page: 1 },
          { section: 'sponsors:event:hashkama', page: 1 },
          { section: 'announcements', page: 1 },
          { section: 'sponsors:event:kiddush', page: 1 },
        ],
        [...present],
      ),
    ).toEqual([
      [
        'sponsors:announcements',
        'shabbos',
        'sponsors:event:hashkama',
        'announcements',
        'sponsors:event:kiddush',
      ],
    ])
  })

  it('puts the groups where a saved combined sponsors section was', () => {
    expect(
      pagesOf(
        [
          { section: 'shabbos', page: 1 },
          { section: 'sponsors', page: 2 },
        ],
        [...present, 'sponsors'],
      ),
    ).toEqual([
      ['shabbos'],
      [
        'sponsors:announcements',
        'sponsors:event:kiddush',
        'sponsors:event:hashkama',
        'sponsors',
        'announcements',
      ],
    ])
  })
})
