import {
  addDays,
  Calendar,
  customZmanName,
  type DateString,
  DEFAULT_SHABBOS_ZMANIM,
  type BulletinBand,
  type Schedule,
  type ShulContact,
  type ShulProfile,
  ZMAN_LABELS,
  type ZmanId,
  type ZmanKey,
  occasionsBetween,
  specialZmanim,
  yahrzeitsBetween,
} from '@beitecha/engine'
import { useMemo } from 'react'

import { useDays } from '@/features/luach/useDays'
import type { InlineZman } from '@/features/luach/shabbosGroups'
import { spanOf, type DateRange } from './range'
import type { WeekProps } from './WeekSheet'

/** The days of `range`, as the sheet shows them: the shul's print settings decide what's left out. */
export function useWeek(
  slug: string,
  profile: ShulProfile | undefined,
  schedule: Schedule | undefined,
  range: DateRange,
): WeekProps | null {
  const { from, to } = range
  const count = spanOf(range)
  // The day before comes along: a range may start on Shabbos, whose Friday is outside it.
  const all = useDays(schedule, addDays(from, -1), count + 1)
  return useMemo(() => {
    if (!schedule || !profile || all.length < count + 1) return null
    const days = all.slice(1)
    const print = schedule.settings.print ?? {}
    const on = (flag: boolean | undefined) => flag !== false
    return {
      slug,
      profile,
      days,
      notices: on(print.notices)
        ? schedule.notices
            .filter((n) => (n.to ?? n.from) >= from && n.from <= to)
            .sort((a, b) => a.from.localeCompare(b.from))
        : [],
      categories: schedule.settings.noticeCategories,
      comingUp: on(print.comingUp) ? new Calendar(schedule).announced(from, count) : [],
      contact: on(print.contact) ? schedule.settings.contact : undefined,
      cholim: on(print.cholim) ? (schedule.cholim ?? []) : [],
      yahrzeits: on(print.yahrzeits)
        ? yahrzeitsBetween(
            schedule.yahrzeits?.filter((p) => !p.hideFromBulletin),
            from,
            to,
          )
        : [],
      yahrzeitSettings: schedule.settings.yahrzeits,
      birthdays: on(print.birthdays)
        ? occasionsBetween(
            schedule.birthdays?.filter((p) => !p.hideFromBulletin),
            from,
            to,
          )
        : [],
      birthdaySettings: schedule.settings.birthdays,
      anniversaries: on(print.anniversaries)
        ? occasionsBetween(
            schedule.anniversaries?.filter((p) => !p.hideFromBulletin),
            from,
            to,
          )
        : [],
      anniversarySettings: schedule.settings.anniversaries,
      zmanimTable: on(print.zmanimTable),
      shiurim: on(print.shiurim),
      programs: on(print.programs),
      specialZmanim: on(print.specialZmanim)
        ? specialZmanim(from, schedule.settings, undefined, count)
        : [],
      shabbos: all.flatMap((friday, i) =>
        i < count && all[i + 1].weekday === 6
          ? [{ friday, shabbos: all[i + 1], zmanim: shabbosZmanim(schedule, friday.date) }]
          : [],
      ),
      layout: print.layout,
      hideGroups: print.hideGroups,
      hideHolidays: print.hideHolidays,
      header: print.header,
      footer: withContact(print.footer, on(print.contact) ? schedule.settings.contact : undefined),
    }
  }, [slug, profile, schedule, from, to, count, all])
}

/** The footer with the shul's contact info under whatever it doesn't say itself. */
function withContact(footer: BulletinBand | undefined, contact: ShulContact | undefined) {
  if (!contact) return footer
  const pick = (...v: (string | undefined)[]) => v.find((x) => x?.trim())
  const merged: BulletinBand = {
    ...footer,
    rabbi: pick(footer?.rabbi, contact.rabbi),
    rabbiPhone: pick(footer?.rabbiPhone, contact.rabbiPhone),
    officePhone: pick(footer?.officePhone, contact.officePhone),
    email: pick(footer?.email, contact.officeEmail, contact.rabbiEmail),
  }
  return merged
}

/** The zmanim the shul lists among Friday night's and Shabbos day's minyanim, hidden or not. */
function shabbosZmanim(schedule: Schedule, friday: DateString) {
  const picked = schedule.settings.print?.shabbosZmanim ?? DEFAULT_SHABBOS_ZMANIM
  const custom = schedule.settings.zmanim?.custom ?? []
  const cal = new Calendar(schedule)
  const on = (date: DateString, ids: ZmanKey[]): InlineZman[] => {
    const times = cal.zmanimOn(date)
    return ids.flatMap((id) => {
      const minutes = times[id]
      const own = custom.find((c) => c.id === id)
      const name = ZMAN_LABELS[id as ZmanId] ?? (own && customZmanName(own))
      return minutes === undefined || !name ? [] : [{ id, name, minutes }]
    })
  }
  return { friday: on(friday, picked.friday), shabbos: on(addDays(friday, 1), picked.shabbos) }
}
