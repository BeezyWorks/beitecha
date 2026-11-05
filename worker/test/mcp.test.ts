import { env } from 'cloudflare:workers'
import { addDays, todayIn } from '@beitecha/engine'
import { SignJWT, importJWK } from 'jose'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '../env'
import worker from '../index'
import { ageJwks, forgetJwks } from '../oauth'

const ORIGIN = 'https://beitecha.test'
const ISSUER = 'https://auth.test/api/auth'
const AUDIENCE = `${ORIGIN}/mcp`
const TZ = 'America/New_York'
const testEnv = env as unknown as Env & { TEST_KEYS: string }
const db = testEnv.DB
const keys = JSON.parse(testEnv.TEST_KEYS) as Record<string, any>
const location = { latitude: 40.0821, longitude: -74.2097, timeZone: TZ, israel: false }
const today = () => todayIn(TZ)
const later = (days: number) => addDays(today(), days)

let n = 0
let u = 0
const user = (name = 'u') => `${name}-${++u}-${Math.random().toString(36).slice(2, 6)}`

async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { token?: string; headers?: Record<string, string> } = {},
) {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
  )
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data, headers: res.headers }
}

// ---------------------------------------------------------------------------
// The fake accounts service (see vitest.config.mts)

const jwksControl = async (set?: string) =>
  (
    await (testEnv.AUTH as Fetcher).fetch(
      `https://auth.test/__jwks${set === undefined ? '' : `?set=${set}`}`,
    )
  ).json<{
    published: string[]
    fetches: number
  }>()

interface TokenOpts {
  sub: string
  kid?: string
  azp?: string
  iss?: string
  aud?: string | string[]
  scope?: string
  exp?: number | string
  nbf?: number | string
  extra?: Record<string, unknown>
}

async function sign(o: TokenOpts) {
  const kid = o.kid ?? 'a'
  const jwt = new SignJWT({
    scope: o.scope ?? 'openid beitecha:write',
    azp: o.azp ?? 'client-claude',
    ...o.extra,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setSubject(o.sub)
    .setIssuer(o.iss ?? ISSUER)
    .setAudience(o.aud ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(o.exp ?? '10m')
  if (o.nbf !== undefined) jwt.setNotBefore(o.nbf)
  return jwt.sign(await importJWK(keys[kid], 'EdDSA'))
}

let rpc = 100
const mcp = (token: string | undefined, method: string, params?: unknown, id: unknown = ++rpc) =>
  call('POST', '/mcp', { jsonrpc: '2.0', id, method, params }, { token })

/** A tool call as the model sees it. */
async function tool(
  sub: string,
  name: string,
  args: Record<string, unknown> = {},
  o: Partial<TokenOpts> = {},
  id?: unknown,
) {
  const res = await mcp(await sign({ sub, ...o }), 'tools/call', { name, arguments: args }, id)
  expect(res.status).toBe(200)
  expect(res.data.error).toBeUndefined()
  const r = res.data.result
  return {
    isError: r.isError as boolean,
    text: r.content[0].text as string,
    data: r.structuredContent,
  }
}

// ---------------------------------------------------------------------------
// Shuls and people

async function newShul(
  owner: string,
  api: { enabled?: boolean; defaultMode?: string } = { enabled: true, defaultMode: 'publish' },
) {
  const slug = `mcp-${++n}-${Math.random().toString(36).slice(2, 7)}`
  const res = await call(
    'POST',
    '/api/shuls',
    { slug, profile: { name: { en: `Shul ${n}` } }, location },
    { token: owner },
  )
  expect(res.status).toBe(201)
  if (api.enabled !== undefined || api.defaultMode)
    expect((await call('PUT', `/api/shuls/${slug}/api`, api, { token: owner })).status).toBe(200)
  return slug
}

async function addMember(slug: string, owner: string, member: string) {
  const invite = await call(
    'POST',
    `/api/shuls/${slug}/invites`,
    { role: 'editor' },
    { token: owner },
  )
  expect(
    (await call('POST', `/api/invites/${invite.data.token}`, undefined, { token: member })).status,
  ).toBe(200)
}

const connections = (slug: string) =>
  db
    .prepare(
      'SELECT * FROM connections WHERE shul_id = (SELECT id FROM shuls WHERE slug = ?) ORDER BY created_at',
    )
    .bind(slug)
    .all<any>()
    .then((r) => r.results)
const schedule = async (slug: string) =>
  JSON.parse(
    (await db.prepare('SELECT schedule FROM shuls WHERE slug = ?').bind(slug).first<any>())
      .schedule,
  )

const OFF =
  "This shul hasn't turned on assistants. Ask a gabbai to turn it on in Beitecha → Assistants & API."

beforeEach(async () => {
  forgetJwks()
  await jwksControl('a')
})

// ---------------------------------------------------------------------------

describe('discovery', () => {
  it('publishes the protected resource metadata at both paths', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const r = await call('GET', path)
      expect(r.status).toBe(200)
      expect(r.data).toEqual({
        resource: AUDIENCE,
        authorization_servers: [ISSUER],
        scopes_supported: ['beitecha:write'],
        bearer_methods_supported: ['header'],
      })
      expect(r.headers.get('x-frame-options')).toBe('DENY')
    }
  })
})

describe('tokens', () => {
  const challenge = `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`

  it('asks for a sign-in when there is no token, with the metadata url and no error', async () => {
    const r = await mcp(undefined, 'ping')
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toBe(`Bearer ${challenge}`)
  })

  it('answers invalid_token to a bad one: junk, wrong audience or issuer, expired, not yet valid, wrong key', async () => {
    const sub = user()
    const bad: [string, string][] = [
      ['junk', 'not.a.jwt'],
      ['wrong aud', await sign({ sub, aud: 'https://evil.example/mcp' })],
      ['aud list without ours', await sign({ sub, aud: ['https://evil.example/mcp'] })],
      ['wrong iss', await sign({ sub, iss: 'https://evil.example/api/auth' })],
      ['expired', await sign({ sub, exp: Math.floor(Date.now() / 1000) - 300 })],
      ['not yet valid', await sign({ sub, nbf: Math.floor(Date.now() / 1000) + 600 })],
      ['unpublished key', await sign({ sub, kid: 'x' })],
      [
        'no client',
        await sign({ sub, azp: undefined as any, extra: { azp: undefined } }).catch(() => 'x.y.z'),
      ],
      ['proof-bound', await sign({ sub, extra: { cnf: { jkt: 'abc' } } })],
    ]
    for (const [why, token] of bad) {
      const r = await mcp(token, 'ping')
      expect(r.status, why).toBe(401)
      expect(r.headers.get('www-authenticate'), why).toBe(
        `Bearer error="invalid_token", ${challenge}`,
      )
    }
    // A token a moment past its expiry is within the clock skew.
    expect(
      (await mcp(await sign({ sub, exp: Math.floor(Date.now() / 1000) - 5 }), 'ping')).status,
    ).toBe(200)
  })

  it('answers 403 insufficient_scope to a good token without beitecha:write', async () => {
    const r = await mcp(await sign({ sub: user(), scope: 'openid offline_access' }), 'ping')
    expect(r.status).toBe(403)
    expect(r.headers.get('www-authenticate')).toBe(
      `Bearer error="insufficient_scope", scope="beitecha:write", ${challenge}`,
    )
  })

  it('refetches the keys once for an unknown kid, but not in a flood', async () => {
    const sub = user()
    expect((await mcp(await sign({ sub }), 'ping')).status).toBe(200)
    const before = (await jwksControl()).fetches
    // The accounts service rotates: b is published as well.
    await jwksControl('a,b')
    // The cache is fresh, so a token for b is turned away rather than refetching on every unknown kid...
    expect((await mcp(await sign({ sub, kid: 'b' }), 'ping')).status).toBe(401)
    expect((await jwksControl()).fetches).toBe(before)
    // ...until the keys are old enough to look again.
    ageJwks(11_000)
    expect((await mcp(await sign({ sub, kid: 'b' }), 'ping')).status).toBe(200)
    expect((await jwksControl()).fetches).toBe(before + 1)
    expect((await mcp(await sign({ sub, kid: 'b' }), 'ping')).status).toBe(200)
    expect((await jwksControl()).fetches).toBe(before + 1)
  })

  it('counts unauthenticated hits against the caller’s IP', async () => {
    const headers = { 'cf-connecting-ip': '203.0.113.77' }
    const codes: number[] = []
    for (let i = 0; i < 5; i++)
      codes.push(
        (await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' }, { headers })).status,
      )
    expect(codes).toContain(429)
    expect(codes[0]).toBe(401)
  })
})

describe('protocol', () => {
  it('initializes, lists tools, pings, takes notifications and says no to GET and DELETE', async () => {
    const token = await sign({ sub: user() })
    const init = await mcp(token, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    })
    expect(init.status).toBe(200)
    expect(init.data.result).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'beitecha' },
      instructions: expect.stringContaining('Confirm before writing'),
    })
    // An unknown version gets ours.
    expect(
      (await mcp(token, 'initialize', { protocolVersion: '1999-01-01' })).data.result
        .protocolVersion,
    ).toBe('2025-11-25')
    expect((await mcp(token, 'ping')).data.result).toEqual({})
    const note = await call(
      'POST',
      '/mcp',
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { token },
    )
    expect(note.status).toBe(202)
    expect((await mcp(token, 'nope')).data.error.code).toBe(-32601)
    const broken = await worker.fetch(
      new Request(`${ORIGIN}/mcp`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: '{',
      }),
      testEnv,
    )
    expect(broken.status).toBe(400)
    expect((await broken.json<any>()).error.code).toBe(-32700)
    const get = await call('GET', '/mcp', undefined, { token })
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    expect((await call('DELETE', '/mcp', undefined, { token })).status).toBe(405)

    const list = await mcp(token, 'tools/list')
    const tools = list.data.result.tools as any[]
    const names = tools.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'list_shuls',
        'get_upcoming',
        'list_notices',
        'get_bulletin_link',
        'set_sponsor',
        'remove_sponsor',
        'add_notice',
        'edit_notice',
        'remove_notice',
        'cancel_event',
        'retime_event',
        'add_note',
        'create_event',
        'add_yahrzeit',
        'add_birthday',
        'add_anniversary',
        'remove_person',
        'list_pending',
        'undo_change',
      ]),
    )
    expect(names).not.toContain('add_refuah')
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object')
      expect(t.description.length).toBeGreaterThan(20)
    }
    expect(tools.find((t) => t.name === 'set_sponsor').inputSchema.properties.shul).toBeTruthy()
    expect(tools.find((t) => t.name === 'list_shuls').inputSchema.properties.shul).toBeUndefined()
    // Bad calls are protocol errors; failed tools are results.
    expect((await mcp(token, 'tools/call', { name: 'nope' })).data.error.code).toBe(-32602)
  })
})

describe('which shul, and the connection', () => {
  it('gives the public bulletin link', async () => {
    const owner = user('owner')
    const slug = await newShul(owner, { enabled: true, defaultMode: 'publish' })
    const r = await tool(owner, 'get_bulletin_link')
    expect(r.isError).toBe(false)
    expect(JSON.stringify(r)).toContain(`/${slug}/bulletin`)
  })

  it('makes the connection on first use, in the shul’s default mode with the default scopes and no expiry', async () => {
    for (const mode of ['publish', 'review'] as const) {
      const owner = user('owner')
      const slug = await newShul(owner, { enabled: true, defaultMode: mode })
      const r = await tool(owner, 'list_notices')
      expect(r.isError).toBe(false)
      const rows = await connections(slug)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        kind: 'oauth',
        purpose: 'assistant',
        label: "User's Claude",
        mode,
        oauth_client_id: 'client-claude',
        user_id: owner,
        expires_at: null,
        revoked_at: null,
        hash: null,
        prefix: null,
      })
      expect(JSON.parse(rows[0].scopes)).toEqual([
        'sponsors',
        'notices',
        'changes',
        'events',
        'yahrzeits',
        'occasions',
      ])
      // Again: the same row, not another.
      await tool(owner, 'list_notices')
      expect(await connections(slug)).toHaveLength(1)
      // The admin lists it.
      const list = await call('GET', `/api/shuls/${slug}/connections`, undefined, { token: owner })
      expect(list.data.connections[0]).toMatchObject({
        kind: 'oauth',
        purpose: 'assistant',
        expiresAt: null,
        prefix: null,
      })
    }
    // An unknown client is just an assistant; a different client is its own connection.
    const owner = user('owner')
    const slug = await newShul(owner)
    await tool(owner, 'list_notices', {}, { azp: 'client-unknown' })
    await tool(owner, 'list_notices', {}, { azp: 'client-gpt' })
    expect((await connections(slug)).map((c) => c.label)).toEqual([
      "User's assistant",
      "User's ChatGPT",
    ])
  })

  it('says assistants are off, the same, when the API is off, the slug is unknown or she is not a member', async () => {
    const owner = user('owner')
    const off = await newShul(owner, { enabled: false })
    const on = await newShul(owner)
    const stranger = user('stranger')
    const mixed = [
      await tool(owner, 'get_upcoming', { shul: off }),
      await tool(owner, 'get_upcoming', { shul: 'no-such-shul' }),
      await tool(stranger, 'get_upcoming', { shul: on }),
      await tool(stranger, 'get_upcoming'),
    ]
    for (const r of mixed) {
      expect(r).toMatchObject({ isError: true, text: OFF })
      expect(r.data.error.code).toBe('assistants_off')
    }
    expect(await connections(off)).toHaveLength(0)
    expect(await connections(on)).toHaveLength(0)
  })

  it('uses the one shul that has assistants on, and asks when there are several', async () => {
    const person = user('p')
    const off = await newShul(person, { enabled: false })
    const a = await newShul(person)
    // One on, one off: no need to ask.
    expect((await tool(person, 'list_notices')).isError).toBe(false)
    expect(await connections(off)).toHaveLength(0)
    const b = await newShul(person)
    const ask = await tool(person, 'list_notices')
    expect(ask.isError).toBe(true)
    expect(ask.text).toContain(a)
    expect(ask.text).toContain(b)
    expect(ask.text).not.toContain(off)
    expect(ask.data.error.code).toBe('which_shul')
    expect((await tool(person, 'list_notices', { shul: b })).isError).toBe(false)
    expect(await connections(b)).toHaveLength(1)
    expect(await connections(a)).toHaveLength(1) // made when she had only one
    const shuls = await tool(person, 'list_shuls')
    expect(shuls.text).toContain(off)
    expect(shuls.data.shuls).toHaveLength(3)
  })

  it('ends when the member is removed from the shul', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const member = user('member')
    await addMember(slug, owner, member)
    expect((await tool(member, 'list_notices')).isError).toBe(false)
    expect(
      (await call('DELETE', `/api/shuls/${slug}/members/${member}`, undefined, { token: owner }))
        .status,
    ).toBe(204)
    expect(await tool(member, 'list_notices')).toMatchObject({ isError: true, text: OFF })
  })

  it('keeps a revoked connection revoked, and never quietly makes another', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const member = user('member')
    await addMember(slug, owner, member)
    expect((await tool(member, 'list_notices')).isError).toBe(false)
    const [row] = await connections(slug)
    expect(
      (
        await call('DELETE', `/api/shuls/${slug}/connections/${row.id}`, undefined, {
          token: owner,
        })
      ).status,
    ).toBe(204)
    const r = await tool(member, 'add_notice', { kind: 'announcement', text: 'Hello' })
    expect(r.isError).toBe(true)
    expect(r.text).toMatch(/gabbai .*disconnected/)
    expect(r.data.error.code).toBe('disconnected')
    expect(await connections(slug)).toHaveLength(1)
    expect((await schedule(slug)).notices).toEqual([])
    // Revoking everything and reading is the same.
    expect((await tool(member, 'get_upcoming')).data.error.code).toBe('disconnected')
    // A new sign-in from another chat app is a new client, so a new connection (as a new key would be).
    expect((await tool(member, 'list_notices', {}, { azp: 'client-gpt' })).isError).toBe(false)
    expect(await connections(slug)).toHaveLength(2)
  })

  it('respects the limit of three connections a person has in one shul', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    for (let i = 0; i < 3; i++)
      expect(
        (
          await call(
            'POST',
            `/api/shuls/${slug}/connections`,
            { purpose: 'script', label: `K${i}` },
            { token: owner },
          )
        ).status,
      ).toBe(201)
    const r = await tool(owner, 'list_notices')
    expect(r.isError).toBe(true)
    expect(r.text).toContain('3 active connections')
    expect(await connections(slug)).toHaveLength(3)
  })

  it('does not accept a revoked-all shul’s sign-ins after the API is turned off', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    expect((await tool(owner, 'list_notices')).isError).toBe(false)
    await call('PUT', `/api/shuls/${slug}/api`, { enabled: false }, { token: owner })
    expect(await tool(owner, 'list_notices')).toMatchObject({ isError: true, text: OFF })
  })
})

describe('tools', () => {
  it('reads what is coming up and the notices, and writes by ref, in words she would use', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const up = await tool(owner, 'get_upcoming', { days: 3 })
    expect(up.isError).toBe(false)
    expect(up.text).toContain(`shacharis@${today()}`)
    expect(up.data.events.length).toBeGreaterThan(0)

    const made = await tool(owner, 'create_event', {
      name: 'Melave Malka',
      date: later(2),
      time: '21:30',
    })
    expect(made.text).toMatch(
      new RegExp(`Created "Melave Malka" on ${later(2)} at 21:30. Live now.`),
    )
    const ref = `${made.data.target}@${later(2)}`
    const sponsored = await tool(owner, 'set_sponsor', {
      ref,
      sponsoredBy: 'the Cohens',
      inHonorOf: "Dovid's bar mitzvah",
    })
    expect(sponsored.isError).toBe(false)
    expect(sponsored.text).toContain(
      `Melave Malka, ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'][new Date(`${later(2)}T00:00:00Z`).getUTCDay()]} ${later(2)}: sponsored by the Cohens in honor of Dovid's bar mitzvah. Live now.`,
    )
    expect(sponsored.data).toMatchObject({ status: 'applied', target: ref })
    // The same event again is a conflict that shows the sponsor; nothing changed.
    const dup = await tool(owner, 'set_sponsor', { ref, sponsoredBy: 'the Golds' })
    expect(dup).toMatchObject({ isError: true })
    expect(dup.text).toMatch(/already sponsored.*Cohens.*ask before/s)
    expect(
      (await tool(owner, 'set_sponsor', { ref, sponsoredBy: 'the Golds', replace: true })).isError,
    ).toBe(false)

    const listed = await tool(owner, 'get_upcoming', { days: 5 })
    expect(listed.text).toContain('sponsored: the Golds')
    const notice = await tool(owner, 'add_notice', {
      kind: 'simcha',
      title: 'Mazal tov to the Levys',
      text: 'On the birth of a son',
    })
    expect(notice.text).toContain('Added the simcha "Mazal tov to the Levys"')
    const id = notice.data.after[0].item.id
    expect((await tool(owner, 'list_notices')).text).toContain(`id ${id}`)
    expect(
      (await tool(owner, 'edit_notice', { id, text: 'On the birth of a grandson' })).text,
    ).toContain('Updated the notice')
    expect((await tool(owner, 'remove_notice', { id })).text).toContain('Removed the notice')
    expect((await tool(owner, 'remove_notice', { id: 'nope' })).data.error.code).toBe('not_found')
    expect(
      (await tool(owner, 'add_note', { ref: `shacharis@${later(1)}`, note: 'Guest speaker' })).text,
    ).toContain('note added "Guest speaker"')
    expect((await tool(owner, 'remove_sponsor', { ref })).text).toContain('sponsorship removed')

    const y = await tool(owner, 'add_yahrzeit', {
      name: 'Avraham ben Yitzchak',
      hebrewDate: { day: 5, month: 7 },
    })
    expect(y.text).toContain('Added the yahrzeit of Avraham ben Yitzchak')
    const b = await tool(owner, 'add_birthday', { name: 'Rivka', date: '2015-03-04' })
    expect(b.text).toContain('Added the birthday of Rivka')
    expect(
      (
        await tool(owner, 'add_anniversary', {
          name: 'The Golds',
          hebrewDate: { day: 1, month: 8 },
        })
      ).isError,
    ).toBe(false)
    const gone = await tool(owner, 'remove_person', { kind: 'birthday', match: 'rivka' })
    expect(gone.text).toContain('Removed the birthday of Rivka')
    expect((await schedule(slug)).birthdays).toEqual([])
  })

  it('posts in publish mode, holds in review mode, and always holds a minyan time change', async () => {
    const owner = user('owner')
    const slug = await newShul(owner, { enabled: true, defaultMode: 'publish' })
    const live = await tool(owner, 'add_notice', {
      kind: 'announcement',
      text: 'Kiddush after davening',
    })
    expect(live.data.status).toBe('applied')
    expect(live.text).toMatch(/Live now\./)
    const held = await tool(owner, 'retime_event', { ref: `shacharis@${later(2)}`, time: '07:00' })
    expect(held.isError).toBe(false)
    expect(held.data.status).toBe('pending')
    expect(held.text).toContain('Waiting for a gabbai to approve.')
    expect(held.text).toContain('moved to 07:00')
    expect((await schedule(slug)).exceptions).toEqual([])
    const cancel = await tool(owner, 'cancel_event', { ref: `shacharis@${later(2)}` })
    expect(cancel.data.status).toBe('pending')
    // Something that isn't a minyan goes straight through.
    const e = await tool(owner, 'create_event', { name: 'Siyum', date: later(2), time: '20:00' })
    const retimed = await tool(owner, 'retime_event', {
      ref: `${e.data.target}@${later(2)}`,
      time: '21:00',
    })
    expect(retimed.text).toContain('moved to 21:00. Live now.')

    const pending = await tool(owner, 'list_pending')
    expect(pending.data.changes).toHaveLength(2)
    expect(pending.text).toContain('change.retime')

    // Review mode: even a notice waits.
    const owner2 = user('owner')
    const slug2 = await newShul(owner2, { enabled: true, defaultMode: 'review' })
    const wait = await tool(owner2, 'add_notice', { kind: 'announcement', text: 'Hello' })
    expect(wait.data.status).toBe('pending')
    expect(wait.text).toMatch(/Waiting for a gabbai to approve\./)
    expect((await schedule(slug2)).notices).toEqual([])
    // A gabbai approves it in the admin and it is live.
    const approved = await call(
      'POST',
      `/api/shuls/${slug2}/changes/${wait.data.changeId}/approve`,
      undefined,
      { token: owner2 },
    )
    expect(approved.status).toBe(200)
    expect((await schedule(slug2)).notices).toHaveLength(1)
  })

  it('undoes its own change', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const r = await tool(owner, 'add_notice', { kind: 'announcement', text: 'Oops' })
    expect((await schedule(slug)).notices).toHaveLength(1)
    const undone = await tool(owner, 'undo_change', { changeId: r.data.changeId })
    expect(undone).toMatchObject({ isError: false, text: expect.stringContaining('Undone') })
    expect((await schedule(slug)).notices).toEqual([])
    expect((await tool(owner, 'undo_change', { changeId: r.data.changeId })).isError).toBe(true)
    expect((await tool(owner, 'undo_change', {})).isError).toBe(true)
  })

  it('answers an ambiguous name with the candidates, and changes nothing', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    await tool(owner, 'add_yahrzeit', { name: 'Moshe Cohen', hebrewDate: { day: 5, month: 7 } })
    await tool(owner, 'add_yahrzeit', { name: 'Moshe Levy', hebrewDate: { day: 9, month: 8 } })
    const r = await tool(owner, 'remove_person', { kind: 'yahrzeit', match: 'moshe' })
    expect(r.isError).toBe(true)
    expect(r.data.error.code).toBe('ambiguous')
    expect(r.text).toContain('Moshe Cohen')
    expect(r.text).toContain('Moshe Levy')
    expect(r.text).toContain('ask which one')
    expect((await schedule(slug)).yahrzeits).toHaveLength(2)
    const id = r.data.error.details.candidates[0].id
    expect((await tool(owner, 'remove_person', { kind: 'yahrzeit', id })).isError).toBe(false)
    expect((await schedule(slug)).yahrzeits).toHaveLength(1)
  })

  it('does not apply a retried JSON-RPC request twice', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const args = { kind: 'announcement', text: 'Only once' }
    const first = await tool(owner, 'add_notice', args, {}, 4242)
    const retry = await tool(owner, 'add_notice', args, {}, 4242)
    expect(first.isError || retry.isError).toBe(false)
    expect(retry.data.changeId).toBe(first.data.changeId)
    expect(retry.text).toContain('already done')
    expect((await schedule(slug)).notices).toHaveLength(1)
    // A new request id is a new request.
    await tool(owner, 'add_notice', args, {}, 4243)
    expect((await schedule(slug)).notices).toHaveLength(2)
    // The same id in a later session, for something else, is something else.
    await tool(owner, 'add_notice', { kind: 'announcement', text: 'Different' }, {}, 4242)
    expect((await schedule(slug)).notices).toHaveLength(3)
  })

  it('offers the refuah tools only to a connection that holds the cholim scope', async () => {
    const owner = user('owner')
    const slug = await newShul(owner)
    const names = async () =>
      ((await mcp(await sign({ sub: owner }), 'tools/list')).data.result.tools as any[]).map(
        (t) => t.name,
      )
    expect(await names()).not.toContain('add_refuah')
    const denied = await tool(owner, 'add_refuah', { name: 'Moshe ben Sarah' })
    expect(denied.isError).toBe(true)
    expect(denied.data.error.code).toBe('forbidden')
    expect(denied.text).toContain('Assistants & API')
    expect((await tool(owner, 'list_refuah')).isError).toBe(true)
    expect((await schedule(slug)).cholim ?? []).toEqual([])

    const [row] = await connections(slug)
    const patch = await call(
      'PATCH',
      `/api/shuls/${slug}/connections/${row.id}`,
      { scopes: ['sponsors', 'notices', 'changes', 'events', 'yahrzeits', 'occasions', 'cholim'] },
      { token: owner },
    )
    expect(patch.status).toBe(200)
    expect(await names()).toEqual(
      expect.arrayContaining(['add_refuah', 'remove_refuah', 'list_refuah']),
    )
    const added = await tool(owner, 'add_refuah', { name: 'Moshe ben Sarah' })
    expect(added.text).toContain('Added "Moshe ben Sarah" to the refuah list. Live now.')
    expect((await tool(owner, 'list_refuah')).text).toContain('Moshe ben Sarah')
    expect((await tool(owner, 'remove_refuah', { match: 'moshe' })).text).toContain('Removed')
  })
})
