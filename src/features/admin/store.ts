import { guessTefila, type EventDef, type Exception, type Notice, type Schedule, type ShulProfile } from '@beitecha/engine'
import { create } from 'zustand'

import { api, ApiError, type ShulAdmin } from '@/lib/api'

type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'

interface AdminState {
  slug: string | null
  loaded: ShulAdmin | null
  loadError: { status: number; message: string } | null
  profile: ShulProfile | null
  schedule: Schedule | null
  dirty: boolean
  save: SaveState
  saveError: string | null
  load: (slug: string) => Promise<void>
  setProfile: (p: ShulProfile) => void
  setSchedule: (s: Schedule) => void
  updateEvent: (id: string, e: EventDef) => void
  removeEvent: (id: string) => void
  addEvent: (e: EventDef) => void
  moveEvent: (id: string, by: -1 | 1) => void
  upsertException: (x: Exception) => void
  removeException: (id: string) => void
  upsertNotice: (n: Notice) => void
  removeNotice: (id: string) => void
  /** Saves the draft. On a conflict, `overwrite` saves on top of the newer revision. */
  saveDraft: (overwrite?: boolean) => Promise<void>
  discard: () => void
}

export const newId = () => Math.random().toString(36).slice(2, 10)

/** Minyanim saved before they had a tefila get the one their name says; the next save keeps it. */
const withTefilos = (s: Schedule): Schedule => ({
  ...s,
  events: s.events.map((e) => (e.kind === 'tefila' && !e.tefila ? { ...e, tefila: guessTefila(e) } : e)),
})

export const useAdmin = create<AdminState>((set, get) => {
  const edit = (fn: (s: Schedule) => Schedule) => {
    const { schedule } = get()
    if (schedule) set({ schedule: fn(schedule), dirty: true, save: 'idle' })
  }
  const replaceIn = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

  return {
    slug: null,
    loaded: null,
    loadError: null,
    profile: null,
    schedule: null,
    dirty: false,
    save: 'idle',
    saveError: null,

    load: async (slug) => {
      set({ slug, loadError: null })
      try {
        const loaded = await api.admin(slug)
        set({ loaded, profile: loaded.profile, schedule: withTefilos(loaded.schedule), dirty: false, save: 'idle', saveError: null })
      } catch (e) {
        set({
          loaded: null,
          loadError: { status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : String(e) },
        })
      }
    },

    setProfile: (profile) => set({ profile, dirty: true, save: 'idle' }),
    setSchedule: (schedule) => set({ schedule, dirty: true, save: 'idle' }),
    updateEvent: (id, e) => edit((s) => ({ ...s, events: s.events.map((x) => (x.id === id ? e : x)) })),
    removeEvent: (id) => edit((s) => ({ ...s, events: s.events.filter((x) => x.id !== id) })),
    addEvent: (e) => edit((s) => ({ ...s, events: [...s.events, e] })),
    moveEvent: (id, by) =>
      edit((s) => {
        // Minyanim, shiurim and events are listed apart, so step over the other kinds.
        const i = s.events.findIndex((e) => e.id === id)
        let j = i + by
        while (j >= 0 && j < s.events.length && s.events[j].kind !== s.events[i]?.kind) j += by
        if (i < 0 || j < 0 || j >= s.events.length) return s
        const events = [...s.events]
        ;[events[i], events[j]] = [events[j], events[i]]
        return { ...s, events }
      }),
    upsertException: (x) => edit((s) => ({ ...s, exceptions: replaceIn(s.exceptions, x) })),
    removeException: (id) => edit((s) => ({ ...s, exceptions: s.exceptions.filter((x) => x.id !== id) })),
    upsertNotice: (n) => edit((s) => ({ ...s, notices: replaceIn(s.notices, n) })),
    removeNotice: (id) => edit((s) => ({ ...s, notices: s.notices.filter((x) => x.id !== id) })),

    saveDraft: async (overwrite = false) => {
      const { slug, loaded, profile, schedule } = get()
      if (!slug || !loaded || !profile || !schedule) return
      set({ save: 'saving', saveError: null })
      try {
        const saved = await api.save(slug, { profile, schedule, baseRevision: loaded.revision })
        set({ loaded: { ...loaded, ...saved }, dirty: false, save: 'saved' })
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const current = e.body as ShulAdmin
          if (overwrite) {
            set({ loaded: { ...loaded, revision: current.revision } })
            return get().saveDraft(false)
          }
          set({ save: 'conflict' })
          return
        }
        set({ save: 'error', saveError: e instanceof Error ? e.message : String(e) })
      }
    },

    discard: () => {
      const { slug } = get()
      if (slug) get().load(slug)
    },
  }
})
