import { Calendar, buildMonth, calendarOptions, makeT, sampleSchedule } from '@beitecha/engine'

import { renderCalendarHtml } from '../html'

const t = makeT('en')
const render = (calendar = {}, month = '2026-11-01') => {
  const schedule = { ...sampleSchedule, settings: { ...sampleSchedule.settings, calendar } }
  const months = [buildMonth(new Calendar(schedule), month, calendar, t)]
  return renderCalendarHtml({
    title: 'Calendar',
    months,
    weekdays: [0, 1, 2, 3, 4, 5, 6].map((d) => t.weekday(d as 0)),
    options: calendarOptions(calendar),
    settings: calendar,
    rtl: false,
  })
}

describe('renderCalendarHtml', () => {
  it('prints a sheet per month, sized to the paper', () => {
    const html = render({ paper: 'a4', orientation: 'portrait' })
    expect(html).toContain('<h1>November 2026</h1>')
    expect(html).toContain('size:210mm 297mm')
    expect(html.match(/class="cell/g)!.length).toBeGreaterThanOrEqual(30)
  })
  it('puts the all-months footer, and a month’s own over it', () => {
    expect(render({ footer: 'Seudah at 1' })).toContain('<footer>Seudah at 1</footer>')
    const own = render({ footer: 'All', monthFooters: { '2026-11-01': 'Just now' } })
    expect(own).toContain('<footer>Just now</footer>')
    expect(own).not.toContain('>All<')
    expect(render({})).not.toContain('<footer>')
  })
  it('leaves off what is turned off and escapes text', () => {
    expect(render({ hiddenGroups: ['minor'] })).not.toContain('Rosh Chodesh')
    expect(render({})).toContain('Rosh Chodesh')
    expect(render({ footer: '<b>&' })).toContain('&lt;b&gt;&amp;')
  })
})
