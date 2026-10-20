import type { EventDef } from './types'

type Tefila = Pick<EventDef, 'id' | 'name' | 'kind'>

/**
 * The tefillos every shul has, with the ids and names the starter schedule and the AI prompt use.
 * `minchaMaariv` is one minyan: Mincha, then Maariv straight after it, listed at Mincha's time.
 */
export const STANDARD_TEFILOS = {
  shacharis: { id: 'shacharis', name: { en: 'Shacharis', he: 'שחרית' }, kind: 'tefila' },
  mincha: { id: 'mincha', name: { en: 'Mincha', he: 'מנחה' }, kind: 'tefila' },
  maariv: { id: 'maariv', name: { en: 'Maariv', he: 'ערבית' }, kind: 'tefila' },
  minchaMaariv: {
    id: 'mincha-maariv',
    name: { en: 'Mincha/Maariv', he: 'מנחה וערבית' },
    kind: 'tefila',
  },
} as const satisfies Record<string, Tefila>
