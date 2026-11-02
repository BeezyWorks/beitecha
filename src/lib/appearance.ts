import { create } from 'zustand'

import { storage } from './storage'

export type Appearance = 'auto' | 'light' | 'dark'

const KEY = 'beitecha.appearance'

const read = (): Appearance => {
  const v = storage.get(KEY)
  return v === 'light' || v === 'dark' ? v : 'auto'
}

/** Light, dark, or following the system: this browser's choice, kept between visits. */
export const useAppearance = create<{
  appearance: Appearance
  setAppearance: (a: Appearance) => void
}>((set) => ({
  appearance: read(),
  setAppearance: (appearance) => {
    storage.set(KEY, appearance === 'auto' ? null : appearance)
    set({ appearance })
  },
}))
