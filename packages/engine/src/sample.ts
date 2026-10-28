import type { Schedule } from './types'

/**
 * A made-up Lakewood shul exercising most of the rule language, and a Shabbos with everything a shul page
 * shows: hashkama, Daf Yomi, youth groups, a sponsored Kiddush, Pirchei, a women's shiur, the Rav's shiur
 * (cancelled on 31 October 2026), Seudas Shlishis and Avos U'Banim, a BBQ off-site the week after, and a
 * simcha and a shiva among the notices. Used by tests and the demo.
 */
export const sampleSchedule: Schedule = {
  settings: {
    location: { latitude: 40.0821, longitude: -74.2097, timeZone: 'America/New_York', israel: false },
    zmanim: { candleLightingMinutes: 18 },
    selichos: 'ashkenaz',
  },
  events: [
    {
      id: 'hashkama',
      name: { en: 'Hashkama', he: 'השכמה' },
      kind: 'tefila',
      tefila: 'shacharis',
      room: 'Beis Medrash',
      rules: [{ when: { tag: 'shabbos' }, time: { clock: '07:30' } }],
    },
    {
      id: 'shacharis',
      name: { en: 'Shacharis', he: 'שחרית' },
      kind: 'tefila',
      tefila: 'shacharis',
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
      tefila: 'mincha',
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
      id: 'daf-yomi',
      name: { en: 'Daf Yomi', he: 'דף יומי' },
      kind: 'shiur',
      speaker: { en: 'R’ Feldman' },
      topic: { en: 'Bava Kamma' },
      rules: [
        { when: { tag: 'shabbos' }, time: { offset: -60, of: { event: 'shacharis' } } },
        { when: { weekday: [0, 1, 2, 3, 4, 5] }, time: { clock: '05:45' } },
      ],
    },
    {
      id: 'mishmar',
      name: { en: 'Friday Night Mishmar' },
      kind: 'other',
      audience: 'kids',
      ages: { en: 'Boys 6th–8th' },
      room: 'Youth room',
      duration: 60,
      rules: [{ when: { tag: 'erevShabbos' }, time: { clock: '19:30' } }],
    },
    {
      id: 'youth-groups',
      name: { en: 'Youth groups' },
      kind: 'other',
      ages: { en: 'Ages 3–6 and 7–10' },
      room: 'Youth room',
      rules: [{ when: { tag: 'shabbos' }, time: { clock: '10:15' }, end: { clock: '11:30' } }],
    },
    {
      id: 'kiddush',
      name: { en: 'Kiddush', he: 'קידוש' },
      kind: 'other',
      room: 'Social hall',
      rules: [{ when: { tag: 'shabbos' }, time: { offset: 165, of: { event: 'shacharis' } } }],
    },
    {
      id: 'pirchei',
      name: { en: 'Pirchei', he: 'פרחי' },
      kind: 'other',
      ages: { en: 'Boys 1st–5th' },
      rules: [{ when: { tag: 'shabbos' }, time: { clock: '13:30' }, note: { en: 'Treats' } }],
    },
    {
      id: 'womens-shiur',
      name: { en: 'Parsha shiur for women' },
      kind: 'shiur',
      speaker: { en: 'Mrs. Klein' },
      location: 'At the Levys’, 14 Forest Ave',
      rules: [{ when: { tag: 'shabbos' }, time: { clock: '14:30' } }],
    },
    {
      id: 'shiur',
      name: { en: "Rav's Shiur", he: 'שיעור הרב' },
      kind: 'shiur',
      speaker: { en: 'The Rav', he: 'הרב' },
      topic: { en: 'On the parsha' },
      rules: [{ when: { tag: 'shabbos' }, time: { offset: -30, of: { event: 'mincha' } } }],
    },
    {
      id: 'seudas-shlishis',
      name: { en: 'Seudas Shlishis', he: 'סעודה שלישית' },
      kind: 'other',
      audience: 'men',
      ages: { en: 'Men and boys' },
      room: 'Social hall',
      rules: [{ when: { tag: 'shabbos' }, time: { offset: 25, of: { event: 'mincha' } }, end: { zman: 'sunset' } }],
    },
    {
      id: 'mishna-berura',
      name: { en: 'Mishna Berura Yomi' },
      kind: 'shiur',
      rules: [
        {
          when: { weekday: [0, 1, 2, 3, 4] },
          time: { offset: 15, of: { event: 'mincha' } },
          relative: { between: ['mincha', 'maariv'] },
        },
      ],
    },
    {
      id: 'halacha',
      name: { en: 'Halacha Shiur' },
      kind: 'shiur',
      speaker: { en: 'R’ Stern' },
      topic: { en: 'Hilchos Shabbos' },
      rules: [{ when: { weekday: [4] }, time: { offset: 15, of: { event: 'maariv' } } }],
    },
    {
      id: 'maariv',
      name: { en: 'Maariv', he: 'ערבית' },
      kind: 'tefila',
      tefila: 'maariv',
      rules: [
        { when: { any: [{ tag: 'motzeiShabbos' }, { tag: 'motzeiYomTov' }] }, time: { zman: 'havdalah' } },
        { when: { any: [{ tag: 'erevShabbos' }, { tag: 'erevYomTov' }, { tag: 'shabbos' }, { tag: 'yomTov' }] }, time: null },
        { time: { clock: '21:00' } },
      ],
    },
    {
      id: 'avos-ubanim',
      name: { en: 'Avos U’Banim', he: 'אבות ובנים' },
      kind: 'other',
      ages: { en: 'Fathers and sons' },
      rules: [
        {
          when: { tag: 'motzeiShabbos' },
          time: { latest: [{ clock: '19:30' }, { offset: 60, of: { zman: 'havdalah' } }] },
          note: { en: 'Pizza' },
        },
      ],
    },
  ],
  exceptions: [
    { id: 'x1', date: '2026-10-31', type: 'cancel', eventId: 'shiur', note: { en: 'The Rav is away this week' } },
    {
      id: 'x2',
      date: '2026-11-08',
      type: 'add',
      event: {
        id: 'bbq',
        name: { en: 'Shul BBQ' },
        kind: 'other',
        location: 'Pine Park pavilion, 200 Pine St',
        link: 'https://example.org/bbq',
      },
      time: { clock: '12:00' },
      end: { clock: '15:00' },
    },
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
    {
      id: 'n2',
      kind: 'sponsor',
      from: '2026-10-25',
      to: '2026-10-31',
      sponsors: 'notices',
      text: { en: 'This week’s notices are sponsored by the Gold family' },
    },
    {
      id: 'n3',
      kind: 'reminder',
      from: '2026-10-28',
      eventId: 'bbq',
      title: { en: 'Shul BBQ' },
      text: { en: 'Sunday, November 8 at Pine Park. Bring the family!' },
      link: 'https://example.org/bbq',
    },
    {
      id: 'n4',
      kind: 'simcha',
      from: '2026-10-29',
      to: '2026-11-01',
      text: { en: 'Mazal tov to Dovid and Rivka Levy on the birth of a daughter' },
    },
    {
      id: 'n5',
      kind: 'condolence',
      from: '2026-10-28',
      to: '2026-11-02',
      title: { en: 'Shiva' },
      text: { en: 'Yaakov Klein is sitting shiva for his father at 12 Oak St. Shacharis 7:00, Mincha/Maariv 5:00.' },
    },
  ],
}
