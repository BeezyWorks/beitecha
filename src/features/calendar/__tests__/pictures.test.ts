import { Calendar, buildMonth, calendarOptions, makeT, sampleSchedule } from '@beitecha/engine'

import { renderCalendarHtml } from '../html'
import {
  type BackImage,
  NONE,
  fillInOrder,
  frameFor,
  parsePictureSettings,
  picturesForMonths,
} from '../pictures'

const t = makeT('en')
const months = ['2026-11-01', '2026-12-01', '2027-01-01'].map((m) =>
  buildMonth(new Calendar(sampleSchedule), m, undefined, t),
)
const image = (id: string): BackImage => ({
  id,
  name: id,
  aspect: 1.5,
  width: 3000,
  height: 2000,
  url: `data:image/png;base64,${id}`,
  preview: `data:image/png;base64,${id}-small`,
})
const images = [image('a'), image('b')]

describe('pictures for months', () => {
  it('deals them out in order, going round', () => {
    expect(fillInOrder(months, images)).toEqual({
      '2026-11-01': 'a',
      '2026-12-01': 'b',
      '2027-01-01': 'a',
    })
    expect(fillInOrder(months, [])).toEqual({})
  })
  it('takes a choice over the order, and a blank as none', () => {
    const got = picturesForMonths(months, images, {
      '2026-11-01': 'b',
      '2026-12-01': NONE,
      '2027-01-01': 'gone',
    })
    expect(got.map((i) => i?.id)).toEqual(['b', undefined, undefined])
  })
  it('frames a picture untouched unless cropped', () => {
    expect(frameFor(images[0], {})).toMatchObject({
      id: 'a',
      aspect: 1.5,
      zoom: 1,
      cx: 0.5,
      cy: 0.5,
      rot: 0,
    })
    expect(frameFor(images[0], { a: { zoom: 2, cx: 0.3, cy: 0.4, rot: 90 } })).toMatchObject({
      zoom: 2,
      rot: 90,
    })
  })
  it('reads stored settings, keeping only what is well-formed', () => {
    expect(parsePictureSettings('nope').imageIds).toEqual([])
    const got = parsePictureSettings({
      imageIds: ['a', 3],
      placement: 'opposite',
      frames: { a: { zoom: 2, cx: 0, cy: 0, rot: 0 }, b: { zoom: 'x' } },
      front: true,
    })
    expect(got).toMatchObject({ imageIds: ['a'], placement: 'opposite', front: true })
    expect(Object.keys(got.frames)).toEqual(['a'])
  })
})

const page = (placement: 'above' | 'opposite', covers = {}) =>
  renderCalendarHtml({
    title: 'Calendar',
    months,
    weekdays: [0, 1, 2, 3, 4, 5, 6].map((d) => t.weekday(d as 0)),
    options: calendarOptions(undefined),
    settings: undefined,
    rtl: false,
    pictures: {
      images: ['x', 'y', 'z'].map((i) => `data:image/png;base64,${i}`),
      frames: images.concat(image('c')).map((i) => frameFor(i, {})),
      fit: 'cover',
      placement,
    },
    covers: { front: false, ...covers },
  })

describe('pictures on the page', () => {
  it('puts each month’s picture above its days', () => {
    const html = page('above')
    expect(html.match(/class="photo cover"/g)).toHaveLength(3)
    expect(html.match(/<section class="sheet/g)).toHaveLength(3)
  })
  it('hangs a picture on the page before each month, with a cover in front', () => {
    const html = page('opposite', { back: true })
    // Cover, its back, and each month (the last behind the back cover): 3 months + cover + 3 backs.
    expect(html.match(/<section class="sheet/g)).toHaveLength(8)
    expect(html).toContain('titlepage')
    expect(html).toContain('<h1>November 2026 – January 2027</h1>')
  })
  it('writes the cover’s own words', () => {
    expect(page('above', { front: true, title: 'Beth El 5787', subtitle: 'Our year' })).toContain(
      '<h1>Beth El 5787</h1>',
    )
  })
})
