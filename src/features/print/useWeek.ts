import {
  addDays,
  Calendar,
  customZmanName,
  type DateString,
  DEFAULT_SHABBOS_ZMANIM,
  type Schedule,
  type ShulProfile,
  ZMAN_LABELS,
  type ZmanId,
  type ZmanKey,
  yahrzeitsBetween,
} from '@beitecha/engine'
import { useMemo } from 'react'

import { useDays } from '@/features/luach/useDays'
import type { InlineZman, WeekProps } from './WeekSheet'

/** The week starting `sunday`, as the sheet shows it: the shul's print settings decide what's left out. */
export function useWeek(
  slug: string,
  profile: ShulProfile | undefined,
  schedule: Schedule | undefined,
  sunday: DateString,
): WeekProps | null {
  const days = useDays(schedule, sunday, 7)
  return useMemo(() => {
    if (!schedule || !profile || days.length < 7) return null
    const print = schedule.settings.print ?? {}
    const shabbos = addDays(sunday, 6)
    const on = (flag: boolean | undefined) => flag !== false
    return {
      slug,
      profile,
      days,
      notices: on(print.notices)
        ? schedule.notices
            .filter((n) => (n.to ?? n.from) >= sunday && n.from <= shabbos)
            .sort((a, b) => a.from.localeCompare(b.from))
        : [],
      categories: schedule.settings.noticeCategories,
      comingUp: on(print.comingUp) ? new Calendar(schedule).announced(sunday) : [],
      cholim: on(print.cholim) ? (schedule.cholim ?? []) : [],
      yahrzeits: on(print.yahrzeits) ? yahrzeitsBetween(schedule.yahrzeits, sunday, shabbos) : [],
      yahrzeitSettings: schedule.settings.yahrzeits,
      zmanimTable: on(print.zmanimTable),
      shiurim: on(print.shiurim),
      shabbosZmanim: shabbosZmanim(schedule, addDays(sunday, 5)),
    }
  }, [slug, profile, schedule, sunday, days])
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
