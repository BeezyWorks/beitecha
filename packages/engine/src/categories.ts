import type { Audience, EventCategory, EventDef } from './types'

type Named = Pick<EventDef, 'name' | 'kind' | 'category' | 'audience'>

const MEAL = /kidd?ush(?!\s*levan)|seud|shal[oa]sh\s*s[eu]|shalashud|mel[ae]v[ae]h?\s*malk|breakfast|lunch|dinner|cholent|bbq|barbe?cue|קידוש|סעוד|מלוו?ה\s*מלכה/i
const KIDS = /youth|\bgroups\b|pirchei|bnos|banim|kids|child|\btots\b|ילדים|פרחי|בנות|אבות\s*ובנים/i
const TEENS = /teen|bochur|ncsy|high\s*school|נוער|בחורים/i
const WOMEN = /women|ladies|nashim|נשים/i
const MEN = /\bmen\b|אנשים/i

const text = (e: Named) => `${e.name.en} ${e.name.he ?? ''}`

/**
 * A non-minyan's category: the one the gabbai set, else what its name says (Kiddush, Seudas Shlishis and
 * Melava Malka are meals), else `program`. Minyanim and shiurim have none.
 */
export function guessCategory(e: Named): EventCategory | undefined {
  if (e.kind !== 'other') return undefined
  return e.category ?? (MEAL.test(text(e)) ? 'meal' : 'program')
}

/** Who an event is for: the gabbai's word, else its name's ("Pirchei", "Women's shiur"), else undefined (everyone). */
export function guessAudience(e: Named): Audience | undefined {
  if (e.audience) return e.audience === 'everyone' ? undefined : e.audience
  if (e.kind === 'tefila') return undefined
  const t = text(e)
  if (WOMEN.test(t)) return 'women'
  if (TEENS.test(t)) return 'teens'
  if (KIDS.test(t)) return 'kids'
  if (MEN.test(t)) return 'men'
  return undefined
}
