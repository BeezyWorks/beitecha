import type { DayTag, EventDef, Localized, TefilaType } from './types'

type Tefila = Pick<EventDef, 'id' | 'name' | 'kind' | 'tefila'>

/**
 * The tefillos every shul has, with the ids and names the starter schedule and the AI prompt use.
 * `minchaMaariv` is one minyan: Mincha, then Maariv straight after it, listed at Mincha's time.
 */
export const STANDARD_TEFILOS = {
  shacharis: { id: 'shacharis', name: { en: 'Shacharis', he: 'שחרית' }, kind: 'tefila', tefila: 'shacharis' },
  mincha: { id: 'mincha', name: { en: 'Mincha', he: 'מנחה' }, kind: 'tefila', tefila: 'mincha' },
  maariv: { id: 'maariv', name: { en: 'Maariv', he: 'ערבית' }, kind: 'tefila', tefila: 'maariv' },
  minchaMaariv: {
    id: 'mincha-maariv',
    name: { en: 'Mincha/Maariv', he: 'מנחה וערבית' },
    kind: 'tefila',
    tefila: 'minchaMaariv',
  },
} as const satisfies Record<TefilaType, Tefila>

const SHACHARIS = /shach?a?ri[st]|שחרית|vasikin|netz/i
const MINCHA = /mincha|minha|מנחה/i
const MAARIV = /ma'?ariv|arvit|maariv|ערבית|מעריב/i

/**
 * Which tefila a minyan is, from its `tefila` or else its id and names: for schedules written
 * before minyanim had a type. Undefined when nothing says.
 */
export function guessTefila(e: Pick<EventDef, 'id' | 'name' | 'tefila'>): TefilaType | undefined {
  if (e.tefila) return e.tefila
  const text = [e.id, e.name.en, e.name.he ?? ''].join(' ')
  const mincha = MINCHA.test(text)
  const maariv = MAARIV.test(text)
  if (mincha && maariv) return 'minchaMaariv'
  if (mincha) return 'mincha'
  if (maariv) return 'maariv'
  if (SHACHARIS.test(text)) return 'shacharis'
  return undefined
}

/**
 * On Erev Shabbos, Kabbalas Shabbos comes between Mincha and Maariv: a Mincha/Maariv is
 * Mincha and Kabbalas Shabbos, and a Maariv on its own (when Mincha was earlier) starts with it.
 */
const EREV_SHABBOS_NAMES: Partial<Record<TefilaType, Localized>> = {
  minchaMaariv: { en: 'Mincha/Kabbalas Shabbos', he: 'מנחה וקבלת שבת' },
  maariv: { en: 'Kabbalas Shabbos/Maariv', he: 'קבלת שבת וערבית' },
}

const same = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * A minyan's name on a day: its own, except that a standard Mincha/Maariv or Maariv is called
 * by what it davens on Erev Shabbos. A name the gabbai chose stays as it is.
 */
export function tefilaName(e: Pick<EventDef, 'name' | 'tefila'>, tags: Iterable<DayTag>): Localized {
  const special = e.tefila && EREV_SHABBOS_NAMES[e.tefila]
  if (!special || ![...tags].includes('erevShabbos')) return e.name
  const standard = STANDARD_TEFILOS[e.tefila!].name
  const isStandard = same(e.name.en, standard.en) || same(e.name.he, standard.he)
  return isStandard ? special : e.name
}
