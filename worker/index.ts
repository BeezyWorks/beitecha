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
      if (request.method === 'OPTIONS') return devCors(request, env, new Response(null, { status: 204 }))
      return devCors(request, env, await handleApi(request, env, url))
    }
    // `/<slug>.ics` is the short subscribe link printed under the QR code.
    const ics = /^\/([a-z0-9-]+)\.ics$/.exec(url.pathname)
    if (ics && request.method === 'GET') return handleApi(request, env, new URL(`/api/shuls/${ics[1]}/calendar.ics`, url))
    return env.ASSETS.fetch(request)
  },
}
