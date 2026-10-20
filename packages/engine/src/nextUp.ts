import type { DaySchedule, Minutes, Occurrence } from './types'

export interface NextUp {
  event: Occurrence & { minutes: Minutes }
  /** False when today is over and this is tomorrow's first. */
  today: boolean
}

/** The next minyan or shiur that hasn't started: today's, or tomorrow's first once today is over. */
export function nextUp(
  day: DaySchedule,
  tomorrow: DaySchedule | undefined,
  now: Minutes,
): NextUp | undefined {
  const upcoming = (d: DaySchedule | undefined, from: Minutes) =>
    d?.events.find(
      (e): e is NextUp['event'] => !e.cancelled && e.minutes !== null && e.minutes >= from,
    )
  const today = upcoming(day, now)
  if (today) return { event: today, today: true }
  const first = upcoming(tomorrow, 0)
  return first && { event: first, today: false }
}
