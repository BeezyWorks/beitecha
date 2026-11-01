import {
  AUDIENCES,
  Calendar,
  type DateString,
  EVENT_CATEGORIES,
  type EventDef,
  type Exception,
  type Notice,
  NOTICE_KINDS,
  type Rule,
  type Schedule,
  type ShulProfile,
  WEEKDAYS,
} from '@beitecha/engine'

import { aiReference, checkRule, CLOCK, DATE, extractJson, isObj, parseEventList } from './aiSetup'
import { withSponsorText } from './forms'

// ---------------------------------------------------------------------------
// Prompts and parsers for one thing at a time: an event, a rule, a one-time event, a notice.
// The whole-schedule setup lives in aiSetup.ts; these reuse its format and checks.

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] }

/** A one-time event: an `add` exception, as the Events tab keeps them. */
export type DatedEvent = Extract<Exception, { type: 'add' }>

const HOW_TO_ANSWER = (shape: string) => `How to answer:
1. If something important is unclear, ask a short question first. Otherwise go straight to the JSON.
2. Reply with ONE JSON code block holding ${shape}.
3. After it, say in a line or two of plain words what it does, so the gabbai can check you understood.
4. If Beitecha reports problems and the gabbai pastes them back to you, fix them and send the whole JSON again.`

const request = (r: string) => `The gabbai's request:

${r || '(The gabbai will write it in the next message.)'}
`

/** The other events by id, for anchoring a time on one ("30 minutes before Mincha") or sponsoring it. */
function eventIndex(events: EventDef[]): string {
  if (!events.length) return '  (none)'
  return events
    .map(
      (e) =>
        `  ${e.id}: ${e.adminName ? `${e.adminName}, shown as ${e.name.en}` : e.name.en} (${e.kind === 'tefila' ? `minyan, ${e.tefila}` : e.kind})`,
    )
    .join('\n')
}

/** The coming days in words, so an AI can turn "this Shabbos" or "Chanukah" into dates. */
function comingDays(schedule: Schedule, today: DateString, days: number): string {
  return new Calendar(schedule)
    .range(today, days)
    .map((d) => {
      const extra = [
        ...d.holidays.map((h) => h.en),
        ...(d.weekday === 6 && d.parsha ? [`Parshas ${d.parsha.en}`] : []),
      ]
      return `  ${d.date} ${WEEKDAYS[d.weekday].en}, ${d.hebrew.en}${extra.length ? ` · ${extra.join(', ')}` : ''}`
    })
    .join('\n')
}

function json(text: string): Parsed<unknown> {
  try {
    return { ok: true, value: extractJson(text) }
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] }
  }
}

// ---------------------------------------------------------------------------
// A regular event (a minyan, a shiur, the Kiddush): a new one, or changes to one.

export function eventPrompt(
  schedule: Schedule,
  profile: ShulProfile,
  event: EventDef | null,
  ask: string,
): string {
  const others = schedule.events.filter((e) => e.id !== event?.id)
  const what = event
    ? `change one event, "${event.name.en}" (id "${event.id}"). Its current JSON is below.`
    : 'add new regular events (minyanim, shiurim, or things like Kiddush).'
  const shape = event
    ? `{ "events": [ … ] } with exactly ONE event: the whole changed "${event.name.en}", keeping "id": "${event.id}"`
    : '{ "events": [ … ] } with just the new events, each with a new id not already used'
  return `You are helping the gabbai of ${profile.name.en} ${what} Beitecha works out each day's times from rules over the Jewish calendar and zmanim.

${HOW_TO_ANSWER(shape)}

${aiReference(schedule)}

The shul's other events (ids you can time from with { "event": id }):
${eventIndex(others)}
${event ? `\nThe event now:\n\n${JSON.stringify(event, null, 2)}\n` : ''}
${request(ask)}`
}

/** One or more events from an AI's answer. A bare event object is taken as a list of one. */
export function parseEvents(text: string, zmanim?: ReadonlySet<string>): Parsed<EventDef[]> {
  const data = json(text)
  if (!data.ok) return data
  const v = data.value
  const list = Array.isArray(v)
    ? v
    : isObj(v) && Array.isArray(v.events)
      ? v.events
      : isObj(v) && 'rules' in v
        ? [v]
        : null
  if (!list) return { ok: false, errors: ['Expected { "events": [ … ] }.'] }
  const result = parseEventList(list, zmanim)
  return result.ok ? { ok: true, value: result.events } : result
}

// ---------------------------------------------------------------------------
// One rule of an event: "on these days, at this time".

export function rulePrompt(
  schedule: Schedule,
  profile: ShulProfile,
  event: EventDef,
  index: number | null,
  ask: string,
): string {
  const what =
    index === null
      ? `add one rule to "${event.name.en}": the days it covers and its time on them.`
      : `rewrite rule ${index + 1} of "${event.name.en}".`
  return `You are helping the gabbai of ${profile.name.en} ${what} Beitecha works out each day's times from rules over the Jewish calendar and zmanim. An event's rules are checked in order and the first that fits a day sets its time; a new rule goes before the catch-all rule (the one without "when"), so it only needs to say its own days.

${HOW_TO_ANSWER('{ "rule": { … } }: one Rule')}

${aiReference(schedule)}

The shul's other events (ids you can time from with { "event": id }):
${eventIndex(schedule.events.filter((e) => e.id !== event.id))}

"${event.name.en}" now:

${JSON.stringify(event, null, 2)}
${index !== null ? `\nThe rule to rewrite (rule ${index + 1}):\n\n${JSON.stringify(event.rules[index], null, 2)}\n` : ''}
${request(ask)}`
}

export function parseRule(text: string, zmanim?: ReadonlySet<string>): Parsed<Rule> {
  const data = json(text)
  if (!data.ok) return data
  const v = data.value
  const rule =
    isObj(v) && isObj(v.rule)
      ? v.rule
      : isObj(v) && Array.isArray(v.rules) && v.rules.length === 1
        ? v.rules[0]
        : v
  if (!isObj(rule) || !('time' in rule))
    return { ok: false, errors: ['Expected { "rule": { "when": …, "time": … } }.'] }
  const errors: string[] = []
  checkRule(rule, 'The rule', errors, zmanim)
  return errors.length ? { ok: false, errors } : { ok: true, value: rule as unknown as Rule }
}

// ---------------------------------------------------------------------------
// One-time events: a dinner, a Chanukah party, a guest speaker.

const ONE_TIME_SCHEMA = `{ "events": [
  {
    "date": "YYYY-MM-DD",
    "name": { "en": string, "he"?: string },
    "time": "HH:MM", // 24-hour
    "end"?: "HH:MM", // when it ends, if said
    "room"?: string, // a room in the shul
    "location"?: string, // only when it isn't at the shul: an address
    "category"?: "program" | "meal", // meal = a Kiddush, a dinner, a Melava Malka
    "audience"?: "men" | "women" | "kids" | "teens", // omit when it's for everyone
    "ages"?: { "en": string }, // who exactly: "Boys 1st–5th"
    "speaker"?: { "en": string }, // who speaks or runs it
    "topic"?: { "en": string },
    "link"?: "https://…", // to RSVP or for details
    "note"?: { "en": string } // a short note: "RSVP by Thursday"
  }
] }`

export function oneTimePrompt(
  schedule: Schedule,
  profile: ShulProfile,
  today: DateString,
  ask: string,
): string {
  return `You are helping the gabbai of ${profile.name.en} add one-time events (a dinner, a party, a guest speaker) to their shul's calendar in Beitecha. The gabbai may paste a flyer or message; take the events from it.

${HOW_TO_ANSWER('{ "events": [ … ] } in the format below')}

The format (plain JSON; "?" = optional, leave out what isn't said):

${ONE_TIME_SCHEMA}

Today is ${today}. The coming weeks, with Hebrew dates and holidays:
${comingDays(schedule, today, 70)}

${request(ask)}`
}

const str = (v: unknown) => typeof v === 'string' && v.trim() !== ''
const localized = (v: unknown) =>
  typeof v === 'string'
    ? v.trim()
      ? { en: v.trim() }
      : undefined
    : isObj(v) && str(v.en)
      ? (v as { en: string; he?: string })
      : undefined

/** One-time events from an AI's answer, ready for the schedule once each gets an id. */
export function parseOneTime(text: string): Parsed<DatedEvent[]> {
  const data = json(text)
  if (!data.ok) return data
  const v = data.value
  const list = Array.isArray(v)
    ? v
    : isObj(v) && Array.isArray(v.events)
      ? v.events
      : isObj(v)
        ? [v]
        : []
  if (!list.length) return { ok: false, errors: ['Expected { "events": [ … ] }.'] }
  const errors: string[] = []
  const events = list.map((raw: unknown, i: number): DatedEvent => {
    const e = isObj(raw) ? raw : {}
    const name = localized(e.name)
    const at = name ? `"${name.en}"` : `Event ${i + 1}`
    if (!name) errors.push(`${at}: needs a name`)
    if (!str(e.date) || !DATE.test(e.date as string))
      errors.push(`${at}: "date" must be "YYYY-MM-DD"`)
    if (!str(e.time) || !CLOCK.test(e.time as string))
      errors.push(`${at}: "time" must be "HH:MM", 24-hour`)
    if (e.end !== undefined && (!str(e.end) || !CLOCK.test(e.end as string)))
      errors.push(`${at}: "end" must be "HH:MM", 24-hour`)
    if (e.category !== undefined && !(EVENT_CATEGORIES as readonly unknown[]).includes(e.category))
      errors.push(`${at}: "category" must be "program" or "meal"`)
    if (e.audience !== undefined && !(AUDIENCES as readonly unknown[]).includes(e.audience))
      errors.push(`${at}: "audience" must be men, women, kids or teens`)
    if (e.link !== undefined && !/^https:\/\/\S+$/.test(String(e.link)))
      errors.push(`${at}: "link" must start https://`)
    const opt = <K extends string>(k: K, value: unknown) =>
      value === undefined ? {} : { [k]: value }
    return {
      id: '',
      date: e.date as DateString,
      type: 'add',
      event: {
        id: '',
        name: name ?? { en: '' },
        kind: 'other',
        ...opt('room', str(e.room) ? e.room : undefined),
        ...opt('location', str(e.location) ? e.location : undefined),
        ...opt('category', e.category),
        ...opt('audience', e.audience),
        ...opt('ages', localized(e.ages)),
        ...opt('speaker', localized(e.speaker)),
        ...opt('topic', localized(e.topic)),
        ...opt('link', e.link),
      },
      time: { clock: e.time as string },
      ...(str(e.end) && { end: { clock: e.end as string } }),
      ...opt('note', localized(e.note)),
    }
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: events }
}

// ---------------------------------------------------------------------------
// Notices: sponsorships, announcements, reminders, mazal tovs, condolences.

const NOTICE_SCHEMA = `{ "notices": [
  {
    "kind": "sponsor" | "announcement" | "reminder" | "simcha" | "condolence",
      // sponsor = a sponsorship (Kiddush, Seudah Shlishis, a shiur, the day's learning); simcha = a mazal tov;
      // condolence = shiva, a petira, a yahrzeit; reminder = something coming up; announcement = anything else
    "from": "YYYY-MM-DD", // first day it shows
    "to"?: "YYYY-MM-DD", // last day; omit for one day (a sponsorship shows on its day)
    "category"?: string, // an announcement's category: an id from the list below (omit for a general announcement)
    "eventId"?: string, // what a sponsorship is for, or what a reminder is about: an id from the list below
    "sponsors"?: "day" | "notices", // a sponsorship of no event: the day's learning ("day", the default) or the notices
    "title"?: { "en": string, "he"?: string }, // for a sponsorship: what's sponsored ("Kiddush")
    "sponsoredBy"?: { "en": string }, // for a sponsorship: who, "the Cohen family"
    "inHonorOf"?: { "en": string }, // for a sponsorship: why, the words after "in honor of": "Sarah's bas mitzvah"
    "text": { "en": string, "he"?: string }, // the notice itself; for a sponsorship the whole line:
      // "Sponsored by the Cohen family, in honor of Sarah's bas mitzvah". A Hebrew dedication (לע"נ…) goes in "he".
    "links"?: [{ "title": { "en": string, "he"?: string }, "url": "https://…" }]
      // printed as QR codes; the title says what scanning it does: "To sponsor a kiddush", "Download the shiur"
  }
] }`

export function noticePrompt(
  schedule: Schedule,
  profile: ShulProfile,
  today: DateString,
  ask: string,
): string {
  const weekly = schedule.events.filter((e) => e.kind !== 'tefila' && e.visibility !== 'internal')
  const oneTime = schedule.exceptions.flatMap((x) =>
    x.type === 'add' && x.date >= today
      ? [`  ${x.event.id}: ${x.event.name.en} (on ${x.date})`]
      : [],
  )
  const events = [...weekly.map((e) => `  ${e.id}: ${e.name.en} (every week)`), ...oneTime]
  const categories = schedule.settings.noticeCategories ?? []
  return `You are helping the gabbai of ${profile.name.en} put sponsorships and notices on their shul's display, printed week and Siddur page in Beitecha. The gabbai may paste a message, an email or a list; take each sponsorship or notice from it, keeping the wording warm and short.

${HOW_TO_ANSWER('{ "notices": [ … ] } in the format below')}

The format (plain JSON; "?" = optional):

${NOTICE_SCHEMA}

Events a notice can be about (eventId):
${events.length ? events.join('\n') : '  (none)'}

The shul's categories for announcements (category):
${categories.length ? categories.map((c) => `  ${c.id}: ${c.name.en}`).join('\n') : '  (none)'}

A sponsorship "this Shabbos" or of a weekly event (the Kiddush) is on that day: "from" is the Shabbos's date. A mazal tov or announcement usually shows for a week.

Today is ${today}. The coming weeks, with Hebrew dates and holidays:
${comingDays(schedule, today, 70)}

${request(ask)}`
}

/**
 * Notices from an AI's answer, ready for the schedule once each gets an id. `eventIds` and `categoryIds` are the ones
 * it may name.
 */
export function parseNotices(
  text: string,
  eventIds: string[],
  categoryIds: string[] = [],
): Parsed<Notice[]> {
  const data = json(text)
  if (!data.ok) return data
  const v = data.value
  const list = Array.isArray(v)
    ? v
    : isObj(v) && Array.isArray(v.notices)
      ? v.notices
      : isObj(v) && 'text' in v
        ? [v]
        : []
  if (!list.length) return { ok: false, errors: ['Expected { "notices": [ … ] }.'] }
  const errors: string[] = []
  const notices = list.map((raw: unknown, i: number): Notice => {
    const n = isObj(raw) ? raw : {}
    const text = localized(n.text)
    const title = localized(n.title)
    const sponsoredBy = n.kind === 'sponsor' ? localized(n.sponsoredBy) : undefined
    const inHonorOf = sponsoredBy && localized(n.inHonorOf)
    const at = `Notice ${i + 1}${title ? ` (${title.en})` : ''}`
    if (!(NOTICE_KINDS as readonly unknown[]).includes(n.kind))
      errors.push(`${at}: "kind" must be one of ${NOTICE_KINDS.join(', ')}`)
    if (!text && !sponsoredBy) errors.push(`${at}: needs "text"`)
    if (!str(n.from) || !DATE.test(n.from as string))
      errors.push(`${at}: "from" must be "YYYY-MM-DD"`)
    if (
      n.to !== undefined &&
      (!str(n.to) || !DATE.test(n.to as string) || (n.to as string) < (n.from as string))
    )
      errors.push(`${at}: "to" must be "YYYY-MM-DD", on or after "from"`)
    if (n.eventId !== undefined && !eventIds.includes(n.eventId as string))
      errors.push(`${at}: no event "${n.eventId}"; use an id from the list`)
    if (n.category !== undefined && !categoryIds.includes(n.category as string))
      errors.push(`${at}: no category "${n.category}"; use an id from the list`)
    else if (n.category !== undefined && n.kind !== 'announcement')
      errors.push(`${at}: only an announcement has a "category"`)
    if (n.sponsors !== undefined && n.sponsors !== 'day' && n.sponsors !== 'notices')
      errors.push(`${at}: "sponsors" must be "day" or "notices"`)
    if (n.link !== undefined && !/^https:\/\/\S+$/.test(String(n.link)))
      errors.push(`${at}: "link" must start https://`)
    const links = (Array.isArray(n.links) ? n.links : []).map((raw: unknown) => {
      const l = isObj(raw) ? raw : {}
      const linkTitle = localized(l.title)
      if (!linkTitle) errors.push(`${at}: each link needs a "title" saying what scanning it does`)
      if (!str(l.url) || !/^https:\/\/\S+$/.test(l.url as string))
        errors.push(`${at}: each link's "url" must start https://`)
      return { title: linkTitle ?? { en: '' }, url: String(l.url ?? '') }
    })
    if (n.links !== undefined && !Array.isArray(n.links))
      errors.push(`${at}: "links" must be a list`)
    return withSponsorText({
      id: '',
      kind: n.kind as Notice['kind'],
      from: n.from as DateString,
      ...(str(n.to) && n.to !== n.from && { to: n.to as DateString }),
      ...(str(n.category) && { category: n.category as string }),
      ...(str(n.eventId) && { eventId: n.eventId as string }),
      ...(n.kind === 'sponsor' &&
        !n.eventId &&
        n.sponsors === 'notices' && { sponsors: 'notices' as const }),
      ...(title && { title }),
      ...(sponsoredBy && { sponsoredBy }),
      ...(inHonorOf && { inHonorOf }),
      text: text ?? { en: '' },
      ...(str(n.link) && { link: n.link as string }),
      ...(links.length > 0 && { links, link: links[0].url }),
    })
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: notices }
}
