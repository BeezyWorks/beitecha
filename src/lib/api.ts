import type { Entry, Operation, Schedule, Scope, ShulProfile, ShulSettings } from '@beitecha/engine'

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

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...init.headers }
  const token = tokenStore.get()
  if (token) headers.authorization = `Bearer ${token}`
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 204 || res.status === 304)
    return { status: res.status, data: null as T, etag: res.headers.get('etag') }
  const data = await res.json().catch(() => null)
  if (!res.ok)
    throw new ApiError(
      res.status,
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
      data,
    )
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

export type ConnectionMode = 'publish' | 'review'
export type ConnectionPurpose = 'skill' | 'script' | 'other'

/** A key (or chat-app sign-in) that writes to the shul for the member who made it. Never carries the secret. */
export interface Connection {
  id: string
  userId: string
  userName: string | null
  mine: boolean
  kind: 'key' | 'oauth'
  purpose: string
  label: string
  prefix: string | null
  mode: ConnectionMode
  scopes: Scope[]
  createdAt: number
  expiresAt: number | null
  revokedAt: number | null
  lastUsedAt: number | null
  lastIp: string | null
  lastUserAgent: string | null
}

export interface ConnectionsState {
  enabled: boolean
  defaultMode: ConnectionMode
  connections: Connection[]
}

export type ChangeStatus = 'pending' | 'applied' | 'rejected' | 'expired' | 'reverted'

/** One thing a connection did, or asked to do. `before`/`after` are filled once it has been applied. */
export interface ChangeView {
  id: string
  connectionId: string
  connectionLabel: string | null
  connectionKind: string | null
  userId: string
  userName: string | null
  op: string
  target: string | null
  payload: Operation | null
  before: Entry[]
  after: Entry[]
  status: ChangeStatus
  createdAt: number
  expiresAt: number | null
  decidedBy: string | null
  decidedByName: string | null
  decidedAt: number | null
}

export interface NewConnection {
  purpose: ConnectionPurpose
  label?: string
  scopes?: Scope[]
  mode?: ConnectionMode
  expiresInDays?: number
}

export const api = {
  /** `null` when unchanged since `etag`. */
  async feed(slug: string, etag?: string | null) {
    const res = await request<ShulFeed>(`/api/shuls/${slug}`, {
      headers: etag ? { 'if-none-match': etag } : {},
    })
    return res.status === 304 ? null : { feed: res.data, etag: res.etag }
  },
  admin: async (slug: string) => (await request<ShulAdmin>(`/api/shuls/${slug}/admin`)).data,
  /** Throws ApiError 409 (body = the current record) on a stale revision. */
  save: async (
    slug: string,
    body: { profile?: ShulProfile; schedule?: Schedule; baseRevision: number },
  ) => (await request<ShulFeed>(`/api/shuls/${slug}`, { method: 'PUT', body })).data,
  create: async (body: {
    slug: string
    profile: ShulProfile
    location: ShulSettings['location']
    language?: ShulSettings['language']
    minchaMaariv?: 'combined' | 'separate'
  }) => (await request<{ slug: string }>('/api/shuls', { body })).data,
  directory: async (q: string) =>
    (
      await request<{ shuls: { slug: string; name: ShulProfile['name']; city?: string }[] }>(
        `/api/directory?q=${encodeURIComponent(q)}`,
      )
    ).data.shuls,
  mine: async () => (await request<{ shuls: MyShul[] }>('/api/me/shuls')).data.shuls,
  invite: async (slug: string, role: 'owner' | 'editor') =>
    (
      await request<{ url: string; expiresAt: number }>(`/api/shuls/${slug}/invites`, {
        body: { role },
      })
    ).data,
  acceptInvite: async (token: string) =>
    (await request<{ slug: string }>(`/api/invites/${token}`, { body: {} })).data,
  removeMember: async (slug: string, userId: string) =>
    void (await request(`/api/shuls/${slug}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    })),
  heartbeat: async (slug: string, displayId: string, label?: string) =>
    void (await request(`/api/shuls/${slug}/displays/${displayId}`, { body: { label } })),
  connections: async (slug: string) =>
    (await request<ConnectionsState>(`/api/shuls/${slug}/connections`)).data,
  setApi: async (slug: string, body: { enabled?: boolean; defaultMode?: ConnectionMode }) =>
    (
      await request<{ enabled: boolean; defaultMode: ConnectionMode; revoked: number }>(
        `/api/shuls/${slug}/api`,
        { method: 'PUT', body },
      )
    ).data,
  /** The key is in the answer once; it can't be fetched again. */
  createConnection: async (slug: string, body: NewConnection) =>
    (
      await request<{ connection: Connection; key: string }>(`/api/shuls/${slug}/connections`, {
        body,
      })
    ).data,
  patchConnection: async (
    slug: string,
    id: string,
    body: { mode?: ConnectionMode; scopes?: Scope[]; label?: string },
  ) =>
    (
      await request<{ connection: Connection }>(`/api/shuls/${slug}/connections/${id}`, {
        method: 'PATCH',
        body,
      })
    ).data.connection,
  revokeConnection: async (slug: string, id: string) =>
    void (await request(`/api/shuls/${slug}/connections/${id}`, { method: 'DELETE' })),
  revokeAll: async (slug: string) =>
    (await request<{ revoked: number }>(`/api/shuls/${slug}/connections/revoke-all`, { body: {} }))
      .data,
  changes: async (slug: string, params: { status?: ChangeStatus; limit?: number } = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.limit) q.set('limit', String(params.limit))
    const qs = q.toString()
    return (
      await request<{ changes: ChangeView[] }>(`/api/shuls/${slug}/changes${qs ? `?${qs}` : ''}`)
    ).data.changes
  },
  /** 409 (`it no longer fits: …`) when the schedule has moved on; the change stays pending. */
  approveChange: async (slug: string, id: string) =>
    (
      await request<{ change: ChangeView; revision: number }>(
        `/api/shuls/${slug}/changes/${id}/approve`,
        { body: {} },
      )
    ).data,
  rejectChange: async (slug: string, id: string) =>
    (await request<{ change: ChangeView }>(`/api/shuls/${slug}/changes/${id}/reject`, { body: {} }))
      .data,
  /** 409 (`can't undo: …`, with `conflict`) when the target has changed since. */
  undoChange: async (slug: string, id: string) =>
    (
      await request<{ change: ChangeView; revision: number }>(
        `/api/shuls/${slug}/changes/${id}/undo`,
        { body: {} },
      )
    ).data,
  undoSince: async (slug: string, connectionId: string, since: number) =>
    (
      await request<{
        undone: string[]
        remaining: number
        conflict: { changeId: string; message: string; ids?: string[] } | null
      }>(`/api/shuls/${slug}/changes/undo-since`, { body: { connectionId, since } })
    ).data,
}
