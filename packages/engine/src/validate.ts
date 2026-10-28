import { addDays, parseDate } from './dates'
import { localHolidayDates } from './local'
import { effectiveHolidays } from './localPresets'
import { Calendar } from './schedule'
import {
  AUDIENCES,
  EVENT_CATEGORIES,
  NOTICE_KINDS,
  TEFILA_TYPES,
  type Condition,
  type DateString,
  type EventDef,
  type Exception,
  type RelativeTo,
  type Schedule,
  type TimeExpr,
} from './types'

export interface Issue {
  level: 'error' | 'warning'
  message: string
  eventId?: string
  exceptionId?: string
  date?: DateString
}

function eventRefs(expr: TimeExpr, out: string[] = []): string[] {
  if ('event' in expr) out.push(expr.event)
  else if ('offset' in expr) eventRefs(expr.of, out)
  else if ('earliest' in expr) expr.earliest.forEach((e) => eventRefs(e, out))
  else if ('latest' in expr) expr.latest.forEach((e) => eventRefs(e, out))
  else if ('clamp' in expr) [expr.clamp, expr.min, expr.max].forEach((e) => e && eventRefs(e, out))
  else if ('round' in expr) eventRefs(expr.round, out)
  else if ('weekly' in expr) eventRefs(expr.weekly, out)
  return out
}

function localHolidayRefs(c: Condition, out: string[] = []): string[] {
  if ('localHoliday' in c) out.push(c.localHoliday)
  else if ('all' in c) c.all.forEach((x) => localHolidayRefs(x, out))
  else if ('any' in c) c.any.forEach((x) => localHolidayRefs(x, out))
  else if ('not' in c) localHolidayRefs(c.not, out)
  return out
}

const relativeRefs = (r: RelativeTo): string[] => ('between' in r ? r.between : ['after' in r ? r.after : r.before])

const isLink = (s: string) => /^https:\/\/[^\s/]+\.[^\s]+$/i.test(s)

/** What's wrong with an event's details (not its rules), as messages. */
function detailProblems(e: Omit<EventDef, 'rules'>): { level: Issue['level']; message: string }[] {
  const out: { level: Issue['level']; message: string }[] = []
  if (e.category !== undefined && !EVENT_CATEGORIES.includes(e.category)) {
    out.push({ level: 'error', message: `"${e.name.en}" has an unknown category "${e.category}"` })
  }
  if (e.category && e.kind !== 'other') {
    out.push({ level: 'warning', message: `"${e.name.en}" is a ${e.kind === 'tefila' ? 'minyan' : 'shiur'}; its category is ignored` })
  }
  if (e.audience !== undefined && !AUDIENCES.includes(e.audience)) {
    out.push({ level: 'error', message: `"${e.name.en}" is for an unknown audience "${e.audience}"` })
  }
  if (e.duration !== undefined && !(Number.isInteger(e.duration) && e.duration > 0)) {
    out.push({ level: 'error', message: `"${e.name.en}" lasts ${e.duration} minutes` })
  }
  if (e.link !== undefined && !isLink(e.link)) {
    out.push({ level: 'warning', message: `"${e.name.en}" has a link that isn't an https address` })
  }
  return out
}

function conditionIsEmpty(c: Condition): boolean {
  return ('weekday' in c && c.weekday.length === 0) || ('any' in c && c.any.length === 0)
}

/**
 * Static checks plus a dry run over `days` from `from`: unknown references,
 * cycles, evaluation errors, and exceptions that no longer land on anything.
 */
export function validate(schedule: Schedule, from: DateString, days = 400): Issue[] {
  const issues: Issue[] = []
  const ids = new Set<string>()
  for (const e of schedule.events) {
    if (ids.has(e.id)) issues.push({ level: 'error', eventId: e.id, message: `Two events share the id "${e.id}"` })
    ids.add(e.id)
  }
  const localIds = new Set(effectiveHolidays(schedule.settings).map((h) => h.id))
  const ownIds = new Set<string>()
  for (const h of schedule.settings.localHolidays ?? []) {
    if (ownIds.has(h.id)) issues.push({ level: 'error', message: `Two local holidays share the id "${h.id}"` })
    ownIds.add(h.id)
    // A rule that lands nowhere in two years is a typo (month 13, February 30th, …).
    const year = parseDate(from).year
    if (!localHolidayDates([h], year).size && !localHolidayDates([h], year + 1).size) {
      issues.push({ level: 'warning', message: `Local holiday "${h.name.en}" never lands on a date` })
    }
  }
  const known = new Set([...ids, ...schedule.exceptions.flatMap((x) => (x.type === 'add' ? [x.event.id] : []))])

  for (const e of schedule.events) {
    if (e.kind === 'tefila' && !TEFILA_TYPES.includes(e.tefila!)) {
      issues.push({ level: 'error', eventId: e.id, message: `Minyan "${e.name.en}" needs its tefila: Shacharis, Mincha, Maariv or Mincha/Maariv` })
    }
    if (e.kind !== 'tefila' && e.tefila) {
      issues.push({ level: 'warning', eventId: e.id, message: `"${e.name.en}" isn't a minyan but has a tefila` })
    }
    e.rules.forEach((rule, i) => {
      if (rule.when && conditionIsEmpty(rule.when)) {
        issues.push({ level: 'warning', eventId: e.id, message: `Rule ${i + 1} never applies` })
      }
      for (const ref of rule.when ? localHolidayRefs(rule.when) : []) {
        if (!localIds.has(ref)) issues.push({ level: 'error', eventId: e.id, message: `Rule ${i + 1} uses unknown local holiday "${ref}"` })
      }
      for (const ref of [...(rule.time ? eventRefs(rule.time) : []), ...(rule.end ? eventRefs(rule.end) : [])]) {
        if (!known.has(ref)) issues.push({ level: 'error', eventId: e.id, message: `Rule ${i + 1} uses unknown event "${ref}"` })
      }
      for (const ref of rule.relative ? relativeRefs(rule.relative) : []) {
        if (!known.has(ref)) issues.push({ level: 'error', eventId: e.id, message: `Rule ${i + 1} is said by unknown event "${ref}"` })
        else if (ref === e.id) issues.push({ level: 'error', eventId: e.id, message: `Rule ${i + 1} is said by its own event` })
      }
    })
    for (const p of detailProblems(e)) issues.push({ ...p, eventId: e.id })
  }
  for (const x of schedule.exceptions) {
    if (x.type === 'add') for (const p of detailProblems(x.event)) issues.push({ ...p, exceptionId: x.id, date: x.date })
  }

  const added = new Map(
    schedule.exceptions.flatMap((x): [string, Extract<Exception, { type: 'add' }>][] => (x.type === 'add' ? [[x.event.id, x]] : [])),
  )
  for (const n of schedule.notices) {
    const what = `${n.kind} "${(n.title ?? n.text).en.slice(0, 40)}"`
    if (!NOTICE_KINDS.includes(n.kind)) {
      issues.push({ level: 'error', date: n.from, message: `Notice of unknown kind "${n.kind}"` })
      continue
    }
    if (n.to && n.to < n.from) issues.push({ level: 'error', date: n.from, message: `The ${what} ends before it starts` })
    if (n.eventId && !known.has(n.eventId)) {
      issues.push({ level: 'warning', date: n.from, message: `The ${what} is for an event that doesn't exist ("${n.eventId}")` })
    }
    if (n.sponsors && n.kind !== 'sponsor') issues.push({ level: 'warning', date: n.from, message: `The ${what} isn't a sponsorship` })
    if (n.sponsors && n.eventId) issues.push({ level: 'warning', date: n.from, message: `The ${what} sponsors an event and the ${n.sponsors} both` })
    const event = n.eventId ? added.get(n.eventId) : undefined
    if (n.kind === 'reminder' && event && event.date < n.from) {
      issues.push({ level: 'warning', date: n.from, message: `The ${what} starts after its event (${event.date})` })
    }
    if (n.link !== undefined && !isLink(n.link)) {
      issues.push({ level: 'warning', date: n.from, message: `The ${what} has a link that isn't an https address` })
    }
  }

  const cal = new Calendar(schedule)
  const errorsSeen = new Set<string>()
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    for (const o of cal.occurrences(date, { includeInternal: true })) {
      if (o.error && !errorsSeen.has(`${o.eventId}:${o.error}`)) {
        errorsSeen.add(`${o.eventId}:${o.error}`)
        issues.push({ level: 'error', eventId: o.eventId, date, message: o.error })
      }
      if (o.endMinutes !== undefined && o.minutes !== null && o.endMinutes <= o.minutes && !errorsSeen.has(`${o.eventId}:end`)) {
        errorsSeen.add(`${o.eventId}:end`)
        issues.push({ level: 'warning', eventId: o.eventId, date, message: `"${o.name.en}" ends before it starts` })
      }
    }
  }

  for (const x of schedule.exceptions) {
    if (x.type === 'add') continue
    if (!known.has(x.eventId)) {
      issues.push({ level: 'warning', exceptionId: x.id, date: x.date, message: `Exception for a deleted event "${x.eventId}"` })
      continue
    }
    // Would the event have happened that day without its exceptions?
    const bare = new Calendar({ ...schedule, exceptions: [] }).resolve(x.eventId, x.date)
    if (bare.minutes === null && x.type !== 'retime') {
      issues.push({
        level: 'warning',
        exceptionId: x.id,
        eventId: x.eventId,
        date: x.date,
        message: `"${x.eventId}" doesn't happen on ${x.date} anyway; this exception does nothing`,
      })
    }
  }
  return issues
}
