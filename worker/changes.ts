import {
  applyOperation,
  revertOperation,
  todayIn,
  type Entry,
  type Operation,
  type Schedule,
} from '@beitecha/engine'

import { requireUser } from './auth'
import { requireConnection } from './connections'
import type { Env } from './env'
import { ApiError, HttpError, apiFail, fail, json, readJson } from './http'
import { findShul, requireRole, saveSchedule, type Actor } from './shuls'

// ---------------------------------------------------------------------------
// The record of what connections did (`api_changes`): pending until a member approves, then applied and kept for undo.

export type ChangeStatus = 'pending' | 'applied' | 'rejected' | 'expired' | 'reverted'
const STATUSES: readonly ChangeStatus[] = ['pending', 'applied', 'rejected', 'expired', 'reverted']

/** Pending changes nobody looked at for this long are expired. */
export const PENDING_DAYS = 14
/** A connection may have this many waiting at once. */
export const MAX_PENDING = 50
const DAY = 86_400_000

export interface ChangeRow {
  id: string
  shul_id: string
  connection_id: string
  user_id: string
  op: string
  target: string | null
  payload: string
  before: string | null
  after: string | null
  status: ChangeStatus
  idempotency_key: string | null
  created_at: number
  decided_by: string | null
  decided_at: number | null
}

type ChangeJoin = ChangeRow & {
  connection_label?: string | null
  connection_kind?: string | null
  user_name?: string | null
  decided_by_name?: string | null
}

const parse = <T>(text: string | null): T | null => {
  if (text === null) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/** A change as the admin sees it: everything, with the connection's label and the people's names. */
export const adminChangeView = (row: ChangeJoin) => ({
  id: row.id,
  connectionId: row.connection_id,
  connectionLabel: row.connection_label ?? null,
  connectionKind: row.connection_kind ?? null,
  userId: row.user_id,
  userName: row.user_name ?? null,
  op: row.op,
  target: row.target,
  payload: parse<Operation>(row.payload),
  before: parse<Entry[]>(row.before) ?? [],
  after: parse<Entry[]>(row.after) ?? [],
  status: row.status,
  createdAt: row.created_at,
  expiresAt: row.status === 'pending' ? row.created_at + PENDING_DAYS * DAY : null,
  decidedBy: row.decided_by,
  decidedByName: row.decided_by_name ?? null,
  decidedAt: row.decided_at,
})

/** A change as its own connection sees it: what it asked and how that went, not the contents it replaced. */
export const keyChangeView = (row: ChangeRow) => ({
  id: row.id,
  op: row.op,
  target: row.target,
  payload: parse<Operation>(row.payload),
  status: row.status,
  createdAt: row.created_at,
  expiresAt: row.status === 'pending' ? row.created_at + PENDING_DAYS * DAY : null,
  decidedAt: row.decided_at,
})

/** Marks pending changes past their 14 days as expired. Lazy: called wherever pending changes are read or decided. */
export async function expireStale(env: Env, shulId: string): Promise<void> {
  const now = Date.now()
  await env.DB.prepare(
    `UPDATE api_changes SET status = 'expired', decided_at = ?2
     WHERE shul_id = ?1 AND status = 'pending' AND created_at < ?3`,
  )
    .bind(shulId, now, now - PENDING_DAYS * DAY)
    .run()
}

export async function pendingCount(env: Env, connectionId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM api_changes WHERE connection_id = ? AND status = 'pending'`,
  )
    .bind(connectionId)
    .first<{ n: number }>()
  return row?.n ?? 0
}

export interface NewChange {
  id: string
  shulId: string
  connectionId: string
  userId: string
  op: Operation
  target: string
  before: Entry[]
  after: Entry[]
  status: 'pending' | 'applied'
  idempotencyKey: string | null
}

export async function insertChange(env: Env, c: NewChange): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO api_changes (id, shul_id, connection_id, user_id, op, target, payload, before, after, status, idempotency_key, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
  )
    .bind(
      c.id,
      c.shulId,
      c.connectionId,
      c.userId,
      c.op.op,
      c.target,
      JSON.stringify(c.op),
      JSON.stringify(c.before),
      JSON.stringify(c.after),
      c.status,
      c.idempotencyKey,
      Date.now(),
    )
    .run()
}

// ---------------------------------------------------------------------------
// Undo, shared by the admin, the admin's "undo everything since" and a key undoing its own work

type UndoResult =
  | { ok: true; revision: number }
  | { ok: false; status: 404 | 409; message: string; conflict?: { message: string; ids: string[] } }

/**
 * Reverts one applied change if what it left is still as it left it. The status moves to `reverted` first (so two
 * undos can't both run) and goes back if the revert can't be saved.
 */
export async function undoChange(
  env: Env,
  row: ChangeRow,
  decidedBy: string,
  actor: Actor,
): Promise<UndoResult> {
  const now = Date.now()
  const claimed = await env.DB.prepare(
    `UPDATE api_changes SET status = 'reverted', decided_by = ?2, decided_at = ?3
     WHERE id = ?1 AND status = 'applied' RETURNING id`,
  )
    .bind(row.id, decidedBy, now)
    .first()
  if (!claimed) return { ok: false, status: 409, message: `this change is already ${row.status}` }
  const change = {
    before: parse<Entry[]>(row.before) ?? [],
    after: parse<Entry[]>(row.after) ?? [],
  }
  const outcome = await saveSchedule<null, { message: string; ids: string[] }>(
    env,
    row.shul_id,
    (schedule) => {
      const r = revertOperation(schedule, change)
      return 'conflict' in r ? { rejected: r.conflict } : { schedule: r.schedule, result: null }
    },
    { ...actor, changeId: row.id },
  )
  if (outcome.status === 'saved') return { ok: true, revision: outcome.record.revision }
  await env.DB.prepare(
    `UPDATE api_changes SET status = 'applied', decided_by = ?2, decided_at = ?3 WHERE id = ?1`,
  )
    .bind(row.id, row.decided_by, row.decided_at)
    .run()
  if (outcome.status === 'rejected')
    return {
      ok: false,
      status: 409,
      message: `can't undo: ${outcome.rejected.message}`,
      conflict: outcome.rejected,
    }
  if (outcome.status === 'missing') return { ok: false, status: 404, message: 'no such shul' }
  return {
    ok: false,
    status: 409,
    message:
      outcome.status === 'invalid'
        ? `can't undo: ${outcome.message}`
        : 'the schedule kept changing; try again',
  }
}

// ---------------------------------------------------------------------------
// Admin endpoints (session-authenticated, any member). Flat `{ error }` like the rest of /api.

const LIST_SQL = `SELECT a.*, c.label AS connection_label, c.kind AS connection_kind, m.name AS user_name, d.name AS decided_by_name
  FROM api_changes a
  JOIN connections c ON c.id = a.connection_id
  LEFT JOIN members m ON m.shul_id = a.shul_id AND m.user_id = a.user_id
  LEFT JOIN members d ON d.shul_id = a.shul_id AND d.user_id = a.decided_by`

async function memberOf(request: Request, env: Env, slug: string) {
  const user = await requireUser(request, env)
  const shul = await findShul(env, slug)
  await requireRole(env, shul, user, 'editor')
  return { user, shul }
}

async function viewOf(env: Env, id: string) {
  const row = await env.DB.prepare(`${LIST_SQL} WHERE a.id = ?`).bind(id).first<ChangeJoin>()
  return row && adminChangeView(row)
}

/** Newest first. `?status=` and `?connectionId=` filter; `?limit=` up to 200 (default 100). */
export async function listChanges(
  request: Request,
  env: Env,
  slug: string,
  url: URL,
): Promise<Response> {
  const { shul } = await memberOf(request, env, slug)
  const status = url.searchParams.get('status')
  if (status !== null && !STATUSES.includes(status as ChangeStatus))
    throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100))
  await expireStale(env, shul.id)
  const { results } = await env.DB.prepare(
    `${LIST_SQL} WHERE a.shul_id = ?1 AND (?2 IS NULL OR a.status = ?2) AND (?3 IS NULL OR a.connection_id = ?3)
     ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?4`,
  )
    .bind(shul.id, status, url.searchParams.get('connectionId'), limit)
    .all<ChangeJoin>()
  return json({ changes: results.map(adminChangeView) })
}

async function pendingRow(env: Env, shulId: string, id: string): Promise<ChangeRow> {
  const row = await env.DB.prepare('SELECT * FROM api_changes WHERE id = ? AND shul_id = ?')
    .bind(id, shulId)
    .first<ChangeRow>()
  if (!row) throw new HttpError(404, 'no such change')
  return row
}

/** Applies the stored operation to the schedule as it is now. If it no longer fits it stays pending, with a 409. */
export async function approveChange(
  request: Request,
  env: Env,
  slug: string,
  id: string,
): Promise<Response> {
  const { user, shul } = await memberOf(request, env, slug)
  await expireStale(env, shul.id)
  const now = Date.now()
  // Claimed first, so approving twice can't apply twice; put back below if it can't be applied.
  const row = await env.DB.prepare(
    `UPDATE api_changes SET status = 'applied', decided_by = ?3, decided_at = ?4
     WHERE id = ?1 AND shul_id = ?2 AND status = 'pending' RETURNING *`,
  )
    .bind(id, shul.id, user.id, now)
    .first<ChangeRow>()
  if (!row) {
    const existing = await pendingRow(env, shul.id, id)
    throw new HttpError(409, `this change is already ${existing.status}`)
  }
  const op = parse<Operation>(row.payload)
  const outcome = op
    ? await saveSchedule<
        { target: string; before: Entry[]; after: Entry[] },
        { code: string; message: string }
      >(
        env,
        shul.id,
        (schedule: Schedule) => {
          const r = applyOperation(schedule, op, {
            today: todayIn(schedule.settings.location.timeZone),
            connectionId: row.connection_id,
          })
          return 'error' in r
            ? { rejected: r.error }
            : {
                schedule: r.schedule,
                result: { target: r.target, before: r.before, after: r.after },
              }
        },
        { userId: user.id, connectionId: row.connection_id, changeId: row.id },
      )
    : ({ status: 'invalid', message: 'the stored change is unreadable' } as const)
  if (outcome.status !== 'saved') {
    await env.DB.prepare(
      `UPDATE api_changes SET status = 'pending', decided_by = NULL, decided_at = NULL WHERE id = ?`,
    )
      .bind(id)
      .run()
    const message =
      outcome.status === 'rejected'
        ? `it no longer fits: ${outcome.rejected.message}`
        : outcome.status === 'invalid'
          ? `it no longer fits: ${outcome.message}`
          : outcome.status === 'conflict'
            ? 'the schedule kept changing; try again'
            : 'no such shul'
    return fail(409, message, outcome.status === 'rejected' ? { code: outcome.rejected.code } : {})
  }
  const { target, before, after } = outcome.result
  await env.DB.prepare('UPDATE api_changes SET target = ?2, before = ?3, after = ?4 WHERE id = ?1')
    .bind(id, target, JSON.stringify(before), JSON.stringify(after))
    .run()
  return json({ change: await viewOf(env, id), revision: outcome.record.revision })
}

export async function rejectChange(
  request: Request,
  env: Env,
  slug: string,
  id: string,
): Promise<Response> {
  const { user, shul } = await memberOf(request, env, slug)
  await expireStale(env, shul.id)
  const row = await env.DB.prepare(
    `UPDATE api_changes SET status = 'rejected', decided_by = ?3, decided_at = ?4
     WHERE id = ?1 AND shul_id = ?2 AND status = 'pending' RETURNING id`,
  )
    .bind(id, shul.id, user.id, Date.now())
    .first()
  if (!row) {
    const existing = await pendingRow(env, shul.id, id)
    throw new HttpError(409, `this change is already ${existing.status}`)
  }
  return json({ change: await viewOf(env, id) })
}

export async function undoOne(
  request: Request,
  env: Env,
  slug: string,
  id: string,
): Promise<Response> {
  const { user, shul } = await memberOf(request, env, slug)
  const row = await pendingRow(env, shul.id, id)
  const res = await undoChange(env, row, user.id, {
    userId: user.id,
    connectionId: row.connection_id,
  })
  if (!res.ok)
    return fail(res.status, res.message, res.conflict ? { conflict: res.conflict } : undefined)
  return json({ change: await viewOf(env, id), revision: res.revision })
}

/**
 * Undoes what a connection did since a moment (ms since epoch, or an ISO date-time), newest first, stopping at the
 * first change that can't be undone. Always 200: `undone` says how far it got, `conflict` why it stopped.
 */
export async function undoSince(request: Request, env: Env, slug: string): Promise<Response> {
  const { user, shul } = await memberOf(request, env, slug)
  const body = await readJson<{ connectionId?: unknown; since?: unknown }>(request, 1024)
  if (typeof body?.connectionId !== 'string') throw new HttpError(400, 'connectionId is required')
  const since =
    typeof body.since === 'number'
      ? body.since
      : typeof body.since === 'string'
        ? Date.parse(body.since)
        : NaN
  if (!Number.isFinite(since)) throw new HttpError(400, 'since must be a time')
  const { results } = await env.DB.prepare(
    `SELECT * FROM api_changes WHERE shul_id = ?1 AND connection_id = ?2 AND status = 'applied'
       AND COALESCE(decided_at, created_at) >= ?3
     ORDER BY COALESCE(decided_at, created_at) DESC, rowid DESC LIMIT 500`,
  )
    .bind(shul.id, body.connectionId, since)
    .all<ChangeRow>()
  const undone: string[] = []
  let conflict: { changeId: string; message: string; ids?: string[] } | null = null
  for (const row of results) {
    const res = await undoChange(env, row, user.id, {
      userId: user.id,
      connectionId: row.connection_id,
    })
    if (res.ok) undone.push(row.id)
    else {
      conflict = { changeId: row.id, message: res.message, ids: res.conflict?.ids }
      break
    }
  }
  return json({ undone, remaining: results.length - undone.length, conflict })
}

// ---------------------------------------------------------------------------
// A key's own view (`/v1`)

/** `GET /v1/shuls/:slug/changes?status=` — this connection's own changes, newest first. */
export async function listOwnChanges(
  request: Request,
  env: Env,
  slug: string,
  url: URL,
): Promise<Response> {
  const { connection, shul } = await requireConnection(request, env, slug)
  const status = url.searchParams.get('status')
  if (status !== null && !STATUSES.includes(status as ChangeStatus))
    throw new ApiError(400, 'invalid', `status must be one of ${STATUSES.join(', ')}`)
  await expireStale(env, shul.id)
  const { results } = await env.DB.prepare(
    `SELECT * FROM api_changes WHERE connection_id = ?1 AND (?2 IS NULL OR status = ?2)
     ORDER BY created_at DESC, rowid DESC LIMIT 100`,
  )
    .bind(connection.id, status)
    .all<ChangeRow>()
  return json({ changes: results.map(keyChangeView) })
}

/** `POST /v1/shuls/:slug/changes/:id/undo` — a key undoing its own applied change. */
export async function undoOwnChange(
  request: Request,
  env: Env,
  slug: string,
  id: string,
): Promise<Response> {
  const { connection } = await requireConnection(request, env, slug)
  if (env.V1_WRITES === 'off')
    return apiFail(503, 'writes_disabled', 'Writes are paused for everyone right now')
  const row = await env.DB.prepare('SELECT * FROM api_changes WHERE id = ? AND connection_id = ?')
    .bind(id, connection.id)
    .first<ChangeRow>()
  if (!row) throw new ApiError(404, 'not_found', 'No such change')
  if (row.status !== 'applied')
    throw new ApiError(409, 'conflict', `This change is ${row.status}, so there is nothing to undo`)
  const res = await undoChange(env, row, connection.userId, {
    userId: connection.userId,
    connectionId: connection.id,
  })
  if (!res.ok)
    throw new ApiError(
      res.status,
      res.status === 404 ? 'not_found' : 'conflict',
      res.message,
      res.conflict,
    )
  return Response.json({ status: 'reverted', changeId: id, revision: res.revision })
}
