import type { DaySchedule, DisplayBlock, DisplaySetup, Minutes } from '@beitecha/engine'

/** What `/<slug>/display` shows when the shul has made no setups. */
export const DEFAULT_SETUP: DisplaySetup = {
  id: 'display',
  name: 'Lobby display',
}

/** The setup at `/<slug>/display/<id>`, or the first (the default one when there are none) with no id. */
export function findSetup(
  displays: DisplaySetup[] | undefined,
  id?: string,
): DisplaySetup | undefined {
  if (!id) return displays?.[0] ?? DEFAULT_SETUP
  return displays?.find((d) => d.id === id)
}

export const blockOn = (setup: DisplaySetup, block: DisplayBlock) => setup.blocks?.[block] !== false

/** A setup's id from its name: lowercase letters, digits and dashes, and not one already taken. */
export function setupId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'display'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

const HOUR = 60
const DAY = 24 * HOUR
/** How long the screen stays on after the last event, and comes on before the first. */
export const SLEEP_MARGIN = HOUR

const timed = (day: Pick<DaySchedule, 'events'>) =>
  day.events.flatMap((e) => (!e.cancelled && e.minutes !== null ? [e.minutes] : []))

/** Whether the screen should be black at `minutes` of the shul's `day`. */
export function isAsleep(
  sleep: DisplaySetup['sleep'],
  day: Pick<DaySchedule, 'events'>,
  minutes: Minutes,
): boolean {
  if (sleep === 'off') return false
  if (sleep && sleep !== 'auto') {
    const { from, to } = sleep
    return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to
  }
  // Auto: quiet from an hour after the last event until an hour before the first (of the next day, i.e. the
  // morning side of the same clock). A day with nothing on it never sleeps.
  const times = timed(day)
  if (!times.length) return false
  return minutes >= Math.max(...times) + SLEEP_MARGIN || minutes < Math.min(...times) - SLEEP_MARGIN
}

/** An OLED panel orbits this many canvas px from where it started. */
export const ORBIT = 12
const ORBIT_STEP = 10

/** How far to nudge the canvas, so no pixel sits still for days: a slow orbit on OLED, a pixel each hour otherwise. */
export function driftFor(
  screen: DisplaySetup['screen'],
  minutes: Minutes,
): { x: number; y: number } {
  if (screen === 'oled') {
    const angle = (2 * Math.PI * Math.floor(minutes / ORBIT_STEP)) / (DAY / ORBIT_STEP)
    return {
      x: Math.round(ORBIT * Math.cos(angle)) + 0,
      y: Math.round(ORBIT * Math.sin(angle)) + 0,
    }
  }
  const hour = Math.floor(minutes / HOUR)
  return { x: (hour % 3) - 1, y: (Math.floor(hour / 3) % 3) - 1 }
}

// ---------------------------------------------------------------------------
// Shabbos

/** The erev and the holy day Shabbos (or Yom Tov) is listed from. */
export interface ShabbosSpan {
  friday: DaySchedule
  shabbos: DaySchedule
}

const holy = (d?: DaySchedule) => !!d && (d.tags.includes('shabbos') || d.tags.includes('yomTov'))
const erev = (d?: DaySchedule) =>
  !!d && (d.tags.includes('erevShabbos') || d.tags.includes('erevYomTov'))
const ended = (d: DaySchedule, minutes: Minutes) =>
  minutes >= (d.zmanim.havdalah ?? d.zmanim.tzeis ?? DAY)

/**
 * The coming Shabbos or Yom Tov and the day before it. `days` starts with yesterday, then today: yesterday is the
 * erev when today is the holy day. Once Havdalah has passed, it's the next one.
 */
export function shabbosSpan(days: DaySchedule[], minutes: Minutes): ShabbosSpan | undefined {
  const [, today, tomorrow] = days
  if (!today) return undefined
  const first = holy(today) && !(!holy(tomorrow) && ended(today, minutes)) ? 1 : 2
  let j = days.findIndex((d, i) => i >= first && holy(d))
  if (j < 0) return undefined
  // A Yom Tov on Friday leads into Shabbos: list that.
  while (erev(days[j]) && holy(days[j + 1])) j++
  return { friday: days[j - 1], shabbos: days[j] }
}

/**
 * Whether Shabbos takes the screen's main place: from Thursday's last event (or the same on the day before an erev
 * Yom Tov) through the holy days until Havdalah. `days` starts with yesterday.
 */
export function shabbosFocused(
  mode: DisplaySetup['shabbosFocus'],
  days: DaySchedule[],
  minutes: Minutes,
): boolean {
  if (mode === 'never') return false
  if (mode === 'always') return true
  const [, today, tomorrow] = days
  if (!today) return false
  if (holy(today)) return holy(tomorrow) || !ended(today, minutes)
  if (erev(today)) return true
  if (!erev(tomorrow)) return false
  const times = timed(today)
  return !times.length || minutes > Math.max(...times)
}
