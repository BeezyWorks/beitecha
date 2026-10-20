import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import type { Env } from '../env'
import worker from '../index'

const ORIGIN = 'https://beitecha.test'
const testEnv = env as unknown as Env

async function call(method: string, path: string, body?: unknown, opts: { token?: string; headers?: Record<string, string> } = {}) {
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

const location = { latitude: 40.0821, longitude: -74.2097, timeZone: 'America/New_York', israel: false }
let n = 0
async function newShul(owner = 'owner1', extra: Record<string, unknown> = {}) {
  const slug = `shul-${++n}-${Math.random().toString(36).slice(2, 7)}`
  const res = await call(
    'POST',
    '/api/shuls',
    { slug, profile: { name: { en: `Shul ${n}` } }, location, ...extra },
    { token: owner },
  )
  expect(res.status).toBe(201)
  return slug
}

describe('creating a shul', () => {
  it('needs a session', async () => {
    expect((await call('POST', '/api/shuls', { slug: 'abc' })).status).toBe(401)
    expect((await call('POST', '/api/shuls', { slug: 'abc' }, { token: 'expired' })).status).toBe(401)
  })

  it('checks the address, name and location', async () => {
    const ok = { profile: { name: { en: 'X' } }, location }
    expect((await call('POST', '/api/shuls', { ...ok, slug: 'A b' }, { token: 'u' })).status).toBe(400)
    expect((await call('POST', '/api/shuls', { ...ok, slug: 'admin' }, { token: 'u' })).data.error).toMatch(/reserved/)
    expect((await call('POST', '/api/shuls', { ...ok, slug: 'good-one', profile: {} }, { token: 'u' })).status).toBe(400)
    const badTz = { ...ok, slug: 'good-two', location: { ...location, timeZone: 'Mars/Olympus' } }
    expect((await call('POST', '/api/shuls', badTz, { token: 'u' })).data.error).toMatch(/time zone/)
  })

  it('starts from the starter schedule, owned by its creator, and refuses a taken address', async () => {
    const slug = await newShul('creator')
    const pub = await call('GET', `/api/shuls/${slug}`)
    expect(pub.status).toBe(200)
    expect(pub.data.schedule.events.map((e: any) => e.id)).toEqual([
      'shacharis',
      'mincha-maariv',
      'maariv',
    ])
    const mine = await call('GET', '/api/me/shuls', undefined, { token: 'creator' })
    expect(mine.data.shuls).toEqual([{ slug, name: { en: expect.any(String) }, role: 'owner' }])
    const again = await call('POST', '/api/shuls', { slug, profile: { name: { en: 'Y' } }, location }, { token: 'x' })
    expect(again.status).toBe(409)
  })

  it('can start with separate Mincha and Maariv, in Hebrew', async () => {
    const slug = await newShul('creator', { minchaMaariv: 'separate', language: 'he' })
    const { schedule } = (await call('GET', `/api/shuls/${slug}`)).data
    expect(schedule.events.map((e: any) => e.id)).toEqual(['shacharis', 'mincha', 'maariv'])
    expect(schedule.settings.language).toBe('he')
    const bad = { slug: 'good-three', profile: { name: { en: 'X' } }, location }
    expect(
      (await call('POST', '/api/shuls', { ...bad, language: 'fr' }, { token: 'u' })).status,
    ).toBe(400)
    expect(
      (await call('POST', '/api/shuls', { ...bad, minchaMaariv: 'both' }, { token: 'u' })).status,
    ).toBe(400)
  })
})

describe('the public feed', () => {
  it('serves an ETag and answers 304', async () => {
    const slug = await newShul()
    const first = await call('GET', `/api/shuls/${slug}`)
    const etag = first.headers.get('etag')!
    expect(etag).toBeTruthy()
    expect((await call('GET', `/api/shuls/${slug}`, undefined, { headers: { 'if-none-match': etag } })).status).toBe(304)
  })

  it('leaves out long-past exceptions and notices', async () => {
    const slug = await newShul()
    const { data } = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'owner1' })
    const schedule = {
      ...data.schedule,
      exceptions: [
        { id: 'old', date: '2020-01-01', type: 'cancel', eventId: 'mincha' },
        { id: 'new', date: '2099-01-01', type: 'cancel', eventId: 'mincha' },
      ],
      notices: [{ id: 'n', kind: 'announcement', from: '2020-01-01', text: { en: 'old' } }],
    }
    expect((await call('PUT', `/api/shuls/${slug}`, { schedule, baseRevision: data.revision }, { token: 'owner1' })).status).toBe(200)
    const pub = await call('GET', `/api/shuls/${slug}`)
    expect(pub.data.schedule.exceptions.map((x: any) => x.id)).toEqual(['new'])
    expect(pub.data.schedule.notices).toEqual([])
  })

  it('404s an unknown shul', async () => {
    expect((await call('GET', '/api/shuls/nope-nope')).status).toBe(404)
  })
})

describe('editing', () => {
  it('only lets members edit, and checks the revision', async () => {
    const slug = await newShul('ed-owner')
    const { data } = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'ed-owner' })
    expect(data.role).toBe('owner')
    expect((await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'stranger' })).status).toBe(403)

    const profile = { name: { en: 'Renamed' } }
    const put = (token: string, baseRevision: number) =>
      call('PUT', `/api/shuls/${slug}`, { profile, baseRevision }, { token })
    expect((await put('stranger', data.revision)).status).toBe(403)
    const saved = await put('ed-owner', data.revision)
    expect(saved.status).toBe(200)
    expect(saved.data.revision).toBe(data.revision + 1)
    const stale = await put('ed-owner', data.revision)
    expect(stale.status).toBe(409)
    expect(stale.data.revision).toBe(data.revision + 1)
  })

  it('rejects a malformed schedule', async () => {
    const slug = await newShul('mal')
    const res = await call('PUT', `/api/shuls/${slug}`, { schedule: { events: 'x' }, baseRevision: 1 }, { token: 'mal' })
    expect(res.status).toBe(400)
  })

  it('records who saved each revision', async () => {
    const slug = await newShul('hist')
    await call('PUT', `/api/shuls/${slug}`, { profile: { name: { en: 'H' } }, baseRevision: 1 }, { token: 'hist' })
    const { data } = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'hist' })
    expect(data.history.map((h: any) => h.revision)).toEqual([2, 1])
    expect(data.history[0].name).toBe('User hist')
  })
})

describe('the team', () => {
  it('invites an editor who can then edit but not invite', async () => {
    const slug = await newShul('team-owner')
    const invite = await call('POST', `/api/shuls/${slug}/invites`, { role: 'editor' }, { token: 'team-owner' })
    expect(invite.status).toBe(201)
    expect(invite.data.url).toBe(`${ORIGIN}/invite/${invite.data.token}`)
    expect((await call('POST', `/api/invites/${invite.data.token}`, {}, { token: 'gabbai' })).data).toEqual({ slug })
    expect((await call('POST', `/api/invites/${invite.data.token}`, {}, { token: 'other' })).status).toBe(404) // used up
    expect((await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'gabbai' })).data.role).toBe('editor')
    expect((await call('POST', `/api/shuls/${slug}/invites`, {}, { token: 'gabbai' })).status).toBe(403)
  })

  it('keeps at least one owner', async () => {
    const slug = await newShul('solo')
    const res = await call('DELETE', `/api/shuls/${slug}/members/solo`, undefined, { token: 'solo' })
    expect(res.status).toBe(400)
  })

  it('lets an editor leave but not remove others', async () => {
    const slug = await newShul('o2')
    const { data } = await call('POST', `/api/shuls/${slug}/invites`, {}, { token: 'o2' })
    await call('POST', `/api/invites/${data.token}`, {}, { token: 'e2' })
    expect((await call('DELETE', `/api/shuls/${slug}/members/o2`, undefined, { token: 'e2' })).status).toBe(403)
    expect((await call('DELETE', `/api/shuls/${slug}/members/e2`, undefined, { token: 'e2' })).status).toBe(204)
  })
})

describe('displays', () => {
  it('records heartbeats the gabbai can see', async () => {
    const slug = await newShul('disp')
    expect((await call('POST', `/api/shuls/${slug}/displays/lobby-tv-0001`, { label: 'Lobby' })).status).toBe(204)
    const { data } = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'disp' })
    expect(data.displays).toEqual([{ id: 'lobby-tv-0001', label: 'Lobby', lastSeen: expect.any(Number) }])
  })

  it('caps the number of displays', async () => {
    const slug = await newShul('cap')
    for (let i = 0; i < 22; i++) await call('POST', `/api/shuls/${slug}/displays/display-${String(i).padStart(4, '0')}`)
    const { data } = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'cap' })
    expect(data.displays).toHaveLength(20)
  })
})

describe('calendar feed', () => {
  it('serves iCalendar in the shul time zone, also at /<slug>.ics', async () => {
    const slug = await newShul()
    const res = await call('GET', `/${slug}.ics`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/calendar/)
    expect(res.data).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(res.data).toMatch(/DTSTART;TZID=America\/New_York:\d{8}T\d{6}\r\n/)
    expect(res.data).toContain('SUMMARY:Shacharis')
  })

  it('writes event names in the shul’s language', async () => {
    const slug = await newShul('owner1', { language: 'he' })
    const res = await call('GET', `/${slug}.ics`)
    expect(res.data).toContain('SUMMARY:שחרית')
    expect(res.data).toContain('SUMMARY:מנחה וערבית')
  })

  it('can write names in Hebrew while the shul’s language stays English', async () => {
    const slug = await newShul('owner2')
    const { data } = await call('GET', `/api/shuls/${slug}/admin`, undefined, { token: 'owner2' })
    const schedule = { ...data.schedule, settings: { ...data.schedule.settings, names: 'he' } }
    expect((await call('PUT', `/api/shuls/${slug}`, { schedule, baseRevision: data.revision }, { token: 'owner2' })).status).toBe(200)
    expect((await call('GET', `/${slug}.ics`)).data).toContain('SUMMARY:שחרית')
    const bad = { ...schedule, settings: { ...schedule.settings, names: 'fr' } }
    expect((await call('PUT', `/api/shuls/${slug}`, { schedule: bad, baseRevision: data.revision + 1 }, { token: 'owner2' })).status).toBe(400)
  })
})

describe('the directory', () => {
  it('lists only verified shuls', async () => {
    const slug = await newShul()
    expect((await call('GET', `/api/directory?q=${slug}`)).data.shuls).toEqual([])
    await testEnv.DB.prepare('UPDATE shuls SET listed = 1 WHERE slug = ?').bind(slug).run()
    expect((await call('GET', `/api/directory?q=${slug}`)).data.shuls).toEqual([{ slug, name: { en: expect.any(String) } }])
  })
})

it('hands everything else to the web app', async () => {
  const res = await call('GET', '/some-shul')
  expect(res.status).toBe(200)
  expect(res.data).toContain('<title>app</title>')
})
