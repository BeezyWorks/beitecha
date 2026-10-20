import type { Schedule, ShulProfile, ShulSettings } from '@beitecha/engine'

import { tokenStore } from '@/features/account/tokens'
import { API_URL } from './config'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...init.headers }
  const token = tokenStore.get()
  if (token) headers.authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 204 || res.status === 304) return { status: res.status, data: null as T, etag: res.headers.get('etag') }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`, data)
  return { status: res.status, data: data as T, etag: res.headers.get('etag') }
}

export interface ShulFeed {
  slug: string
  profile: ShulProfile
  schedule: Schedule
  revision: number
  updatedAt: number
}

export interface Member {
  userId: string
  role: 'owner' | 'editor'
  name: string | null
  email: string | null
}

export interface ShulAdmin extends ShulFeed {
  role: 'owner' | 'editor'
  listed: boolean
  members: Member[]
  displays: { id: string; label: string | null; lastSeen: number }[]
  history: { revision: number; at: number; name: string | null }[]
}

export interface MyShul {
  slug: string
  name: ShulProfile['name']
  role: 'owner' | 'editor'
}

export const api = {
  /** `null` when unchanged since `etag`. */
  async feed(slug: string, etag?: string | null) {
    const res = await request<ShulFeed>(`/api/shuls/${slug}`, { headers: etag ? { 'if-none-match': etag } : {} })
    return res.status === 304 ? null : { feed: res.data, etag: res.etag }
  },
  admin: async (slug: string) => (await request<ShulAdmin>(`/api/shuls/${slug}/admin`)).data,
  /** Throws ApiError 409 (body = the current record) on a stale revision. */
  save: async (slug: string, body: { profile?: ShulProfile; schedule?: Schedule; baseRevision: number }) =>
    (await request<ShulFeed>(`/api/shuls/${slug}`, { method: 'PUT', body })).data,
  create: async (body: {
    slug: string
    profile: ShulProfile
    location: ShulSettings['location']
    language?: ShulSettings['language']
    minchaMaariv?: 'combined' | 'separate'
  }) =>
    (await request<{ slug: string }>('/api/shuls', { body })).data,
  directory: async (q: string) =>
    (await request<{ shuls: { slug: string; name: ShulProfile['name']; city?: string }[] }>(`/api/directory?q=${encodeURIComponent(q)}`)).data.shuls,
  mine: async () => (await request<{ shuls: MyShul[] }>('/api/me/shuls')).data.shuls,
  invite: async (slug: string, role: 'owner' | 'editor') =>
    (await request<{ url: string; expiresAt: number }>(`/api/shuls/${slug}/invites`, { body: { role } })).data,
  acceptInvite: async (token: string) => (await request<{ slug: string }>(`/api/invites/${token}`, { body: {} })).data,
  removeMember: async (slug: string, userId: string) =>
    void (await request(`/api/shuls/${slug}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })),
  heartbeat: async (slug: string, displayId: string, label?: string) =>
    void (await request(`/api/shuls/${slug}/displays/${displayId}`, { body: { label } })),
}
