import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import {
  LAST_USED_EVERY_MS,
  countBadSecret,
  requireConnection,
  requireScope,
  sha256Hex,
} from '../connections'
import type { Env } from '../env'
import { ApiError } from '../http'
import worker from '../index'
import { MAX_SAVE_ATTEMPTS, saveSchedule } from '../shuls'

const ORIGIN = 'https://beitecha.test'
const testEnv = env as unknown as Env
const db = testEnv.DB

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
  )
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

const location = {
  latitude: 40.0821,
  longitude: -74.2097,
  timeZone: 'America/New_York',
  israel: false,
}
let n = 0
let u = 0
/** A fresh user id, so per-user limits don't leak between tests. */
const user = (name = 'u') => `${name}-${++u}-${Math.random().toString(36).slice(2, 6)}`

async function newShul(
  owner: string,
  api: { enabled?: boolean; defaultMode?: string } = { enabled: true },
) {
  const slug = `conn-${++n}-${Math.random().toString(36).slice(2, 7)}`
  const res = await call(
    'POST',
    '/api/shuls',
    { slug, profile: { name: { en: `Shul ${n}` } }, location },
    owner,
  )
  expect(res.status).toBe(201)
  if (api.enabled !== undefined || api.defaultMode)
    expect((await call('PUT', `/api/shuls/${slug}/api`, api, owner)).status).toBe(200)
  return slug
}

async function addMember(
  slug: string,
  owner: string,
  member: string,
  role: 'owner' | 'editor' = 'editor',
) {
  const invite = await call('POST', `/api/shuls/${slug}/invites`, { role }, owner)
  expect((await call('POST', `/api/invites/${invite.data.token}`, undefined, member)).status).toBe(
    200,
  )
}

const makeKey = (slug: string, token: string, body: Record<string, unknown> = {}) =>
  call(
    'POST',
    `/api/shuls/${slug}/connections`,
    { purpose: 'script', label: 'Test', ...body },
    token,
  )

const shulId = async (slug: string) =>
  (await db.prepare('SELECT id FROM shuls WHERE slug = ?').bind(slug).first<{ id: string }>())!.id
const row = (id: string) =>
  db.prepare('SELECT * FROM connections WHERE id = ?').bind(id).first<any>()

function request(key?: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/v1/x`, {
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
  })
}
async function auth(slug: string, key?: string, headers?: Record<string, string>) {
  try {
    return { ok: await requireConnection(request(key, headers), testEnv, slug) }
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, code: e.code, message: e.message }
    throw e
  }
}

describe('turning the API on', () => {
  it('is off by default, owner-only, and blocks creating keys while off', async () => {
    const owner = user('owner')
    const editor = user('ed')
    const slug = await newShul(owner, {})
    await addMember(slug, owner, editor)
    const list = await call('GET', `/api/shuls/${slug}/connections`, undefined, owner)
    expect(list.data).toEqual({ enabled: false, defaultMode: 'review', minyanMode: 'review', connections: [] })
    expect((await makeKey(slug, owner)).status).toBe(403)
    expect((await call('PUT', `/api/shuls/${slug}/api`, { enabled: true }, editor)).status).toBe(
      403,
    )
    expect((await call('PUT', `/api/shuls/${slug}/api`, {}, owner)).status).toBe(400)
    expect((await call('PUT', `/api/shuls/${slug}/api`, { defaultMode: 'x' }, owner)).status).toBe(
      400,
    )
    const on = await call(
      'PUT',
      `/api/shuls/${slug}/api`,
      { enabled: true, defaultMode: 'publish' },
      owner,
    )
    expect(on.data).toEqual({ enabled: true, defaultMode: 'publish', minyanMode: 'review', revoked: 0 })
    expect((await makeKey(slug, editor)).status).toBe(201)
    expect(
      (await call('PUT', `/api/shuls/${slug}/api`, { enabled: true }, 'stranger')).status,
    ).toBe(403)
  })

  it('revokes every connection when turned off', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const a = await makeKey(slug, owner)
    const b = await makeKey(slug, owner)
    const off = await call('PUT', `/api/shuls/${slug}/api`, { enabled: false }, owner)
    expect(off.data).toEqual({ enabled: false, defaultMode: 'review', minyanMode: 'review', revoked: 2 })
    expect((await auth(slug, a.data.key)).status).toBe(401)
    expect((await makeKey(slug, owner)).status).toBe(403)
    // Turned back on, the old keys stay dead.
    await call('PUT', `/api/shuls/${slug}/api`, { enabled: true }, owner)
    expect((await auth(slug, a.data.key)).status).toBe(401)
  })
})

describe('creating a key', () => {
  it('shows the key once and stores only its hash and prefix', async () => {
    const owner = user('owner')
    const slug = await newShul(owner, { enabled: true, defaultMode: 'publish' })
    const res = await makeKey(slug, owner, { label: '  Rivka’s   script ', purpose: 'skill' })
    expect(res.status).toBe(201)
    const { key, connection } = res.data
    expect(key).toMatch(/^bk_sec_[0-9A-Za-z]{32}$/)
    expect(connection).toMatchObject({
      kind: 'key',
      purpose: 'skill',
      label: 'Rivka’s script',
      mode: 'publish',
      prefix: key.slice(0, 11),
      mine: true,
      scopes: ['sponsors', 'notices', 'changes', 'events', 'yahrzeits', 'occasions'],
    })
    expect(JSON.stringify(connection)).not.toContain(key)
    expect(connection.expiresAt - connection.createdAt).toBe(90 * 86_400_000)
    const stored = await row(connection.id)
    expect(stored.hash).toBe(await sha256Hex(key))
    expect(stored.hash).not.toContain(key)
    expect(JSON.stringify(stored)).not.toContain(key)
    expect(stored.prefix).toBe(key.slice(0, 11))
    const list = await call('GET', `/api/shuls/${slug}/connections`, undefined, owner)
    expect(JSON.stringify(list.data)).not.toContain(key)
    expect(JSON.stringify(list.data)).not.toContain(stored.hash)
    expect(list.data.connections[0]).not.toHaveProperty('hash')
  })

  it('makes different keys and takes scopes, mode and expiry', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const a = await makeKey(slug, owner, {
      scopes: ['cholim', 'sponsors'],
      mode: 'publish',
      expiresInDays: 365,
    })
    expect(a.data.connection).toMatchObject({ scopes: ['sponsors', 'cholim'], mode: 'publish' })
    expect(a.data.connection.expiresAt - a.data.connection.createdAt).toBe(365 * 86_400_000)
    expect(a.data.connection.mode).toBe('publish')
    const b = await makeKey(slug, owner)
    expect(b.data.connection.mode).toBe('review')
    expect(a.data.key).not.toBe(b.data.key)
  })

  it('checks what it is given', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    for (const body of [
      { purpose: 'assistant' },
      { purpose: undefined },
      { scopes: [] },
      { scopes: ['everything'] },
      { mode: 'yolo' },
      { expiresInDays: 366 },
      { expiresInDays: 0 },
      { expiresInDays: 1.5 },
      { expiresInDays: 'soon' },
      { label: 'x'.repeat(61) },
    ])
      expect((await makeKey(slug, owner, body)).status, JSON.stringify(body)).toBe(400)
    expect((await makeKey(slug, 'stranger')).status).toBe(403)
    expect(
      (await call('POST', `/api/shuls/${slug}/connections`, { purpose: 'script' })).status,
    ).toBe(401)
    // The label may be left out.
    expect((await makeKey(slug, owner, { label: undefined })).data.connection.label).toBe('Script')
  })

  it('allows 3 active per person and 10 per shul, and says so', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const keys = []
    for (let i = 0; i < 3; i++) keys.push(await makeKey(slug, owner))
    const fourth = await makeKey(slug, owner)
    expect(fourth.status).toBe(409)
    expect(fourth.data.error).toMatch(/3 active connections/)
    await call(
      'DELETE',
      `/api/shuls/${slug}/connections/${keys[0].data.connection.id}`,
      undefined,
      owner,
    )
    expect((await makeKey(slug, owner)).status).toBe(201)

    const id = await shulId(slug)
    // An expired key doesn't count.
    await db.prepare('UPDATE connections SET expires_at = 1 WHERE shul_id = ?').bind(id).run()
    for (let i = 0; i < 3; i++) expect((await makeKey(slug, owner)).status).toBe(201)
    for (const who of [user('a'), user('b'), user('c')]) {
      await addMember(slug, owner, who)
      for (let i = 0; i < 3; i++) await makeKey(slug, who)
    }
    const active = await db
      .prepare(
        'SELECT COUNT(*) AS n FROM connections WHERE shul_id = ? AND revoked_at IS NULL AND expires_at > ?',
      )
      .bind(id, Date.now())
      .first<{ n: number }>()
    expect(active!.n).toBe(10)
    const late = user('late')
    await addMember(slug, owner, late)
    const full = await makeKey(slug, late)
    expect(full.status).toBe(409)
    expect(full.data.error).toMatch(/10 active connections/)
  })

  it('limits how many a person can make in an hour', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const id = await shulId(slug)
    const now = Date.now()
    for (let i = 0; i < 10; i++)
      await db
        .prepare(
          `INSERT INTO connections (id, shul_id, user_id, kind, purpose, label, scopes, created_at, revoked_at)
           VALUES (?, ?, ?, 'key', 'script', 'old', '[]', ?, ?)`,
        )
        .bind(`old-${slug}-${i}`, id, owner, now - 60_000, now)
        .run()
    const res = await makeKey(slug, owner)
    expect(res.status).toBe(429)
    await db
      .prepare('UPDATE connections SET created_at = ? WHERE shul_id = ?')
      .bind(now - 3_700_000, id)
      .run()
    expect((await makeKey(slug, owner)).status).toBe(201)
  })
})

describe('listing, changing and revoking', () => {
  it('shows owners every connection and editors their own', async () => {
    const owner = user('owner')
    const editor = user('ed')
    const slug = await newShul(owner)
    await addMember(slug, owner, editor)
    await makeKey(slug, owner, { label: 'Owner key' })
    await makeKey(slug, editor, { label: 'Editor key' })
    const asOwner = await call('GET', `/api/shuls/${slug}/connections`, undefined, owner)
    expect(asOwner.data.connections.map((c: any) => c.label).sort()).toEqual([
      'Editor key',
      'Owner key',
    ])
    const seen = asOwner.data.connections.find((c: any) => c.label === 'Editor key')
    expect(seen).toMatchObject({
      userId: editor,
      userName: `User ${editor}`,
      mine: false,
      purpose: 'script',
      lastUsedAt: null,
    })
    const asEditor = await call('GET', `/api/shuls/${slug}/connections`, undefined, editor)
    expect(asEditor.data.connections.map((c: any) => c.label)).toEqual(['Editor key'])
    expect(
      (await call('GET', `/api/shuls/${slug}/connections`, undefined, 'stranger')).status,
    ).toBe(403)
  })

  it('lets an owner or the connection’s person change it, and nobody else', async () => {
    const owner = user('owner')
    const editor = user('ed')
    const other = user('other')
    const slug = await newShul(owner)
    await addMember(slug, owner, editor)
    await addMember(slug, owner, other)
    const key = (await makeKey(slug, editor)).data.connection.id
    const path = `/api/shuls/${slug}/connections/${key}`
    expect((await call('PATCH', path, { mode: 'publish' }, other)).status).toBe(403)
    const own = await call(
      'PATCH',
      path,
      { mode: 'publish', label: ' Mine ', scopes: ['notices', 'cholim'] },
      editor,
    )
    expect(own.data.connection).toMatchObject({
      mode: 'publish',
      label: 'Mine',
      scopes: ['notices', 'cholim'],
      userName: `User ${editor}`,
    })
    expect((await call('PATCH', path, { mode: 'review' }, owner)).data.connection.mode).toBe(
      'review',
    )
    expect((await call('PATCH', path, { scopes: ['nope'] }, owner)).status).toBe(400)
    expect((await call('PATCH', path, {}, owner)).status).toBe(400)
    expect((await call('PATCH', path, { mode: 'x' }, owner)).status).toBe(400)
    expect(
      (await call('PATCH', `/api/shuls/${slug}/connections/nope`, { mode: 'review' }, owner))
        .status,
    ).toBe(404)
    // Another shul's owner can't reach it through their own shul.
    const otherOwner = user('owner')
    const otherSlug = await newShul(otherOwner)
    expect(
      (
        await call(
          'PATCH',
          `/api/shuls/${otherSlug}/connections/${key}`,
          { mode: 'review' },
          otherOwner,
        )
      ).status,
    ).toBe(404)
    expect(
      (await call('DELETE', `/api/shuls/${otherSlug}/connections/${key}`, undefined, otherOwner))
        .status,
    ).toBe(404)
    await call('DELETE', path, undefined, editor)
    expect((await call('PATCH', path, { mode: 'review' }, owner)).status).toBe(409)
  })

  it('revokes one at a time, at once, and twice is fine', async () => {
    const owner = user('owner')
    const editor = user('ed')
    const other = user('other')
    const slug = await newShul(owner)
    await addMember(slug, owner, editor)
    await addMember(slug, owner, other)
    const made = await makeKey(slug, editor)
    const path = `/api/shuls/${slug}/connections/${made.data.connection.id}`
    expect((await auth(slug, made.data.key)).ok).toBeTruthy()
    expect((await call('DELETE', path, undefined, other)).status).toBe(403)
    expect((await call('DELETE', path, undefined, editor)).status).toBe(204)
    expect((await auth(slug, made.data.key)).status).toBe(401)
    const first = (await row(made.data.connection.id)).revoked_at
    expect((await call('DELETE', path, undefined, owner)).status).toBe(204)
    expect((await row(made.data.connection.id)).revoked_at).toBe(first)
    const list = await call('GET', `/api/shuls/${slug}/connections`, undefined, editor)
    expect(list.data.connections[0].revokedAt).toBe(first)
  })

  it('revokes all for owners only', async () => {
    const owner = user('owner')
    const editor = user('ed')
    const slug = await newShul(owner)
    await addMember(slug, owner, editor)
    const a = await makeKey(slug, owner)
    const b = await makeKey(slug, editor)
    expect(
      (await call('POST', `/api/shuls/${slug}/connections/revoke-all`, undefined, editor)).status,
    ).toBe(403)
    const res = await call('POST', `/api/shuls/${slug}/connections/revoke-all`, undefined, owner)
    expect(res.data).toEqual({ revoked: 2 })
    expect((await auth(slug, a.data.key)).status).toBe(401)
    expect((await auth(slug, b.data.key)).status).toBe(401)
    // The API itself stays on.
    expect(
      (await call('GET', `/api/shuls/${slug}/connections`, undefined, owner)).data.enabled,
    ).toBe(true)
    expect(
      (await call('POST', `/api/shuls/${slug}/connections/revoke-all`, undefined, owner)).data,
    ).toEqual({ revoked: 0 })
  })
})

describe('requireConnection', () => {
  const setup = async () => {
    const owner = user('owner')
    const editor = user('ed')
    const slug = await newShul(owner, { enabled: true, defaultMode: 'publish' })
    await addMember(slug, owner, editor)
    const made = await makeKey(slug, editor, { scopes: ['notices'] })
    return {
      owner,
      editor,
      slug,
      key: made.data.key as string,
      id: made.data.connection.id as string,
    }
  }

  it('accepts a valid key and says who and what', async () => {
    const { slug, key, id, editor } = await setup()
    const got = (await auth(slug, key)).ok!
    expect(got.connection).toMatchObject({
      id,
      userId: editor,
      kind: 'key',
      scopes: ['notices'],
      mode: 'publish',
    })
    expect(got.role).toBe('editor')
    expect(got.shul).toMatchObject({ slug, defaultMode: 'publish' })
    expect(got.shul.id).toBe(await shulId(slug))
    expect(() => requireScope(got.connection, 'notices')).not.toThrow()
    expect(() => requireScope(got.connection, 'cholim')).toThrow(ApiError)
    try {
      requireScope(got.connection, 'cholim')
    } catch (e) {
      expect(e).toMatchObject({ status: 403, code: 'forbidden' })
    }
  })

  it('answers 401 for no, malformed, wrong, revoked and expired keys', async () => {
    const { slug, key, id } = await setup()
    const unauthorized = { status: 401, code: 'unauthorized' }
    expect(await auth(slug)).toMatchObject(unauthorized)
    expect(await auth(slug, 'not-a-key')).toMatchObject(unauthorized)
    expect(await auth(slug, 'bk_sec_' + 'a'.repeat(32))).toMatchObject(unauthorized)
    expect(await auth(slug, key.slice(0, -1))).toMatchObject(unauthorized)
    expect(await auth(slug, key + 'x')).toMatchObject(unauthorized)
    // A key in the query string is not read.
    const q = new Request(`${ORIGIN}/v1/x?key=${key}&access_token=${key}`)
    await expect(requireConnection(q, testEnv, slug)).rejects.toMatchObject({ status: 401 })
    // Only Bearer.
    await expect(
      requireConnection(
        new Request(ORIGIN, { headers: { authorization: `Basic ${key}` } }),
        testEnv,
        slug,
      ),
    ).rejects.toMatchObject({ status: 401 })

    await db
      .prepare('UPDATE connections SET expires_at = ? WHERE id = ?')
      .bind(Date.now() - 1, id)
      .run()
    expect(await auth(slug, key)).toMatchObject(unauthorized)
    await db
      .prepare('UPDATE connections SET expires_at = ? WHERE id = ?')
      .bind(Date.now() + 60_000, id)
      .run()
    expect((await auth(slug, key)).ok).toBeTruthy()
    await db
      .prepare('UPDATE connections SET revoked_at = ? WHERE id = ?')
      .bind(Date.now(), id)
      .run()
    expect(await auth(slug, key)).toMatchObject(unauthorized)
  })

  it('stops working when the member leaves, but not when they are demoted', async () => {
    const { owner, editor, slug, key } = await setup()
    const ownerKey = (await makeKey(slug, owner)).data.key
    expect((await auth(slug, ownerKey)).ok!.role).toBe('owner')
    await db.prepare(`UPDATE members SET role = 'editor' WHERE user_id = ?`).bind(owner).run()
    expect((await auth(slug, ownerKey)).ok!.role).toBe('editor')
    await db.prepare(`UPDATE members SET role = 'owner' WHERE user_id = ?`).bind(owner).run()

    expect(
      (await call('DELETE', `/api/shuls/${slug}/members/${editor}`, undefined, owner)).status,
    ).toBe(204)
    expect(await auth(slug, key)).toMatchObject({ status: 401, code: 'unauthorized' })
    expect((await auth(slug, ownerKey)).ok).toBeTruthy()
  })

  it('answers the same 404 when the API is off, the slug is another shul’s or doesn’t exist', async () => {
    const { slug, key } = await setup()
    const otherSlug = await newShul(user('owner'))
    const expected = { status: 404, code: 'not_found' }
    const wrong = await auth(otherSlug, key)
    const missing = await auth('no-such-shul', key)
    expect(wrong).toMatchObject(expected)
    expect(missing).toEqual(wrong)
    await db.prepare('UPDATE shuls SET api_enabled = 0 WHERE slug = ?').bind(slug).run()
    expect(await auth(slug, key)).toEqual(wrong)
    await db.prepare('UPDATE shuls SET api_enabled = 1 WHERE slug = ?').bind(slug).run()
    expect((await auth(slug, key)).ok).toBeTruthy()
    // The key can't be used on the other shul even if that shul has the API on.
    expect(await auth(otherSlug, key)).toEqual(wrong)
  })

  it('counts bad secrets against the caller’s IP limit, and good ones not', async () => {
    const { slug, key } = await setup()
    const headers = { 'cf-connecting-ip': '198.51.100.9' }
    const codes = []
    for (let i = 0; i < 5; i++)
      codes.push((await auth(slug, 'bk_sec_' + String(i).repeat(32), headers)).status)
    expect(codes).toEqual([401, 401, 401, 429, 429])
    const other = { 'cf-connecting-ip': '198.51.100.10' }
    for (let i = 0; i < 6; i++) expect((await auth(slug, key, other)).ok).toBeTruthy()
    await expect(countBadSecret(request(undefined, headers), testEnv)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limited',
    })
    await expect(countBadSecret(request(), testEnv)).resolves.toBeUndefined()
  })

  it('records the last use at most every five minutes', async () => {
    const { slug, key, id } = await setup()
    expect((await row(id)).last_used_at).toBeNull()
    await auth(slug, key, { 'cf-connecting-ip': '203.0.113.50', 'user-agent': 'beitecha.py/1' })
    const first = await row(id)
    expect(first).toMatchObject({ last_ip: '203.0.113.50', last_user_agent: 'beitecha.py/1' })
    expect(first.last_used_at).toBeGreaterThan(0)
    await auth(slug, key, { 'cf-connecting-ip': '203.0.113.51', 'user-agent': 'other' })
    expect(await row(id)).toMatchObject({
      last_used_at: first.last_used_at,
      last_ip: '203.0.113.50',
    })
    await db
      .prepare('UPDATE connections SET last_used_at = ? WHERE id = ?')
      .bind(first.last_used_at - LAST_USED_EVERY_MS - 1, id)
      .run()
    await auth(slug, key, { 'cf-connecting-ip': '203.0.113.51', 'user-agent': 'other' })
    const later = await row(id)
    expect(later).toMatchObject({ last_ip: '203.0.113.51', last_user_agent: 'other' })
    expect(later.last_used_at).toBeGreaterThanOrEqual(first.last_used_at)
    // Failed lookups write nothing.
    await auth(slug, 'bk_sec_' + 'z'.repeat(32), { 'user-agent': 'bad' })
    expect((await row(id)).last_user_agent).toBe('other')
  })
})

describe('saving', () => {
  const getAdmin = (slug: string, token: string) =>
    call('GET', `/api/shuls/${slug}/admin`, undefined, token)
  const history = (slug: string) =>
    db
      .prepare(
        'SELECT revision, user_id, connection_id, change_id FROM history WHERE shul_id = (SELECT id FROM shuls WHERE slug = ?) ORDER BY revision',
      )
      .bind(slug)
      .all<any>()

  it('putShul keeps its 409 body and history row', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const admin = await getAdmin(slug, owner)
    const profile = { name: { en: 'Renamed' } }
    const saved = await call(
      'PUT',
      `/api/shuls/${slug}`,
      { profile, baseRevision: admin.data.revision },
      owner,
    )
    expect(saved.status).toBe(200)
    expect(Object.keys(saved.data).sort()).toEqual([
      'listed',
      'profile',
      'revision',
      'schedule',
      'slug',
      'updatedAt',
    ])
    expect(saved.data.revision).toBe(admin.data.revision + 1)
    const stale = await call(
      'PUT',
      `/api/shuls/${slug}`,
      { profile, baseRevision: admin.data.revision },
      owner,
    )
    expect(stale.status).toBe(409)
    expect(Object.keys(stale.data).sort()).toEqual([
      'error',
      'listed',
      'profile',
      'revision',
      'schedule',
      'slug',
      'updatedAt',
    ])
    expect(stale.data.error).toBe('revision conflict')
    expect(stale.data.revision).toBe(saved.data.revision)
    expect((await history(slug)).results).toEqual([
      { revision: 1, user_id: owner, connection_id: null, change_id: null },
      { revision: 2, user_id: owner, connection_id: null, change_id: null },
    ])
  })

  const addNotice = (text: string) => (schedule: any) => ({
    schedule: {
      ...schedule,
      notices: [...schedule.notices, { id: text, kind: 'announcement', text: { en: text } }],
    },
    result: text,
  })

  it('saveSchedule writes the change, the actor and the history', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const id = await shulId(slug)
    const out = await saveSchedule(testEnv, id, addNotice('one'), {
      userId: owner,
      connectionId: 'c1',
      changeId: 'ch1',
    })
    expect(out).toMatchObject({ status: 'saved', result: 'one', attempts: 1 })
    if (out.status !== 'saved') throw new Error()
    expect(out.record.revision).toBe(2)
    expect(out.record.schedule.notices.map((x: any) => x.id)).toEqual(['one'])
    expect((await history(slug)).results[1]).toEqual({
      revision: 2,
      user_id: owner,
      connection_id: 'c1',
      change_id: 'ch1',
    })
    expect(
      (await db.prepare('SELECT updated_by FROM shuls WHERE id = ?').bind(id).first<any>())
        .updated_by,
    ).toBe(owner)
  })

  it('saveSchedule reads again and retries when the admin saved in between', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const id = await shulId(slug)
    let calls = 0
    const out = await saveSchedule(
      testEnv,
      id,
      async (schedule: any) => {
        if (++calls === 1) {
          const admin = await getAdmin(slug, owner)
          const withNotice = {
            ...admin.data.schedule,
            notices: [{ id: 'admin', kind: 'announcement', text: { en: 'admin' } }],
          }
          expect(
            (
              await call(
                'PUT',
                `/api/shuls/${slug}`,
                { schedule: withNotice, baseRevision: admin.data.revision },
                owner,
              )
            ).status,
          ).toBe(200)
        }
        return addNotice('api')(schedule)
      },
      { userId: owner },
    )
    expect(out).toMatchObject({ status: 'saved', attempts: 2 })
    expect(calls).toBe(2)
    if (out.status !== 'saved') throw new Error()
    expect(out.record.schedule.notices.map((x: any) => x.id)).toEqual(['admin', 'api'])
    expect(out.record.revision).toBe(3)
  })

  it('saveSchedule gives up with the current record after three conflicts', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const id = await shulId(slug)
    let calls = 0
    const out = await saveSchedule(
      testEnv,
      id,
      async (schedule: any) => {
        calls++
        await db.prepare('UPDATE shuls SET revision = revision + 1 WHERE id = ?').bind(id).run()
        return addNotice('never')(schedule)
      },
      { userId: owner },
    )
    expect(calls).toBe(MAX_SAVE_ATTEMPTS)
    expect(out.status).toBe('conflict')
    if (out.status !== 'conflict') throw new Error()
    expect(out.record.revision).toBe(1 + MAX_SAVE_ATTEMPTS)
    expect(out.record.schedule.notices).toEqual([])
  })

  it('saveSchedule refuses what the mutation rejects or the document can’t hold', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const id = await shulId(slug)
    expect(await saveSchedule(testEnv, id, () => ({ rejected: 'no' }), { userId: owner })).toEqual({
      status: 'rejected',
      rejected: 'no',
    })
    const bad = await saveSchedule(
      testEnv,
      id,
      (s: any) => ({ schedule: { ...s, notices: 'x' }, result: 1 }),
      { userId: owner },
    )
    expect(bad).toMatchObject({ status: 'invalid', message: 'notices must be a list' })
    expect(await saveSchedule(testEnv, 'nope', addNotice('x'), { userId: owner })).toEqual({
      status: 'missing',
    })
    expect((await history(slug)).results).toHaveLength(1)
  })
})
