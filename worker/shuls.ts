import {
  addDays,
  starterSchedule,
  timeFormatProblem,
  todayIn,
  type Schedule,
  type ShulProfile,
  type ShulSettings,
} from '@beitecha/engine'

import { requireUser, type User } from './auth'
import type { Env } from './env'
import { HttpError, json, readJson } from './http'
import { icsFeed } from './ics'

export const MAX_SCHEDULE_BYTES = 512 * 1024
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/
/** Paths the web app uses at the top level, so no shul can take them. */
const RESERVED = new Set(['api', 'new', 'admin', 'account', 'about', 'directory', 'help', 'login', 'settings', 'invite'])
const INVITE_DAYS = 14
const MAX_DISPLAYS = 20
/** Past exceptions and notices the public feed still carries (the display shows the past week). */
const PUBLIC_HISTORY_DAYS = 7

type Role = 'owner' | 'editor'

interface ShulRow {
  id: string
  slug: string
  profile: string
  schedule: string
  revision: number
  listed: number
  updated_at: number
}

const shulRecord = (row: ShulRow) => ({
  slug: row.slug,
  profile: JSON.parse(row.profile) as ShulProfile,
  schedule: JSON.parse(row.schedule) as Schedule,
  revision: row.revision,
  listed: row.listed === 1,
  updatedAt: row.updated_at,
})

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return 'use 3–40 lowercase letters, digits and dashes'
  if (RESERVED.has(slug)) return 'that address is reserved'
  return null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function validTimeZone(tz: unknown): boolean {
  if (typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Shape checks for what the engine would choke on; rule-level problems are the editor's job. */
export function scheduleProblem(s: unknown): string | null {
  if (!isObject(s)) return 'schedule must be an object'
  if (!isObject(s.settings) || !isObject(s.settings.location)) return 'settings.location is required'
  const loc = s.settings.location
  const local = s.settings.localHolidays
  if (local !== undefined && (!Array.isArray(local) || local.some((h) => !isObject(h) || typeof h.id !== 'string' || !isObject(h.date)))) {
    return 'localHolidays must be a list of holidays with an id and a date'
  }
  if (typeof loc.latitude !== 'number' || Math.abs(loc.latitude) > 90) return 'bad latitude'
  if (typeof loc.longitude !== 'number' || Math.abs(loc.longitude) > 180) return 'bad longitude'
  if (!validTimeZone(loc.timeZone)) return 'bad time zone'
  if (
    s.settings.language !== undefined &&
    s.settings.language !== 'en' &&
    s.settings.language !== 'he'
  )
    return 'language must be en or he'
  if (
    s.settings.names !== undefined &&
    s.settings.names !== 'en' &&
    s.settings.names !== 'he' &&
    s.settings.names !== 'both'
  )
    return 'names must be en, he or both'
  if (
    s.settings.timeFormat !== undefined &&
    (typeof s.settings.timeFormat !== 'string' || timeFormatProblem(s.settings.timeFormat))
  )
    return 'timeFormat must be a time format with an hour and minutes'
  if (typeof loc.israel !== 'boolean') return 'location.israel must be true or false'
  for (const key of ['events', 'exceptions', 'notices'] as const) {
    if (!Array.isArray(s[key])) return `${key} must be a list`
  }
  for (const e of s.events as unknown[]) {
    if (!isObject(e) || typeof e.id !== 'string' || !Array.isArray(e.rules)) return 'every event needs an id and rules'
  }
  return null
}

function profileProblem(p: unknown): string | null {
  if (!isObject(p) || !isObject(p.name) || typeof p.name.en !== 'string' || !p.name.en.trim()) return 'a name is required'
  if (p.brandColor !== undefined && !/^#[0-9a-f]{6}$/i.test(String(p.brandColor))) return 'brandColor must be #rrggbb'
  return null
}

async function findShul(env: Env, slug: string): Promise<ShulRow> {
  const row = await env.DB.prepare('SELECT * FROM shuls WHERE slug = ?').bind(slug).first<ShulRow>()
  if (!row) throw new HttpError(404, 'no such shul')
  return row
}

async function roleOf(env: Env, shulId: string, userId: string): Promise<Role | null> {
  const row = await env.DB.prepare('SELECT role FROM members WHERE shul_id = ? AND user_id = ?')
    .bind(shulId, userId)
    .first<{ role: Role }>()
  return row?.role ?? null
}

async function requireRole(env: Env, shul: ShulRow, user: User, needed: Role): Promise<Role> {
  const role = await roleOf(env, shul.id, user.id)
  if (!role || (needed === 'owner' && role !== 'owner')) throw new HttpError(403, 'not allowed')
  return role
}

/** The public feed: everything but long-past exceptions and notices. */
function publicSchedule(schedule: Schedule): Schedule {
  const cutoff = addDays(todayIn(schedule.settings.location.timeZone), -PUBLIC_HISTORY_DAYS)
  return {
    ...schedule,
    exceptions: schedule.exceptions.filter((x) => x.date >= cutoff),
    notices: schedule.notices.filter((n) => (n.to ?? n.from) >= cutoff),
  }
}

// ---------------------------------------------------------------------------
// Handlers

export async function getPublic(env: Env, slug: string, request: Request): Promise<Response> {
  const row = await findShul(env, slug)
  const etag = `"${row.id}-${row.revision}"`
  const headers = { etag, 'cache-control': 'public, max-age=60' }
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  const { profile, schedule, revision, updatedAt } = shulRecord(row)
  return json({ slug, profile, schedule: publicSchedule(schedule), revision, updatedAt }, { headers })
}

export async function getIcs(env: Env, slug: string): Promise<Response> {
  const row = await findShul(env, slug)
  const { profile, schedule } = shulRecord(row)
  const host = new URL(env.PUBLIC_URL).host
  return new Response(icsFeed(slug, profile, schedule, host), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}

export async function getDirectory(env: Env, q: string): Promise<Response> {
  const like = `%${q.replace(/[%_]/g, '')}%`
  const { results } = await env.DB.prepare(
    `SELECT slug, profile FROM shuls WHERE listed = 1 AND (slug LIKE ?1 OR profile LIKE ?1) ORDER BY slug LIMIT 50`,
  )
    .bind(like)
    .all<{ slug: string; profile: string }>()
  return json({
    shuls: results.map((r) => {
      const p = JSON.parse(r.profile) as ShulProfile
      return { slug: r.slug, name: p.name, city: p.city }
    }),
  })
}

export async function getMine(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const { results } = await env.DB.prepare(
    `SELECT s.slug, s.profile, m.role FROM members m JOIN shuls s ON s.id = m.shul_id WHERE m.user_id = ? ORDER BY s.slug`,
  )
    .bind(user.id)
    .all<{ slug: string; profile: string; role: Role }>()
  return json({ shuls: results.map((r) => ({ slug: r.slug, name: (JSON.parse(r.profile) as ShulProfile).name, role: r.role })) })
}

export async function createShul(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env)
  const body = await readJson<{
    slug?: string
    profile?: ShulProfile
    location?: ShulSettings['location']
    language?: ShulSettings['language']
    minchaMaariv?: 'combined' | 'separate'
  }>(request, 16 * 1024)
  const slug = String(body.slug ?? '').toLowerCase()
  const slugError = slugProblem(slug)
  if (slugError) throw new HttpError(400, `address: ${slugError}`)
  const profileError = profileProblem(body.profile)
  if (profileError) throw new HttpError(400, profileError)
  if (body.language !== undefined && body.language !== 'en' && body.language !== 'he')
    throw new HttpError(400, 'language must be en or he')
  if (
    body.minchaMaariv !== undefined &&
    body.minchaMaariv !== 'combined' &&
    body.minchaMaariv !== 'separate'
  ) {
    throw new HttpError(400, 'minchaMaariv must be combined or separate')
  }
  const schedule = starterSchedule(
    {
      location: body.location as ShulSettings['location'],
      ...(body.language && { language: body.language }),
    },
    { minchaMaariv: body.minchaMaariv },
  )
  const scheduleError = scheduleProblem(schedule)
  if (scheduleError) throw new HttpError(400, scheduleError)

  const id = crypto.randomUUID()
  const now = Date.now()
  const inserted = await env.DB.prepare(
    `INSERT INTO shuls (id, slug, profile, schedule, revision, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?) ON CONFLICT (slug) DO NOTHING RETURNING id`,
  )
    .bind(id, slug, JSON.stringify(body.profile), JSON.stringify(schedule), now, now, user.id)
    .first()
  if (!inserted) throw new HttpError(409, 'that address is taken')
  await env.DB.batch([
    env.DB.prepare('INSERT INTO members (shul_id, user_id, role, name, email, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      id,
      user.id,
      'owner',
      user.name,
      user.email,
      now,
    ),
    env.DB.prepare('INSERT INTO history (shul_id, revision, user_id, at) VALUES (?, 1, ?, ?)').bind(id, user.id, now),
  ])
  return json({ slug }, { status: 201 })
}

export async function getAdmin(request: Request, env: Env, slug: string): Promise<Response> {
  const user = await requireUser(request, env)
  const row = await findShul(env, slug)
  const role = await requireRole(env, row, user, 'editor')
  const [members, displays, history] = await Promise.all([
    env.DB.prepare('SELECT user_id AS userId, role, name, email FROM members WHERE shul_id = ? ORDER BY created_at').bind(row.id).all(),
    env.DB.prepare('SELECT display_id AS id, label, last_seen AS lastSeen FROM displays WHERE shul_id = ? ORDER BY last_seen DESC')
      .bind(row.id)
      .all(),
    env.DB.prepare(
      `SELECT h.revision, h.at, m.name FROM history h LEFT JOIN members m ON m.shul_id = h.shul_id AND m.user_id = h.user_id
       WHERE h.shul_id = ? ORDER BY h.revision DESC LIMIT 20`,
    )
      .bind(row.id)
      .all(),
  ])
  return json({
    ...shulRecord(row),
    role,
    members: members.results,
    displays: displays.results,
    history: history.results,
  })
}

/** Saves profile and/or schedule. `baseRevision` must match, else 409 with the current record. */
export async function putShul(request: Request, env: Env, slug: string): Promise<Response> {
  const user = await requireUser(request, env)
  const row = await findShul(env, slug)
  await requireRole(env, row, user, 'editor')
  const body = await readJson<{ profile?: ShulProfile; schedule?: Schedule; baseRevision?: number }>(request, MAX_SCHEDULE_BYTES)
  if (typeof body.baseRevision !== 'number') throw new HttpError(400, 'baseRevision is required')
  if (body.profile !== undefined) {
    const e = profileProblem(body.profile)
    if (e) throw new HttpError(400, e)
  }
  if (body.schedule !== undefined) {
    const e = scheduleProblem(body.schedule)
    if (e) throw new HttpError(400, e)
  }
  const now = Date.now()
  const updated = await env.DB.prepare(
    `UPDATE shuls SET profile = ?1, schedule = ?2, revision = revision + 1, updated_at = ?3, updated_by = ?4
     WHERE id = ?5 AND revision = ?6 RETURNING *`,
  )
    .bind(
      body.profile !== undefined ? JSON.stringify(body.profile) : row.profile,
      body.schedule !== undefined ? JSON.stringify(body.schedule) : row.schedule,
      now,
      user.id,
      row.id,
      body.baseRevision,
    )
    .first<ShulRow>()
  if (!updated) {
    const current = await findShul(env, slug)
    return json({ error: 'revision conflict', ...shulRecord(current) }, { status: 409 })
  }
  await env.DB.prepare('INSERT INTO history (shul_id, revision, user_id, at) VALUES (?, ?, ?, ?)')
    .bind(row.id, updated.revision, user.id, now)
    .run()
  return json(shulRecord(updated))
}

export async function createInvite(request: Request, env: Env, slug: string): Promise<Response> {
  const user = await requireUser(request, env)
  const row = await findShul(env, slug)
  await requireRole(env, row, user, 'owner')
  const body = await readJson<{ role?: Role }>(request, 1024)
  const role: Role = body.role === 'owner' ? 'owner' : 'editor'
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')
  const expiresAt = Date.now() + INVITE_DAYS * 86_400_000
  await env.DB.prepare('INSERT INTO invites (token, shul_id, role, created_by, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, row.id, role, user.id, expiresAt)
    .run()
  return json({ token, role, expiresAt, url: `${env.PUBLIC_URL}/invite/${token}` }, { status: 201 })
}

export async function acceptInvite(request: Request, env: Env, token: string): Promise<Response> {
  const user = await requireUser(request, env)
  const invite = await env.DB.prepare(
    'SELECT i.shul_id, i.role, i.expires_at, s.slug FROM invites i JOIN shuls s ON s.id = i.shul_id WHERE i.token = ?',
  )
    .bind(token)
    .first<{ shul_id: string; role: Role; expires_at: number; slug: string }>()
  if (!invite || invite.expires_at < Date.now()) throw new HttpError(404, 'this invitation has expired')
  // Never demote someone already on the team.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO members (shul_id, user_id, role, name, email, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (shul_id, user_id) DO UPDATE SET role = CASE WHEN members.role = 'owner' THEN 'owner' ELSE excluded.role END`,
    ).bind(invite.shul_id, user.id, invite.role, user.name, user.email, Date.now()),
    env.DB.prepare('DELETE FROM invites WHERE token = ?').bind(token),
  ])
  return json({ slug: invite.slug })
}

export async function removeMember(request: Request, env: Env, slug: string, userId: string): Promise<Response> {
  const user = await requireUser(request, env)
  const row = await findShul(env, slug)
  // Anyone may leave; only owners remove others.
  await requireRole(env, row, user, userId === user.id ? 'editor' : 'owner')
  const owners = await env.DB.prepare(`SELECT user_id FROM members WHERE shul_id = ? AND role = 'owner'`).bind(row.id).all<{ user_id: string }>()
  if (owners.results.length === 1 && owners.results[0].user_id === userId) {
    throw new HttpError(400, 'a shul needs at least one owner')
  }
  await env.DB.prepare('DELETE FROM members WHERE shul_id = ? AND user_id = ?').bind(row.id, userId).run()
  return new Response(null, { status: 204 })
}

/** A display checking in. Unauthenticated, so capped per shul. */
export async function heartbeat(request: Request, env: Env, slug: string, displayId: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(displayId)) throw new HttpError(400, 'bad display id')
  const row = await findShul(env, slug)
  const body = await readJson<{ label?: string }>(request, 1024).catch(() => ({}) as { label?: string })
  const label = typeof body.label === 'string' ? body.label.slice(0, 60) : null
  const agent = request.headers.get('user-agent')?.slice(0, 200) ?? null
  await env.DB.prepare(
    `INSERT INTO displays (shul_id, display_id, label, user_agent, last_seen)
     SELECT ?1, ?2, ?3, ?4, ?5
     WHERE EXISTS (SELECT 1 FROM displays WHERE shul_id = ?1 AND display_id = ?2)
        OR (SELECT COUNT(*) FROM displays WHERE shul_id = ?1) < ?6
     ON CONFLICT (shul_id, display_id) DO UPDATE SET last_seen = excluded.last_seen,
       label = COALESCE(excluded.label, displays.label), user_agent = excluded.user_agent`,
  )
    .bind(row.id, displayId, label, agent, Date.now(), MAX_DISPLAYS)
    .run()
  return new Response(null, { status: 204 })
}
