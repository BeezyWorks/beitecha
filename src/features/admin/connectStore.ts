import type { Scope } from '@beitecha/engine'
import { create } from 'zustand'

import {
  api,
  ApiError,
  type ChangeView,
  type Connection,
  type ConnectionMode,
  type NewConnection,
} from '@/lib/api'
import { sentence } from './connect'
import { useAdmin } from './store'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** A pending change is also over once its 14 days are up, even before the server marks it. */
export const isLivePending = (c: ChangeView, now: number) =>
  c.status === 'pending' && (c.expiresAt === null || c.expiresAt > now)

export const pendingCountOf = (changes: ChangeView[], now = Date.now()) =>
  changes.filter((c) => isLivePending(c, now)).length

interface ConnectState {
  slug: string | null
  ready: boolean
  /** The assistants-and-API switch and the mode new connections start in. */
  enabled: boolean
  defaultMode: ConnectionMode
  /** Whether a one-off change to a minyan's time or existence waits for a gabbai. */
  minyanMode: ConnectionMode
  connections: Connection[]
  changes: ChangeView[]
  error: string | null
  /** The last thing the gabbai tried that didn't work, or an outcome worth saying. */
  notice: string | null
  /** Change id → why it was refused ("It no longer fits: …"). */
  refused: Record<string, string>
  load: (slug: string) => Promise<void>
  refreshChanges: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setDefaultMode: (mode: ConnectionMode) => Promise<void>
  setMinyanMode: (mode: ConnectionMode) => Promise<void>
  create: (body: NewConnection) => Promise<{ connection: Connection; key: string } | null>
  patch: (
    id: string,
    body: { mode?: ConnectionMode; scopes?: Scope[]; label?: string },
  ) => Promise<void>
  revoke: (id: string) => Promise<void>
  revokeAll: () => Promise<void>
  approve: (id: string) => Promise<boolean>
  approveAll: () => Promise<void>
  reject: (id: string) => Promise<void>
  undo: (id: string) => Promise<boolean>
  undoSince: (connectionId: string, since: number) => Promise<void>
  clearNotice: () => void
}

export const useConnect = create<ConnectState>((set, get) => {
  const slug = () => get().slug
  const fail = (e: unknown) => set({ error: message(e) })
  const reloadConnections = async () => {
    const s = slug()
    if (!s) return
    const state = await api.connections(s)
    set({
      enabled: state.enabled,
      defaultMode: state.defaultMode,
      minyanMode: state.minyanMode,
      connections: state.connections,
    })
  }
  /** The schedule changed on the server: the admin's draft must not clobber it. */
  const scheduleChanged = () => useAdmin.getState().reloadFromServer()

  return {
    slug: null,
    ready: false,
    enabled: false,
    defaultMode: 'review',
    minyanMode: 'review',
    connections: [],
    changes: [],
    error: null,
    notice: null,
    refused: {},

    load: async (s) => {
      set({ slug: s, error: null, ...(get().slug !== s && { ready: false, changes: [] }) })
      try {
        const [state, changes] = await Promise.all([
          api.connections(s),
          api.changes(s, { limit: 200 }),
        ])
        if (get().slug !== s) return
        set({
          ready: true,
          enabled: state.enabled,
          defaultMode: state.defaultMode,
          connections: state.connections,
          changes,
        })
      } catch (e) {
        if (get().slug === s) set({ ready: true, error: message(e) })
      }
    },

    refreshChanges: async () => {
      const s = slug()
      if (!s) return
      try {
        set({ changes: await api.changes(s, { limit: 200 }) })
      } catch (e) {
        fail(e)
      }
    },

    setEnabled: async (enabled) => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        await api.setApi(s, { enabled })
        await Promise.all([reloadConnections(), get().refreshChanges()])
      } catch (e) {
        fail(e)
      }
    },

    setDefaultMode: async (defaultMode) => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        const res = await api.setApi(s, { defaultMode })
        set({ defaultMode: res.defaultMode })
      } catch (e) {
        fail(e)
      }
    },

    setMinyanMode: async (minyanMode) => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        const res = await api.setApi(s, { minyanMode })
        set({ minyanMode: res.minyanMode })
      } catch (e) {
        fail(e)
      }
    },

    create: async (body) => {
      const s = slug()
      if (!s) return null
      set({ error: null })
      try {
        const res = await api.createConnection(s, body)
        await reloadConnections()
        return res
      } catch (e) {
        fail(e)
        return null
      }
    },

    patch: async (id, body) => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        const updated = await api.patchConnection(s, id, body)
        set({ connections: get().connections.map((c) => (c.id === id ? updated : c)) })
      } catch (e) {
        fail(e)
      }
    },

    revoke: async (id) => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        await api.revokeConnection(s, id)
        await reloadConnections()
      } catch (e) {
        fail(e)
      }
    },

    revokeAll: async () => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        await api.revokeAll(s)
        await reloadConnections()
      } catch (e) {
        fail(e)
      }
    },

    approve: async (id) => {
      const s = slug()
      if (!s) return false
      const { [id]: _gone, ...refused } = get().refused
      set({ error: null, refused })
      try {
        await api.approveChange(s, id)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          // Stays pending; say why on its card.
          set({ refused: { ...get().refused, [id]: sentence(e.message) } })
          await get().refreshChanges()
          return false
        }
        fail(e)
        return false
      }
      await get().refreshChanges()
      await scheduleChanged()
      return true
    },

    approveAll: async () => {
      const now = Date.now()
      const ids = get()
        .changes.filter((c) => isLivePending(c, now))
        .map((c) => c.id)
        .reverse() // oldest first, the order they were asked in
      let ok = 0
      for (const id of ids) if (await get().approve(id)) ok++
      set({
        notice:
          ok === ids.length
            ? `Approved ${ok}.`
            : `Approved ${ok} of ${ids.length}. The rest are still waiting; see why on each one.`,
      })
    },

    reject: async (id) => {
      const s = slug()
      if (!s) return
      set({ error: null })
      try {
        await api.rejectChange(s, id)
        await get().refreshChanges()
      } catch (e) {
        fail(e)
      }
    },

    undo: async (id) => {
      const s = slug()
      if (!s) return false
      const { [id]: _gone, ...refused } = get().refused
      set({ error: null, refused })
      try {
        await api.undoChange(s, id)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          set({ refused: { ...get().refused, [id]: sentence(e.message) } })
          return false
        }
        fail(e)
        return false
      }
      await get().refreshChanges()
      await scheduleChanged()
      return true
    },

    undoSince: async (connectionId, since) => {
      const s = slug()
      if (!s) return
      set({ error: null, notice: null })
      try {
        const res = await api.undoSince(s, connectionId, since)
        set({
          notice: res.conflict
            ? `Undid ${res.undone.length}. Stopped: ${sentence(res.conflict.message)}`
            : res.undone.length
              ? `Undid ${res.undone.length}.`
              : 'Nothing to undo in that time.',
        })
        await get().refreshChanges()
        if (res.undone.length) await scheduleChanged()
      } catch (e) {
        fail(e)
      }
    },

    clearNotice: () => set({ notice: null, error: null }),
  }
})
