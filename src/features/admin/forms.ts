import {
  guessAudience,
  guessCategory,
  type Audience,
  type Condition,
  type DayTag,
  type EventCategory,
  type EventDef,
  type Notice,
  type RelativeTo,
  type RoundMode,
  type Rule,
  type TimeExpr,
  type Weekday,
  type ZmanId,
} from '@beitecha/engine'

// ---------------------------------------------------------------------------
// Clock input: gabbaim type "6:30", "6:30pm", "18:30".

/** `HH:MM` (24-hour) from loose input, or null. A bare "6:30" is AM. */
export function parseClockInput(input: string): string | null {
  const m = /^\s*(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?\s*$/i.exec(input)
  if (!m) return null
  let h = +m[1]
  const min = m[2] ? +m[2] : 0
  const suffix = m[3]?.toLowerCase()
  if (min > 59) return null
  if (suffix) {
    if (h < 1 || h > 12) return null
    if (suffix.startsWith('p') && h !== 12) h += 12
    if (suffix.startsWith('a') && h === 12) h = 0
  } else if (h > 23) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** `18:30` → `6:30 PM`. */
export function clockLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// ---------------------------------------------------------------------------
// Conditions as "on any of these, except these".

export type Atom =
  | { kind: 'weekday'; day: Weekday }
  | { kind: 'tag'; tag: DayTag }
  | { kind: 'holiday'; name: string }
  | { kind: 'localHoliday'; id: string }
  | { kind: 'dates'; from: string; to: string }

export interface ConditionForm {
  /** Empty = every day. */
  include: Atom[]
  exclude: Atom[]
}

function atomsOf(c: Condition): Atom[] | null {
  if ('weekday' in c) return c.weekday.map((day) => ({ kind: 'weekday', day }))
  if ('tag' in c) return [{ kind: 'tag', tag: c.tag }]
  if ('holiday' in c) return [{ kind: 'holiday', name: c.holiday }]
  if ('localHoliday' in c) return [{ kind: 'localHoliday', id: c.localHoliday }]
  if ('dates' in c) return [{ kind: 'dates', ...c.dates }]
  if ('any' in c) {
    const out: Atom[] = []
    for (const part of c.any) {
      const atoms = atomsOf(part)
      if (!atoms) return null
      out.push(...atoms)
    }
    return out
  }
  return null
}

/** The form for a rule's `when`, or null when it's too intricate for the form (edit as JSON). */
export function conditionToForm(c: Condition | undefined): ConditionForm | null {
  if (!c) return { include: [], exclude: [] }
  if ('not' in c) {
    const exclude = atomsOf(c.not)
    return exclude ? { include: [], exclude } : null
  }
  if ('all' in c) {
    let include: Atom[] = []
    let exclude: Atom[] = []
    for (const part of c.all) {
      if ('not' in part) {
        const atoms = atomsOf(part.not)
        if (!atoms) return null
        exclude = [...exclude, ...atoms]
      } else {
        const atoms = atomsOf(part)
        // Two positive parts would be an AND; the form only says OR.
        if (!atoms || include.length) return null
        include = atoms
      }
    }
    return { include, exclude }
  }
  const include = atomsOf(c)
  return include ? { include, exclude: [] } : null
}

function atomsToCondition(atoms: Atom[]): Condition {
  const parts: Condition[] = []
  const days = atoms.flatMap((a) => (a.kind === 'weekday' ? [a.day] : []))
  if (days.length) parts.push({ weekday: [...new Set(days)].sort() as Weekday[] })
  for (const a of atoms) {
    if (a.kind === 'tag') parts.push({ tag: a.tag })
    if (a.kind === 'holiday') parts.push({ holiday: a.name })
    if (a.kind === 'localHoliday') parts.push({ localHoliday: a.id })
    if (a.kind === 'dates') parts.push({ dates: { from: a.from, to: a.to } })
  }
  return parts.length === 1 ? parts[0] : { any: parts }
}

export function formToCondition(form: ConditionForm): Condition | undefined {
  const include = form.include.length ? atomsToCondition(form.include) : undefined
  const exclude = form.exclude.length ? ({ not: atomsToCondition(form.exclude) } as Condition) : undefined
  if (include && exclude) return { all: [include, exclude] }
  return include ?? exclude
}

export const sameAtom = (a: Atom, b: Atom) => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------
// Time expressions as "the earliest/latest of these, same all week, clamped, rounded".

export type Source =
  | { type: 'clock'; clock: string }
  | { type: 'zman'; zman: ZmanId; offset: number }
  | { type: 'event'; event: string; offset: number }

export interface TimeForm {
  sources: Source[]
  combine: 'earliest' | 'latest'
  weekly?: { pick: 'earliest' | 'latest'; days: Weekday[] }
  notBefore?: string
  notAfter?: string
  round?: { to: number; mode: RoundMode }
}

const DEFAULT_WEEK: Weekday[] = [0, 1, 2, 3, 4, 5]

function sourceOf(e: TimeExpr): Source | null {
  if ('clock' in e) return { type: 'clock', clock: e.clock }
  if ('zman' in e) return { type: 'zman', zman: e.zman, offset: 0 }
  if ('event' in e) return { type: 'event', event: e.event, offset: 0 }
  if ('offset' in e) {
    const inner = sourceOf(e.of)
    if (!inner || inner.type === 'clock') return null
    return { ...inner, offset: inner.offset + e.offset }
  }
  return null
}

/** The form for a rule's time, or null when the expression is beyond it (edit as JSON). */
export function timeToForm(expr: TimeExpr): TimeForm | null {
  const form: TimeForm = { sources: [], combine: 'earliest' }
  let e = expr
  if ('round' in e) {
    form.round = { to: e.to, mode: e.mode }
    e = e.round
  }
  if ('clamp' in e) {
    if (e.min && !('clock' in e.min)) return null
    if (e.max && !('clock' in e.max)) return null
    form.notBefore = e.min && 'clock' in e.min ? e.min.clock : undefined
    form.notAfter = e.max && 'clock' in e.max ? e.max.clock : undefined
    e = e.clamp
  }
  if ('weekly' in e) {
    form.weekly = { pick: e.pick, days: e.days ?? DEFAULT_WEEK }
    e = e.weekly
  }
  const list = 'earliest' in e ? e.earliest : 'latest' in e ? e.latest : [e]
  if ('latest' in e) form.combine = 'latest'
  for (const item of list) {
    const s = sourceOf(item)
    if (!s) return null
    form.sources.push(s)
  }
  return form.sources.length ? form : null
}

function sourceToExpr(s: Source): TimeExpr {
  if (s.type === 'clock') return { clock: s.clock }
  const base: TimeExpr = s.type === 'zman' ? { zman: s.zman } : { event: s.event }
  return s.offset ? { offset: s.offset, of: base } : base
}

export function formToTime(form: TimeForm): TimeExpr {
  const items = form.sources.map(sourceToExpr)
  let e: TimeExpr = items.length === 1 ? items[0] : form.combine === 'earliest' ? { earliest: items } : { latest: items }
  if (form.weekly) {
    const sameAsDefault = form.weekly.days.join() === DEFAULT_WEEK.join()
    e = { weekly: e, pick: form.weekly.pick, ...(sameAsDefault ? {} : { days: form.weekly.days }) }
  }
  if (form.notBefore || form.notAfter) {
    e = {
      clamp: e,
      ...(form.notBefore ? { min: { clock: form.notBefore } } : {}),
      ...(form.notAfter ? { max: { clock: form.notAfter } } : {}),
    }
  }
  if (form.round) e = { round: e, to: form.round.to, mode: form.round.mode }
  return e
}

// ---------------------------------------------------------------------------
// Event details: guessed from the name until the gabbai says otherwise.

type Details = Pick<EventDef, 'name' | 'kind' | 'category' | 'audience'>

/** The category shown for an event, and whether it's only the name's guess. Minyanim and shiurim have none. */
export function categoryChoice(e: Details): { value?: EventCategory; guessed: boolean } {
  return { value: guessCategory(e), guessed: e.kind === 'other' && !e.category }
}

/** Who an event is shown as being for (`everyone` when nothing says), and whether it's only the name's guess. */
export function audienceChoice(e: Details): { value: Audience; guessed: boolean } {
  return { value: guessAudience(e) ?? 'everyone', guessed: !e.audience }
}

/** Whole minutes from "75", undefined when empty, null when it isn't a length. */
export function parseMinutes(input: string): number | undefined | null {
  if (!input.trim()) return undefined
  const n = Number(input.trim())
  return Number.isInteger(n) && n > 0 && n < 24 * 60 ? n : null
}

/** What's wrong with a link the gabbai typed, or null. */
export function linkProblem(input: string): string | null {
  if (!input.trim()) return null
  return /^https:\/\/[^\s/]+\.\S+$/i.test(input.trim()) ? null : 'A web address starting https://'
}

// ---------------------------------------------------------------------------
// How a rule's time is said: as the time implies ("after Maariv"), just the time, or between two minyanim.

export type SaidForm =
  | { mode: 'auto' }
  | { mode: 'none' }
  | { mode: 'between'; between: [string, string] }
  /** An explicit after/before, written as JSON; the form leaves it be. */
  | { mode: 'other'; value: RelativeTo }

export function saidToForm(r: Rule['relative']): SaidForm {
  if (r === undefined) return { mode: 'auto' }
  if (r === null) return { mode: 'none' }
  if ('between' in r) return { mode: 'between', between: r.between }
  return { mode: 'other', value: r }
}

export function formToSaid(f: SaidForm): Rule['relative'] {
  if (f.mode === 'auto') return undefined
  if (f.mode === 'none') return null
  if (f.mode === 'between') return { between: f.between }
  return f.value
}

// ---------------------------------------------------------------------------
// What a sponsorship is for.

export type SponsorTarget = { kind: 'event'; eventId: string } | { kind: 'day' } | { kind: 'notices' }

export function sponsorTarget(n: Notice): SponsorTarget {
  if (n.eventId) return { kind: 'event', eventId: n.eventId }
  return n.sponsors === 'notices' ? { kind: 'notices' } : { kind: 'day' }
}

export function withSponsorTarget(n: Notice, t: SponsorTarget): Notice {
  const { eventId: _e, sponsors: _s, ...rest } = n
  if (t.kind === 'event') return { ...rest, eventId: t.eventId }
  return t.kind === 'notices' ? { ...rest, sponsors: 'notices' } : rest
}

/** A notice of another kind keeps only what that kind uses: a sponsorship's target, a reminder's event. */
export function withNoticeKind(n: Notice, kind: Notice['kind']): Notice {
  const { eventId, sponsors: _s, ...rest } = n
  if (kind === 'sponsor') return { ...n, kind }
  return kind === 'reminder' && eventId ? { ...rest, kind, eventId } : { ...rest, kind }
}
