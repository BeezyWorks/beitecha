import type { Schedule } from './types'

/** A made-up Lakewood shul exercising most of the rule language. Used by tests and the demo. */
export const sampleSchedule: Schedule = {
  settings: {
    location: { latitude: 40.0821, longitude: -74.2097, timeZone: 'America/New_York', israel: false },
    zmanim: { candleLightingMinutes: 18 },
    selichos: 'ashkenaz',
  },
  events: [
    {
      id: 'shacharis',
      name: { en: 'Shacharis', he: 'שחרית' },
      kind: 'tefila',
      rules: [
        { when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] }, time: { clock: '09:00' } },
        { when: { tag: 'selichos' }, time: { clock: '06:00' }, note: { en: 'Selichos', he: 'סליחות' } },
        {
          when: { any: [{ weekday: [1, 4] }, { tag: 'roshChodesh' }, { tag: 'fast' }, { tag: 'cholHamoed' }] },
          time: { clock: '06:15' },
        },
        { when: { weekday: [0] }, time: { clock: '07:30' } },
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
          time: {
            round: { earliest: [{ zman: 'candleLighting' }, { zman: 'plag' }, { clock: '19:15' }] },
            to: 5,
            mode: 'down',
          },
        },
        {
          when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] },
          time: { round: { offset: -40, of: { zman: 'sunset' } }, to: 5, mode: 'down' },
        },
        {
          time: {
            round: { weekly: { offset: -15, of: { zman: 'sunset' } }, pick: 'earliest', days: [0, 1, 2, 3, 4] },
            to: 5,
            mode: 'down',
          },
        },
      ],
    },
    {
      id: 'shiur',
      name: { en: "Rav's Shiur", he: 'שיעור הרב' },
      kind: 'shiur',
      rules: [{ when: { tag: 'shabbos' }, time: { offset: -30, of: { event: 'mincha' } } }],
    },
    {
      id: 'maariv',
      name: { en: 'Maariv', he: 'מעריב' },
      kind: 'tefila',
      rules: [
        { when: { any: [{ tag: 'motzeiShabbos' }, { tag: 'motzeiYomTov' }] }, time: { zman: 'havdalah' } },
        { when: { any: [{ tag: 'erevShabbos' }, { tag: 'erevYomTov' }, { tag: 'shabbos' }, { tag: 'yomTov' }] }, time: null },
        { time: { clock: '21:00' } },
      ],
    },
  ],
  exceptions: [
    { id: 'x1', date: '2026-10-31', type: 'cancel', eventId: 'shiur', note: { en: 'The Rav is away this week' } },
  ],
  notices: [
    {
      id: 'n1',
      kind: 'sponsor',
      from: '2026-10-31',
      eventId: 'kiddush',
      title: { en: 'Kiddush' },
      text: { en: 'Sponsored by the Cohen family in honor of Sarah’s bas mitzvah' },
    },
  ],
}
