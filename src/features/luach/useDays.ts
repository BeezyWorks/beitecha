import { Calendar, type DateString, type DaySchedule, type Schedule } from '@beitecha/engine'
import { useMemo } from 'react'

/** `count` computed days from `from`. */
export function useDays(schedule: Schedule | undefined, from: DateString, count: number): DaySchedule[] {
  return useMemo(() => (schedule ? new Calendar(schedule).range(from, count) : []), [schedule, from, count])
}
