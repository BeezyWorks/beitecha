import {
  applyOperation,
  isRemoval,
  operationScope,
  todayIn,
  type Entry,
  type Operation,
  type OperationError,
  type Schedule,
} from '@beitecha/engine'

import { MAX_PENDING, expireStale, insertChange, pendingCount, type ChangeRow } from './changes'
import { requireConnection, requireScope, notFound, type Connection } from './connections'
import type { Env } from './env'
import { ApiError, HttpError } from './http'
import {
  MAX_SCHEDULE_BYTES,
  saveSchedule,
  scheduleProblem,
  shulRecord,
  type ShulRow,
} from './shuls'

/** Operations are small; anything bigger is not one. */
export const MAX_OPERATION_BYTES = 8 * 1024
/** Writes a connection may make in one of the shul's days (applied or waiting). */
export const DAILY_WRITES = 50
/** Edits of other people's items and removals a connection may have applied in a day before a gabbai must look. */
export const DAILY_GUARDED = 3
const IDEMPOTENCY_MS = 24 * 3_600_000

type Applied = Extract<ReturnType<typeof applyOperation>, { schedule: Schedule }>

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const STATUS_OF: Record<OperationError['code'], number> = {
  invalid: 400,
  ambiguous: 400,
  date_out_of_range: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  limit: 422,
}

export const engineError = (e: OperationError) =>
  new ApiError(STATUS_OF[e.code] ?? 400, e.code, e.message, e.details)

/** Items this connection did not create: the edit or removal touches somebody else's work. */
const touchesOthers = (op: Pick<Operation, 'op'>, before: Entry[], connectionId: string) =>
  isRemoval(op) ||
  before.some(
    (e) =>
      e.item &&
      (e.item as { origin?: { connectionId?: string } }).origin?.connectionId !== connectionId,
  )

/**
 * Why a change waits for a gabbai instead of going live, or null when it goes live.
 *
 * - the connection asks first (`review` mode);
 * - a minyan's time or existence changes (`needsReview`), in any mode;
 * - a removal, or an edit of an item the connection didn't create, once it already has `DAILY_GUARDED` of those
 *   applied today.
 */
export function pendingReason(
  connection: Pick<Connection, 'id' | 'mode'>,
  op: Operation,
  result: Pick<Applied, 'before' | 'needsReview'>,
  guardedToday: number,
): string | null {
  if (connection.mode === 'review') return 'This connection asks a gabbai to approve changes first'
  if (result.needsReview) return result.needsReview
  if (touchesOthers(op, result.before, connection.id) && guardedToday >= DAILY_GUARDED)
    return `A connection can change or remove at most ${DAILY_GUARDED} existing items a day on its own; this one waits for a gabbai`
  return null
}

async function readOperation(request: Request): Promise<Operation> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_OPERATION_BYTES)
    throw new ApiError(413, 'too_large', 'The request body is too large')
  const text = await request.text()
  if (text.length > MAX_OPERATION_BYTES)
    throw new ApiError(413, 'too_large', 'The request body is too large')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(400, 'invalid', 'The body must be JSON')
  }
  if (!isObject(body) || typeof body.op !== 'string')
    throw new ApiError(400, 'invalid', 'The body must be one operation: { "op": "…", … }')
  return body as unknown as Operation
}

function idempotencyKey(request: Request): string | null {
  const key = request.headers.get('idempotency-key')
  if (key === null) return null
  if (!/^[\x21-\x7e]{1,128}$/.test(key))
    throw new ApiError(400, 'invalid', 'Idempotency-Key must be 1 to 128 printable characters')
  return key
}

/** What a change answers with. `revision` is the schedule's revision it produced, when it was applied. */
async function responseOf(
  env: Env,
  row: Pick<ChangeRow, 'id' | 'status' | 'target' | 'before' | 'after'>,
  extra: { revision?: number; reason?: string } = {},
  replay = false,
): Promise<Response> {
  let revision = extra.revision
  if (revision === undefined && row.status !== 'pending') {
    const h = await env.DB.prepare(
      'SELECT revision FROM history WHERE change_id = ? ORDER BY revision LIMIT 1',
    )
      .bind(row.id)
      .first<{ revision: number }>()
    revision = h?.revision
  }
  return Response.json(
    {
      status: row.status,
      changeId: row.id,
      target: row.target,
      ...(revision !== undefined && { revision }),
      before: JSON.parse(row.before ?? '[]'),
      after: JSON.parse(row.after ?? '[]'),
      ...(extra.reason && { reason: extra.reason }),
    },
    { status: 201, headers: replay ? { 'idempotent-replay': 'true' } : {} },
  )
}

const isUnique = (e: unknown) => /UNIQUE|constraint/i.test(String((e as Error)?.message))

/**
 * `POST /v1/shuls/:slug/operations` with one operation as the body.
 *
 * Connection → scope → idempotency replay → the day's write cap → the operation dry-run on the current schedule
 * (an engine error is the answer) → applied or pending (see `pendingReason`). Applied goes through `saveSchedule`
 * (revision-checked, retried); pending is stored and the schedule is untouched until a member approves it.
 */
export async function postOperation(request: Request, env: Env, slug: string): Promise<Response> {
  const { connection, shul } = await requireConnection(request, env, slug)
  if (env.V1_WRITES === 'off')
    throw new ApiError(503, 'writes_disabled', 'Writes are paused for everyone right now')
  const op = await readOperation(request)
  const scope = operationScope(op)
  if (!scope)
    throw new ApiError(400, 'invalid', `${String(op.op).slice(0, 40)} is not an operation`)
  requireScope(connection, scope)
  const key = idempotencyKey(request)

  const now = Date.now()
  if (key) {
    const seen = await env.DB.prepare(
      'SELECT * FROM api_changes WHERE connection_id = ? AND idempotency_key = ?',
    )
      .bind(connection.id, key)
      .first<ChangeRow>()
    if (seen && now - seen.created_at < IDEMPOTENCY_MS) {
      if (seen.payload !== JSON.stringify(op))
        throw new ApiError(
          409,
          'idempotency_conflict',
          'That Idempotency-Key was used for a different operation',
        )
      return responseOf(env, seen, {}, true)
    }
    // Older than a day: free the key for reuse.
    if (seen)
      await env.DB.prepare('UPDATE api_changes SET idempotency_key = NULL WHERE id = ?')
        .bind(seen.id)
        .run()
  }

  const row = await env.DB.prepare('SELECT * FROM shuls WHERE id = ?')
    .bind(shul.id)
    .first<ShulRow>()
  if (!row) throw notFound()
  const tz = shulRecord(row).schedule.settings.location.timeZone
  const today = todayIn(tz)

  // The shul's day, from what this connection has already done.
  const { results: recent } = await env.DB.prepare(
    'SELECT op, status, before, created_at, decided_by FROM api_changes WHERE connection_id = ? AND created_at > ?',
  )
    .bind(connection.id, now - 2 * 86_400_000)
    .all<Pick<ChangeRow, 'op' | 'status' | 'before' | 'created_at' | 'decided_by'>>()
  const todays = recent.filter((r) => todayIn(tz, new Date(r.created_at)) === today)
  if (todays.length >= DAILY_WRITES)
    throw new ApiError(
      429,
      'daily_limit',
      `This connection has made its ${DAILY_WRITES} writes for today`,
    )
  const guardedToday = todays.filter(
    (r) =>
      (r.status === 'applied' || r.status === 'reverted') &&
      r.decided_by === null &&
      touchesOthers({ op: r.op } as Operation, JSON.parse(r.before ?? '[]'), connection.id),
  ).length

  const changeId = crypto.randomUUID()
  const ctx = (schedule: Schedule) => ({
    today: todayIn(schedule.settings.location.timeZone),
    connectionId: connection.id,
  })

  const dry = applyOperation(shulRecord(row).schedule, op, ctx(shulRecord(row).schedule))
  if ('error' in dry) throw engineError(dry.error)
  const problem = scheduleProblem(dry.schedule)
  if (problem) throw new ApiError(400, 'invalid', problem)
  if (JSON.stringify(dry.schedule).length > MAX_SCHEDULE_BYTES)
    throw new ApiError(422, 'limit', 'The schedule is too large')

  const wait = async (preview: Applied, reason: string) => {
    await expireStale(env, shul.id)
    if ((await pendingCount(env, connection.id)) >= MAX_PENDING)
      throw new ApiError(
        429,
        'too_many_pending',
        `This connection already has ${MAX_PENDING} changes waiting for a gabbai`,
      )
    try {
      await insertChange(env, {
        id: changeId,
        shulId: shul.id,
        connectionId: connection.id,
        userId: connection.userId,
        op,
        target: preview.target,
        before: preview.before,
        after: preview.after,
        status: 'pending',
        idempotencyKey: key,
      })
    } catch (e) {
      if (key && isUnique(e)) return replayOf(env, connection.id, key)
      throw e
    }
    return responseOf(
      env,
      {
        id: changeId,
        status: 'pending',
        target: preview.target,
        before: JSON.stringify(preview.before),
        after: JSON.stringify(preview.after),
      },
      { reason },
    )
  }

  const reason = pendingReason(connection, op, dry, guardedToday)
  if (reason) return wait(dry, reason)

  const outcome = await saveSchedule<
    Applied,
    { error: OperationError } | { pending: string; preview: Applied }
  >(
    env,
    shul.id,
    (schedule) => {
      const r = applyOperation(schedule, op, ctx(schedule))
      if ('error' in r) return { rejected: { error: r.error } }
      // The schedule may have moved since the dry run (an admin saved); decide again on what is there now.
      const why = pendingReason(connection, op, r, guardedToday)
      if (why) return { rejected: { pending: why, preview: r } }
      return { schedule: r.schedule, result: r }
    },
    { userId: connection.userId, connectionId: connection.id, changeId },
  )

  switch (outcome.status) {
    case 'rejected':
      if ('error' in outcome.rejected) throw engineError(outcome.rejected.error)
      return wait(outcome.rejected.preview, outcome.rejected.pending)
    case 'invalid':
      throw new ApiError(400, 'invalid', outcome.message)
    case 'conflict':
      throw new ApiError(
        409,
        'conflict',
        'The schedule is being changed at the same time; try again',
      )
    case 'missing':
      throw notFound()
  }
  const r = outcome.result
  try {
    await insertChange(env, {
      id: changeId,
      shulId: shul.id,
      connectionId: connection.id,
      userId: connection.userId,
      op,
      target: r.target,
      before: r.before,
      after: r.after,
      status: 'applied',
      idempotencyKey: key,
    })
  } catch (e) {
    // Two requests with one key at once: the other recorded first.
    if (key && isUnique(e)) return replayOf(env, connection.id, key)
    throw e
  }
  return responseOf(
    env,
    {
      id: changeId,
      status: 'applied',
      target: r.target,
      before: JSON.stringify(r.before),
      after: JSON.stringify(r.after),
    },
    { revision: outcome.record.revision },
  )
}

async function replayOf(env: Env, connectionId: string, key: string): Promise<Response> {
  const seen = await env.DB.prepare(
    'SELECT * FROM api_changes WHERE connection_id = ? AND idempotency_key = ?',
  )
    .bind(connectionId, key)
    .first<ChangeRow>()
  if (!seen) throw new HttpError(409, 'try again')
  return responseOf(env, seen, {}, true)
}
