import type { Schedule, ShulSettings } from './types'

/** What a new shul starts from: the three tefillos on common times, ready to edit. */
export function starterSchedule(settings: ShulSettings): Schedule {
  return {
    settings,
    events: [
      {
        id: 'shacharis',
        name: { en: 'Shacharis', he: 'שחרית' },
        kind: 'tefila',
        rules: [
          { when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] }, time: { clock: '09:00' } },
          { when: { any: [{ weekday: [1, 4] }, { tag: 'roshChodesh' }, { tag: 'fast' }] }, time: { clock: '06:15' } },
          { when: { weekday: [0] }, time: { clock: '08:00' } },
          { time: { clock: '06:30' } },
        ],
      },
      {
        id: 'mincha',
        name: { en: 'Mincha', he: 'מנחה' },
        kind: 'tefila',
        rules: [
          {
            when: { any: [{ tag: 'erevShabbos' }, { tag: 'erevYomTov' }] },
            time: { round: { zman: 'candleLighting' }, to: 5, mode: 'down' },
          },
          {
            time: {
              round: { weekly: { offset: -15, of: { zman: 'sunset' } }, pick: 'earliest' },
              to: 5,
              mode: 'down',
            },
          },
        ],
      },
      {
        id: 'maariv',
        name: { en: 'Maariv', he: 'מעריב' },
        kind: 'tefila',
        rules: [
          { when: { any: [{ tag: 'motzeiShabbos' }, { tag: 'motzeiYomTov' }] }, time: { zman: 'havdalah' } },
          { when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] }, time: null },
          { time: { offset: 0, of: { event: 'mincha' } } },
        ],
      },
    ],
    exceptions: [],
    notices: [],
  }
}
