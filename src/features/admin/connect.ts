import {
  civilDateShort,
  nowMinutesIn,
  type Entry,
  type Localized,
  type Operation,
  type Scope,
} from '@beitecha/engine'

import type { Connection, ConnectionMode } from '@/lib/api'

// Pure helpers for the admin's "Connect" sections: wording for operations, scopes and times.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const SCOPE_LABELS: Record<Scope, string> = {
  sponsors: 'Sponsorships',
  notices: 'Notices',
  changes: 'One-time changes',
  events: 'One-time events',
  yahrzeits: 'Yahrzeits',
  occasions: 'Birthdays & anniversaries',
  cholim: 'Refuah shleimah',
}

/** In the order the admin lists them; refuah names are opt-in. */
export const ALL_SCOPES: Scope[] = [
  'sponsors',
  'notices',
  'changes',
  'events',
  'yahrzeits',
  'occasions',
  'cholim',
]
export const DEFAULT_SCOPES: Scope[] = ALL_SCOPES.filter((s) => s !== 'cholim')

export const MODE_LABELS: Record<ConnectionMode, string> = {
  publish: 'Post right away',
  review: 'Ask a gabbai first',
}

export const PURPOSE_LABELS: Record<string, string> = {
  skill: 'Claude skill',
  script: 'Script',
  other: 'Other',
}

export const scopeList = (scopes: Scope[]) =>
  scopes.length ? scopes.map((s) => SCOPE_LABELS[s] ?? s).join(', ') : 'Nothing'

/** "just now", "5 min ago", "3 hr ago", "2 days ago", "3 mo ago"; `null` is "never". */
export function relativeTime(at: number | null, now: number): string {
  if (at === null) return 'never'
  const diff = Math.max(0, now - at)
  if (diff < 2 * MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`
  if (diff < 2 * DAY) return `${Math.round(diff / HOUR)} hr ago`
  if (diff < 60 * DAY) return `${Math.round(diff / DAY)} days ago`
  return `${Math.round(diff / (30 * DAY))} mo ago`
}

export const EXPIRY_WARN_DAYS = 14

export type ExpiryState =
  { state: 'none' } | { state: 'ok' | 'soon'; days: number } | { state: 'expired' }

/** `soon` within 14 days of expiring. */
export function expiryState(expiresAt: number | null, now: number): ExpiryState {
  if (expiresAt === null) return { state: 'none' }
  if (expiresAt <= now) return { state: 'expired' }
  const days = Math.ceil((expiresAt - now) / DAY)
  return { state: days <= EXPIRY_WARN_DAYS ? 'soon' : 'ok', days }
}

export function expiryText(e: ExpiryState): string {
  if (e.state === 'none') return 'Never expires'
  if (e.state === 'expired') return 'Expired'
  return e.days === 1 ? 'Expires tomorrow' : `Expires in ${e.days} days`
}

export const NEW_DAYS = 7

/** Connections other people made in the last week, newest first: what stands in for telling an owner. */
export function newConnectionsByOthers(
  connections: Connection[],
  now: number,
  days = NEW_DAYS,
): Connection[] {
  return connections
    .filter((c) => !c.mine && c.revokedAt === null && now - c.createdAt <= days * DAY)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const newConnectionNote = (c: Connection, now: number) =>
  `${c.userName ?? 'A gabbai'} created “${c.label}” ${relativeTime(c.createdAt, now)}`

/** A change or connection record's label, or a plain stand-in. */
export const viaLabel = (connections: Connection[], connectionId: string) =>
  connections.find((c) => c.id === connectionId)?.label ?? 'an assistant'

export type SinceChoice = 'hour' | 'today' | 'week'

export const SINCE_CHOICES: { key: SinceChoice; label: string }[] = [
  { key: 'hour', label: 'The last hour' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'The last 7 days' },
]

/** When "since…" starts, in ms. Today is midnight in the shul's time zone. */
export function sinceTime(choice: SinceChoice, now: number, timeZone: string): number {
  if (choice === 'hour') return now - HOUR
  if (choice === 'week') return now - 7 * DAY
  return now - nowMinutesIn(timeZone, new Date(now)) * MINUTE - (now % MINUTE)
}

/** A `YYYY-MM-DD` the gabbai typed, as the start of that day in the browser; `null` when it isn't a date. */
export function sinceDate(text: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const [y, m, d] = text.split('-').map(Number)
  const at = new Date(y, m - 1, d).getTime()
  return Number.isFinite(at) ? at : null
}

/** "It no longer fits: …" from the server's lowercase message. */
export const sentence = (message: string) => message.charAt(0).toUpperCase() + message.slice(1)

// ---------------------------------------------------------------------------
// Operations in plain English

const text = (v: string | Localized | null | undefined): string =>
  v == null ? '' : typeof v === 'string' ? v.trim() : (v.en || v.he || '').trim()

const quote = (s: string) => (s ? `“${s}”` : '')

const KIND_NAMES: Record<string, string> = {
  announcement: 'announcement',
  reminder: 'reminder',
  simcha: 'mazal tov notice',
  condolence: 'condolence notice',
}

/** "Oct 19", or the text as it came if it isn't a date. */
const day = (d: string | undefined): string => {
  if (!d) return ''
  try {
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? civilDateShort(d) : d
  } catch {
    return d
  }
}

const range = (from?: string, to?: string) =>
  from && to && to !== from ? `${day(from)} to ${day(to)}` : day(from ?? to)

/** What a `ref` or `eventId` + `date` means, with the event's name when the caller can say it. */
export interface Names {
  event?: (id: string) => string | undefined
}

function targetOf(t: { ref?: string; eventId?: string; date?: string }, names?: Names): string {
  let id = t.eventId
  let date = t.date
  if (t.ref) {
    const at = t.ref.lastIndexOf('@')
    if (at > 0) {
      id = id ?? t.ref.slice(0, at)
      date = date ?? t.ref.slice(at + 1)
    } else id = id ?? t.ref
  }
  const name = (id && names?.event?.(id)) || (id ? 'the event' : '')
  return [name, date ? `on ${day(date)}` : ''].filter(Boolean).join(' ')
}

/** The best short name for one list item, whichever list it is from. */
export function entryLabel(entry: Entry | undefined): string {
  if (!entry) return ''
  const i = entry.item as unknown as Record<string, unknown>
  const loc = (k: string) => text(i[k] as Localized | undefined)
  switch (entry.list) {
    case 'notices':
      return loc('title') || loc('sponsoredBy') || loc('text')
    case 'exceptions': {
      const ev = i.event as { name?: Localized } | undefined
      const what = i.type === 'add' ? text(ev?.name) : String(i.type ?? '')
      return [what, i.date ? day(String(i.date)) : ''].filter(Boolean).join(' · ')
    }
    case 'cholim':
      return loc('name')
    default:
      return loc('displayName') || String(i.hebrewName ?? '')
  }
}

const who = (p: { id?: string; match?: string }, before?: Entry[]) =>
  p.match ? quote(p.match) : entryLabel(before?.[0]) ? quote(entryLabel(before?.[0])) : 'an entry'

const person = (p: {
  displayName?: string | Localized | null
  hebrewName?: string | null
  hebrew?: { day: number; month: number; year?: number } | null
  gregorian?: string | null
}) => {
  const name = text(p.displayName) || p.hebrewName || 'someone'
  return `${quote(name)}${p.gregorian ? ` (${day(p.gregorian)})` : ''}`
}

const sponsorLine = (o: {
  sponsoredBy?: string | Localized | null
  inHonorOf?: string | Localized | null
  text?: string | Localized | null
}) => {
  const by = text(o.sponsoredBy)
  const honor = text(o.inHonorOf)
  const free = text(o.text)
  const line = [by, honor ? `in honor of ${honor}` : ''].filter(Boolean).join(' ')
  return line || free
}

/**
 * One operation as a sentence a gabbai can read. `before` (the entries it replaced, known once applied) names what an
 * edit or removal by id was about; `names.event` turns an event id into its name.
 */
export function describeOperation(op: Operation, before?: Entry[], names?: Names): string {
  switch (op.op) {
    case 'sponsor.create': {
      const for_ =
        op.ref || op.eventId
          ? targetOf(op, names)
          : op.sponsors === 'notices'
            ? `the notices, ${range(op.from, op.to)}`
            : `the day, ${range(op.from, op.to)}`
      const line = sponsorLine(op)
      return `${op.replace ? 'Replace the sponsorship' : 'Add a sponsorship'} for ${for_}${line ? `: ${line}` : ''}`
    }
    case 'sponsor.update': {
      const line = sponsorLine(op)
      const where = op.ref || op.eventId ? ` for ${targetOf(op, names)}` : ''
      return `Change the sponsorship${where}${line ? ` to: ${line}` : ''}`
    }
    case 'sponsor.delete': {
      const where = op.ref || op.eventId ? ` for ${targetOf(op, names)}` : ''
      const was = entryLabel(before?.[0])
      return `Remove the sponsorship${where}${!where && was ? ` ${quote(was)}` : ''}`
    }
    case 'notice.create': {
      const kind = KIND_NAMES[op.kind] ?? 'notice'
      const title = text(op.title)
      const body = text(op.text)
      const when = range(op.from, op.to)
      return `Post a ${kind}${title ? ` ${quote(title)}` : ''}: ${body}${when ? ` (${when})` : ''}`
    }
    case 'notice.update': {
      const was = entryLabel(before?.[0])
      const parts = [
        op.title !== undefined && `title ${op.title === null ? 'removed' : quote(text(op.title))}`,
        op.text !== undefined && `text “${text(op.text)}”`,
        (op.from || op.to) && `shown ${range(op.from, op.to)}`,
      ].filter(Boolean)
      return `Change the notice${was ? ` ${quote(was)}` : ''}${parts.length ? `: ${parts.join('; ')}` : ''}`
    }
    case 'notice.delete': {
      const was = entryLabel(before?.[0])
      return `Remove the notice${was ? ` ${quote(was)}` : ''}`
    }
    case 'change.cancel':
      return `Cancel ${targetOf(op, names)}${op.note ? ` (${text(op.note)})` : ''}`
    case 'change.retime':
      return `Move ${targetOf(op, names)} to ${op.time}${op.note ? ` (${text(op.note)})` : ''}`
    case 'change.note':
      return `Add a note to ${targetOf(op, names)}: ${text(op.note)}`
    case 'change.delete':
      return `Undo the ${op.type ?? 'one-time'} change to ${targetOf(op, names)}`
    case 'event.create': {
      const bits = [op.date && day(op.date), op.time, text(op.room), text(op.location)].filter(
        Boolean,
      )
      return `Add a one-time event ${quote(text(op.name))} (${bits.join(', ')})`
    }
    case 'event.update': {
      const was = entryLabel(before?.[0])
      const bits = [
        op.name !== undefined && `name ${quote(text(op.name))}`,
        op.date && `on ${day(op.date)}`,
        op.time && `at ${op.time}`,
        op.room !== undefined && `room ${op.room ?? 'removed'}`,
      ].filter(Boolean)
      return `Change the event${was ? ` ${quote(was)}` : ''}${bits.length ? `: ${bits.join(', ')}` : ''}`
    }
    case 'event.delete': {
      const was = entryLabel(before?.[0])
      return `Remove the event${was ? ` ${quote(was)}` : ''}`
    }
    case 'yahrzeit.add':
      return `Add a yahrzeit for ${person(op)}`
    case 'yahrzeit.update':
      return `Change the yahrzeit of ${who(op, before)}${op.gregorian || op.hebrew ? ' (new date)' : ''}`
    case 'yahrzeit.delete':
      return `Remove the yahrzeit of ${who(op, before)}`
    case 'occasion.add':
      return `Add a ${op.kind} for ${person(op)}`
    case 'occasion.update':
      return `Change the ${op.kind} of ${who(op, before)}${op.gregorian || op.hebrew ? ' (new date)' : ''}`
    case 'occasion.delete':
      return `Remove the ${op.kind} of ${who(op, before)}`
    case 'cholim.add':
      return `Add ${quote(text(op.name))} to the refuah shleimah list`
    case 'cholim.remove':
      return `Take ${who(op, before)} off the refuah shleimah list`
    case 'cholim.renew':
      return `Keep ${who(op, before)} on the refuah shleimah list for another month`
    default:
      return `Change the schedule (${(op as { op: string }).op})`
  }
}

/** "Was: …" and "Now: …" lines for an applied change, when the entries say anything. */
export function beforeAfter(before: Entry[], after: Entry[]): { was?: string; now?: string } {
  const was = before.map(entryLabel).filter(Boolean).join(', ')
  const now = after.map(entryLabel).filter(Boolean).join(', ')
  return { ...(was && { was }), ...(now && { now }) }
}
