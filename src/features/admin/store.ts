import { guessTefila, type Choleh, type EventDef, type Exception, type Notice, type NoticeCategory, type Schedule, type ShulProfile, type Yahrzeit, type YahrzeitSettings } from '@beitecha/engine'
import { create } from 'zustand'

import { api, ApiError, type ShulAdmin } from '@/lib/api'

type SaveState = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'

/** The minyan, shiur or program open in its editor: a copy, so Cancel can drop it and Save commits it at once. */
export interface Editing {
  event: EventDef
  /** Not in the schedule yet: Save adds it. */
  isNew: boolean
  /** Changed since it was opened. */
  changed: boolean
}

interface AdminState {
  slug: string | null
  loaded: ShulAdmin | null
  loadError: { status: number; message: string } | null
  profile: ShulProfile | null
  schedule: Schedule | null
  /** Settings changed but not saved yet (the shul's name, zmanim, print…); the save bar shows. */
  dirty: boolean
  save: SaveState
  saveError: string | null
  editing: Editing | null
  load: (slug: string) => Promise<void>
  /** Settings pages edit in place and save from the save bar. */
  setProfile: (p: ShulProfile) => void
  setSchedule: (s: Schedule) => void
  /** Replaces the schedule and saves it now (an AI import, a shul-wide setting changed from an event). */
  commitSchedule: (s: Schedule) => void
  startEditing: (event: EventDef, isNew?: boolean) => void
  changeEditing: (event: EventDef) => void
  /** Puts the open event into the schedule and saves. */
  saveEditing: () => Promise<void>
  cancelEditing: () => void
  // The rest each save at once.
  removeEvent: (id: string) => void
  moveEvent: (id: string, by: -1 | 1) => void
  upsertException: (x: Exception) => void
  removeException: (id: string) => void
  upsertNotice: (n: Notice) => void
  removeNotice: (id: string) => void
  setCholim: (list: Choleh[]) => void
  /** The yahrzeit list and how it's shown; saves at once. */
  setYahrzeits: (list: Yahrzeit[], settings?: YahrzeitSettings) => void
  /** The shul's announcement categories; announcements under one that's gone become plain ones. */
  setNoticeCategories: (list: NoticeCategory[]) => void
  /** Saves the whole document. On a conflict, `overwrite` saves on top of the newer revision. */
  persist: (overwrite?: boolean) => Promise<void>
  /** Drops unsaved settings and reloads what's saved. */
  discard: () => void
}

export const newId = () => Math.random().toString(36).slice(2, 10)

/** Minyanim saved before they had a tefila get the one their name says; the next save keeps it. */
const withTefilos = (s: Schedule): Schedule => ({
  ...s,
  events: s.events.map((e) => (e.kind === 'tefila' && !e.tefila ? { ...e, tefila: guessTefila(e) } : e)),
})

/** The schedule as it would be with the open event saved, for previews. */
export function previewSchedule(s: Pick<AdminState, 'schedule' | 'editing'>): Schedule | null {
  const { schedule, editing } = s
  if (!schedule || !editing) return schedule
  const { event, isNew } = editing
  return {
    ...schedule,
    events: isNew ? [...schedule.events, event] : schedule.events.map((e) => (e.id === event.id ? event : e)),
  }
}

export const useAdmin = create<AdminState>((set, get) => {
  /** A save asked for while one is running runs once it's done, with whatever is current then. */
  let again = false
  const commit = (fn: (s: Schedule) => Schedule) => {
    const { schedule } = get()
    if (!schedule) return
    set({ schedule: fn(schedule) })
    void get().persist()
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
    editing: null,

    load: async (slug) => {
      set({ slug, loadError: null })
      try {
        const loaded = await api.admin(slug)
        set({ loaded, profile: loaded.profile, schedule: withTefilos(loaded.schedule), dirty: false, save: 'idle', saveError: null, editing: null })
      } catch (e) {
        set({
          loaded: null,
          loadError: { status: e instanceof ApiError ? e.status : 0, message: e instanceof Error ? e.message : String(e) },
        })
      }
    },

    setProfile: (profile) => set({ profile, dirty: true }),
    setSchedule: (schedule) => set({ schedule, dirty: true }),
    commitSchedule: (schedule) => commit(() => schedule),

    startEditing: (event, isNew = false) => set({ editing: { event, isNew, changed: isNew } }),
    changeEditing: (event) => {
      const { editing } = get()
      if (editing) set({ editing: { ...editing, event, changed: true } })
    },
    saveEditing: async () => {
      const { editing, schedule } = get()
      if (!editing || !schedule) return
      set({ schedule: previewSchedule({ schedule, editing }), editing: { ...editing, isNew: false, changed: false } })
      await get().persist()
    },
    cancelEditing: () => {
      const { editing, schedule } = get()
      if (!editing) return
      // A new one that's dropped closes; an existing one goes back to what's saved.
      const saved = schedule?.events.find((e) => e.id === editing.event.id)
      set({ editing: editing.isNew || !saved ? null : { event: saved, isNew: false, changed: false } })
    },

    removeEvent: (id) => {
      if (get().editing?.event.id === id) set({ editing: null })
      commit((s) => ({ ...s, events: s.events.filter((x) => x.id !== id) }))
    },
    moveEvent: (id, by) =>
      commit((s) => {
        // Minyanim, shiurim and events are listed apart, so step over the other kinds.
        const i = s.events.findIndex((e) => e.id === id)
        let j = i + by
        while (j >= 0 && j < s.events.length && s.events[j].kind !== s.events[i]?.kind) j += by
        if (i < 0 || j < 0 || j >= s.events.length) return s
        const events = [...s.events]
        ;[events[i], events[j]] = [events[j], events[i]]
        return { ...s, events }
      }),
    upsertException: (x) => commit((s) => ({ ...s, exceptions: replaceIn(s.exceptions, x) })),
    removeException: (id) => commit((s) => ({ ...s, exceptions: s.exceptions.filter((x) => x.id !== id) })),
    upsertNotice: (n) => commit((s) => ({ ...s, notices: replaceIn(s.notices, n) })),
    removeNotice: (id) => commit((s) => ({ ...s, notices: s.notices.filter((x) => x.id !== id) })),
    setCholim: (cholim) => commit((s) => ({ ...s, cholim })),
    setYahrzeits: (yahrzeits, settings) =>
      commit((s) => ({
        ...s,
        yahrzeits,
        settings: settings ? { ...s.settings, yahrzeits: settings } : s.settings,
      })),
    setNoticeCategories: (noticeCategories) =>
      commit((s) => ({
        ...s,
        settings: { ...s.settings, noticeCategories },
        notices: s.notices.map(({ category, ...n }) =>
          category && noticeCategories.some((c) => c.id === category) ? { ...n, category } : n,
        ),
      })),

    persist: async (overwrite = false) => {
      const { slug, loaded, profile, schedule, save } = get()
      if (!slug || !loaded || !profile || !schedule) return
      if (save === 'saving') {
        again = true
        return
      }
      set({ save: 'saving', saveError: null })
      try {
        const saved = await api.save(slug, { profile, schedule, baseRevision: loaded.revision })
        // Edits made while it saved stay unsaved for the next round.
        const unchanged = get().schedule === schedule && get().profile === profile
        set({ loaded: { ...loaded, ...saved }, dirty: get().dirty && !unchanged, save: 'saved' })
      } catch (e) {
        again = false
        if (e instanceof ApiError && e.status === 409) {
          const current = e.body as ShulAdmin
          if (overwrite) {
            set({ loaded: { ...loaded, revision: current.revision }, save: 'idle' })
            return get().persist(false)
          }
          set({ save: 'conflict' })
          return
        }
        set({ save: 'error', saveError: e instanceof Error ? e.message : String(e) })
        return
      }
      if (again) {
        again = false
        await get().persist()
      }
    },

    discard: () => {
      const { slug } = get()
      if (slug) get().load(slug)
    },
  }
})
