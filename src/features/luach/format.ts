import { parseDate, type DateString, type Minutes } from '@beitecha/engine'

/** `6:30` (no AM/PM) — shul schedules read better without it. */
export const clock = (m: Minutes) => {
  const h = Math.floor(m / 60) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')}`
}

export const ampm = (m: Minutes) => (Math.floor(m / 60) % 24 < 12 ? 'AM' : 'PM')

export const clockFull = (m: Minutes) => `${clock(m)} ${ampm(m)}`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `October 19` */
export const civilDate = (date: DateString) => {
  const { month, day } = parseDate(date)
  return `${MONTHS[month - 1]} ${day}`
}

/** `Oct 19` */
export const civilDateShort = (date: DateString) => {
  const { month, day } = parseDate(date)
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`
}

/** "in 23 min", "in 1 hr 5 min" */
export const untilText = (minutes: number) => {
  if (minutes <= 0) return 'now'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `in ${h} hr${m ? ` ${m} min` : ''}` : `in ${m} min`
}
