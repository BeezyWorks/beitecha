import { sanitizeText, type Scope } from '@beitecha/engine'

import { requireUser } from './auth'
import type { Env } from './env'
import { ApiError, HttpError, json, readJson } from './http'
import { findShul, requireRole, type Role } from './shuls'

// ---------------------------------------------------------------------------
// Connections: a key (or, later, a chat app's sign-in) that writes to one shul for the member who made it.

export const SCOPES: readonly Scope[] = [
  'sponsors',
  'notices',
  'changes',
  'events',
  'yahrzeits',
  'occasions',
  'cholim',
]
/** What a new connection may do; refuah names are opt-in. */
export const DEFAULT_SCOPES: readonly Scope[] = [
  'sponsors',
  'notices',
  'changes',
  'events',
  'yahrzeits',
  'occasions',
]
export type Mode = 'publish' | 'review'
export type Purpose = 'skill' | 'script' | 'other'
const PURPOSES: readonly Purpose[] = ['skill', 'script', 'other']

export const KEY_PREFIX = 'bk_sec_'
const KEY_RE = /^bk_sec_[0-9A-Za-z]{32}$/
/** How much of the key stays visible in the admin: `bk_sec_` and four characters. */
const VISIBLE_PREFIX = KEY_PREFIX.length + 4
const DEFAULT_EXPIRY_DAYS = 90
const MAX_EXPIRY_DAYS = 365
const MAX_PER_SHUL = 10
const MAX_PER_USER = 3
/** Keys one person may create in an hour, across shuls. */
const MAX_CREATES_PER_HOUR = 10
/** `last_used_*` is written at most this often per connection. */
export const LAST_USED_EVERY_MS = 5 * 60_000
const DAY = 86_400_000

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** 32 base62 characters, unbiased (bytes of 248 and up are thrown away, since 248 = 4 × 62). */
function randomBase62(length: number): string {
  let out = ''
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < 248 && out.length < length) out += BASE62[b % 62]
    }
  }
  return out
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface ConnectionRow {
  id: string
  shul_id: string
  user_id: string
  kind: 'key' | 'oauth'
  purpose: string
  label: string
  prefix: string | null
  scopes: string
  mode: Mode
  created_at: number
  expires_at: number | null
  revoked_at: number | null
  last_used_at: number | null
  last_ip: string | null
  last_user_agent: string | null
}

const parseScopes = (text: string): Scope[] => {
  try {
    const v = JSON.parse(text)
    return Array.isArray(v) ? v.filter((s): s is Scope => SCOPES.includes(s)) : []
  } catch {
    return []
  }
}

/** A connection as the admin sees it. Never the hash. */
const connectionView = (row: ConnectionRow & { user_name?: string | null }, viewer: string) => ({
  id: row.id,
  userId: row.user_id,
  userName: row.user_name ?? null,
  mine: row.user_id === viewer,
  kind: row.kind,
  purpose: row.purpose,
  label: row.label,
  prefix: row.prefix,
  mode: row.mode,
  scopes: parseScopes(row.scopes),
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  lastUsedAt: row.last_used_at,
  lastIp: row.last_ip,
  lastUserAgent: row.last_user_agent,
})

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isMode = (v: unknown): v is Mode => v === 'publish' || v === 'review'

function parseScopesInput(v: unknown): Scope[] {
  if (!Array.isArray(v) || v.length === 0)
    throw new HttpError(400, 'scopes must be a non-empty list')
  const bad = v.find((s) => !SCOPES.includes(s as Scope))
  if (bad !== undefined) throw new HttpError(400, `unknown scope: ${String(bad).slice(0, 40)}`)
  return SCOPES.filter((s) => v.includes(s))
}

function parseLabel(v: unknown): string {
  const r = sanitizeText(v, { max: 60, required: true })
  if (!r.ok) throw new HttpError(400, `label ${r.message}`)
  return r.text
}

const ACTIVE = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`
/** The same, with the time as `?8` (for the insert, which numbers its parameters). */
const ACTIVE_ALL = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?8)`

async function shulAndRole(request: Request, env: Env, slug: string, needed: Role) {
  const user = await requireUser(request, env)
  const shul = await findShul(env, slug)
  const role = await requireRole(env, shul, user, needed)
  return { user, shul, role }
}

const apiSettings = async (env: Env, shulId: string) => {
  const row = await env.DB.prepare('SELECT api_enabled, api_default_mode FROM shuls WHERE id = ?')
    .bind(shulId)
    .first<{ api_enabled: number; api_default_mode: Mode }>()
  return { enabled: row?.api_enabled === 1, defaultMode: row?.api_default_mode ?? 'review' }
}

// ---------------------------------------------------------------------------
// Session-authenticated admin endpoints

/** Owners see every connection of the shul, editors their own. */
export async function listConnections(request: Request, env: Env, slug: string): Promise<Response> {
  const { user, shul, role } = await shulAndRole(request, env, slug, 'editor')
  const { results } = await env.DB.prepare(
    `SELECT c.*, m.name AS user_name FROM connections c
     LEFT JOIN members m ON m.shul_id = c.shul_id AND m.user_id = c.user_id
     WHERE c.shul_id = ?1 AND (?2 = 'owner' OR c.user_id = ?3) ORDER BY c.created_at DESC LIMIT 200`,
  )
    .bind(shul.id, role, user.id)
    .all<ConnectionRow & { user_name: string | null }>()
  return json({
    ...(await apiSettings(env, shul.id)),
    connections: results.map((r) => connectionView(r, user.id)),
  })
}

/** Owner: turn the API on or off and pick the mode new connections start in. Off revokes every connection. */
export async function putApiSettings(request: Request, env: Env, slug: string): Promise<Response> {
  const { shul } = await shulAndRole(request, env, slug, 'owner')
  const body = await readJson<{ enabled?: unknown; defaultMode?: unknown }>(request, 1024)
  if (!isObject(body)) throw new HttpError(400, 'invalid body')
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean')
    throw new HttpError(400, 'enabled must be true or false')
  if (body.defaultMode !== undefined && !isMode(body.defaultMode))
    throw new HttpError(400, 'defaultMode must be publish or review')
  if (body.enabled === undefined && body.defaultMode === undefined)
    throw new HttpError(400, 'enabled or defaultMode is required')
  const now = Date.now()
  const statements = [
    env.DB.prepare(
      `UPDATE shuls SET api_enabled = COALESCE(?2, api_enabled), api_default_mode = COALESCE(?3, api_default_mode) WHERE id = ?1`,
    ).bind(
      shul.id,
      body.enabled === undefined ? null : body.enabled ? 1 : 0,
      body.defaultMode ?? null,
    ),
  ]
  if (body.enabled === false) {
    statements.push(
      env.DB.prepare(
        'UPDATE connections SET revoked_at = ?2 WHERE shul_id = ?1 AND revoked_at IS NULL',
      ).bind(shul.id, now),
    )
  }
  const results = await env.DB.batch(statements)
  const revoked = body.enabled === false ? (results[1].meta.changes ?? 0) : 0
  return json({ ...(await apiSettings(env, shul.id)), revoked })
}

/** Any member, once the API is on. The key comes back here and never again. */
export async function createConnection(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const { user, shul } = await shulAndRole(request, env, slug, 'editor')
  const body = await readJson<Record<string, unknown>>(request, 2048)
  if (!isObject(body)) throw new HttpError(400, 'invalid body')
  const settings = await apiSettings(env, shul.id)
  if (!settings.enabled)
    throw new HttpError(
      403,
      'assistants and the API are off for this shul; an owner can turn them on',
    )

  if (!PURPOSES.includes(body.purpose as Purpose))
    throw new HttpError(400, 'purpose must be skill, script or other')
  const purpose = body.purpose as Purpose
  const label =
    body.label === undefined || body.label === ''
      ? defaultLabel(purpose, user.name)
      : parseLabel(body.label)
  const scopes = body.scopes === undefined ? [...DEFAULT_SCOPES] : parseScopesInput(body.scopes)
  if (body.mode !== undefined && !isMode(body.mode))
    throw new HttpError(400, 'mode must be publish or review')
  const mode = (body.mode as Mode | undefined) ?? settings.defaultMode
  const days = body.expiresInDays === undefined ? DEFAULT_EXPIRY_DAYS : body.expiresInDays
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_EXPIRY_DAYS)
    throw new HttpError(400, `expiresInDays must be a whole number from 1 to ${MAX_EXPIRY_DAYS}`)

  const now = Date.now()
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM connections WHERE user_id = ? AND created_at > ?',
  )
    .bind(user.id, now - 3_600_000)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_CREATES_PER_HOUR) {
    throw new HttpError(429, 'you have made a lot of keys in the last hour; try again later')
  }

  const secret = KEY_PREFIX + randomBase62(32)
  const id = crypto.randomUUID()
  // The limits are checked in the insert itself, so two requests at once can't both squeeze in; the shul's switch
  // is checked again there in case an owner turned the API off meanwhile.
  const inserted = await env.DB.prepare(
    `INSERT INTO connections (id, shul_id, user_id, kind, purpose, label, prefix, hash, scopes, mode, created_at, expires_at)
     SELECT ?1, ?2, ?3, 'key', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
     WHERE (SELECT api_enabled FROM shuls WHERE id = ?2) = 1
       AND (SELECT COUNT(*) FROM connections WHERE shul_id = ?2 AND ${ACTIVE.replace('?', '?10')}) < ?12
       AND (SELECT COUNT(*) FROM connections WHERE shul_id = ?2 AND user_id = ?3 AND ${ACTIVE.replace('?', '?10')}) < ?13
     RETURNING *`,
  )
    .bind(
      id,
      shul.id,
      user.id,
      purpose,
      label,
      secret.slice(0, VISIBLE_PREFIX),
      await sha256Hex(secret),
      JSON.stringify(scopes),
      mode,
      now,
      now + days * DAY,
      MAX_PER_SHUL,
      MAX_PER_USER,
    )
    .first<ConnectionRow>()
  if (!inserted) {
    const [shulCount, userCount] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM connections WHERE shul_id = ? AND ${ACTIVE}`)
        .bind(shul.id, now)
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM connections WHERE shul_id = ? AND user_id = ? AND ${ACTIVE}`,
      )
        .bind(shul.id, user.id, now)
        .first<{ n: number }>(),
    ])
    if ((userCount?.n ?? 0) >= MAX_PER_USER)
      throw new HttpError(
        409,
        `you already have ${MAX_PER_USER} active connections for this shul; revoke one first`,
      )
    if ((shulCount?.n ?? 0) >= MAX_PER_SHUL)
      throw new HttpError(
        409,
        `this shul already has ${MAX_PER_SHUL} active connections; revoke one first`,
      )
    throw new HttpError(
      403,
      'assistants and the API are off for this shul; an owner can turn them on',
    )
  }
  return json(
    { connection: connectionView({ ...inserted, user_name: user.name }, user.id), key: secret },
    { status: 201 },
  )
}

const defaultLabel = (purpose: Purpose, name: string) =>
  purpose === 'skill'
    ? `${name.slice(0, 40)}'s Claude`
    : purpose === 'script'
      ? 'Script'
      : 'Connection'

async function ownConnection(env: Env, shulId: string, id: string): Promise<ConnectionRow> {
  const row = await env.DB.prepare('SELECT * FROM connections WHERE id = ? AND shul_id = ?')
    .bind(id, shulId)
    .first<ConnectionRow>()
  if (!row) throw new HttpError(404, 'no such connection')
  return row
}

/** Owner, or the member the connection belongs to: its mode, scopes and label. */
export async function patchConnection(
  request: Request,
  env: Env,
  slug: string,
  id: string,
): Promise<Response> {
  const { user, shul, role } = await shulAndRole(request, env, slug, 'editor')
  const row = await ownConnection(env, shul.id, id)
  if (role !== 'owner' && row.user_id !== user.id) throw new HttpError(403, 'not allowed')
  if (row.revoked_at !== null) throw new HttpError(409, 'this connection is revoked')
  const body = await readJson<Record<string, unknown>>(request, 2048)
  if (!isObject(body)) throw new HttpError(400, 'invalid body')
  if (body.mode === undefined && body.scopes === undefined && body.label === undefined)
    throw new HttpError(400, 'nothing to change')
  if (body.mode !== undefined && !isMode(body.mode))
    throw new HttpError(400, 'mode must be publish or review')
  const updated = await env.DB.prepare(
    `UPDATE connections SET mode = COALESCE(?3, mode), scopes = COALESCE(?4, scopes), label = COALESCE(?5, label)
     WHERE id = ?1 AND shul_id = ?2 AND revoked_at IS NULL RETURNING *`,
  )
    .bind(
      id,
      shul.id,
      (body.mode as Mode | undefined) ?? null,
      body.scopes === undefined ? null : JSON.stringify(parseScopesInput(body.scopes)),
      body.label === undefined ? null : parseLabel(body.label),
    )
    .first<ConnectionRow>()
  if (!updated) throw new HttpError(409, 'this connection is revoked')
  const owner = await env.DB.prepare('SELECT name FROM members WHERE shul_id = ? AND user_id = ?')
    .bind(shul.id, updated.user_id)
    .first<{ name: string | null }>()
  return json({ connection: connectionView({ ...updated, user_name: owner?.name }, user.id) })
}

/** Owner, or the member the connection belongs to. Takes effect on the next request; revoking twice is fine. */
export async function revokeConnection(
  request: Request,
  env: Env,
  slug: string,
  id: string,
): Promise<Response> {
  const { user, shul, role } = await shulAndRole(request, env, slug, 'editor')
  const row = await ownConnection(env, shul.id, id)
  if (role !== 'owner' && row.user_id !== user.id) throw new HttpError(403, 'not allowed')
  await env.DB.prepare('UPDATE connections SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(Date.now(), id)
    .run()
  return new Response(null, { status: 204 })
}

export async function revokeAllConnections(
  request: Request,
  env: Env,
  slug: string,
): Promise<Response> {
  const { shul } = await shulAndRole(request, env, slug, 'owner')
  const res = await env.DB.prepare(
    'UPDATE connections SET revoked_at = ? WHERE shul_id = ? AND revoked_at IS NULL',
  )
    .bind(Date.now(), shul.id)
    .run()
  return json({ revoked: res.meta.changes ?? 0 })
}

// ---------------------------------------------------------------------------
// What a /v1 request authenticates with

export interface Connection {
  id: string
  userId: string
  kind: 'key' | 'oauth'
  purpose: string
  label: string
  scopes: Scope[]
  mode: Mode
  expiresAt: number | null
}

export interface AuthedConnection {
  connection: Connection
  /** The shul the connection belongs to: every write's shul id comes from here, never from the URL. */
  shul: { id: string; slug: string; defaultMode: Mode }
  /** The member's current role, read in the same statement. */
  role: Role
}

export const notFound = () => new ApiError(404, 'not_found', 'No such shul')
const unauthorized = (message = 'A valid API key is required') =>
  new ApiError(401, 'unauthorized', message)

/** One connection joined to its member and shul, active (not revoked, not expired), whose user is still on the team.
 * The shul's switch and slug are returned, not filtered on, so "no such connection" (401) and "not for this shul"
 * (the shared 404) stay apart. `where` picks the row by how the credential identifies it. */
const ACTIVE_CONNECTION = `
  SELECT c.*, m.role, s.slug, s.api_enabled, s.api_default_mode
  FROM connections c
  JOIN members m ON m.shul_id = c.shul_id AND m.user_id = c.user_id
  JOIN shuls s ON s.id = c.shul_id
  WHERE c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > ?1) AND `

type ActiveRow = ConnectionRow & {
  role: Role
  slug: string
  api_enabled: number
  api_default_mode: Mode
}

/** A `bk_sec_` key is looked up by its hash. (A chat app's sign-in is not a secret of ours: `requireOAuthConnection`
 * finds its row by `(user, client, shul)` with the same join instead.) */
async function findActive(env: Env, token: string, now: number): Promise<ActiveRow | null> {
  if (token.startsWith(KEY_PREFIX)) {
    if (!KEY_RE.test(token)) return null
    return env.DB.prepare(`${ACTIVE_CONNECTION} c.kind = 'key' AND c.hash = ?2`)
      .bind(now, await sha256Hex(token))
      .first<ActiveRow>()
  }
  return null
}

/**
 * Counts a bad secret against the caller's IP in `PUBLIC_LIMIT` (the same counter as the public reads), so guessing
 * keys runs out of room quickly. Throws a 429 once over. Public so `/v1` can call it for other rejections too.
 */
export async function countBadSecret(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!env.PUBLIC_LIMIT || !ip) return
  const { success } = await env.PUBLIC_LIMIT.limit({ key: ip })
  if (!success) throw new ApiError(429, 'rate_limited', 'Too many requests; try again in a minute')
}

/**
 * The connection behind an `Authorization: Bearer bk_sec_…` header (never a query string), for the shul at `slug`.
 *
 * - No header, a malformed, unknown, revoked or expired secret, or a user no longer on the team: 401 `unauthorized`
 *   (a wrong or unknown secret also counts against the caller's IP limit).
 * - A good secret but the API is off, or the slug is another shul's or doesn't exist: the same 404 `not_found`.
 * - `last_used_*` is updated at most every 5 minutes.
 *
 * The role is the member's current one; a connection never outranks it. Check `requireScope` next.
 */
export async function requireConnection(
  request: Request,
  env: Env,
  slug: string,
): Promise<AuthedConnection> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) throw unauthorized()
  const now = Date.now()
  const row = await findActive(env, match[1], now)
  if (!row) {
    await countBadSecret(request, env)
    throw unauthorized()
  }
  if (row.api_enabled !== 1 || row.slug !== slug) throw notFound()
  return authedOf(env, request, row, now)
}

/** Records `last_used_*` (at most every 5 minutes) and shapes the row. */
async function authedOf(
  env: Env,
  request: Request,
  row: ActiveRow,
  now: number,
): Promise<AuthedConnection> {
  if (row.last_used_at === null || now - row.last_used_at >= LAST_USED_EVERY_MS) {
    await env.DB.prepare(
      `UPDATE connections SET last_used_at = ?2, last_ip = ?3, last_user_agent = ?4
       WHERE id = ?1 AND (last_used_at IS NULL OR last_used_at <= ?2 - ?5)`,
    )
      .bind(
        row.id,
        now,
        request.headers.get('cf-connecting-ip'),
        request.headers.get('user-agent')?.slice(0, 200) ?? null,
        LAST_USED_EVERY_MS,
      )
      .run()
  }
  return {
    connection: {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      purpose: row.purpose,
      label: row.label,
      scopes: parseScopes(row.scopes),
      mode: row.mode,
      expiresAt: row.expires_at,
    },
    shul: { id: row.shul_id, slug: row.slug, defaultMode: row.api_default_mode },
    role: row.role,
  }
}

// ---------------------------------------------------------------------------
// A chat app's sign-in (the MCP)

/** Who a verified OAuth token is: the account, and the chat app (OAuth client) it was issued to. */
export interface OAuthIdentity {
  userId: string
  clientId: string
  /** Looks up the client's self-asserted name from the accounts service (called only when a connection is made). */
  clientName?: () => Promise<string | null>
}

/** A shul the user is a member of, and what its API switch says. */
export interface MemberShul {
  id: string
  slug: string
  name: string
  role: Role
  apiEnabled: boolean
  defaultMode: Mode
  memberName: string | null
}

export const ASSISTANTS_OFF =
  "This shul hasn't turned on assistants. Ask a gabbai to turn it on in Beitecha → Assistants & API."

export async function userShuls(env: Env, userId: string): Promise<MemberShul[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.slug, s.api_enabled, s.api_default_mode, m.role, m.name AS member_name,
            COALESCE(NULLIF(json_extract(s.profile, '$.name.en'), ''), json_extract(s.profile, '$.name.he'), s.slug) AS shul_name
     FROM members m JOIN shuls s ON s.id = m.shul_id WHERE m.user_id = ? ORDER BY s.slug LIMIT 50`,
  )
    .bind(userId)
    .all<{
      id: string
      slug: string
      api_enabled: number
      api_default_mode: Mode
      role: Role
      member_name: string | null
      shul_name: string
    }>()
  return results.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.shul_name,
    role: r.role,
    apiEnabled: r.api_enabled === 1,
    defaultMode: r.api_default_mode,
    memberName: r.member_name,
  }))
}

/** Which of the user's shuls a tool means: the `shul` argument, or the only one with assistants on. Throws a message
 * written for the person (tools hand it straight back). Not a member and unknown look the same. */
export function pickShul(shuls: MemberShul[], slug?: string): MemberShul {
  if (slug) {
    const mine = shuls.find((s) => s.slug === slug.trim().toLowerCase())
    if (!mine || !mine.apiEnabled) throw new ApiError(403, 'assistants_off', ASSISTANTS_OFF)
    return mine
  }
  const on = shuls.filter((s) => s.apiEnabled)
  if (on.length === 1) return on[0]
  if (on.length === 0) throw new ApiError(403, 'assistants_off', ASSISTANTS_OFF)
  throw new ApiError(
    400,
    'which_shul',
    `You belong to more than one shul here. Ask which one she means, then call again with shul set to its slug: ${on
      .map((s) => `${s.name} (${s.slug})`)
      .join(', ')}.`,
    { shuls: on.map((s) => ({ slug: s.slug, name: s.name })) },
  )
}

const findOAuth = (env: Env, identity: OAuthIdentity, shulId: string, now: number) =>
  env.DB.prepare(
    `${ACTIVE_CONNECTION} c.kind = 'oauth' AND c.user_id = ?2 AND c.oauth_client_id = ?3 AND c.shul_id = ?4`,
  )
    .bind(now, identity.userId, identity.clientId, shulId)
    .first<ActiveRow>()

/**
 * The connection behind a verified OAuth token, for the shul the tool means (`pickShul`).
 *
 * - Found by `(user, client, shul)` with the same join as keys: revoked, or a user no longer on the team, never match.
 * - First use for a member of a shul with assistants on: the row is made then, in the shul's default mode with the
 *   default scopes and no expiry (revoking it in the admin is how it ends), within the shul's and the user's limits.
 * - A revoked row is final. `(shul, user, client)` is unique, so it can't be remade; a gabbai who disconnected an
 *   assistant has done it for good, and the person must ask. (Removing the connector in her chat app and adding it
 *   again is a new client with a new sign-in; that is a new connection, as a new key would be.)
 */
export async function requireOAuthConnection(
  env: Env,
  request: Request,
  identity: OAuthIdentity,
  slug?: string,
): Promise<AuthedConnection> {
  const shul = pickShul(await userShuls(env, identity.userId), slug)
  const now = Date.now()
  const found = await findOAuth(env, identity, shul.id, now)
  if (found) return authedOf(env, request, found, now)

  const any = await env.DB.prepare(
    `SELECT revoked_at FROM connections WHERE shul_id = ? AND user_id = ? AND oauth_client_id = ?`,
  )
    .bind(shul.id, identity.userId, identity.clientId)
    .first<{ revoked_at: number | null }>()
  if (any)
    throw new ApiError(
      403,
      'disconnected',
      `A gabbai of ${shul.name} disconnected this assistant, so it can't change the shul's schedule. Ask a gabbai if you want it back.`,
    )

  const first = (shul.memberName ?? '').trim().split(/\s+/)[0]
  const client = (await identity.clientName?.().catch(() => null)) ?? 'assistant'
  const label = parseLabelLoose(`${first ? `${first}'s ` : ''}${client}`)
  const id = crypto.randomUUID()
  let inserted: ConnectionRow | null = null
  try {
    inserted = await env.DB.prepare(
      `INSERT INTO connections (id, shul_id, user_id, kind, purpose, label, oauth_client_id, scopes, mode, created_at)
       SELECT ?1, ?2, ?3, 'oauth', 'assistant', ?4, ?5, ?6, ?7, ?8
       WHERE (SELECT api_enabled FROM shuls WHERE id = ?2) = 1
         AND (SELECT COUNT(*) FROM connections WHERE shul_id = ?2 AND ${ACTIVE_ALL}) < ?9
         AND (SELECT COUNT(*) FROM connections WHERE shul_id = ?2 AND user_id = ?3 AND ${ACTIVE_ALL}) < ?10
       RETURNING *`,
    )
      .bind(
        id,
        shul.id,
        identity.userId,
        label,
        identity.clientId,
        JSON.stringify(DEFAULT_SCOPES),
        shul.defaultMode,
        now,
        MAX_PER_SHUL,
        MAX_PER_USER,
      )
      .first<ConnectionRow>()
  } catch (e) {
    // Two first calls at once: the other made it.
    if (!/UNIQUE|constraint/i.test(String((e as Error)?.message))) throw e
  }
  if (!inserted) {
    const raced = await findOAuth(env, identity, shul.id, Date.now())
    if (raced) return authedOf(env, request, raced, now)
    const count = (sql: string, ...args: unknown[]) =>
      env.DB.prepare(`SELECT COUNT(*) AS n FROM connections WHERE shul_id = ? AND ${sql}`)
        .bind(shul.id, ...args)
        .first<{ n: number }>()
        .then((r) => r?.n ?? 0)
    if ((await count(`user_id = ? AND ${ACTIVE}`, identity.userId, now)) >= MAX_PER_USER)
      throw new ApiError(
        409,
        'limit',
        `You already have ${MAX_PER_USER} active connections to ${shul.name}, which is the most one person can have. Ask a gabbai to disconnect one in Beitecha → Assistants & API.`,
      )
    if ((await count(ACTIVE, now)) >= MAX_PER_SHUL)
      throw new ApiError(
        409,
        'limit',
        `${shul.name} already has ${MAX_PER_SHUL} active connections, which is the most it can have. Ask a gabbai to disconnect one in Beitecha → Assistants & API.`,
      )
    throw new ApiError(403, 'assistants_off', ASSISTANTS_OFF)
  }
  return authedOf(env, request, { ...inserted, ...shulFields(shul) }, now)
}

const shulFields = (shul: MemberShul) => ({
  role: shul.role,
  slug: shul.slug,
  api_enabled: 1,
  api_default_mode: shul.defaultMode,
})

/** A label from text we don't control (the client's own name): cleaned and cut to 60, never an error. */
function parseLabelLoose(text: string): string {
  const r = sanitizeText(text.slice(0, 120), { max: 60, required: true })
  return r.ok ? r.text : 'Assistant'
}

/** Does any of the user's active OAuth connections for this chat app hold the scope? (What `tools/list` shows.) */
export async function oauthHasScope(
  env: Env,
  identity: OAuthIdentity,
  scope: Scope,
): Promise<boolean> {
  const { results } = await env.DB.prepare(
    `${ACTIVE_CONNECTION} c.kind = 'oauth' AND c.user_id = ?2 AND c.oauth_client_id = ?3`,
  )
    .bind(Date.now(), identity.userId, identity.clientId)
    .all<ActiveRow>()
  return results.some((r) => r.api_enabled === 1 && parseScopes(r.scopes).includes(scope))
}

/** 403 `forbidden` unless the connection holds the scope. */
export function requireScope(connection: Pick<Connection, 'scopes'>, scope: Scope): void {
  if (!connection.scopes.includes(scope))
    throw new ApiError(403, 'forbidden', `This connection can't use the ${scope} scope`)
}
