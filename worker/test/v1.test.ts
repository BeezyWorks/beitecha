import { env } from 'cloudflare:workers'
import { addDays, todayIn } from '@beitecha/engine'
import { describe, expect, it } from 'vitest'

import type { Env } from '../env'
import worker from '../index'

const ORIGIN = 'https://beitecha.test'
const testEnv = env as unknown as Env
const db = testEnv.DB
const TZ = 'America/New_York'
const location = { latitude: 40.0821, longitude: -74.2097, timeZone: TZ, israel: false }

async function call(
  method: string,
  path: string,
  body?: unknown,
  opts: { token?: string; headers?: Record<string, string>; env?: Env; raw?: string } = {},
) {
  const res = await worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    }),
    opts.env ?? testEnv,
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

let n = 0
let u = 0
const user = (name = 'u') => `${name}-${++u}-${Math.random().toString(36).slice(2, 6)}`
const today = () => todayIn(TZ)
const later = (days: number) => addDays(today(), days)

interface Fixture {
  slug: string
  owner: string
  /** A publish-mode key with every scope but cholim. */
  key: string
  keyId: string
}

async function newShul(): Promise<{ slug: string; owner: string }> {
  const owner = user('owner')
  const slug = `v1-${++n}-${Math.random().toString(36).slice(2, 7)}`
  expect(
    (
      await call(
        'POST',
        '/api/shuls',
        { slug, profile: { name: { en: `Shul ${n}`, he: 'בית' }, city: 'Lakewood' }, location },
        { token: owner },
      )
    ).status,
  ).toBe(201)
  expect(
    (await call('PUT', `/api/shuls/${slug}/api`, { enabled: true }, { token: owner })).status,
  ).toBe(200)
  return { slug, owner }
}

async function makeKey(slug: string, token: string, body: Record<string, unknown> = {}) {
  const res = await call(
    'POST',
    `/api/shuls/${slug}/connections`,
    { purpose: 'script', label: 'Test', mode: 'publish', ...body },
    { token },
  )
  expect(res.status).toBe(201)
  return { key: res.data.key as string, keyId: res.data.connection.id as string }
}

async function fixture(body: Record<string, unknown> = {}): Promise<Fixture> {
  const { slug, owner } = await newShul()
  return { slug, owner, ...(await makeKey(slug, owner, body)) }
}

/** Another connection on the same shul, usable wherever a fixture is. */
async function another(f: Fixture, body: Record<string, unknown> = {}): Promise<Fixture> {
  return { ...f, ...(await makeKey(f.slug, f.owner, body)) }
}

const send = (
  f: { slug: string; key: string },
  op: unknown,
  headers: Record<string, string> = {},
  e?: Env,
) => call('POST', `/v1/shuls/${f.slug}/operations`, op, { token: f.key, headers, env: e })

const shulRow = (slug: string) =>
  db.prepare('SELECT * FROM shuls WHERE slug = ?').bind(slug).first<any>()
const schedule = async (slug: string) => JSON.parse((await shulRow(slug)).schedule)
const changeRow = (id: string) =>
  db.prepare('SELECT * FROM api_changes WHERE id = ?').bind(id).first<any>()

/** The admin saving: reads the record, lets `edit` change the schedule, saves it. */
async function adminEdit(slug: string, owner: string, edit: (s: any) => void) {
  const rec = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: owner })
  edit(rec.data.schedule)
  const res = await call(
    'PUT',
    `/api/shuls/${slug}`,
    { schedule: rec.data.schedule, baseRevision: rec.data.revision },
    { token: owner },
  )
  expect(res.status).toBe(200)
  return res.data
}

/** Notices an admin wrote (no origin): items a connection did not create. */
const seedNotices = (slug: string, owner: string, count: number) =>
  adminEdit(slug, owner, (s) => {
    for (let i = 0; i < count; i++)
      s.notices.push({
        id: `adm${i}`,
        kind: 'announcement',
        from: today(),
        to: later(30),
        text: { en: `Admin notice ${i}` },
      })
  })

const nameOf = (id: string) => ({ op: 'notice.update', id, text: 'changed' })

describe('public reads', () => {
  it('serves info, with CORS, caching and an ETag, and 404s an unknown shul', async () => {
    const f = await fixture()
    const res = await call('GET', `/v1/shuls/${f.slug}/info`)
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({
      slug: f.slug,
      timeZone: TZ,
      language: 'en',
      israel: false,
      city: 'Lakewood',
      bulletinUrl: `https://beitecha.test/${f.slug}/bulletin`,
    })
    expect(res.data.name).toContain('Shul')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-expose-headers')).toBe('etag')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300')
    const missing = await call('GET', '/v1/shuls/nope-nope/info')
    expect(missing.status).toBe(404)
    expect(missing.data).toEqual({ error: { code: 'not_found', message: 'No such shul' } })
    expect(missing.headers.get('access-control-allow-origin')).toBe('*')
    const pre = await call('OPTIONS', `/v1/shuls/${f.slug}/info`)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-headers')).toBe('if-none-match')
  })

  it('answers 304 to a matching ETag, and the ETag follows the revision, language and names', async () => {
    const f = await fixture()
    const path = `/v1/shuls/${f.slug}/week`
    const first = await call('GET', path)
    const etag = first.headers.get('etag')!
    expect(etag).toMatch(/^"/)
    const again = await call('GET', path, undefined, { headers: { 'if-none-match': etag } })
    expect(again.status).toBe(304)
    expect(again.headers.get('etag')).toBe(etag)
    expect(again.headers.get('access-control-allow-origin')).toBe('*')
    expect(
      (await call('GET', path, undefined, { headers: { 'if-none-match': `W/${etag}, "x"` } }))
        .status,
    ).toBe(304)
    expect((await call('GET', `${path}?lang=he`)).headers.get('etag')).not.toBe(etag)
    expect((await call('GET', `${path}?names=he`)).headers.get('etag')).not.toBe(etag)
    await send(f, { op: 'notice.create', kind: 'announcement', text: 'Hello' })
    const changed = await call('GET', path, undefined, { headers: { 'if-none-match': etag } })
    expect(changed.status).toBe(200)
    expect(changed.headers.get('etag')).not.toBe(etag)
  })

  it('gives a day, a range, the week, the zmanim, what is next and the notices', async () => {
    const f = await fixture()
    const date = later(1)
    const day = await call('GET', `/v1/shuls/${f.slug}/day/${date}`)
    expect(day.status).toBe(200)
    expect(day.data).toMatchObject({ timeZone: TZ, language: 'en', date })
    expect(day.data.hebrew.text).toBeTruthy()
    expect(day.data.zmanim.length).toBeGreaterThan(3)
    expect(day.data.zmanim[0].time).toMatchObject({ minutes: expect.any(Number) })
    expect(day.data.zmanim[0].time.iso).toMatch(/T\d\d:\d\d:00-0[45]:00$/)
    const shacharis = day.data.events.find((e: any) => e.id === 'shacharis')
    expect(shacharis).toMatchObject({ ref: `shacharis@${date}`, kind: 'tefila', source: 'rule' })

    const days = await call('GET', `/v1/shuls/${f.slug}/days?from=${date}&to=${later(3)}`)
    expect(days.data.days.map((d: any) => d.date)).toEqual([date, later(2), later(3)])
    expect(days.data).toMatchObject({ from: date, to: later(3), timeZone: TZ })

    const week = await call('GET', `/v1/shuls/${f.slug}/week`)
    expect(week.data.days).toHaveLength(7)
    expect(week.data.days[0].weekday).toBe(0)
    expect(week.data.days.map((d: any) => d.date)).toContain(week.data.today)

    const zmanim = await call('GET', `/v1/shuls/${f.slug}/zmanim?from=${date}&to=${later(2)}`)
    expect(zmanim.data.days).toHaveLength(2)
    expect(Object.keys(zmanim.data.days[0]).sort()).toEqual(['date', 'hebrew', 'weekday', 'zmanim'])

    const next = await call('GET', `/v1/shuls/${f.slug}/next`)
    expect(next.status).toBe(200)
    expect(next.data.now.date).toBe(today())
    expect(next.data.next).toMatchObject({ kind: 'tefila', cancelled: false })

    await send(f, { op: 'notice.create', kind: 'announcement', title: 'Hi', text: 'Kiddush club' })
    const notices = await call('GET', `/v1/shuls/${f.slug}/notices`)
    expect(notices.data.notices).toHaveLength(1)
    expect(notices.data.notices[0]).toMatchObject({
      kind: 'announcement',
      title: 'Hi',
      text: 'Kiddush club',
      from: today(),
      current: true,
    })
    expect(notices.data.notices[0].id).toBeTruthy()
    expect(notices.data.notices[0].to).toBe(later(14))
  })

  it('lists upcoming instances with their sponsor and exception', async () => {
    const f = await fixture()
    const created = await send(f, {
      op: 'event.create',
      name: 'Siyum',
      date: later(2),
      time: '20:00',
    })
    const ref = created.data.target as string
    expect(ref).toMatch(/^oneoff-/)
    const refDate = `${ref}@${later(2)}`
    expect(
      (
        await send(f, {
          op: 'sponsor.create',
          ref: refDate,
          sponsoredBy: 'the Cohens',
          inHonorOf: 'Dovid',
        })
      ).data.status,
    ).toBe('applied')
    const shacharisRef = `shacharis@${later(1)}`
    expect(
      (await send(f, { op: 'change.note', ref: shacharisRef, note: 'Bring a book' })).data.status,
    ).toBe('applied')
    const up = await call('GET', `/v1/shuls/${f.slug}/upcoming?days=5`)
    expect(up.status).toBe(200)
    expect(up.data).toMatchObject({ from: today(), to: later(4) })
    const siyum = up.data.events.find((e: any) => e.ref === refDate)
    expect(siyum).toMatchObject({
      name: 'Siyum',
      date: later(2),
      sponsor: { sponsoredBy: 'the Cohens', inHonorOf: 'Dovid' },
      exception: { type: 'add' },
      source: 'added',
    })
    expect(up.data.events.find((e: any) => e.ref === shacharisRef)).toMatchObject({
      note: 'Bring a book',
      exception: { type: 'note' },
    })
    expect(siyum.sponsor.id).toBeTruthy()
    expect(up.data.events.filter((e: any) => e.id === 'shacharis')).toHaveLength(5)
    expect((await call('GET', `/v1/shuls/${f.slug}/upcoming?days=63`)).data.error.code).toBe(
      'invalid',
    )
  })

  it('never returns rules or the people lists', async () => {
    const f = await fixture({
      scopes: ['sponsors', 'notices', 'changes', 'events', 'yahrzeits', 'occasions', 'cholim'],
    })
    expect(
      (
        await send(f, {
          op: 'yahrzeit.add',
          displayName: 'Zzyx Yahrzeit',
          hebrewName: 'פלוני',
          hebrew: { day: 10, month: 10 },
        })
      ).data.status,
    ).toBe('applied')
    expect(
      (
        await send(f, {
          op: 'occasion.add',
          kind: 'birthday',
          displayName: 'Plugh Birthday',
          hebrew: { day: 3, month: 7 },
        })
      ).data.status,
    ).toBe('applied')
    expect((await send(f, { op: 'cholim.add', name: 'Qwerty Choleh' })).data.status).toBe('applied')
    await send(f, { op: 'notice.create', kind: 'announcement', text: 'Public thing' })
    const paths = [
      'info',
      `day/${today()}`,
      'days',
      'week',
      'zmanim',
      'next',
      'notices',
      'upcoming',
    ]
    for (const p of paths) {
      const res = await call('GET', `/v1/shuls/${f.slug}/${p}`)
      expect(res.status, p).toBe(200)
      const text = JSON.stringify(res.data)
      for (const leak of [
        'Zzyx',
        'Plugh',
        'Qwerty',
        '"rules"',
        'hebrewName',
        'cholim',
        'yahrzeit',
        'birthday',
        'origin',
        f.keyId,
      ])
        expect(text, `${p} leaks ${leak}`).not.toContain(leak)
    }
  })

  it('checks dates, ranges, language and names, and caps a range at 62 days', async () => {
    const f = await fixture()
    const base = `/v1/shuls/${f.slug}`
    const from = today()
    expect(
      (await call('GET', `${base}/days?from=${from}&to=${addDays(from, 61)}`)).data.days,
    ).toHaveLength(62)
    const long = await call('GET', `${base}/days?from=${from}&to=${addDays(from, 62)}`)
    expect(long.status).toBe(400)
    expect(long.data.error).toMatchObject({ code: 'invalid', details: { max: 62 } })
    expect((await call('GET', `${base}/zmanim?from=${from}&to=${addDays(from, 70)}`)).status).toBe(
      400,
    )
    expect((await call('GET', `${base}/days?from=${later(3)}&to=${from}`)).status).toBe(400)
    expect((await call('GET', `${base}/day/2026-02-30`)).data.error.code).toBe('invalid')
    expect((await call('GET', `${base}/day/tomorrow`)).status).toBe(400)
    expect((await call('GET', `${base}/week?lang=fr`)).status).toBe(400)
    expect((await call('GET', `${base}/week?names=x`)).status).toBe(400)
    expect((await call('GET', `${base}/days?from=1850-01-01`)).status).toBe(400)
    const he = await call('GET', `${base}/day/${from}?lang=he&names=he`)
    expect(he.data.language).toBe('he')
    expect(he.data.events[0].name).not.toBe(
      (await call('GET', `${base}/day/${from}`)).data.events[0].name,
    )
    expect((await call('POST', `${base}/info`)).data.error.code).toBe('method_not_allowed')
    expect((await call('GET', `${base}/nonsense`)).data.error.code).toBe('not_found')
  })

  it('limits each visitor’s reads, in the /v1 error shape', async () => {
    const f = await fixture()
    const headers = { 'cf-connecting-ip': '198.51.100.9' }
    const out = []
    for (let i = 0; i < 4; i++)
      out.push(await call('GET', `/v1/shuls/${f.slug}/info`, undefined, { headers }))
    expect(out.map((r) => r.status)).toEqual([200, 200, 200, 429])
    expect(out[3].data.error.code).toBe('rate_limited')
    expect(out[3].headers.get('access-control-allow-origin')).toBe('*')
  })

  it('does not show a notice after its last day', async () => {
    const f = await fixture()
    await adminEdit(f.slug, f.owner, (s) => {
      s.notices.push({
        id: 'old',
        kind: 'announcement',
        from: later(-5),
        to: later(-2),
        text: { en: 'Past' },
      })
      s.notices.push({
        id: 'soon',
        kind: 'announcement',
        from: later(3),
        to: later(4),
        text: { en: 'Soon' },
      })
    })
    const res = await call('GET', `/v1/shuls/${f.slug}/notices`)
    expect(res.data.notices.map((x: any) => [x.id, x.current])).toEqual([['soon', false]])
  })
})

describe('keyed reads', () => {
  it('lists refuah names only with the cholim scope, and sends no CORS headers', async () => {
    const f = await fixture({ scopes: ['sponsors', 'cholim'] })
    const plain = await another(f, { scopes: ['notices'] })
    await send(f, { op: 'cholim.add', name: { en: 'Moshe ben Sarah', he: 'משה בן שרה' } })
    const res = await call('GET', `/v1/shuls/${f.slug}/cholim`, undefined, {
      token: f.key,
      headers: { origin: 'https://evil.example' },
    })
    expect(res.status).toBe(200)
    expect(res.data.cholim).toEqual([
      { id: expect.any(String), name: { en: 'Moshe ben Sarah', he: 'משה בן שרה' }, added: today() },
    ])
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    const denied = await call('GET', `/v1/shuls/${f.slug}/cholim`, undefined, { token: plain.key })
    expect(denied.status).toBe(403)
    expect(denied.data.error.code).toBe('forbidden')
    const anon = await call('GET', `/v1/shuls/${f.slug}/cholim`)
    expect(anon.status).toBe(401)
    expect(anon.data.error.code).toBe('unauthorized')
    // Another shul's slug is the same 404.
    const other = await newShul()
    expect(
      (await call('GET', `/v1/shuls/${other.slug}/cholim`, undefined, { token: f.key })).status,
    ).toBe(404)
  })

  it('lists only the connection’s own changes, by status', async () => {
    const f = await fixture()
    const other = await another(f, { mode: 'review' })
    await send(f, { op: 'notice.create', kind: 'announcement', text: 'Mine' })
    const waiting = await send(other, { op: 'notice.create', kind: 'announcement', text: 'Theirs' })
    expect(waiting.data.status).toBe('pending')
    const mine = await call('GET', `/v1/shuls/${f.slug}/changes`, undefined, { token: f.key })
    expect(mine.data.changes).toHaveLength(1)
    expect(mine.data.changes[0]).toMatchObject({ op: 'notice.create', status: 'applied' })
    expect(mine.data.changes[0]).not.toHaveProperty('before')
    const pending = await call('GET', `/v1/shuls/${f.slug}/changes?status=pending`, undefined, {
      token: other.key,
    })
    expect(pending.data.changes.map((c: any) => c.id)).toEqual([waiting.data.changeId])
    expect(
      (
        await call('GET', `/v1/shuls/${f.slug}/changes?status=applied`, undefined, {
          token: other.key,
        })
      ).data.changes,
    ).toEqual([])
    expect(
      (await call('GET', `/v1/shuls/${f.slug}/changes?status=x`, undefined, { token: f.key }))
        .status,
    ).toBe(400)
  })
})

describe('operations: one of each family, end to end', () => {
  it('sponsors, notices, changes, one-time events, people and refuah names', async () => {
    const f = await fixture({
      scopes: ['sponsors', 'notices', 'changes', 'events', 'yahrzeits', 'occasions', 'cholim'],
    })
    const event = await send(f, {
      op: 'event.create',
      name: 'Melave Malka',
      date: later(3),
      time: '21:30',
      kind: 'other',
    })
    expect(event.status).toBe(201)
    expect(event.data).toMatchObject({ status: 'applied', revision: expect.any(Number) })
    const id = event.data.target as string
    const ref = `${id}@${later(3)}`

    const sponsor = await send(f, {
      op: 'sponsor.create',
      ref,
      sponsoredBy: 'the Golds',
      inHonorOf: 'a birth',
    })
    expect(sponsor.data).toMatchObject({ status: 'applied', target: ref })
    expect(sponsor.data.after[0].item.origin).toEqual({ connectionId: f.keyId })
    expect((await send(f, { op: 'sponsor.create', ref, sponsoredBy: 'X' })).status).toBe(409)
    expect(
      (await send(f, { op: 'sponsor.create', ref, sponsoredBy: 'X', replace: true })).data.status,
    ).toBe('applied')

    const notice = await send(f, { op: 'notice.create', kind: 'simcha', text: 'Mazal tov!' })
    const noticeId = notice.data.target
    expect(
      (await send(f, { op: 'notice.update', id: noticeId, text: 'Mazal tov to all' })).data.status,
    ).toBe('applied')

    expect((await send(f, { op: 'change.note', ref, note: 'Upstairs' })).data.status).toBe(
      'applied',
    )
    expect((await send(f, { op: 'change.cancel', ref })).data.status).toBe('applied')
    expect((await send(f, { op: 'event.update', id, time: '22:00' })).data.status).toBe('applied')

    const y = await send(f, {
      op: 'yahrzeit.add',
      displayName: 'Reb Moshe',
      hebrew: { day: 4, month: 11 },
    })
    expect(y.data.status).toBe('applied')
    expect(
      (await send(f, { op: 'yahrzeit.update', id: y.data.target, displayName: 'Reb Moshe Z"L' }))
        .data.status,
    ).toBe('applied')
    const o = await send(f, {
      op: 'occasion.add',
      kind: 'anniversary',
      displayName: 'The Levis',
      gregorian: '2000-05-01',
    })
    expect(o.data.status).toBe('applied')

    const c = await send(f, { op: 'cholim.add', name: 'Ploni ben Almonis' })
    expect(c.data.status).toBe('applied')
    expect((await send(f, { op: 'cholim.renew', id: c.data.target })).data.status).toBe('applied')

    const s = await schedule(f.slug)
    expect(s.notices.map((n: any) => n.kind).sort()).toEqual(['simcha', 'sponsor'])
    expect(s.cholim).toHaveLength(1)
    expect(s.yahrzeits[0].origin).toEqual({ connectionId: f.keyId })
    // Every revision remembers the connection and the change.
    const hist = await db
      .prepare(
        'SELECT connection_id, change_id FROM history WHERE shul_id = ? AND connection_id IS NOT NULL',
      )
      .bind((await shulRow(f.slug)).id)
      .all()
    expect(hist.results.length).toBeGreaterThanOrEqual(10)
    expect(await changeRow(sponsor.data.changeId)).toMatchObject({
      status: 'applied',
      op: 'sponsor.create',
      target: ref,
    })
  })

  it('answers engine errors with their code', async () => {
    const f = await fixture()
    const bad = await send(f, { op: 'notice.create', kind: 'announcement', text: '' })
    expect(bad.status).toBe(400)
    expect(bad.data.error).toMatchObject({ code: 'invalid' })
    const none = await send(f, {
      op: 'sponsor.create',
      ref: `nonesuch@${later(1)}`,
      sponsoredBy: 'X',
    })
    expect(none.status).toBe(404)
    expect(none.data.error.code).toBe('not_found')
    expect((await send(f, { op: 'notice.delete', id: 'nope' })).status).toBe(404)
    const far = await send(f, { op: 'event.create', name: 'Far', date: later(500), time: '10:00' })
    expect(far.data.error.code).toBe('date_out_of_range')
    // Nothing was stored for any of them.
    expect(
      (await call('GET', `/v1/shuls/${f.slug}/changes`, undefined, { token: f.key })).data.changes,
    ).toEqual([])
  })

  it('strips invisible and direction-changing characters before they reach the schedule', async () => {
    const f = await fixture()
    const res = await send(f, {
      op: 'notice.create',
      kind: 'announcement',
      title: 'Kid\u200Bdush',
      text: 'Hello\u202E world\u200B\u2066!\u0007',
    })
    expect(res.data.status).toBe('applied')
    const stored = (await schedule(f.slug)).notices[0]
    expect(stored.text.en).toBe('Hello world!')
    expect(stored.title.en).toBe('Kiddush')
    expect(JSON.stringify(stored)).not.toMatch(/[\u200B\u202E\u2066\u0007]/)
    const feed = await call('GET', `/api/shuls/${f.slug}`)
    expect(feed.data.schedule.notices[0].text.en).toBe('Hello world!')
    const tooLong = await send(f, {
      op: 'notice.create',
      kind: 'announcement',
      text: `a ${'x'.repeat(45)}`,
    })
    expect(tooLong.status).toBe(400)
  })
})

describe('refusals before anything changes', () => {
  it('turns away a missing scope, a long body, a bad body and an unknown operation', async () => {
    const f = await fixture({ scopes: ['notices'] })
    const scope = await send(f, { op: 'cholim.add', name: 'X' })
    expect(scope.status).toBe(403)
    expect(scope.data.error.code).toBe('forbidden')
    expect(
      (await send(f, { op: 'event.create', name: 'x', date: later(1), time: '10:00' })).status,
    ).toBe(403)
    const big = await send(f, {
      op: 'notice.create',
      kind: 'announcement',
      text: 'x '.repeat(5000),
    })
    expect(big.status).toBe(413)
    expect(big.data.error.code).toBe('too_large')
    expect(
      (
        await call('POST', `/v1/shuls/${f.slug}/operations`, undefined, {
          token: f.key,
          raw: 'not json',
        })
      ).data.error.code,
    ).toBe('invalid')
    expect(
      (await call('POST', `/v1/shuls/${f.slug}/operations`, [1], { token: f.key })).status,
    ).toBe(400)
    expect((await send(f, { op: 'shul.delete' })).status).toBe(400)
    expect((await send(f, { nothing: true })).status).toBe(400)
    expect(
      (await call('POST', `/v1/shuls/${f.slug}/operations`, { op: 'notice.delete' })).status,
    ).toBe(401)
    expect(
      (
        await send(
          f,
          { op: 'notice.create', kind: 'announcement', text: 'ok' },
          { 'idempotency-key': 'bad key' },
        )
      ).status,
    ).toBe(400)
  })

  it('stops every write when V1_WRITES is off', async () => {
    const f = await fixture()
    const off = { ...testEnv, V1_WRITES: 'off' } as Env
    const res = await send(f, { op: 'notice.create', kind: 'announcement', text: 'x' }, {}, off)
    expect(res.status).toBe(503)
    expect(res.data.error.code).toBe('writes_disabled')
    expect((await schedule(f.slug)).notices).toEqual([])
  })
})

describe('applied or pending', () => {
  it('applies in publish mode and holds in review mode', async () => {
    const f = await fixture()
    const review = await another(f, { mode: 'review' })
    const live = await send(f, { op: 'notice.create', kind: 'announcement', text: 'Live' })
    expect(live.data.status).toBe('applied')
    const held = await send(review, { op: 'notice.create', kind: 'announcement', text: 'Held' })
    expect(held.status).toBe(201)
    expect(held.data).toMatchObject({
      status: 'pending',
      changeId: expect.any(String),
      reason: expect.stringMatching(/approve/),
    })
    expect(held.data).not.toHaveProperty('revision')
    expect(held.data.after[0].item.text.en).toBe('Held')
    expect((await schedule(f.slug)).notices.map((x: any) => x.text.en)).toEqual(['Live'])
    expect(await changeRow(held.data.changeId)).toMatchObject({
      status: 'pending',
      op: 'notice.create',
    })
    // A pending change is checked now.
    expect((await send(review, { op: 'notice.update', id: 'nope', text: 'x' })).status).toBe(404)
  })

  it('applies a minyan retime or cancel in publish mode', async () => {
    const f = await fixture()
    const ref = `shacharis@${later(2)}`
    const retime = await send(f, { op: 'change.retime', ref, time: '07:00' })
    expect(retime.data).toMatchObject({ status: 'applied', target: ref })
    const cancel = await send(f, { op: 'change.cancel', ref })
    expect(cancel.data.status).toBe('applied')
    expect((await schedule(f.slug)).exceptions).toHaveLength(1)
    // A note on a minyan is not a time change.
    expect((await send(f, { op: 'change.note', ref, note: 'Guest speaker' })).data.status).toBe(
      'applied',
    )
    const e = await send(f, { op: 'event.create', name: 'Siyum', date: later(2), time: '20:00' })
    expect(
      (await send(f, { op: 'change.retime', ref: `${e.data.target}@${later(2)}`, time: '21:00' }))
        .data.status,
    ).toBe('applied')
  })

  it('lets a connection remove or change three items it did not create a day, and holds the fourth', async () => {
    const f = await fixture()
    await seedNotices(f.slug, f.owner, 8)
    for (const i of [0, 1, 2]) {
      const r = await send(f, { op: 'notice.delete', id: `adm${i}` })
      expect(r.data.status, `delete ${i}`).toBe('applied')
    }
    const fourth = await send(f, { op: 'notice.delete', id: 'adm3' })
    expect(fourth.data).toMatchObject({
      status: 'pending',
      reason: expect.stringMatching(/3 existing items a day/),
    })
    // Edits of other people's items are in the same allowance (already used up) …
    const edit = await send(f, nameOf('adm4'))
    expect(edit.data.status).toBe('pending')
    // … while creating, and editing what it made itself, are not.
    const own = await send(f, { op: 'notice.create', kind: 'announcement', text: 'Mine' })
    expect(own.data.status).toBe('applied')
    for (let i = 0; i < 4; i++)
      expect(
        (await send(f, { op: 'notice.update', id: own.data.target, text: `Mine ${i}` })).data
          .status,
      ).toBe('applied')
    const left = (await schedule(f.slug)).notices.map((x: any) => x.id)
    expect(left).toContain('adm3')
    expect(left).not.toContain('adm0')
  })

  it('counts edits of other people’s items the same way', async () => {
    const f = await fixture()
    await seedNotices(f.slug, f.owner, 6)
    const results = []
    for (const i of [0, 1, 2, 3, 4]) results.push((await send(f, nameOf(`adm${i}`))).data.status)
    expect(results).toEqual(['applied', 'applied', 'applied', 'pending', 'pending'])
    // Another connection has its own allowance.
    const other = await another(f)
    expect((await send(other, nameOf('adm5'))).data.status).toBe('applied')
    // An approved change does not use up the allowance, and neither does a held one.
    const own = await send(f, { op: 'notice.create', kind: 'announcement', text: 'Own' })
    expect((await send(f, { op: 'notice.delete', id: own.data.target })).data.status).toBe(
      'pending',
    )
  })

  it('caps writes at 50 a day and pending changes at 50 a connection', async () => {
    const f = await fixture()
    const review = await another(f, { mode: 'review' })
    const id = (await shulRow(f.slug)).id
    const insert = (conn: string, status: string, at: number, i: number) =>
      db
        .prepare(
          `INSERT INTO api_changes (id, shul_id, connection_id, user_id, op, target, payload, status, created_at)
           VALUES (?, ?, ?, 'x', 'notice.create', 't', '{}', ?, ?)`,
        )
        .bind(`fill-${conn}-${i}-${status}`, id, conn, status, at)
        .run()
    for (let i = 0; i < 49; i++) await insert(f.keyId, 'applied', Date.now(), i)
    expect(
      (await send(f, { op: 'notice.create', kind: 'announcement', text: 'Fiftieth' })).data.status,
    ).toBe('applied')
    const over = await send(f, { op: 'notice.create', kind: 'announcement', text: 'Fifty-first' })
    expect(over.status).toBe(429)
    expect(over.data.error.code).toBe('daily_limit')
    // Yesterday's writes don't count.
    await db
      .prepare('UPDATE api_changes SET created_at = ? WHERE connection_id = ?')
      .bind(Date.now() - 30 * 3_600_000, f.keyId)
      .run()
    expect(
      (await send(f, { op: 'notice.create', kind: 'announcement', text: 'Fresh day' })).data.status,
    ).toBe('applied')

    for (let i = 0; i < 50; i++)
      await insert(review.keyId, 'pending', Date.now() - 3 * 86_400_000, i)
    const full = await send(review, {
      op: 'notice.create',
      kind: 'announcement',
      text: 'One too many',
    })
    expect(full.status).toBe(429)
    expect(full.data.error.code).toBe('too_many_pending')
  })
})

describe('idempotency', () => {
  it('replays the first answer for the same key, without applying again', async () => {
    const f = await fixture()
    const op = { op: 'notice.create', kind: 'announcement', text: 'Once' }
    const headers = { 'idempotency-key': 'abc-123' }
    const first = await send(f, op, headers)
    const second = await send(f, op, headers)
    expect(second.status).toBe(201)
    expect(second.headers.get('idempotent-replay')).toBe('true')
    expect(second.data).toEqual(first.data)
    expect((await schedule(f.slug)).notices).toHaveLength(1)
    const mismatch = await send(f, { ...op, text: 'Different' }, headers)
    expect(mismatch.status).toBe(409)
    expect(mismatch.data.error.code).toBe('idempotency_conflict')
    // Scoped to the connection.
    const other = await another(f)
    expect((await send(other, op, headers)).data.changeId).not.toBe(first.data.changeId)
    expect((await schedule(f.slug)).notices).toHaveLength(2)
  })

  it('replays a pending change as pending, and forgets a key after a day', async () => {
    const f = await fixture({ mode: 'review' })
    const op = { op: 'notice.create', kind: 'announcement', text: 'Wait' }
    const headers = { 'idempotency-key': 'k1' }
    const first = await send(f, op, headers)
    expect((await send(f, op, headers)).data).toMatchObject({
      status: 'pending',
      changeId: first.data.changeId,
    })
    await db
      .prepare('UPDATE api_changes SET created_at = ? WHERE id = ?')
      .bind(Date.now() - 25 * 3_600_000, first.data.changeId)
      .run()
    const again = await send(f, op, headers)
    expect(again.headers.get('idempotent-replay')).toBeNull()
    expect(again.data.changeId).not.toBe(first.data.changeId)
  })
})

describe('review: approve, reject, expire', () => {
  async function held(f: Fixture, op: unknown) {
    const res = await send(f, op)
    expect(res.data.status).toBe('pending')
    return res.data.changeId as string
  }
  const admin = (f: Fixture, path: string, method = 'GET', body?: unknown, token = f.owner) =>
    call(method, `/api/shuls/${f.slug}/changes${path}`, body, { token })

  it('lists changes with the connection and person, newest first, with filters', async () => {
    const f = await fixture({ mode: 'review', label: 'Rivka’s Claude' })
    const a = await held(f, { op: 'notice.create', kind: 'announcement', text: 'A' })
    const b = await held(f, { op: 'notice.create', kind: 'announcement', text: 'B' })
    const list = await admin(f, '')
    expect(list.data.changes.map((c: any) => c.id)).toEqual([b, a])
    expect(list.data.changes[0]).toMatchObject({
      connectionId: f.keyId,
      connectionLabel: 'Rivka’s Claude',
      userName: expect.stringContaining('User'),
      status: 'pending',
      op: 'notice.create',
      payload: { op: 'notice.create', text: 'B' },
      expiresAt: expect.any(Number),
    })
    expect((await admin(f, '?status=applied')).data.changes).toEqual([])
    expect((await admin(f, `?connectionId=${f.keyId}&status=pending`)).data.changes).toHaveLength(2)
    expect((await admin(f, '?connectionId=other')).data.changes).toEqual([])
    expect((await admin(f, '?status=bogus')).status).toBe(400)
    expect((await admin(f, '', 'GET', undefined, 'stranger')).status).toBe(403)
    expect((await call('GET', `/api/shuls/${f.slug}/changes`)).status).toBe(401)
  })

  it('approves through the same path: applied, tagged with the connection, and any member may', async () => {
    const f = await fixture({ mode: 'review' })
    const editor = user('ed')
    const invite = await call(
      'POST',
      `/api/shuls/${f.slug}/invites`,
      { role: 'editor' },
      { token: f.owner },
    )
    await call('POST', `/api/invites/${invite.data.token}`, undefined, { token: editor })
    const id = await held(f, { op: 'notice.create', kind: 'announcement', text: 'Approve me' })
    const res = await admin(f, `/${id}/approve`, 'POST', undefined, editor)
    expect(res.status).toBe(200)
    expect(res.data.change).toMatchObject({
      status: 'applied',
      decidedBy: editor,
      target: expect.any(String),
    })
    expect(res.data.change.after[0].item.origin).toEqual({ connectionId: f.keyId })
    const s = await schedule(f.slug)
    expect(s.notices[0]).toMatchObject({
      text: { en: 'Approve me' },
      origin: { connectionId: f.keyId },
    })
    const hist = await db.prepare('SELECT * FROM history WHERE change_id = ?').bind(id).first<any>()
    expect(hist).toMatchObject({
      user_id: editor,
      connection_id: f.keyId,
      revision: res.data.revision,
    })
    // Not twice.
    expect((await admin(f, `/${id}/approve`, 'POST')).status).toBe(409)
    expect((await schedule(f.slug)).notices).toHaveLength(1)
    // And it can then be undone.
    expect((await admin(f, `/${id}/undo`, 'POST')).data.change.status).toBe('reverted')
  })

  it('applies an approved minyan retime that review mode held', async () => {
    const f = await fixture({ mode: 'review' })
    const ref = `shacharis@${later(2)}`
    const id = await held(f, { op: 'change.retime', ref, time: '07:15' })
    expect((await admin(f, `/${id}/approve`, 'POST')).status).toBe(200)
    expect((await schedule(f.slug)).exceptions[0]).toMatchObject({
      type: 'retime',
      eventId: 'shacharis',
      origin: { connectionId: f.keyId },
    })
    const day = await call('GET', `/v1/shuls/${f.slug}/day/${later(2)}`)
    expect(day.data.events.find((e: any) => e.id === 'shacharis').time.minutes).toBe(7 * 60 + 15)
  })

  it('rejects, and a rejected change cannot be approved', async () => {
    const f = await fixture({ mode: 'review' })
    const id = await held(f, { op: 'notice.create', kind: 'announcement', text: 'No' })
    const res = await admin(f, `/${id}/reject`, 'POST')
    expect(res.data.change).toMatchObject({ status: 'rejected', decidedBy: f.owner })
    expect((await admin(f, `/${id}/approve`, 'POST')).status).toBe(409)
    expect((await admin(f, `/${id}/reject`, 'POST')).status).toBe(409)
    expect((await schedule(f.slug)).notices).toEqual([])
    expect((await admin(f, '/nope/approve', 'POST')).status).toBe(404)
  })

  it('expires after 14 days, on read and on approve', async () => {
    const f = await fixture({ mode: 'review' })
    const id = await held(f, { op: 'notice.create', kind: 'announcement', text: 'Old' })
    const old = await held(f, { op: 'notice.create', kind: 'announcement', text: 'Older' })
    await db
      .prepare('UPDATE api_changes SET created_at = ? WHERE id = ?')
      .bind(Date.now() - 15 * 86_400_000, id)
      .run()
    const res = await admin(f, `/${id}/approve`, 'POST')
    expect(res.status).toBe(409)
    expect(res.data.error).toMatch(/expired/)
    expect((await changeRow(id)).status).toBe('expired')
    await db
      .prepare('UPDATE api_changes SET created_at = ? WHERE id = ?')
      .bind(Date.now() - 20 * 86_400_000, old)
      .run()
    const list = await admin(f, '?status=pending')
    expect(list.data.changes).toEqual([])
    expect((await admin(f, '?status=expired')).data.changes).toHaveLength(2)
    expect(
      (await call('GET', `/v1/shuls/${f.slug}/changes?status=expired`, undefined, { token: f.key }))
        .data.changes,
    ).toHaveLength(2)
    expect((await schedule(f.slug)).notices).toEqual([])
  })

  it('fails clearly, and stays pending, when an admin edit made it no longer fit', async () => {
    const f = await fixture({ mode: 'review' })
    await seedNotices(f.slug, f.owner, 1)
    const id = await held(f, nameOf('adm0'))
    await adminEdit(f.slug, f.owner, (s) => {
      s.notices = []
    })
    const res = await admin(f, `/${id}/approve`, 'POST')
    expect(res.status).toBe(409)
    expect(res.data).toMatchObject({
      error: expect.stringMatching(/no longer fits/),
      code: 'not_found',
    })
    expect(await changeRow(id)).toMatchObject({ status: 'pending', decided_by: null })
    // Rejecting is still possible.
    expect((await admin(f, `/${id}/reject`, 'POST')).status).toBe(200)
  })
})

describe('undo', () => {
  const admin = (f: Fixture, path: string, method = 'POST', body?: unknown) =>
    call(method, `/api/shuls/${f.slug}/changes${path}`, body, { token: f.owner })

  it('undoes a change, restoring what it replaced', async () => {
    const f = await fixture()
    await seedNotices(f.slug, f.owner, 1)
    const created = await send(f, { op: 'notice.create', kind: 'announcement', text: 'New' })
    const edited = await send(f, nameOf('adm0'))
    const removed = await send(f, { op: 'notice.delete', id: created.data.target })
    expect(removed.data.status).toBe('applied')
    expect((await schedule(f.slug)).notices.map((x: any) => x.id)).toEqual(['adm0'])
    // Newest first: bring the new notice back, then take the edit away, then the creation.
    const r1 = await admin(f, `/${removed.data.changeId}/undo`)
    expect(r1.data.change.status).toBe('reverted')
    expect((await schedule(f.slug)).notices).toHaveLength(2)
    expect((await admin(f, `/${edited.data.changeId}/undo`)).status).toBe(200)
    expect((await schedule(f.slug)).notices.find((x: any) => x.id === 'adm0').text.en).toBe(
      'Admin notice 0',
    )
    expect((await admin(f, `/${created.data.changeId}/undo`)).status).toBe(200)
    expect((await schedule(f.slug)).notices.map((x: any) => x.id)).toEqual(['adm0'])
    expect((await admin(f, `/${created.data.changeId}/undo`)).status).toBe(409)
    // The history says who undid it.
    const hist = await db
      .prepare('SELECT * FROM history WHERE change_id = ? ORDER BY revision DESC')
      .bind(created.data.changeId)
      .first<any>()
    expect(hist).toMatchObject({ user_id: f.owner, connection_id: f.keyId })
  })

  it('says what changed when the target was edited since, and leaves it applied', async () => {
    const f = await fixture()
    const created = await send(f, { op: 'notice.create', kind: 'announcement', text: 'New' })
    await adminEdit(f.slug, f.owner, (s) => {
      s.notices[0].text.en = 'Edited by a gabbai'
    })
    const res = await admin(f, `/${created.data.changeId}/undo`)
    expect(res.status).toBe(409)
    expect(res.data.error).toMatch(/changed since/)
    expect(res.data.conflict.ids).toEqual([created.data.target])
    expect((await changeRow(created.data.changeId)).status).toBe('applied')
    expect((await schedule(f.slug)).notices[0].text.en).toBe('Edited by a gabbai')
  })

  it('undoes everything since a moment, newest first, and stops at the first conflict', async () => {
    const f = await fixture()
    const a = await send(f, { op: 'notice.create', kind: 'announcement', text: 'A' })
    const b = await send(f, { op: 'notice.create', kind: 'announcement', text: 'B' })
    const c = await send(f, { op: 'notice.create', kind: 'announcement', text: 'C' })
    await adminEdit(f.slug, f.owner, (s) => {
      s.notices.find((x: any) => x.id === b.data.target).text.en = 'B by admin'
    })
    const stopped = await admin(f, '/undo-since', 'POST', { connectionId: f.keyId, since: 0 })
    expect(stopped.status).toBe(200)
    expect(stopped.data).toMatchObject({
      undone: [c.data.changeId],
      remaining: 2,
      conflict: { changeId: b.data.changeId, ids: [b.data.target] },
    })
    expect((await schedule(f.slug)).notices.map((x: any) => x.id)).toEqual([
      a.data.target,
      b.data.target,
    ])
    // Clear the conflict (the admin removes B), then it finishes.
    await adminEdit(f.slug, f.owner, (s) => {
      s.notices = s.notices.filter((x: any) => x.id !== b.data.target)
    })
    await db
      .prepare(`UPDATE api_changes SET status = 'reverted' WHERE id = ?`)
      .bind(b.data.changeId)
      .run()
    const done = await admin(f, '/undo-since', 'POST', {
      connectionId: f.keyId,
      since: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(done.data).toMatchObject({ undone: [a.data.changeId], conflict: null, remaining: 0 })
    expect((await schedule(f.slug)).notices).toEqual([])
    expect((await admin(f, '/undo-since', 'POST', { connectionId: f.keyId })).status).toBe(400)
    expect((await admin(f, '/undo-since', 'POST', { since: 0 })).status).toBe(400)
    // Only changes since then.
    const late = await send(f, { op: 'notice.create', kind: 'announcement', text: 'Late' })
    const future = await admin(f, '/undo-since', 'POST', {
      connectionId: f.keyId,
      since: Date.now() + 60_000,
    })
    expect(future.data.undone).toEqual([])
    expect((await changeRow(late.data.changeId)).status).toBe('applied')
  })

  it('lets a key undo its own applied change, and nobody else’s', async () => {
    const f = await fixture()
    const other = await another(f)
    const mine = await send(f, { op: 'notice.create', kind: 'announcement', text: 'Mine' })
    const theirs = await send(other, { op: 'notice.create', kind: 'announcement', text: 'Theirs' })
    const undo = (id: string, token = f.key) =>
      call('POST', `/v1/shuls/${f.slug}/changes/${id}/undo`, undefined, { token })
    expect((await undo(theirs.data.changeId)).status).toBe(404)
    const ok = await undo(mine.data.changeId)
    expect(ok.status).toBe(200)
    expect(ok.data).toMatchObject({ status: 'reverted', changeId: mine.data.changeId })
    expect((await schedule(f.slug)).notices.map((x: any) => x.text.en)).toEqual(['Theirs'])
    const again = await undo(mine.data.changeId)
    expect(again.status).toBe(409)
    expect(again.data.error.code).toBe('conflict')
    // A conflict is explained.
    await adminEdit(f.slug, f.owner, (s) => {
      s.notices[0].text.en = 'Changed'
    })
    const blocked = await undo(theirs.data.changeId, other.key)
    expect(blocked.status).toBe(409)
    expect(blocked.data.error.details.ids).toEqual([theirs.data.target])
  })
})

describe('writing while the admin saves', () => {
  it('retries on the new revision when an admin save lands between load and save, losing neither', async () => {
    const f = await fixture()
    const before = await call('GET', `/api/shuls/${f.slug}/admin`, undefined, { token: f.owner })
    let armed = true
    const racing = {
      ...testEnv,
      DB: new Proxy(db, {
        get(target, prop) {
          const v = Reflect.get(target, prop) as unknown
          if (prop !== 'prepare') return typeof v === 'function' ? (v as Function).bind(target) : v
          return (sql: string) => {
            const stmt = target.prepare(sql)
            if (!armed || !sql.startsWith('UPDATE shuls SET profile')) return stmt
            return {
              bind: (...args: unknown[]) => {
                const bound = stmt.bind(...args)
                return {
                  first: async () => {
                    armed = false
                    // The admin saves after the key loaded the schedule and before it wrote.
                    await adminEdit(f.slug, f.owner, (s) => {
                      s.notices.push({
                        id: 'admin1',
                        kind: 'announcement',
                        from: today(),
                        to: later(5),
                        text: { en: 'From the admin' },
                      })
                    })
                    return bound.first()
                  },
                }
              },
            }
          }
        },
      }),
    } as unknown as Env
    const res = await send(
      f,
      { op: 'notice.create', kind: 'announcement', text: 'From the key' },
      {},
      racing,
    )
    expect(res.data.status).toBe('applied')
    expect(res.data.revision).toBe(before.data.revision + 2)
    const s = await schedule(f.slug)
    expect(s.notices.map((x: any) => x.text.en).sort()).toEqual(['From the admin', 'From the key'])
    // The admin’s own stale save is refused with the current record; nothing of either is lost.
    const stale = await call(
      'PUT',
      `/api/shuls/${f.slug}`,
      { schedule: before.data.schedule, baseRevision: before.data.revision },
      { token: f.owner },
    )
    expect(stale.status).toBe(409)
    expect(stale.data.schedule.notices).toHaveLength(2)
    expect((await schedule(f.slug)).notices).toHaveLength(2)
  })
})
