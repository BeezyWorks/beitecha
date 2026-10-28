import { dayInfo, displayHolidays, hebrewDateOf, holidayMatches, parshaFor, zmanimFor, type DayInfo } from './day'
import { addDays, parseClock, startOfWeek, utcOffset } from './dates'
import { LocalHolidays } from './local'
import { effectiveHolidays } from './localPresets'
import { guessAudience, guessCategory } from './categories'
import { tefilaName } from './tefilos'
import type {
  Anchor,
  Condition,
  DateString,
  DaySchedule,
  EventDef,
  Exception,
  Minutes,
  Notice,
  Occurrence,
  Relative,
  RelativeTo,
  Schedule,
  TimeExpr,
  ZmanId,
} from './types'

/** Thrown inside evaluation; caught per occurrence and reported as its `error`. */
class EvalError extends Error {}

/** "15 minutes after Maariv" is "after Maariv", "30 before Mincha" is "before Mincha"; rounding doesn't change it. */
export function derivedRelative(expr: TimeExpr): RelativeTo | undefined {
  let e = expr
  if ('round' in e) e = e.round
  const offset = 'offset' in e ? e.offset : 0
  if ('offset' in e) e = e.of
  if (!('event' in e) || offset === 0) return undefined
  return offset < 0 ? { before: e.event } : { after: e.event }
}

/**
 * The last day a notice shows: its `to`, else the day of the one-time event it's about (a reminder takes itself
 * down), else its `from`.
 */
export function noticeLastDay(notice: Notice, exceptions: Exception[]): DateString {
  if (notice.to) return notice.to
  const added = notice.eventId && exceptions.find((x) => x.type === 'add' && x.event.id === notice.eventId)
  return added && added.date > notice.from ? added.date : notice.from
}

interface Resolved {
  minutes: Minutes | null
  end?: Minutes
  /** The expression the time came from, for saying it as "after Maariv". */
  expr?: TimeExpr
  /** The rule's own `relative`. */
  said?: RelativeTo | null
  cancelled: boolean
  note?: Occurrence['note']
  source: Occurrence['source']
  ruleIndex?: number
  error?: string
}

/**
 * Computes a shul's days. Results are memoized per date, so build one
 * `Calendar` per render (or per range) rather than per day.
 */
export class Calendar {
  private readonly events = new Map<string, EventDef>()
  private readonly exceptionsByDate = new Map<DateString, Exception[]>()
  private readonly local: LocalHolidays
  private readonly infos = new Map<DateString, DayInfo>()
  private readonly zmanim = new Map<DateString, Partial<Record<ZmanId, Minutes>>>()
  private readonly resolved = new Map<string, Resolved>()
  private readonly inProgress = new Set<string>()

  constructor(readonly schedule: Schedule) {
    this.local = new LocalHolidays(effectiveHolidays(schedule.settings))
    for (const e of schedule.events) this.events.set(e.id, e)
    for (const x of schedule.exceptions) {
      const list = this.exceptionsByDate.get(x.date) ?? []
      list.push(x)
      this.exceptionsByDate.set(x.date, list)
      if (x.type === 'add') this.events.set(x.event.id, { ...x.event, rules: [] })
    }
  }

  info(date: DateString): DayInfo {
    let i = this.infos.get(date)
    if (!i) {
      i = dayInfo(date, this.schedule.settings, this.local.on(date))
      this.infos.set(date, i)
    }
    return i
  }

  zmanimOn(date: DateString): Partial<Record<ZmanId, Minutes>> {
    let z = this.zmanim.get(date)
    if (!z) {
      z = zmanimFor(date, this.schedule.settings)
      this.zmanim.set(date, z)
    }
    return z
  }

  matches(cond: Condition, date: DateString): boolean {
    const info = this.info(date)
    if ('weekday' in cond) return cond.weekday.includes(info.weekday)
    if ('tag' in cond) return info.tags.has(cond.tag)
    if ('holiday' in cond) return holidayMatches(info, cond.holiday)
    if ('localHoliday' in cond) return info.localHolidays.some((h) => h.id === cond.localHoliday)
    if ('civil' in cond) {
      const md = date.slice(5)
      const { from, to } = cond.civil
      return from <= to ? md >= from && md <= to : md >= from || md <= to
    }
    if ('dates' in cond) return date >= cond.dates.from && date <= cond.dates.to
    if ('all' in cond) return cond.all.every((c) => this.matches(c, date))
    if ('any' in cond) return cond.any.some((c) => this.matches(c, date))
    if ('not' in cond) return !this.matches(cond.not, date)
    throw new EvalError(`Unknown condition ${JSON.stringify(cond)}`)
  }

  /** Evaluates `expr` on `date`; `null` when it has no value that day (e.g. a cancelled anchor). */
  evaluate(expr: TimeExpr, date: DateString): Minutes | null {
    if ('clock' in expr) return parseClock(expr.clock)
    if ('zman' in expr) {
      const z = this.zmanimOn(date)[expr.zman]
      if (z === undefined) throw new EvalError(`No ${expr.zman} on ${date}`)
      return z
    }
    if ('event' in expr) {
      if (!this.events.has(expr.event)) throw new EvalError(`Unknown event "${expr.event}"`)
      const r = this.resolve(expr.event, date)
      if (r.error) throw new EvalError(`"${expr.event}": ${r.error}`)
      return r.cancelled ? null : r.minutes
    }
    if ('offset' in expr) {
      const v = this.evaluate(expr.of, date)
      return v === null ? null : v + expr.offset
    }
    if ('earliest' in expr || 'latest' in expr) {
      const items = 'earliest' in expr ? expr.earliest : expr.latest
      const values = items.map((e) => this.evaluate(e, date)).filter((v): v is Minutes => v !== null)
      if (values.length === 0) return null
      return 'earliest' in expr ? Math.min(...values) : Math.max(...values)
    }
    if ('clamp' in expr) {
      let v = this.evaluate(expr.clamp, date)
      if (v === null) return null
      const min = expr.min ? this.evaluate(expr.min, date) : null
      const max = expr.max ? this.evaluate(expr.max, date) : null
      if (min !== null) v = Math.max(v, min)
      if (max !== null) v = Math.min(v, max)
      return v
    }
    if ('round' in expr) {
      const v = this.evaluate(expr.round, date)
      if (v === null) return null
      if (!(expr.to > 0)) throw new EvalError(`Round to ${expr.to} minutes`)
      let mode = expr.mode
      if (mode === 'withTrend' || mode === 'againstTrend') {
        const t = this.trend(expr.round, date, v) * (mode === 'withTrend' ? 1 : -1)
        mode = t < 0 ? 'down' : t > 0 ? 'up' : 'nearest'
      }
      const f = mode === 'down' ? Math.floor : mode === 'up' ? Math.ceil : Math.round
      return f(v / expr.to) * expr.to
    }
    if ('weekly' in expr) {
      const sunday = startOfWeek(date)
      const days = expr.days ?? [0, 1, 2, 3, 4, 5]
      const values = days
        .map((d) => this.evaluate(expr.weekly, addDays(sunday, d)))
        .filter((v): v is Minutes => v !== null)
      if (values.length === 0) return null
      return expr.pick === 'earliest' ? Math.min(...values) : Math.max(...values)
    }
    throw new EvalError(`Unknown time expression ${JSON.stringify(expr)}`)
  }

  /**
   * Which way `expr` (worth `value` on `date`) is moving: -1 earlier, 1 later, 0 not at all. Compared
   * with the same weekday a week on (or, when it has no value then, a week before), so a `weekly`
   * time gets one direction for its whole week; clock changes don't count as movement.
   */
  private trend(expr: TimeExpr, date: DateString, value: Minutes): number {
    const tz = this.schedule.settings.location.timeZone
    const solar = (d: DateString, v: Minutes | null) => (v === null ? null : v - utcOffset(d, tz))
    const here = value - utcOffset(date, tz)
    const next = solar(addDays(date, 7), this.evaluate(expr, addDays(date, 7)))
    if (next !== null) return Math.sign(next - here)
    const prev = solar(addDays(date, -7), this.evaluate(expr, addDays(date, -7)))
    return prev === null ? 0 : Math.sign(here - prev)
  }

  /** Which rule of `event` applies on `date`, or -1. */
  matchingRule(event: EventDef, date: DateString): number {
    return event.rules.findIndex((r) => !r.when || this.matches(r.when, date))
  }

  /** An event on a date: its rule, then that day's exceptions on top. */
  resolve(eventId: string, date: DateString): Resolved {
    const key = `${eventId}@${date}`
    const done = this.resolved.get(key)
    if (done) return done
    if (this.inProgress.has(key)) throw new EvalError(`"${eventId}" depends on itself`)
    this.inProgress.add(key)
    let result: Resolved
    try {
      result = this.compute(eventId, date)
    } catch (e) {
      if (!(e instanceof EvalError)) throw e
      result = { minutes: null, cancelled: false, source: 'rule', error: e.message }
    } finally {
      this.inProgress.delete(key)
    }
    this.resolved.set(key, result)
    return result
  }

  private compute(eventId: string, date: DateString): Resolved {
    const exceptions = (this.exceptionsByDate.get(date) ?? []).filter((x) =>
      x.type === 'add' ? x.event.id === eventId : x.eventId === eventId,
    )
    const added = exceptions.find((x) => x.type === 'add')
    const cancel = exceptions.find((x) => x.type === 'cancel')
    const retime = exceptions.find((x) => x.type === 'retime')
    const noteOnly = exceptions.find((x) => x.type === 'note')
    const exceptionNote = (cancel ?? retime ?? added ?? noteOnly)?.note

    const event = this.events.get(eventId)
    if (!event) throw new EvalError(`Unknown event "${eventId}"`)
    let base: Resolved
    let endExpr: TimeExpr | undefined
    if (added && added.type === 'add') {
      base = { minutes: this.evaluate(added.time, date), expr: added.time, cancelled: false, source: 'added' }
      endExpr = added.end
    } else {
      const i = this.matchingRule(event, date)
      const rule = event.rules[i]
      if (!rule || rule.time === null) {
        base = { minutes: null, cancelled: false, source: 'rule', ruleIndex: i >= 0 ? i : undefined }
      } else {
        base = {
          minutes: this.evaluate(rule.time, date),
          expr: rule.time,
          said: rule.relative,
          cancelled: false,
          source: 'rule',
          ruleIndex: i,
          note: rule.note,
        }
        endExpr = rule.end
      }
    }

    if (cancel) return { ...base, cancelled: true, source: 'exception', note: exceptionNote }
    if (retime && retime.type === 'retime') {
      const minutes = this.evaluate(retime.time, date)
      // A rule's "between Mincha and Maariv" no longer holds once the time is moved; say the new one's.
      base = { ...base, minutes, expr: retime.time, said: undefined, source: 'exception', note: exceptionNote ?? base.note }
    } else if (exceptionNote) base = { ...base, note: exceptionNote }
    if (base.minutes === null) return base
    const end = endExpr ? this.evaluate(endExpr, date) : event.duration ? base.minutes + event.duration : null
    return end === null ? base : { ...base, end }
  }

  /** How `o`'s time is said, by the minyanim around it that happen that day (`day` is that day's list). */
  private relativeOf(r: Resolved, kind: Occurrence['kind'], day: Occurrence[]): Relative | undefined {
    const spec = r.said === null ? undefined : (r.said ?? (kind === 'tefila' || !r.expr ? undefined : derivedRelative(r.expr)))
    if (!spec) return undefined
    const anchor = (id: string): Anchor | undefined => {
      const o = day.find((x) => x.eventId === id)
      if (!o || o.cancelled || o.minutes === null) return undefined
      const twin = day.some(
        (x) => x.eventId !== id && (x.name.en === o.name.en || (!!o.tefila && x.tefila === o.tefila)),
      )
      return { eventId: id, name: o.name, minutes: o.minutes, ...(twin && { needsTime: true }) }
    }
    if ('between' in spec) {
      const [a, b] = spec.between.map(anchor)
      return a && b ? { position: 'between', anchors: [a, b] } : undefined
    }
    const position = 'after' in spec ? 'after' : 'before'
    const a = anchor('after' in spec ? spec.after : spec.before)
    return a && { position, anchors: [a] }
  }

  /** Every event that happens (or was cancelled) on `date`, sorted by time. Internal events are left out. */
  occurrences(date: DateString, { includeInternal = false } = {}): Occurrence[] {
    const out: Occurrence[] = []
    const resolved = new Map<Occurrence, Resolved>()
    for (const event of this.events.values()) {
      if (!includeInternal && event.visibility === 'internal') continue
      const r = this.resolve(event.id, date)
      const happens = r.minutes !== null || r.cancelled || r.error
      if (!happens) continue
      const o: Occurrence = {
        eventId: event.id,
        name: event.kind === 'tefila' ? tefilaName(event, this.info(date).tags) : event.name,
        kind: event.kind,
        tefila: event.tefila,
        category: guessCategory(event),
        audience: guessAudience(event),
        ages: event.ages,
        speaker: event.speaker,
        topic: event.topic,
        room: event.room,
        location: event.location,
        link: event.link,
        minutes: r.minutes,
        endMinutes: r.end,
        cancelled: r.cancelled,
        note: r.note,
        source: r.source,
        ruleIndex: r.ruleIndex,
        error: r.error,
      }
      out.push(o)
      resolved.set(o, r)
    }
    for (const o of out) {
      const relative = this.relativeOf(resolved.get(o)!, o.kind, out)
      if (relative) o.relative = relative
    }
    return out.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity))
  }

  notices(date: DateString): Notice[] {
    const { notices, exceptions } = this.schedule
    return notices.filter((n) => date >= n.from && date <= noticeLastDay(n, exceptions))
  }

  /**
   * One-time events (not minyanim) from `from` for `days`: the shul BBQ three weeks out, for a "coming up"
   * list beyond the days a client computes.
   */
  oneTimeEvents(from: DateString, days = 56): { date: DateString; event: Occurrence }[] {
    const to = addDays(from, days - 1)
    const out: { date: DateString; event: Occurrence }[] = []
    for (const x of this.schedule.exceptions) {
      if (x.type !== 'add' || x.event.kind === 'tefila' || x.date < from || x.date > to) continue
      const event = this.occurrences(x.date).find((o) => o.eventId === x.event.id)
      if (event) out.push({ date: x.date, event })
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.event.minutes ?? Infinity) - (b.event.minutes ?? Infinity))
  }

  /** The zmanim to display: all but the ones the shul hides. Rules can still anchor on a hidden one. */
  private shownZmanim(date: DateString): Partial<Record<ZmanId, Minutes>> {
    const hidden = this.schedule.settings.zmanim?.hidden
    if (!hidden?.length) return this.zmanimOn(date)
    const out = { ...this.zmanimOn(date) }
    for (const id of hidden) delete out[id]
    return out
  }

  day(date: DateString, opts?: { includeInternal?: boolean }): DaySchedule {
    const info = this.info(date)
    return {
      date,
      weekday: info.weekday,
      hebrew: hebrewDateOf(info),
      holidays: displayHolidays(info),
      parsha: parshaFor(date, this.schedule.settings),
      tags: [...info.tags],
      zmanim: this.shownZmanim(date),
      events: this.occurrences(date, opts),
      notices: this.notices(date),
    }
  }

  range(from: DateString, days: number, opts?: { includeInternal?: boolean }): DaySchedule[] {
    return Array.from({ length: days }, (_, i) => this.day(addDays(from, i), opts))
  }
}

export function computeDay(schedule: Schedule, date: DateString): DaySchedule {
  return new Calendar(schedule).day(date)
}

export function computeRange(schedule: Schedule, from: DateString, days: number): DaySchedule[] {
  return new Calendar(schedule).range(from, days)
}
