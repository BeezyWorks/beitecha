import type { DaySchedule, Localized, Minutes, Occurrence, ZmanKey } from '@beitecha/engine'

/** Where Friday's Shabbos times start without a chatzos. */
const NOON = 12 * 60
/** Shabbos afternoon starts by then, or at an earlier Mincha: a kiddush after davening stays in the morning. */
const AFTERNOON = 13 * 60

/** A zman among a day's minyanim, at its time. */
export interface InlineZman {
  id: ZmanKey
  name: Localized
  minutes: Minutes
}

export type ShabbosRow =
  | { type: 'event'; key: string; event: Occurrence }
  | { type: 'zman'; key: string; zman: InlineZman }

export interface ShabbosGroup {
  key: 'friday' | 'morning' | 'afternoon'
  day: DaySchedule
  rows: ShabbosRow[]
}

/** Events in time order with zmanim slotted in at their times (untimed events keep their anchor's place). */
function merge(events: Occurrence[], zmanim: InlineZman[]): ShabbosRow[] {
  const rows: (ShabbosRow & { at: Minutes | null })[] = events.map((e) => ({
    type: 'event',
    key: e.eventId,
    event: e,
    at: e.minutes,
  }))
  for (const zman of zmanim) {
    const i = rows.findIndex((r) => r.at !== null && r.at > zman.minutes)
    const row = { type: 'zman' as const, key: `zman:${zman.id}`, zman, at: zman.minutes }
    rows.splice(i < 0 ? rows.length : i, 0, row)
  }
  return rows.map(({ at: _, ...r }) => r as ShabbosRow)
}

/**
 * Shabbos as one list in time order, from Friday afternoon to Havdalah, in three groups: Friday (from chatzos),
 * Shabbos morning and Shabbos afternoon (from the first Mincha, or 1 pm if that's earlier). The print sheet and the display lay these out the same
 * way. `filter` drops events (the sheet leaves shiurim to their own list); empty groups are left out.
 */
export function shabbosGroups(
  friday: DaySchedule,
  shabbos: DaySchedule,
  zmanim: { friday: InlineZman[]; shabbos: InlineZman[] },
  filter: (e: Occurrence) => boolean = () => true,
): ShabbosGroup[] {
  const fridayFrom = friday.zmanim.chatzos ?? NOON
  const mincha = shabbos.events.find((e) => e.tefila === 'mincha' && e.minutes !== null)
  const split = Math.min(mincha?.minutes ?? AFTERNOON, AFTERNOON)
  const late = (e: Occurrence) => e.minutes !== null && e.minutes >= fridayFrom
  const before = (m: Minutes | null) => m !== null && m < split
  const shown = shabbos.events.filter(filter)
  const groups: ShabbosGroup[] = [
    {
      key: 'friday',
      day: friday,
      rows: merge(
        friday.events.filter((e) => late(e) && filter(e)),
        zmanim.friday,
      ),
    },
    {
      key: 'morning',
      day: shabbos,
      rows: merge(
        shown.filter((e) => before(e.minutes)),
        zmanim.shabbos.filter((z) => before(z.minutes)),
      ),
    },
    {
      key: 'afternoon',
      day: shabbos,
      rows: merge(
        shown.filter((e) => !before(e.minutes)),
        zmanim.shabbos.filter((z) => !before(z.minutes)),
      ),
    },
  ]
  return groups.filter((g) => g.rows.length > 0)
}

/** Friday's events that belong to Shabbos (from chatzos), which the weekday grid leaves out. */
export function erevShabbosEvents(friday: DaySchedule): Occurrence[] {
  const from = friday.zmanim.chatzos ?? NOON
  return friday.events.filter((e) => e.minutes !== null && e.minutes >= from)
}
