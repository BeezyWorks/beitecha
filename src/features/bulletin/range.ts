import {
  addDays,
  type DateString,
  type PrintSettings,
  type Weekday,
  weekdayOf,
} from '@beitecha/engine'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** The longest a bulletin runs, in days. */
export const MAX_SPAN = 14

/** The days one bulletin covers, both ends included. */
export interface DateRange {
  from: DateString
  to: DateString
}

export const spanOf = ({ from, to }: DateRange) => {
  const [a, b] = [from, to].map((d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)))
  return Math.round((b - a) / 86_400_000) + 1
}

/** The shul's usual week: `weekStart` through `weekEnd` (default Sunday to Shabbos). */
export function weekSpan(print: PrintSettings | undefined): { start: Weekday; length: number } {
  const start = (print?.weekStart ?? 0) as Weekday
  const end = print?.weekEnd ?? 6
  return { start, length: ((end - start + 7) % 7) + 1 }
}

/** The usual week containing `date`. */
export function weekContaining(date: DateString, print: PrintSettings | undefined): DateRange {
  const { start, length } = weekSpan(print)
  const from = addDays(date, -((weekdayOf(date) - start + 7) % 7))
  return { from, to: addDays(from, length - 1) }
}

/**
 * The range a page asks for: its own `from` and `to` if both are dates (1 to `MAX_SPAN` days), else the usual week
 * that `week` (any date in it) falls in, else the one around `today`.
 */
export function rangeFromParams(
  params: { week?: string; from?: string; to?: string },
  today: DateString,
  print: PrintSettings | undefined,
): DateRange {
  const { from, to } = params
  if (from && to && DATE_RE.test(from) && DATE_RE.test(to) && to >= from) {
    const range = { from, to }
    return spanOf(range) <= MAX_SPAN ? range : { from, to: addDays(from, MAX_SPAN - 1) }
  }
  return weekContaining(params.week && DATE_RE.test(params.week) ? params.week : today, print)
}

/** The range after (or, negative, before) this one, as long as it is. */
export const shiftRange = (r: DateRange, direction: 1 | -1): DateRange => {
  const n = spanOf(r) * direction
  return { from: addDays(r.from, n), to: addDays(r.to, n) }
}
