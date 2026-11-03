import { create } from 'zustand'

import { storage } from './storage'

const KEY = 'beitecha.collapsed'

const read = (): Record<string, boolean> => {
  try {
    return JSON.parse(storage.get(KEY) ?? '{}')
  } catch {
    return {}
  }
}

const useStore = create<{
  collapsed: Record<string, boolean>
  toggle: (id: string) => void
}>((set, get) => ({
  collapsed: read(),
  toggle: (id) => {
    const collapsed = { ...get().collapsed, [id]: !get().collapsed[id] }
    storage.set(KEY, JSON.stringify(collapsed))
    set({ collapsed })
  },
}))

/** Whether a side rail is folded away: this browser's choice per rail, kept between visits. */
export function useCollapsed(id: string): [boolean, () => void] {
  const folded = useStore((s) => !!s.collapsed[id])
  const toggle = useStore((s) => s.toggle)
  return [folded, () => toggle(id)]
}
