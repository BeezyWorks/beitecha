import type { Zmanim } from '@hebcal/core'

import { ZMAN_IDS, type CustomZman, type Localized, type SunPosition, type ZmanRef } from './types'

const MINUTE = 60_000

/** The name a custom zman is shown by: Hebrew always, English where the shul gave one. */
export const customZmanName = (c: CustomZman): Localized => ({ en: c.name.en?.trim() || c.name.he, he: c.name.he })

const isRef = (p: SunPosition | ZmanRef): p is ZmanRef => typeof p !== 'string' && 'zman' in p

/** Counted straight from the sun in clock minutes, so it can start or end a zmani day, or be counted from. */
export const isSunBased = (c: CustomZman) => !isRef(c.from) && !c.zmani

/**
 * The shul's custom zmanim on one day, as exact instants (ms since the epoch); NaN where the sun never gets there
 * (far north in summer) or the definition is broken (`customZmanProblem` says why). `day(elevation)` is the day's
 * hebcal `Zmanim` with sunrise and sunset from the shul's height or sea level; `useElevation` is the shul's default.
 */
export function customInstants(
  day: (elevation: boolean) => Zmanim,
  custom: CustomZman[],
  useElevation = false,
): Map<string, number> {
  const byId = new Map(custom.map((c) => [c.id, c]))
  const sun = (p: SunPosition, c: CustomZman) => {
    const z = day(c.elevation ?? useElevation)
    return (p === 'sunrise' ? z.sunrise() : p === 'sunset' ? z.sunset() : z.timeAtAngle(p.degrees, p.at === 'morning')).getTime()
  }
  // A reference is only ever to a zman counted from the sun, so this never recurses further. It keeps its own
  // elevation: an alos 72 from sea-level sunrise stays that, whoever counts from it.
  const ref = (r: ZmanRef) => {
    const c = byId.get(r.zman)
    return c && isSunBased(c) ? sun(c.from as SunPosition, c) + (c.minutes ?? 0) * MINUTE : NaN
  }
  const out = new Map<string, number>()
  for (const c of custom) {
    const from = isRef(c.from) ? ref(c.from) : sun(c.from, c)
    let minute = MINUTE
    if (c.zmani) {
      const start = c.zmani.start === 'sunrise' ? sun('sunrise', c) : ref(c.zmani.start)
      const end = c.zmani.end === 'sunset' ? sun('sunset', c) : ref(c.zmani.end)
      minute = (end - start) / 720
    }
    out.set(c.id, from + (c.minutes ?? 0) * minute)
  }
  return out
}

const BUILT_IN: ReadonlySet<string> = new Set(ZMAN_IDS)

/** What's wrong with a custom zman among the shul's others, or undefined. */
export function customZmanProblem(c: CustomZman, all: CustomZman[]): string | undefined {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(c.id)) return `The id "${c.id}" needs to be a letter, then letters and digits`
  if (BUILT_IN.has(c.id)) return `"${c.id}" is a built-in zman's id`
  if (all.filter((x) => x.id === c.id).length > 1) return `Two zmanim share the id "${c.id}"`
  if (!c.name.he?.trim()) return `"${c.id}" needs a Hebrew name`
  if (c.minutes !== undefined && !Number.isFinite(c.minutes)) return `"${c.id}" has minutes that aren't a number`
  const sunProblem = (p: SunPosition) =>
    typeof p !== 'string' && !(Number.isFinite(p.degrees) && p.degrees > -15 && p.degrees < 30)
      ? `"${c.id}" puts the sun at ${p.degrees}°, which it doesn't reach`
      : undefined
  const refProblem = (r: ZmanRef) => {
    const target = all.find((x) => x.id === r.zman)
    if (!target) return `"${c.id}" counts from "${r.zman}", which isn't one of the shul's zmanim`
    if (target.id === c.id) return `"${c.id}" counts from itself`
    if (!isSunBased(target)) return `"${c.id}" counts from "${r.zman}", which needs to be counted straight from the sun in plain minutes`
  }
  const points = [c.from, ...(c.zmani ? [c.zmani.start, c.zmani.end] : [])]
  for (const p of points) {
    const problem = isRef(p) ? refProblem(p) : sunProblem(p)
    if (problem) return problem
  }
}
