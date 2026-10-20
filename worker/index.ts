import type { Env } from './env'
import { HttpError, fail } from './http'
import {
  acceptInvite,
  createInvite,
  createShul,
  getAdmin,
  getDirectory,
  getIcs,
  getMine,
  getPublic,
  heartbeat,
  putShul,
  removeMember,
} from './shuls'

export type { Env } from './env'

type Handler = (request: Request, env: Env, params: string[], url: URL) => Promise<Response>

const routes: [method: string, pattern: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/directory$/, (_r, env, _p, url) => getDirectory(env, url.searchParams.get('q') ?? '')],
  ['GET', /^\/api\/me\/shuls$/, (r, env) => getMine(r, env)],
  ['POST', /^\/api\/shuls$/, (r, env) => createShul(r, env)],
  ['GET', /^\/api\/shuls\/([^/]+)$/, (r, env, [slug]) => getPublic(env, slug, r)],
  ['PUT', /^\/api\/shuls\/([^/]+)$/, (r, env, [slug]) => putShul(r, env, slug)],
  ['GET', /^\/api\/shuls\/([^/]+)\/calendar\.ics$/, (_r, env, [slug]) => getIcs(env, slug)],
  ['GET', /^\/api\/shuls\/([^/]+)\/admin$/, (r, env, [slug]) => getAdmin(r, env, slug)],
  ['POST', /^\/api\/shuls\/([^/]+)\/invites$/, (r, env, [slug]) => createInvite(r, env, slug)],
  ['DELETE', /^\/api\/shuls\/([^/]+)\/members\/([^/]+)$/, (r, env, [slug, id]) => removeMember(r, env, slug, id)],
  ['POST', /^\/api\/shuls\/([^/]+)\/displays\/([^/]+)$/, (r, env, [slug, id]) => heartbeat(r, env, slug, id)],
  ['POST', /^\/api\/invites\/([^/]+)$/, (r, env, [token]) => acceptInvite(r, env, token)],
]

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  let pathMatched = false
  for (const [method, pattern, handler] of routes) {
    const m = pattern.exec(url.pathname)
    if (!m) continue
    pathMatched = true
    if (method !== request.method) continue
    try {
      return await handler(request, env, m.slice(1).map(decodeURIComponent), url)
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message)
      throw e
    }
  }
  return pathMatched ? fail(405, 'method not allowed') : fail(404, 'not found')
}

/** Reads that need no session: a shul's feed, the directory, the ICS feed. */
const PUBLIC_READ = /^\/api\/(directory|shuls\/[^/]+(\/calendar\.ics)?)$/

/** The Siddur's web build (its hosts in SiddurOneRN's app.config.ts) reads a shul's feed cross-origin. CORS only
 * governs browsers; the native apps send no origin, and the rate limit is what guards the reads. */
const SIDDUR_ORIGINS = new Set(['https://siddur.one', 'https://tefila.baderech.app', 'https://siddur.baderech.app'])

function siddurCors(request: Request, url: URL, response: Response): Response {
  const origin = request.headers.get('origin')
  if (!origin || !SIDDUR_ORIGINS.has(origin) || !PUBLIC_READ.test(url.pathname)) return response
  if (request.method !== 'GET' && request.method !== 'OPTIONS') return response
  const res = new Response(response.body, response)
  res.headers.set('access-control-allow-origin', origin)
  res.headers.set('vary', 'origin')
  res.headers.set('access-control-allow-headers', 'if-none-match')
  res.headers.set('access-control-allow-methods', 'GET')
  res.headers.set('access-control-expose-headers', 'etag')
  return res
}

/** A 429 once a visitor's IP has made too many public reads this minute (`PUBLIC_LIMIT` in wrangler.jsonc: room for a
 * whole minyan scanning the QR code over the shul's wifi, not for a flood). */
async function rateLimited(request: Request, env: Env, url: URL): Promise<Response | null> {
  const ip = request.headers.get('cf-connecting-ip')
  if (!env.PUBLIC_LIMIT || !ip || request.method !== 'GET' || !PUBLIC_READ.test(url.pathname)) return null
  const { success } = await env.PUBLIC_LIMIT.limit({ key: ip })
  if (success) return null
  const res = fail(429, 'too many requests')
  res.headers.set('retry-after', '60')
  return res
}

/** In local dev the Expo server (another port) calls the API cross-origin. */
function devCors(request: Request, env: Env, response: Response): Response {
  const origin = request.headers.get('origin')
  if (env.DEV_AUTH !== '1' || !origin || !/^http:\/\/localhost:\d+$/.test(origin)) return response
  const res = new Response(response.body, response)
  res.headers.set('access-control-allow-origin', origin)
  res.headers.set('access-control-allow-headers', 'content-type, authorization, if-none-match')
  res.headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.headers.set('access-control-expose-headers', 'etag')
  return res
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return Response.json({ ok: true })
    if (url.pathname.startsWith('/api/')) {
      const response =
        request.method === 'OPTIONS'
          ? new Response(null, { status: 204 })
          : ((await rateLimited(request, env, url)) ?? (await handleApi(request, env, url)))
      return devCors(request, env, siddurCors(request, url, response))
    }
    // `/<slug>.ics` is the short subscribe link printed under the QR code.
    const ics = /^\/([a-z0-9-]+)\.ics$/.exec(url.pathname)
    if (ics && request.method === 'GET') {
      const api = new URL(`/api/shuls/${ics[1]}/calendar.ics`, url)
      return (await rateLimited(request, env, api)) ?? handleApi(request, env, api)
    }
    return env.ASSETS.fetch(request)
  },
}
