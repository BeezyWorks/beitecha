import {
  Calendar,
  MAX_PUBLIC_DAYS,
  addDays,
  computeDays,
  makeT,
  nextUp,
  noticeLastDay,
  nowMinutesIn,
  startOfWeek,
  todayIn,
  type ComputeDaysOptions,
  type DateString,
  type Notice,
  type PublicEvent,
  type Schedule,
} from '@beitecha/engine'

import { listOwnChanges, undoOwnChange } from './changes'
import { notFound, requireConnection, requireScope } from './connections'
import type { Env } from './env'
import { ApiError, HttpError, apiFail } from './http'
import { shulRecord, type ShulRow } from './shuls'
import { postOperation } from './v1write'

// ---------------------------------------------------------------------------
// Public reads: computed, never a rule, never a people list.

/** The reads that need no key (rate-limited per IP, open to any origin). */
export const PUBLIC_V1 =
  /^\/v1\/shuls\/[^/]+\/(info|day\/[^/]+|days|week|zmanim|next|notices|upcoming)$/

/** Open CORS for the public reads: the data is public, and no credentials are involved. */
export function publicCors(response: Response): Response {
  const res = new Response(response.body, response)
  res.headers.set('access-control-allow-origin', '*')
  res.headers.set('access-control-allow-headers', 'if-none-match')
  res.headers.set('access-control-allow-methods', 'GET, OPTIONS')
  res.headers.set('access-control-expose-headers', 'etag')
  res.headers.set('access-control-max-age', '86400')
  return res
}

const bad = (message: string, details?: unknown) => new ApiError(400, 'invalid', message, details)

function dateParam(name: string, value: string): DateString {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (!m || !d || d.toISOString().slice(0, 10) !== value)
    throw bad(`${name} must be a date like 2026-11-07`)
  if (+m[1] < 2000 || +m[1] > 2100) throw bad(`${name} must be between the years 2000 and 2100`)
  return value
}

/** `from` and `to` (inclusive), defaulting to today and `span` days. At most 62. */
function range(url: URL, today: DateString, span: number): { from: DateString; to: DateString } {
  const f = url.searchParams.get('from')
  const t = url.searchParams.get('to')
  const from = f === null ? today : dateParam('from', f)
  const to = t === null ? addDays(from, span - 1) : dateParam('to', t)
  const count = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
  if (count < 1) throw bad('to must not be before from')
  if (count > MAX_PUBLIC_DAYS)
    throw bad(`from..to can cover at most ${MAX_PUBLIC_DAYS} days`, { max: MAX_PUBLIC_DAYS })
  return { from, to }
}

/** The shul's language and names, unless `?lang=` / `?names=` say otherwise. */
function viewOf(schedule: Schedule, url: URL) {
  const lang = url.searchParams.get('lang')
  const names = url.searchParams.get('names')
  if (lang !== null && lang !== 'en' && lang !== 'he') throw bad('lang must be en or he')
  if (names !== null && names !== 'en' && names !== 'he' && names !== 'both')
    throw bad('names must be en, he or both')
  const { settings } = schedule
  const t = makeT(
    lang ?? settings.language ?? 'en',
    settings.timeFormat,
    names ?? (lang ? undefined : settings.names),
  )
  const opts: ComputeDaysOptions = { ...(lang && { lang }), ...(names && { names }) }
  return { t, opts }
}

const matches = (header: string | null, etag: string) =>
  header !== null && header.split(',').some((v) => v.trim().replace(/^W\//, '') === etag)

/**
 * A cacheable public answer. The ETag is the shul, its revision, the shul's date, language and names (plus the minute
 * for `/next`, which changes through the day); a matching `If-None-Match` is a 304 without computing anything.
 */
async function publicRead(
  request: Request,
  env: Env,
  slug: string,
  url: URL,
  build: (ctx: {
    row: ShulRow
    schedule: Schedule
    today: DateString
    now: number
    view: ReturnType<typeof viewOf>
  }) => unknown,
  { minute = false } = {},
): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM shuls WHERE slug = ?').bind(slug).first<ShulRow>()
  if (!row) throw notFound()
  const { schedule } = shulRecord(row)
  const tz = schedule.settings.location.timeZone
  const today = todayIn(tz)
  const now = nowMinutesIn(tz)
  const view = viewOf(schedule, url)
  const etag = `"${row.id}-${row.revision}-${today}${minute ? `-${now}` : ''}-${view.t.lang}-${view.t.names}"`
  const headers = { etag, 'cache-control': 'public, max-age=60, s-maxage=300' }
  if (matches(request.headers.get('if-none-match'), etag))
    return new Response(null, { status: 304, headers })
  try {
    return Response.json(build({ row, schedule, today, now, view }), { headers })
  } catch (e) {
    if (e instanceof RangeError) throw bad(e.message)
    throw e
  }
}

const noticeView = (n: Notice, schedule: Schedule, t: ReturnType<typeof makeT>) => {
  const to = noticeLastDay(n, schedule.exceptions)
  const text = (v?: { en: string; he?: string }) => (v ? t.text(v) : undefined)
  return Object.fromEntries(
    Object.entries({
      id: n.id,
      kind: n.kind,
      ...(n.kind === 'sponsor' && n.eventId && { ref: `${n.eventId}@${n.from}` }),
      eventId: n.eventId,
      category: n.category,
      sponsors: n.sponsors,
      title: text(n.title),
      sponsoredBy: text(n.sponsoredBy),
      inHonorOf: text(n.inHonorOf),
      text: t.text(n.text),
      link: n.link,
      links: n.links?.map((l) => ({ title: t.text(l.title), url: l.url })),
      from: n.from,
      to,
    }).filter(([, v]) => v !== undefined),
  )
}

/** The sponsor and exception already on an event instance, so a writer knows what it would replace. */
function withAttachments(
  e: PublicEvent,
  date: DateString,
  schedule: Schedule,
  t: ReturnType<typeof makeT>,
) {
  const sponsor = schedule.notices.find(
    (n) => n.kind === 'sponsor' && n.eventId === e.id && n.from === date,
  )
  const x = schedule.exceptions.find(
    (x) => x.date === date && (x.type === 'add' ? x.event.id === e.id : x.eventId === e.id),
  )
  return {
    date,
    ...e,
    ...(sponsor && {
      sponsor: {
        id: sponsor.id,
        ...(sponsor.sponsoredBy && { sponsoredBy: t.text(sponsor.sponsoredBy) }),
        ...(sponsor.inHonorOf && { inHonorOf: t.text(sponsor.inHonorOf) }),
        text: t.text(sponsor.text),
      },
    }),
    ...(x && { exception: { id: x.id, type: x.type } }),
  }
}

const info: Handler = (request, env, [slug], url) =>
  publicRead(request, env, slug, url, ({ row, schedule, view: { t } }) => {
    const { profile } = shulRecord(row)
    const loc = schedule.settings.location
    return {
      slug,
      name: t.text(profile.name),
      nameLocalized: profile.name,
      address: profile.address,
      city: profile.city,
      website: profile.website,
      brandColor: profile.brandColor,
      timeZone: loc.timeZone,
      language: t.lang,
      names: t.names,
      israel: loc.israel,
      bulletinUrl: `${env.PUBLIC_URL}/${slug}/bulletin`,
    }
  })

const day: Handler = (request, env, [slug, date], url) =>
  publicRead(request, env, slug, url, ({ schedule, view }) => {
    const d = dateParam('date', date)
    const r = computeDays(schedule, d, d, view.opts)
    return { timeZone: r.timeZone, language: r.language, ...r.days[0] }
  })

const days: Handler = (request, env, [slug], url) =>
  publicRead(request, env, slug, url, ({ schedule, today, view }) => {
    const { from, to } = range(url, today, 7)
    return computeDays(schedule, from, to, view.opts)
  })

const week: Handler = (request, env, [slug], url) =>
  publicRead(request, env, slug, url, ({ schedule, today, view }) => {
    const from = startOfWeek(today)
    return { today, ...computeDays(schedule, from, addDays(from, 6), view.opts) }
  })

const zmanim: Handler = (request, env, [slug], url) =>
  publicRead(request, env, slug, url, ({ schedule, today, view }) => {
    const { from, to } = range(url, today, 1)
    const r = computeDays(schedule, from, to, view.opts)
    return {
      timeZone: r.timeZone,
      language: r.language,
      from,
      to,
      days: r.days.map((d) => ({
        date: d.date,
        weekday: d.weekday,
        hebrew: d.hebrew,
        zmanim: d.zmanim,
      })),
    }
  })

const next: Handler = (request, env, [slug], url) =>
  publicRead(
    request,
    env,
    slug,
    url,
    ({ schedule, today, now, view }) => {
      const cal = new Calendar(schedule)
      const tomorrow = addDays(today, 1)
      const found = nextUp(cal.day(today), cal.day(tomorrow), now)
      const r = computeDays(schedule, today, tomorrow, { ...view.opts, zmanim: false })
      const date = found?.today ? today : tomorrow
      const event =
        found && r.days[found.today ? 0 : 1].events.find((e) => e.id === found.event.eventId)
      return {
        timeZone: r.timeZone,
        language: r.language,
        now: { date: today, minutes: now },
        next: event ? { date, today: found.today, ...event } : null,
      }
    },
    { minute: true },
  )

const notices: Handler = (request, env, [slug], url) =>
  publicRead(request, env, slug, url, ({ schedule, today, view: { t } }) => ({
    timeZone: schedule.settings.location.timeZone,
    language: t.lang,
    date: today,
    notices: schedule.notices
      .filter((n) => noticeLastDay(n, schedule.exceptions) >= today)
      .sort((a, b) => a.from.localeCompare(b.from))
      .map((n) => ({ ...noticeView(n, schedule, t), current: n.from <= today })),
  }))

const upcoming: Handler = (request, env, [slug], url) =>
  publicRead(request, env, slug, url, ({ schedule, today, view }) => {
    const raw = url.searchParams.get('days')
    const count = raw === null ? 14 : Number(raw)
    if (!Number.isInteger(count) || count < 1 || count > MAX_PUBLIC_DAYS)
      throw bad(`days must be a whole number from 1 to ${MAX_PUBLIC_DAYS}`)
    const to = addDays(today, count - 1)
    const r = computeDays(schedule, today, to, { ...view.opts, zmanim: false })
    return {
      timeZone: r.timeZone,
      language: r.language,
      from: today,
      to,
      events: r.days.flatMap((d) =>
        d.events.map((e) => withAttachments(e, d.date, schedule, view.t)),
      ),
    }
  })

// ---------------------------------------------------------------------------
// Keyed reads

/** The refuah names, for removing or renewing one. Only with the `cholim` scope. */
const cholim: Handler = async (request, env, [slug]) => {
  const { connection, shul } = await requireConnection(request, env, slug)
  requireScope(connection, 'cholim')
  const row = await env.DB.prepare('SELECT * FROM shuls WHERE id = ?')
    .bind(shul.id)
    .first<ShulRow>()
  if (!row) throw notFound()
  const { schedule } = shulRecord(row)
  return Response.json({
    cholim: (schedule.cholim ?? []).map((c) => ({ id: c.id, name: c.name, added: c.added })),
  })
}

// ---------------------------------------------------------------------------
// Router

type Handler = (request: Request, env: Env, params: string[], url: URL) => Promise<Response>

const routes: [method: string, pattern: RegExp, handler: Handler][] = [
  ['GET', /^\/v1\/shuls\/([^/]+)\/info$/, info],
  ['GET', /^\/v1\/shuls\/([^/]+)\/day\/([^/]+)$/, day],
  ['GET', /^\/v1\/shuls\/([^/]+)\/days$/, days],
  ['GET', /^\/v1\/shuls\/([^/]+)\/week$/, week],
  ['GET', /^\/v1\/shuls\/([^/]+)\/zmanim$/, zmanim],
  ['GET', /^\/v1\/shuls\/([^/]+)\/next$/, next],
  ['GET', /^\/v1\/shuls\/([^/]+)\/notices$/, notices],
  ['GET', /^\/v1\/shuls\/([^/]+)\/upcoming$/, upcoming],
  ['GET', /^\/v1\/shuls\/([^/]+)\/cholim$/, cholim],
  [
    'GET',
    /^\/v1\/shuls\/([^/]+)\/changes$/,
    (r, env, [slug], url) => listOwnChanges(r, env, slug, url),
  ],
  ['POST', /^\/v1\/shuls\/([^/]+)\/operations$/, (r, env, [slug]) => postOperation(r, env, slug)],
  [
    'POST',
    /^\/v1\/shuls\/([^/]+)\/changes\/([^/]+)\/undo$/,
    (r, env, [slug, id]) => undoOwnChange(r, env, slug, id),
  ],
]

const CODES: Record<number, string> = {
  400: 'invalid',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  413: 'too_large',
}

/** Every `/v1` error is `{ error: { code, message, details? } }`. */
export async function handleV1(request: Request, env: Env, url: URL): Promise<Response> {
  let pathMatched = false
  for (const [method, pattern, handler] of routes) {
    const m = pattern.exec(url.pathname)
    if (!m) continue
    pathMatched = true
    if (method !== request.method) continue
    try {
      return await handler(request, env, m.slice(1).map(decodeURIComponent), url)
    } catch (e) {
      if (e instanceof ApiError) return apiFail(e.status, e.code, e.message, e.details)
      if (e instanceof HttpError) return apiFail(e.status, CODES[e.status] ?? 'error', e.message)
      // Never log the request: it carries the key.
      console.error('v1 error', e instanceof Error ? e.message : 'unknown')
      return apiFail(500, 'internal', 'Something went wrong')
    }
  }
  return pathMatched
    ? apiFail(405, 'method_not_allowed', 'Method not allowed')
    : apiFail(404, 'not_found', 'Not found')
}
