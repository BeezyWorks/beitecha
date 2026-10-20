import { STANDARD_TEFILOS as T } from './tefilos'
import type { EventDef, Rule, Schedule, ShulSettings, TimeExpr } from './types'

export interface StarterOptions {
  /** One "Mincha/Maariv" minyan on weekdays (the common case), or separate Mincha and Maariv. Default `combined`. */
  minchaMaariv?: 'combined' | 'separate'
}

const SHACHARIS: EventDef = {
  ...T.shacharis,
  rules: [
    { when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] }, time: { clock: '09:00' } },
    {
      when: { any: [{ weekday: [1, 4] }, { tag: 'roshChodesh' }, { tag: 'fast' }] },
      time: { clock: '06:15' },
    },
    { when: { weekday: [0] }, time: { clock: '08:00' } },
    { time: { clock: '06:30' } },
  ],
}

const EREV_MINCHA: Rule = {
  when: { any: [{ tag: 'erevShabbos' }, { tag: 'erevYomTov' }] },
  time: { round: { zman: 'candleLighting' }, to: 5, mode: 'down' },
}

const WEEKDAY_MINCHA: TimeExpr = {
  round: { weekly: { offset: -15, of: { zman: 'sunset' } }, pick: 'earliest' },
  to: 5,
  mode: 'down',
}

const HAVDALAH: Rule = {
  when: { any: [{ tag: 'motzeiShabbos' }, { tag: 'motzeiYomTov' }] },
  time: { zman: 'havdalah' },
}

/** What a new shul starts from: the three tefillos on common times, ready to edit. */
export function starterSchedule(
  settings: ShulSettings,
  { minchaMaariv = 'combined' }: StarterOptions = {},
): Schedule {
  const events: EventDef[] =
    minchaMaariv === 'separate'
      ? [
          SHACHARIS,
          {
            ...T.mincha,
            rules: [EREV_MINCHA, { time: WEEKDAY_MINCHA }],
          },
          {
            ...T.maariv,
            rules: [
              HAVDALAH,
              { when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] }, time: null },
              { time: { offset: 0, of: { event: 'mincha' } } },
            ],
          },
        ]
      : [
          SHACHARIS,
          // Mincha and Maariv back to back; on Shabbos and Yom Tov only Mincha is davened at this time.
          {
            ...T.minchaMaariv,
            rules: [
              { ...EREV_MINCHA, note: { en: 'Mincha', he: 'מנחה' } },
              {
                when: { any: [{ tag: 'shabbos' }, { tag: 'yomTov' }] },
                time: WEEKDAY_MINCHA,
                note: { en: 'Mincha', he: 'מנחה' },
              },
              { time: WEEKDAY_MINCHA },
            ],
          },
          { ...T.maariv, rules: [HAVDALAH] },
        ]
  return { settings, events, exceptions: [], notices: [] }
}
