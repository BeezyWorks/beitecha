import { HDate } from '@hebcal/core'

import { Calendar, noticeLastDay } from './schedule'
import { addDays, formatClock, parseClock, parseDate } from './dates'
import { resolveOccasion } from './occasions'
import { LIMITS, foldName, sanitizeLink, sanitizeText } from './text'
import { gregorianToHebrew, hebrewToGregorian, isRealMonthDay, originYear } from './yahrzeits'
import {
  AUDIENCES,
  EVENT_CATEGORIES,
  type Audience,
  type Choleh,
  type DateString,
  type EventCategory,
  type EventDef,
  type Exception,
  type HebrewMonthDay,
  type Localized,
  type Notice,
  type NoticeKind,
  type Occasion,
  type OccasionKind,
  type Origin,
  type Schedule,
  type Yahrzeit,
} from './types'

// ---------------------------------------------------------------------------
// The operations a write connection can make. Plain JSON in, so the Worker can validate nothing but the shape.

/** Text from outside: a plain string is English; or `{ en, he }`. */
export type TextInput = string | Localized

/** Which entry a list operation means: the id it was created with, or a name to `match` (exactly one entry must). */
export interface PersonRef {
  id?: string
  match?: string
}

/** A dated target: `ref` (`<eventId>@<date>`) as `/upcoming` gives it, or `eventId` and `date`. */
export interface EventTarget {
  ref?: string
  eventId?: string
  date?: DateString
}

export interface PersonFields {
  hebrewName?: string | null
  displayName?: TextInput | null
  /** Hebrew day and month of the passing/birthday; the year is optional. */
  hebrew?: HebrewMonthDay | null
  /** Civil date, `YYYY-MM-DD`. Giving either date replaces both. */
  gregorian?: DateString | null
  hideFromBulletin?: boolean
}

export interface OneTimeEventFields {
  name?: TextInput
  date?: DateString
  /** `HH:MM`, 24-hour. */
  time?: string
  end?: string | null
  kind?: 'other' | 'shiur'
  category?: EventCategory | null
  audience?: Audience | null
  ages?: TextInput | null
  speaker?: TextInput | null
  topic?: TextInput | null
  description?: TextInput | null
  room?: string | null
  location?: string | null
  link?: string | null
  note?: TextInput | null
}

export type Operation =
  | ({
      op: 'sponsor.create'
      sponsoredBy?: TextInput
      inHonorOf?: TextInput
      text?: TextInput
      /** Without an event: the run of days (`to` defaults to `from`), for the day's learning or the notices. */
      from?: DateString
      to?: DateString
      sponsors?: 'day' | 'notices'
      /** Replace the sponsorship already on that event and date; else that is a conflict. */
      replace?: boolean
    } & EventTarget)
  | ({
      op: 'sponsor.update'
      id?: string
      sponsoredBy?: TextInput | null
      inHonorOf?: TextInput | null
      text?: TextInput | null
    } & EventTarget)
  | ({ op: 'sponsor.delete'; id?: string } & EventTarget)
  | {
      op: 'notice.create'
      kind: Exclude<NoticeKind, 'sponsor'>
      title?: TextInput
      text: TextInput
      from?: DateString
      to?: DateString
      /** The event it is about (a reminder for a one-time event comes down after it). */
      eventId?: string
      category?: string
      link?: string
    }
  | {
      op: 'notice.update'
      id: string
      title?: TextInput | null
      text?: TextInput
      from?: DateString
      to?: DateString
      category?: string | null
      link?: string | null
    }
  | { op: 'notice.delete'; id: string }
  | ({ op: 'change.cancel'; note?: TextInput } & EventTarget)
  | ({ op: 'change.retime'; time: string; note?: TextInput } & EventTarget)
  | ({ op: 'change.note'; note: TextInput } & EventTarget)
  | ({ op: 'change.delete'; type?: 'cancel' | 'retime' | 'note' } & EventTarget)
  | ({ op: 'event.create' } & OneTimeEventFields & Required<Pick<OneTimeEventFields, 'name' | 'date' | 'time'>>)
  /** `id` is the event's id, as returned when it was created. */
  | ({ op: 'event.update'; id: string } & OneTimeEventFields)
  | { op: 'event.delete'; id: string }
  | ({ op: 'yahrzeit.add' } & PersonFields)
  | ({ op: 'yahrzeit.update' } & PersonRef & PersonFields)
  | ({ op: 'yahrzeit.delete' } & PersonRef)
  | ({ op: 'occasion.add'; kind: OccasionKind; by?: 'hebrew' | 'gregorian' } & PersonFields)
  | ({ op: 'occasion.update'; kind: OccasionKind; by?: 'hebrew' | 'gregorian' | null } & PersonRef & PersonFields)
  | ({ op: 'occasion.delete'; kind: OccasionKind } & PersonRef)
  | { op: 'cholim.add'; name: TextInput }
  | ({ op: 'cholim.remove' } & PersonRef)
  | ({ op: 'cholim.renew' } & PersonRef)

export type OperationName = Operation['op']
export type Scope = 'sponsors' | 'notices' | 'changes' | 'events' | 'yahrzeits' | 'occasions' | 'cholim'

/** The scope a connection needs for an operation. */
export function operationScope(op: Pick<Operation, 'op'>): Scope | undefined {
  const group = op.op.split('.')[0]
  return ({
    sponsor: 'sponsors',
    notice: 'notices',
    change: 'changes',
    event: 'events',
    yahrzeit: 'yahrzeits',
    occasion: 'occasions',
    cholim: 'cholim',
  } as Record<string, Scope>)[group]
}

/** Deletions count against a connection's daily removal allowance. */
export const isRemoval = (op: Pick<Operation, 'op'>): boolean => /\.(delete|remove)$/.test(op.op)

// ---------------------------------------------------------------------------
// Results

export type ErrorCode =
  | 'invalid'
  | 'not_found'
  | 'ambiguous'
  | 'conflict'
  | 'forbidden'
  | 'date_out_of_range'
  | 'limit'

export interface OperationError {
  code: ErrorCode
  message: string
  details?: unknown
}

export type ListKey = 'notices' | 'exceptions' | 'yahrzeits' | 'birthdays' | 'anniversaries' | 'cholim'

/** One item of one of the schedule's lists, as it was or became. */
export interface Entry {
  list: ListKey
  item: { id: string }
}

export interface OperationContext {
  /** Today in the shul's time zone (`todayIn`). */
  today: DateString
  connectionId: string
  /** New ids; default is the admin's style. */
  newId?: () => string
}

export interface Change {
  op: Operation
  before: Entry[]
  after: Entry[]
}

export type ApplyResult =
  | {
      schedule: Schedule
      /** What the operation replaced or removed, and what it put there. */
      before: Entry[]
      after: Entry[]
      /** A `ref` for something on a date, else the id of the item. */
      target: string
      /** Why a gabbai should look at it first (a minyan's time changing). */
      needsReview?: string
    }
  | { error: OperationError }

class OpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}
const fail = (code: ErrorCode, message: string, details?: unknown): never => {
  throw new OpError(code, message, details)
}
const invalid = (field: string, message: string): never => fail('invalid', `${field} ${message}`)

// ---------------------------------------------------------------------------
// Field readers

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

interface TextOpts {
  max?: number
  multiline?: boolean
}

function str(field: string, v: unknown, { max = LIMITS.name, multiline }: TextOpts = {}): string {
  const r = sanitizeText(v, { max, multiline })
  return r.ok ? r.text : invalid(field, r.message)
}

/** A `Localized` from a string (English) or `{ en, he }`; undefined when both come out empty. */
function loc(field: string, v: unknown, opts: TextOpts = {}): Localized | undefined {
  if (v === undefined) return undefined
  if (typeof v === 'string') {
    const en = str(field, v, opts)
    return en ? { en } : undefined
  }
  if (!isObject(v)) return invalid(field, 'must be text or { en, he }')
  const en = v.en === undefined ? '' : str(`${field}.en`, v.en, opts)
  const he = v.he === undefined ? '' : str(`${field}.he`, v.he, opts)
  return en || he ? { en, ...(he && { he }) } : undefined
}

function link(field: string, v: unknown): string {
  const r = sanitizeLink(v)
  return r.ok ? r.text : invalid(field, r.message)
}

function realDate(field: string, v: unknown): DateString {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return invalid(field, 'must be YYYY-MM-DD')
  const { year, month, day } = parseDate(v)
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return invalid(field, 'is not a real date')
  return v
}

/** A date an exception or one-time event may sit on: at most a day back and a year ahead. */
function windowed(field: string, v: unknown, ctx: OperationContext): DateString {
  const d = realDate(field, v)
  if (d < addDays(ctx.today, -LIMITS.pastDays) || d > addDays(ctx.today, LIMITS.aheadDays))
    return fail('date_out_of_range', `${field} ${d} is more than a day ago or more than a year ahead (today is ${ctx.today})`)
  return d
}

function clockOf(field: string, v: unknown): string {
  try {
    return formatClock(parseClock(String(v)))
  } catch {
    return invalid(field, 'must be a time like 18:30')
  }
}

const OWN = (ctx: OperationContext): Origin => ({ connectionId: ctx.connectionId })

function parseRef(ref: string): { eventId: string; date: DateString } {
  const at = ref.lastIndexOf('@')
  if (at <= 0) return invalid('ref', 'must look like <eventId>@<date>')
  return { eventId: ref.slice(0, at), date: realDate('ref', ref.slice(at + 1)) }
}

function target(op: EventTarget, ctx: OperationContext): { eventId: string; date: DateString } {
  const t = op.ref !== undefined ? parseRef(String(op.ref)) : { eventId: op.eventId, date: op.date }
  if (typeof t.eventId !== 'string' || !t.eventId || t.date === undefined)
    return invalid('ref', 'or eventId and date is required')
  return { eventId: t.eventId, date: windowed('date', t.date, ctx) }
}

const sameDay = (x: Exception, eventId: string, date: DateString) =>
  x.type !== 'add' && x.eventId === eventId && x.date === date

/** The event as defined (a rule event, or a one-time event's definition). */
function eventDef(s: Schedule, eventId: string): Omit<EventDef, 'rules'> | undefined {
  return (
    s.events.find((e) => e.id === eventId) ??
    s.exceptions.flatMap((x) => (x.type === 'add' && x.event.id === eventId ? [x.event] : []))[0]
  )
}

/** The event must be a public one that happens (or was cancelled) on the date; returns its definition. */
function requireOccurrence(s: Schedule, eventId: string, date: DateString) {
  const def = eventDef(s, eventId)
  const happens = def && def.visibility !== 'internal' && new Calendar(s).occurrences(date).some((o) => o.eventId === eventId)
  return happens && def ? def : fail('not_found', `there is no ${eventId} on ${date}; look it up in the upcoming events first`)
}

// ---------------------------------------------------------------------------
// The working copy an operation edits, recording what it replaced and what it put there

class Editor {
  readonly before: Entry[] = []
  readonly after: Entry[] = []
  private readonly lists: Record<ListKey, { id: string }[]>
  private readonly touched = new Set<ListKey>()

  constructor(
    private readonly schedule: Schedule,
    private readonly ctx: OperationContext,
  ) {
    this.lists = {
      notices: [...schedule.notices],
      exceptions: [...schedule.exceptions],
      yahrzeits: [...(schedule.yahrzeits ?? [])],
      birthdays: [...(schedule.birthdays ?? [])],
      anniversaries: [...(schedule.anniversaries ?? [])],
      cholim: [...(schedule.cholim ?? [])],
    }
  }

  list<T>(key: ListKey): T[] {
    return this.lists[key] as T[]
  }

  newId(key: ListKey): string {
    for (;;) {
      const id = this.ctx.newId?.() ?? Math.random().toString(36).slice(2, 10)
      if (!this.lists[key].some((x) => x.id === id)) return id
    }
  }

  find<T extends { id: string }>(key: ListKey, id: string): T | undefined {
    return this.lists[key].find((x) => x.id === id) as T | undefined
  }

  put<T extends { id: string }>(key: ListKey, item: T) {
    const list = this.lists[key]
    const i = list.findIndex((x) => x.id === item.id)
    if (i >= 0) {
      this.before.push({ list: key, item: list[i] })
      list[i] = item
    } else list.push(item)
    this.after.push({ list: key, item })
    this.touched.add(key)
  }

  remove(key: ListKey, id: string) {
    const list = this.lists[key]
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) return
    this.before.push({ list: key, item: list[i] })
    list.splice(i, 1)
    this.touched.add(key)
  }

  result(target: string, needsReview?: string): ApplyResult {
    const next: Schedule = { ...this.schedule }
    for (const key of this.touched) (next as unknown as Record<string, unknown>)[key] = this.lists[key]
    return { schedule: next, before: this.before, after: this.after, target, ...(needsReview && { needsReview }) }
  }
}

// ---------------------------------------------------------------------------
// Sponsorships and notices

const clean = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

const live = (n: Notice, s: Schedule, today: DateString) => noticeLastDay(n, s.exceptions) >= today

/** "Sponsored by" shows the name with the dedication under it, which the admin keeps in `text.en`. */
function sponsorText(by: Localized | undefined, honor: Localized | undefined, text: Localized | undefined): Localized {
  if (!by) return text ?? { en: '' }
  const he = text?.he ?? honor?.he
  return { en: honor?.en ?? '', ...(he && { he }) }
}

function patched<T>(op: object, key: string, read: (v: unknown) => T | undefined, current: T | undefined) {
  if (!(key in op) || (op as Record<string, unknown>)[key] === undefined) return current
  const v = (op as Record<string, unknown>)[key]
  return v === null ? undefined : read(v)
}

function findSponsor(ed: Editor, op: { id?: string } & EventTarget, ctx: OperationContext): Notice {
  const notices = ed.list<Notice>('notices')
  let found: Notice | undefined
  if (op.id !== undefined) found = notices.find((n) => n.id === op.id)
  else {
    const t = target(op, ctx)
    found = notices.find((n) => n.kind === 'sponsor' && n.eventId === t.eventId && n.from === t.date)
  }
  return found && found.kind === 'sponsor' ? found : fail('not_found', 'no such sponsorship')
}

function sponsorCreate(s: Schedule, op: Extract<Operation, { op: 'sponsor.create' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const by = loc('sponsoredBy', op.sponsoredBy)
  const honor = loc('inHonorOf', op.inHonorOf, { max: LIMITS.text })
  const text = loc('text', op.text, { max: LIMITS.text, multiline: true })
  if (!by && !text) return invalid('a sponsorship', 'needs sponsoredBy or text')
  let notice: Notice
  let existing: Notice | undefined
  let name: string
  const base = { kind: 'sponsor' as const, ...(by && { sponsoredBy: by }), ...(by && honor && { inHonorOf: honor }), text: sponsorText(by, honor, text), origin: OWN(ctx) }
  if (op.ref !== undefined || op.eventId !== undefined || op.date !== undefined) {
    const t = target(op, ctx)
    requireOccurrence(s, t.eventId, t.date)
    existing = ed.list<Notice>('notices').find((n) => n.kind === 'sponsor' && n.eventId === t.eventId && n.from === t.date)
    if (existing && !op.replace)
      return fail('conflict', `${t.eventId} on ${t.date} is already sponsored; send replace to change it`, {
        id: existing.id,
        sponsoredBy: existing.sponsoredBy,
        text: existing.text,
      })
    notice = { id: existing?.id ?? ed.newId('notices'), from: t.date, eventId: t.eventId, ...base }
    name = `${t.eventId}@${t.date}`
  } else {
    const from = realDate('from', op.from)
    const to = noticeEnd(from, op.to, false)
    // A run that began earlier this week is fine; it has to end within the window.
    windowed('to', to ?? from, ctx)
    notice = {
      id: ed.newId('notices'),
      from,
      ...(to && to !== from && { to }),
      ...(op.sponsors === 'notices' && { sponsors: 'notices' as const }),
      ...base,
    }
    name = notice.id
  }
  if (!existing && ed.list<Notice>('notices').filter((n) => n.kind === 'sponsor' && n.origin?.connectionId === ctx.connectionId && live(n, s, ctx.today)).length >= LIMITS.liveSponsors)
    return fail('limit', `this connection already has ${LIMITS.liveSponsors} live sponsorships`)
  ed.put('notices', notice)
  return ed.result(name)
}

function sponsorUpdate(s: Schedule, op: Extract<Operation, { op: 'sponsor.update' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const old = findSponsor(ed, op, ctx)
  const by = patched(op, 'sponsoredBy', (v) => loc('sponsoredBy', v), old.sponsoredBy)
  const honor = patched(op, 'inHonorOf', (v) => loc('inHonorOf', v, { max: LIMITS.text }), old.inHonorOf)
  const text = patched(op, 'text', (v) => loc('text', v, { max: LIMITS.text, multiline: true }), by ? undefined : old.text)
  if (!by && !text) return invalid('a sponsorship', 'needs sponsoredBy or text')
  const { sponsoredBy: _b, inHonorOf: _h, ...rest } = old
  ed.put('notices', clean({ ...rest, ...(by && { sponsoredBy: by }), ...(by && honor && { inHonorOf: honor }), text: sponsorText(by, honor, text ?? (by ? old.text : undefined)), origin: OWN(ctx) }))
  return ed.result(old.eventId ? `${old.eventId}@${old.from}` : old.id)
}

function sponsorDelete(s: Schedule, op: Extract<Operation, { op: 'sponsor.delete' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const old = findSponsor(ed, op, ctx)
  ed.remove('notices', old.id)
  return ed.result(old.eventId ? `${old.eventId}@${old.from}` : old.id)
}

/** A notice's last day: given, else `from` + 14 days; never over 90 days. `required` is for ones that must end. */
function noticeEnd(from: DateString, to: unknown, required: boolean): DateString | undefined {
  if (to === undefined || to === null) return required ? addDays(from, LIMITS.noticeDefaultDays) : undefined
  const end = realDate('to', to)
  if (end < from) return invalid('to', 'is before from')
  if (end > addDays(from, LIMITS.noticeMaxDays)) return fail('date_out_of_range', `to is more than ${LIMITS.noticeMaxDays} days after from`)
  return end
}

function checkedCategory(s: Schedule, v: unknown): string {
  const id = str('category', v)
  return s.settings.noticeCategories?.some((c) => c.id === id) ? id : invalid('category', `${id} is not one of this shul's categories`)
}

function noticeCreate(s: Schedule, op: Extract<Operation, { op: 'notice.create' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  if (!['announcement', 'reminder', 'simcha', 'condolence'].includes(op.kind))
    return invalid('kind', 'must be announcement, reminder, simcha or condolence')
  const text = loc('text', op.text, { max: LIMITS.text, multiline: true })
  if (!text) return invalid('text', 'is required')
  const title = op.title === undefined ? undefined : loc('title', op.title)
  const from = windowed('from', op.from ?? ctx.today, ctx)
  let eventId: string | undefined
  let oneTime = false
  if (op.eventId !== undefined) {
    eventId = str('eventId', op.eventId)
    if (!eventDef(s, eventId)) return fail('not_found', `there is no event ${eventId}`)
    oneTime = s.exceptions.some((x) => x.type === 'add' && x.event.id === eventId)
  }
  // A reminder about a one-time event comes down after it; every other notice ends within 90 days, 14 by default.
  const to = oneTime && op.to === undefined ? undefined : noticeEnd(from, op.to, true)
  if (op.category !== undefined && op.kind !== 'announcement') return invalid('category', 'is only for announcements')
  if (ed.list<Notice>('notices').filter((n) => n.kind !== 'sponsor' && n.origin?.connectionId === ctx.connectionId && live(n, s, ctx.today)).length >= LIMITS.liveNotices)
    return fail('limit', `this connection already has ${LIMITS.liveNotices} live notices; remove one first`)
  const notice: Notice = {
    id: ed.newId('notices'),
    kind: op.kind,
    from,
    ...(to && to !== from && { to }),
    ...(eventId && { eventId }),
    ...(op.category !== undefined && { category: checkedCategory(s, op.category) }),
    ...(title && { title }),
    text,
    ...(op.link !== undefined && { link: link('link', op.link) }),
    origin: OWN(ctx),
  }
  ed.put('notices', notice)
  return ed.result(notice.id)
}

function noticeUpdate(s: Schedule, op: Extract<Operation, { op: 'notice.update' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const old = ed.find<Notice>('notices', String(op.id))
  if (!old || old.kind === 'sponsor') return fail('not_found', 'no such notice')
  const from = op.from === undefined ? old.from : windowed('from', op.from, ctx)
  const to = op.to === undefined ? old.to : noticeEnd(from, op.to, true)
  if (to && to < from) return invalid('to', 'is before from')
  const title = patched(op, 'title', (v) => loc('title', v), old.title)
  const text = op.text === undefined ? old.text : (loc('text', op.text, { max: LIMITS.text, multiline: true }) ?? invalid('text', 'is required'))
  const category = patched(op, 'category', (v) => checkedCategory(s, v), old.category)
  if (category && old.kind !== 'announcement') return invalid('category', 'is only for announcements')
  const url = patched(op, 'link', (v) => link('link', v), old.link)
  const { title: _t, category: _c, link: _l, to: _to, ...rest } = old
  ed.put('notices', { ...rest, from, ...(to && to !== from && { to }), ...(title && { title }), ...(category && { category }), text, ...(url && { link: url }), origin: OWN(ctx) } as Notice)
  return ed.result(old.id)
}

function noticeDelete(s: Schedule, op: Extract<Operation, { op: 'notice.delete' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const old = ed.find<Notice>('notices', String(op.id))
  if (!old || old.kind === 'sponsor') return fail('not_found', 'no such notice')
  ed.remove('notices', old.id)
  return ed.result(old.id)
}

// ---------------------------------------------------------------------------
// Changes to a day

const TEFILA_REVIEW = 'Changing a minyan on a given day needs a gabbai to approve it.'

function exceptionNote(op: { note?: TextInput | null }): Localized | undefined {
  return op.note === undefined || op.note === null ? undefined : loc('note', op.note)
}

/** One cancel, retime or note stands on an occurrence at a time, as in the admin's Today field: a new one replaces it (a note carries over). */
function replaceChange(s: Schedule, ctx: OperationContext, t: { eventId: string; date: DateString }, build: (id: string, carried?: Localized) => Exception): ApplyResult {
  const def = requireOccurrence(s, t.eventId, t.date)
  const ed = new Editor(s, ctx)
  const olds = ed.list<Exception>('exceptions').filter((x) => sameDay(x, t.eventId, t.date))
  const [reuse, ...extra] = olds
  for (const x of extra) ed.remove('exceptions', x.id)
  ed.put('exceptions', { ...build(reuse?.id ?? ed.newId('exceptions'), olds.find((x) => x.note)?.note), origin: OWN(ctx) })
  return ed.result(`${t.eventId}@${t.date}`, def.kind === 'tefila' ? TEFILA_REVIEW : undefined)
}

function change(s: Schedule, op: Extract<Operation, { op: `change.${string}` }>, ctx: OperationContext): ApplyResult {
  const t = target(op, ctx)
  const note = op.op === 'change.delete' ? undefined : exceptionNote(op)
  if (op.op === 'change.cancel')
    return replaceChange(s, ctx, t, (id, carried) => clean({ id, date: t.date, type: 'cancel' as const, eventId: t.eventId, note: note ?? carried }))
  if (op.op === 'change.retime') {
    const time = { clock: clockOf('time', op.time) }
    return replaceChange(s, ctx, t, (id, carried) => clean({ id, date: t.date, type: 'retime' as const, eventId: t.eventId, time, note: note ?? carried }))
  }
  const ed = new Editor(s, ctx)
  const olds = ed.list<Exception>('exceptions').filter((x) => sameDay(x, t.eventId, t.date))
  if (op.op === 'change.note') {
    if (!note) return invalid('note', 'is required')
    requireOccurrence(s, t.eventId, t.date)
    const [first] = olds
    // A cancel or retime already carries the note that is shown; a plain note exception would be ignored beside it.
    const next: Exception = first && first.type !== 'note' ? { ...first, note } : { id: first?.id ?? ed.newId('exceptions'), date: t.date, type: 'note', eventId: t.eventId, note }
    ed.put('exceptions', { ...next, origin: OWN(ctx) })
    return ed.result(`${t.eventId}@${t.date}`)
  }
  const gone = olds.filter((x) => !op.type || x.type === op.type)
  if (!gone.length) return fail('not_found', `there is no change${op.type ? ` of that kind` : ''} on ${t.eventId}@${t.date}`)
  for (const x of gone) ed.remove('exceptions', x.id)
  return ed.result(`${t.eventId}@${t.date}`)
}

// ---------------------------------------------------------------------------
// One-time events (the connection's own)

type OneTime = Extract<Exception, { type: 'add' }>

function ownEvent(ed: Editor, id: string, ctx: OperationContext): OneTime {
  const x = ed.list<Exception>('exceptions').find((e): e is OneTime => e.type === 'add' && e.event.id === id)
  if (!x) return fail('not_found', 'no such one-time event')
  if (x.origin?.connectionId !== ctx.connectionId)
    return fail('forbidden', 'this connection can only change one-time events it created')
  return x
}

function eventFields(base: OneTime, op: OneTimeEventFields, ctx: OperationContext): OneTime {
  const x: OneTime = { ...base, event: { ...base.event } }
  const e = x.event as Record<string, unknown>
  const set = (key: string, v: unknown) => (v === undefined ? delete e[key] : (e[key] = v))
  if (op.name !== undefined) e.name = loc('name', op.name) ?? invalid('name', 'is required')
  if (op.date !== undefined) x.date = windowed('date', op.date, ctx)
  if (op.time !== undefined) x.time = { clock: clockOf('time', op.time) }
  if (op.end !== undefined) {
    if (op.end === null) delete x.end
    else x.end = { clock: clockOf('end', op.end) }
  }
  if (op.kind !== undefined) {
    if (op.kind !== 'other' && op.kind !== 'shiur') invalid('kind', 'must be other or shiur')
    e.kind = op.kind
  }
  if (op.category !== undefined) {
    if (op.category !== null && !EVENT_CATEGORIES.includes(op.category)) invalid('category', 'must be program or meal')
    set('category', op.category ?? undefined)
  }
  if (op.audience !== undefined) {
    if (op.audience !== null && !AUDIENCES.includes(op.audience)) invalid('audience', `must be one of ${AUDIENCES.join(', ')}`)
    set('audience', op.audience ?? undefined)
  }
  for (const key of ['ages', 'speaker', 'topic'] as const)
    if (op[key] !== undefined) set(key, op[key] === null ? undefined : loc(key, op[key]))
  if (op.description !== undefined) set('description', op.description === null ? undefined : loc('description', op.description, { max: LIMITS.text, multiline: true }))
  for (const key of ['room', 'location'] as const)
    if (op[key] !== undefined) set(key, op[key] === null ? undefined : str(key, op[key]) || undefined)
  if (op.link !== undefined) set('link', op.link === null ? undefined : link('link', op.link))
  if (op.note !== undefined) {
    const note = op.note === null ? undefined : loc('note', op.note)
    if (note) x.note = note
    else delete x.note
  }
  if (x.end && 'clock' in x.end && 'clock' in x.time && parseClock(x.end.clock) <= parseClock(x.time.clock))
    invalid('end', 'must be after the start')
  return x
}

function eventCreate(s: Schedule, op: Extract<Operation, { op: 'event.create' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const mine = ed.list<Exception>('exceptions').filter((x) => x.type === 'add' && x.origin?.connectionId === ctx.connectionId && x.date >= ctx.today)
  if (mine.length >= LIMITS.liveEvents) return fail('limit', `this connection already has ${LIMITS.liveEvents} upcoming one-time events`)
  const id = ed.newId('exceptions')
  const blank: OneTime = { id, date: ctx.today, type: 'add', event: { id: `oneoff-${id}`, name: { en: '' }, kind: 'other', origin: OWN(ctx) }, time: { clock: '00:00' }, origin: OWN(ctx) }
  ed.put('exceptions', eventFields(blank, op, ctx))
  return ed.result(`oneoff-${id}`)
}

function eventUpdate(s: Schedule, op: Extract<Operation, { op: 'event.update' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const old = ownEvent(ed, String(op.id), ctx)
  const next = eventFields(old, op, ctx)
  ed.put('exceptions', next)
  // Anything else on that day for the event (a cancel, a note) moves with it.
  if (next.date !== old.date)
    for (const x of ed.list<Exception>('exceptions'))
      if (x.type !== 'add' && x.eventId === old.event.id && x.date === old.date) ed.put('exceptions', { ...x, date: next.date })
  return ed.result(old.event.id)
}

function eventDelete(s: Schedule, op: Extract<Operation, { op: 'event.delete' }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const old = ownEvent(ed, String(op.id), ctx)
  for (const x of [...ed.list<Exception>('exceptions')]) if (x.id === old.id || (x.type !== 'add' && x.eventId === old.event.id)) ed.remove('exceptions', x.id)
  for (const n of [...ed.list<Notice>('notices')]) if (n.eventId === old.event.id) ed.remove('notices', n.id)
  return ed.result(old.event.id)
}

// ---------------------------------------------------------------------------
// People: yahrzeits, birthdays and anniversaries, refuah names

type Person = Yahrzeit | Occasion

const monthDayText = ({ day, month, year }: HebrewMonthDay) => `${day} ${new HDate(day, month, year ?? originYear({ day, month }) ?? 5784).getMonthName()}`

const dateText = (p: Person) => {
  const r = resolveOccasion(p)
  return [r.hebrew && monthDayText(r.hebrew), r.gregorian].filter(Boolean).join(' · ')
}

const nameText = (p: Person) => [p.displayName?.en, p.displayName?.he, p.hebrewName].filter(Boolean).join(' / ')

/** The one entry `ref` means (its id, or the single one `match` finds); else `not_found` or `ambiguous` with name and date only. */
function pick<T extends { id: string }>(list: T[], ref: PersonRef, names: (x: T) => (string | undefined)[], describe: (x: T) => { name: string; date: string }, what: string): T {
  if (ref.id !== undefined) return list.find((x) => x.id === ref.id) ?? fail('not_found', `no such ${what}`)
  if (typeof ref.match !== 'string' || !foldName(ref.match)) return invalid('id or match', 'is required')
  const needle = foldName(ref.match)
  const folded = (x: T) => names(x).filter((n): n is string => !!n).map(foldName).filter(Boolean)
  const exact = list.filter((x) => folded(x).includes(needle))
  const hits = exact.length ? exact : list.filter((x) => folded(x).some((n) => n.includes(needle)))
  if (hits.length === 1) return hits[0]
  if (!hits.length) return fail('not_found', `no ${what} matches "${ref.match}"`)
  return fail('ambiguous', `${hits.length} ${what}s match "${ref.match}"; use one of their ids`, { candidates: hits.map((x) => ({ id: x.id, ...describe(x) })) })
}

const personNames = (p: Person) => [p.hebrewName, p.displayName?.en, p.displayName?.he]
const describePerson = (p: Person) => ({ name: nameText(p), date: dateText(p) })

function hebrewDay(v: unknown): HebrewMonthDay {
  if (!isObject(v)) return invalid('hebrew', 'must be { day, month, year? }')
  const h = { day: v.day, month: v.month, ...(v.year !== undefined && { year: v.year }) } as HebrewMonthDay
  return isRealMonthDay(h) ? h : invalid('hebrew', 'is not a real Hebrew date')
}

/** Names and dates from the fields given on top of an existing entry; giving either date replaces both. */
function personFields(op: PersonFields, old: Person | undefined, kind: 'yahrzeit' | OccasionKind): Omit<Person, 'id' | 'origin'> {
  const hebrewName = op.hebrewName === undefined ? old?.hebrewName : op.hebrewName === null ? undefined : str('hebrewName', op.hebrewName) || undefined
  const displayName = patched(op, 'displayName', (v) => loc('displayName', v), old?.displayName)
  if (!hebrewName && !displayName) invalid('name', 'is required (hebrewName or displayName)')
  let hebrew = old?.hebrew
  let gregorian = old?.gregorian
  const h = op.hebrew === undefined || op.hebrew === null ? undefined : hebrewDay(op.hebrew)
  const g = op.gregorian === undefined || op.gregorian === null ? undefined : realDate('gregorian', op.gregorian)
  if (h || g) {
    hebrew = h
    gregorian = g
    if (kind === 'yahrzeit') {
      // A yahrzeit is kept by its Hebrew date and stores both when it can.
      hebrew ??= gregorianToHebrew(g!)
      if (!gregorian && hebrew.year !== undefined) gregorian = hebrewToGregorian({ ...hebrew, year: hebrew.year })
    }
  } else if (!hebrew && !gregorian) invalid('hebrew or gregorian', 'a date is required')
  return {
    ...(hebrewName && { hebrewName }),
    ...(displayName && { displayName }),
    ...(hebrew && { hebrew }),
    ...(gregorian && { gregorian }),
    ...((op.hideFromBulletin ?? old?.hideFromBulletin) && { hideFromBulletin: true }),
  } as Omit<Person, 'id' | 'origin'>
}

function sameDate(a: Person, b: Person) {
  const x = resolveOccasion(a as Occasion)
  const y = resolveOccasion(b as Occasion)
  return (x.hebrew && y.hebrew && x.hebrew.day === y.hebrew.day && x.hebrew.month === y.hebrew.month) || (!!x.gregorian && x.gregorian === y.gregorian)
}

function personOp(s: Schedule, op: Extract<Operation, { op: `yahrzeit.${string}` | `occasion.${string}` }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const kind = op.op.startsWith('yahrzeit') ? 'yahrzeit' : (op as { kind: OccasionKind }).kind
  if (kind !== 'yahrzeit' && kind !== 'birthday' && kind !== 'anniversary') return invalid('kind', 'must be birthday or anniversary')
  const key: ListKey = kind === 'yahrzeit' ? 'yahrzeits' : kind === 'birthday' ? 'birthdays' : 'anniversaries'
  const what = kind
  const list = ed.list<Person>(key)
  const action = op.op.split('.')[1]
  if (action === 'add') {
    if (list.length >= LIMITS.people) return fail('limit', `this shul already has ${LIMITS.people} ${what}s`)
    const fields = personFields(op as PersonFields, undefined, kind)
    const by = (op as { by?: unknown }).by
    if (by !== undefined && by !== 'hebrew' && by !== 'gregorian') invalid('by', 'must be hebrew or gregorian')
    const person = { id: ed.newId(key), ...fields, ...(kind !== 'yahrzeit' && by ? { by } : {}), origin: OWN(ctx) } as Person
    const twin = list.find((x) => personNames(x).some((n) => n && personNames(person).some((m) => m && foldName(m) === foldName(n))) && sameDate(x, person))
    if (twin) return fail('conflict', `${what} already on the list`, { id: twin.id, ...describePerson(twin) })
    ed.put(key, person)
    return ed.result(person.id)
  }
  const old = pick(list, op as PersonRef, personNames, describePerson, what)
  if (action === 'delete') {
    ed.remove(key, old.id)
    return ed.result(old.id)
  }
  const fields = personFields(op as PersonFields, old, kind)
  const by = kind === 'yahrzeit' ? undefined : patched(op, 'by', (v) => (v === 'hebrew' || v === 'gregorian' ? v : invalid('by', 'must be hebrew or gregorian')), (old as Occasion).by)
  ed.put(key, { id: old.id, ...fields, ...(by && { by }), origin: OWN(ctx) } as Person)
  return ed.result(old.id)
}

const cholehNames = (c: Choleh) => [c.name.en, c.name.he]
const describeCholeh = (c: Choleh) => ({ name: [c.name.en, c.name.he].filter(Boolean).join(' / '), date: c.added })

function cholimOp(s: Schedule, op: Extract<Operation, { op: `cholim.${string}` }>, ctx: OperationContext): ApplyResult {
  const ed = new Editor(s, ctx)
  const list = ed.list<Choleh>('cholim')
  if (op.op === 'cholim.add') {
    const name = loc('name', op.name)
    if (!name) return invalid('name', 'is required')
    if (list.length >= LIMITS.cholim) return fail('limit', `the refuah list is full (${LIMITS.cholim} names); remove some first`)
    const twin = list.find((c) => cholehNames(c).some((n) => n && cholehNames({ name } as Choleh).some((m) => m && foldName(m) === foldName(n))))
    if (twin) return fail('conflict', 'that name is already on the list; renew it instead', { id: twin.id, ...describeCholeh(twin) })
    const choleh: Choleh = { id: ed.newId('cholim'), name, added: ctx.today }
    ed.put('cholim', choleh)
    return ed.result(choleh.id)
  }
  const old = pick(list, op, cholehNames, describeCholeh, 'name on the refuah list')
  if (op.op === 'cholim.remove') ed.remove('cholim', old.id)
  else ed.put('cholim', { ...old, added: ctx.today })
  return ed.result(old.id)
}

// ---------------------------------------------------------------------------
// Entry points

/**
 * Applies one operation to a schedule, purely: the new schedule with what it replaced (`before`) and put there
 * (`after`), or an error and nothing changed. The caller still runs `scheduleProblem` on the result and saves it.
 */
export function applyOperation(schedule: Schedule, op: Operation, ctx: OperationContext): ApplyResult {
  try {
    if (!isObject(op) || typeof op.op !== 'string') return invalid('op', 'is required')
    const o = op as Operation
    switch (o.op) {
      case 'sponsor.create':
        return sponsorCreate(schedule, o, ctx)
      case 'sponsor.update':
        return sponsorUpdate(schedule, o, ctx)
      case 'sponsor.delete':
        return sponsorDelete(schedule, o, ctx)
      case 'notice.create':
        return noticeCreate(schedule, o, ctx)
      case 'notice.update':
        return noticeUpdate(schedule, o, ctx)
      case 'notice.delete':
        return noticeDelete(schedule, o, ctx)
      case 'change.cancel':
      case 'change.retime':
      case 'change.note':
      case 'change.delete':
        return change(schedule, o, ctx)
      case 'event.create':
        return eventCreate(schedule, o, ctx)
      case 'event.update':
        return eventUpdate(schedule, o, ctx)
      case 'event.delete':
        return eventDelete(schedule, o, ctx)
      case 'yahrzeit.add':
      case 'yahrzeit.update':
      case 'yahrzeit.delete':
      case 'occasion.add':
      case 'occasion.update':
      case 'occasion.delete':
        return personOp(schedule, o, ctx)
      case 'cholim.add':
      case 'cholim.remove':
      case 'cholim.renew':
        return cholimOp(schedule, o, ctx)
      default:
        return invalid('op', `${String((o as { op: unknown }).op)} is not an operation`)
    }
  } catch (e) {
    if (e instanceof OpError) return { error: { code: e.code, message: e.message, ...(e.details !== undefined && { details: e.details }) } }
    throw e
  }
}

/** Deep equality as JSON sees it: key order and undefined values don't matter. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]))
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((k) => same(a[k], b[k]))
  }
  return a === b
}

export type RevertResult = { schedule: Schedule } | { conflict: { message: string; ids: string[] } }

/**
 * Undoes a change if what it left is still there exactly as it left it (`after`), and nothing has taken the place
 * of what it removed; otherwise says what has changed and touches nothing.
 */
export function revertOperation(schedule: Schedule, change: Pick<Change, 'before' | 'after'> & { op?: Operation }): RevertResult {
  const lists: Record<ListKey, { id: string }[]> = {
    notices: [...schedule.notices],
    exceptions: [...schedule.exceptions],
    yahrzeits: [...(schedule.yahrzeits ?? [])],
    birthdays: [...(schedule.birthdays ?? [])],
    anniversaries: [...(schedule.anniversaries ?? [])],
    cholim: [...(schedule.cholim ?? [])],
  }
  const changed: string[] = []
  for (const { list, item } of change.after) {
    const now = lists[list].find((x) => x.id === item.id)
    if (!now || !same(now, item)) changed.push(item.id)
  }
  for (const { list, item } of change.before)
    if (!change.after.some((a) => a.list === list && a.item.id === item.id) && lists[list].some((x) => x.id === item.id)) changed.push(item.id)
  if (changed.length) return { conflict: { message: 'it has been changed since', ids: changed } }
  const touched = new Set<ListKey>()
  for (const { list, item } of change.after) {
    const was = change.before.find((b) => b.list === list && b.item.id === item.id)
    const i = lists[list].findIndex((x) => x.id === item.id)
    if (was) lists[list][i] = was.item
    else lists[list].splice(i, 1)
    touched.add(list)
  }
  for (const { list, item } of change.before)
    if (!change.after.some((a) => a.list === list && a.item.id === item.id)) {
      lists[list].push(item)
      touched.add(list)
    }
  const next: Schedule = { ...schedule }
  for (const key of touched) (next as unknown as Record<string, unknown>)[key] = lists[key]
  return { schedule: next }
}
