import {
  DAY_TAGS,
  STANDARD_TEFILOS,
  ZMAN_IDS,
  effectiveHolidays,
  type DayTag,
  type EventDef,
  type EventKind,
  type Rule,
  type Schedule,
  type ShulProfile,
  type ZmanId,
} from '@beitecha/engine'

import { ZMAN_LABELS } from '@/features/luach/labels'

// ---------------------------------------------------------------------------
// The prompt a gabbai copies into ChatGPT, Claude, Gemini… with their own description.

/** What each day tag means, worded for a model that doesn't know the engine. */
const TAG_MEANINGS: Record<DayTag, string> = {
  shabbos: 'Shabbos (Saturday)',
  erevShabbos: 'Friday',
  motzeiShabbos: 'Shabbos itself, for evening events after Shabbos ends (not when Yom Tov follows)',
  yomTov:
    'a day of Yom Tov (incl. Rosh Hashana, Yom Kippur, Shmini Atzeres, Simchas Torah; not Chol HaMoed)',
  erevYomTov: 'the day before Yom Tov',
  motzeiYomTov: 'the last day of Yom Tov, for evening events after it ends',
  cholHamoed: 'Chol HaMoed',
  roshChodesh: 'Rosh Chodesh',
  fast: 'a public fast day (Tzom Gedalia, Asara B’Teves, Ta’anis Esther, 17 Tammuz, Tish’a B’Av; not Yom Kippur)',
  chanukah: 'Chanukah',
  purim: 'Purim',
  noTachanun: 'a day without Tachanun',
  selichos: 'a day Selichos is said (Elul and Aseres Yemei Teshuva)',
  aseresYemeiTeshuva: 'the Ten Days of Repentance',
  omer: 'Sefiras HaOmer',
  dst: 'daylight saving time is in effect',
  legalHoliday:
    'a civil public holiday (Sunday-schedule days like Thanksgiving, Memorial Day, bank holidays)',
}

const SCHEMA = `type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday … 6 = Shabbos

interface EventDef {
  id: string // short, lowercase, unique, e.g. "shacharis", "shacharis-early", "daf-yomi"
  name: { en: string; he?: string } // he = Hebrew name, if you know it
  kind: 'tefila' | 'shiur' | 'other'
  room?: string
  visibility?: 'internal' // only for helper events other events are timed from; never shown
  rules: Rule[] // FIRST matching rule wins; a day no rule matches has no occurrence
}

interface Rule {
  when?: Condition // omit = every day (use as the last, catch-all rule)
  time: TimeExpr | null // null = the event does NOT happen on matching days
  note?: { en: string; he?: string } // short note shown with the time, e.g. "Selichos first"
}

type Condition =
  | { weekday: Weekday[] }
  | { tag: DayTag }
  | { holiday: string } // a holiday by its Hebcal name, see below
  | { localHoliday: string } // one of the shul's civil holidays, by id (listed below)
  | { civil: { from: 'MM-DD'; to: 'MM-DD' } } // every year, inclusive
  | { dates: { from: 'YYYY-MM-DD'; to: 'YYYY-MM-DD' } } // one-time range, inclusive
  | { all: Condition[] } // AND
  | { any: Condition[] } // OR
  | { not: Condition }

type TimeExpr =
  | { clock: 'HH:MM' } // 24-hour, e.g. "06:30", "19:15"
  | { zman: ZmanId }
  | { event: string } // another event's time that same day, by id
  | { offset: number; of: TimeExpr } // minutes after (negative = before)
  | { earliest: TimeExpr[] }
  | { latest: TimeExpr[] }
  | { clamp: TimeExpr; min?: TimeExpr; max?: TimeExpr } // keep between min and max
  | { round: TimeExpr; to: number; mode: 'down' | 'up' | 'nearest' | 'withTrend' | 'againstTrend' }
    // to a multiple of \`to\` minutes. "withTrend" rounds the way the time is moving week to week:
    // down while it's getting earlier (e.g. plag/sunset from late June to December), up while it's getting
    // later; "againstTrend" the opposite. Daylight saving jumps don't count as moving.
  | { weekly: TimeExpr; pick: 'earliest' | 'latest'; days?: Weekday[] }
    // the same expression worked out on each of \`days\` (default all) of this week, Sunday–Shabbos,
    // taking the earliest/latest, so a zman-based time stays put all week`

const EXAMPLE = `{
  "events": [
    {
      "id": "shacharis",
      "name": { "en": "Shacharis", "he": "שחרית" },
      "kind": "tefila",
      "rules": [
        { "when": { "any": [{ "tag": "shabbos" }, { "tag": "yomTov" }] }, "time": { "clock": "09:00" } },
        { "when": { "any": [{ "weekday": [0] }, { "tag": "legalHoliday" }] }, "time": { "clock": "08:00" } },
        { "when": { "any": [{ "weekday": [1, 4] }, { "tag": "roshChodesh" }, { "tag": "fast" }, { "tag": "cholHamoed" }, { "tag": "chanukah" }, { "tag": "purim" }] }, "time": { "clock": "06:15" } },
        { "time": { "clock": "06:30" } }
      ]
    },
    {
      "id": "shacharis-early",
      "name": { "en": "Early Shacharis" },
      "kind": "tefila",
      "rules": [
        { "when": { "any": [{ "holiday": "Rosh Hashana" }, { "holiday": "Yom Kippur" }] }, "time": null },
        { "when": { "tag": "shabbos" }, "time": { "clock": "07:30" } }
      ]
    },
    {
      "id": "mincha-maariv",
      "name": { "en": "Mincha/Maariv", "he": "מנחה וערבית" },
      "kind": "tefila",
      "rules": [
        { "when": { "any": [{ "tag": "erevShabbos" }, { "tag": "erevYomTov" }] }, "time": { "round": { "offset": 10, "of": { "zman": "candleLighting" } }, "to": 5, "mode": "down" }, "note": { "en": "Mincha", "he": "מנחה" } },
        { "when": { "any": [{ "tag": "shabbos" }, { "tag": "yomTov" }] }, "time": { "round": { "offset": -40, "of": { "zman": "sunset" } }, "to": 5, "mode": "down" }, "note": { "en": "Mincha", "he": "מנחה" } },
        { "time": { "round": { "weekly": { "offset": -10, "of": { "zman": "plag" } }, "pick": "earliest", "days": [0, 1, 2, 3, 4] }, "to": 5, "mode": "withTrend" } }
      ]
    },
    {
      "id": "maariv",
      "name": { "en": "Maariv", "he": "ערבית" },
      "kind": "tefila",
      "rules": [
        { "when": { "any": [{ "tag": "motzeiShabbos" }, { "tag": "motzeiYomTov" }] }, "time": { "zman": "havdalah" } }
      ]
    }
  ]
}`

const HOLIDAY_NAMES =
  "Rosh Hashana, Erev Rosh Hashana, Yom Kippur, Erev Yom Kippur, Sukkot, Shmini Atzeret, Simchat Torah, Hoshana Raba, Chanukah, Asara B'Tevet, Tu BiShvat, Ta'anit Esther, Purim, Shushan Purim, Erev Pesach, Pesach, Ta'anit Bechorot, Lag BaOmer, Erev Shavuot, Shavuot, Tzom Tammuz, Erev Tish'a B'Av, Tish'a B'Av, Tzom Gedaliah, Leil Selichot, Yom HaAtzma'ut, Yom Yerushalayim"

/**
 * Instructions plus the schema, the shul's own holidays and its current events, for any chat AI.
 * The gabbai adds a plain description of their schedule underneath.
 */
export function buildAiPrompt(schedule: Schedule, profile: ShulProfile): string {
  const local = effectiveHolidays(schedule.settings)
  const zmanim = ZMAN_IDS.map((id: ZmanId) => `  ${id}: ${ZMAN_LABELS[id].en}`).join('\n')
  const tags = DAY_TAGS.map((t) => `  ${t}: ${TAG_MEANINGS[t]}`).join('\n')
  const holidays = local.length
    ? local.map((h) => `  ${h.id}: ${h.name.en}`).join('\n')
    : '  (none)'
  const tefilos = Object.values(STANDARD_TEFILOS)
    .map((t) => `  ${t.id}: ${t.name.en} (${t.name.he})`)
    .join('\n')
  const current = JSON.stringify({ events: schedule.events }, null, 2)

  return `You are helping the gabbai of ${profile.name.en} set up their shul's schedule in Beitecha, an app that works out each day's minyan and shiur times from rules over the Jewish calendar and zmanim. Turn the gabbai's description (at the end of this message) into Beitecha's JSON format, described below.

How to answer:
1. If something important is unclear (e.g. which days count as "kriah days", whether an early minyan runs on Yom Tov, what "after Mincha" means), ask short questions first. Otherwise go straight to the JSON.
2. Reply with ONE JSON code block holding { "events": [...] } with every event the shul should have (including the current ones below that should stay, with their ids unchanged). If you can create files, also offer it as a downloadable file named beitecha-schedule.json.
3. After the JSON, list in plain words how each event's times work, so the gabbai can check you understood.
4. The gabbai pastes your JSON into Beitecha (Times → Set up with AI). If Beitecha reports problems and they paste them back to you, fix them and send the whole JSON again.

The format (TypeScript, for reference; output is plain JSON):

${SCHEMA}

Standard tefillos (use these ids and names):
${tefilos}

Mincha/Maariv:
- "Mincha/Maariv" is one minyan: Mincha, then Maariv straight after it, as in every shul. It is ONE event ("${STANDARD_TEFILOS.minchaMaariv.id}") at the time Mincha starts. "Mincha/Maariv at X" means that event at X: don't ask when Maariv starts or how long Mincha takes, and don't split it into two events.
- Make separate "${STANDARD_TEFILOS.mincha.id}" and "${STANDARD_TEFILOS.maariv.id}" events only for times when Maariv is its own minyan (e.g. Maariv at tzeis, or after Shabbos).
- On Shabbos and Yom Tov afternoon, Maariv isn't straight after Mincha (it waits until Shabbos/Yom Tov ends), so the Mincha/Maariv event's Shabbos/Yom Tov rule gets the note { "en": "Mincha", "he": "מנחה" }, and Maariv after Shabbos is the separate "${STANDARD_TEFILOS.maariv.id}" event on motzeiShabbos. On Erev Shabbos/Yom Tov, Kabbalas Shabbos comes in between, so note that rule "Mincha" too.

Rules of thumb:
- Rules are checked in order and the FIRST whose "when" matches sets the time, so put special days (Yom Tov, fasts, Rosh Chodesh, holidays) before the ordinary weekday rule, and end with a rule without "when" as the default when the event happens every other day.
- To say "not on these days", add a rule with "time": null before the rules that would otherwise match. An event that only happens on some days simply has no catch-all rule.
- A day's tags and holidays describe its daytime: a Friday is erevShabbos, Shabbos is shabbos. Evening events after Shabbos/Yom Tov ends go on the motzeiShabbos / motzeiYomTov day (which is the Shabbos/Yom Tov day itself).
- "Kriah days" (Torah reading on weekdays) are usually Monday, Thursday, Rosh Chodesh, fasts, Chol HaMoed, Chanukah and Purim.
- "Yamim Noraim" = { "any": [{ "holiday": "Rosh Hashana" }, { "holiday": "Yom Kippur" }] }.
- Times tied to zmanim are often rounded to a round number and kept the same all week. Put "weekly" inside "round", so the week's earliest (or latest) zman is rounded once: "Mincha 10 minutes before the week's earliest plag, rounded to 5" is { "round": { "weekly": { "offset": -10, "of": { "zman": "plag" } }, "pick": "earliest" }, "to": 5, "mode": … }.
- Pick the rounding the gabbai describes: "down" (never later than the zman-based time, e.g. before shkia or sof zman), "up" (never earlier, e.g. Maariv after tzeis), "nearest", or "withTrend" when it should follow the season (down while the zman is getting earlier, up while it's getting later). If they say "round to 5" with no direction for a time before a deadline, use "down".
- For a different rounding (or anything else) in summer and winter on fixed dates, use two rules with "civil" date ranges or the "dst" tag instead.
- Use "localHoliday" or the legalHoliday tag only for civil holidays; Jewish holidays use "tag" or "holiday".
- Only use the keys shown above. Times are always "HH:MM" 24-hour strings.

Zmanim (ZmanId):
${zmanim}

Day tags (DayTag):
${tags}

Holiday names for { "holiday": … } (Hebcal spelling; a base name like "Pesach" or "Sukkot" matches every day of it, Chol HaMoed included):
  ${HOLIDAY_NAMES}

This shul's civil holidays (ids for { "localHoliday": … }):
${holidays}

An example (a typical shul):

${EXAMPLE}

The shul's current events (keep, change or remove them as the description says):

${current}

The gabbai's description of their schedule:

`
}

// ---------------------------------------------------------------------------
// Reading the AI's answer back.

export type ImportResult = { ok: true; events: EventDef[] } | { ok: false; errors: string[] }

const KINDS: EventKind[] = ['tefila', 'shiur', 'other']
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function checkCondition(c: unknown, at: string, errors: string[]) {
  const bad = (why: string) => errors.push(`${at}: ${why}`)
  if (!isObj(c)) return bad('"when" must be an object')
  const keys = Object.keys(c)
  if (keys.length !== 1)
    return bad(`a condition has exactly one key, found ${keys.join(', ') || 'none'}`)
  const [k] = keys
  const v = c[k]
  if (k === 'weekday') {
    if (!Array.isArray(v) || !v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      bad('"weekday" must be a list of 0–6')
  } else if (k === 'tag') {
    if (!(DAY_TAGS as readonly unknown[]).includes(v)) bad(`unknown tag "${v}"`)
  } else if (k === 'holiday' || k === 'localHoliday') {
    if (typeof v !== 'string' || !v) bad(`"${k}" must be a name`)
  } else if (k === 'civil' || k === 'dates') {
    const re = k === 'civil' ? MMDD : DATE
    if (
      !isObj(v) ||
      typeof v.from !== 'string' ||
      typeof v.to !== 'string' ||
      !re.test(v.from) ||
      !re.test(v.to)
    )
      bad(`"${k}" needs "from" and "to" as ${k === 'civil' ? 'MM-DD' : 'YYYY-MM-DD'}`)
  } else if (k === 'all' || k === 'any') {
    if (!Array.isArray(v)) bad(`"${k}" must be a list of conditions`)
    else v.forEach((x, i) => checkCondition(x, `${at} › ${k}[${i}]`, errors))
  } else if (k === 'not') {
    checkCondition(v, `${at} › not`, errors)
  } else bad(`unknown condition "${k}"`)
}

function checkTime(t: unknown, at: string, errors: string[]) {
  const bad = (why: string) => errors.push(`${at}: ${why}`)
  if (!isObj(t)) return bad('a time must be an object')
  if ('clock' in t) {
    if (typeof t.clock !== 'string' || !CLOCK.test(t.clock))
      bad(`clock "${t.clock}" must be "HH:MM", 24-hour`)
  } else if ('zman' in t) {
    if (!(ZMAN_IDS as readonly unknown[]).includes(t.zman)) bad(`unknown zman "${t.zman}"`)
  } else if ('event' in t) {
    if (typeof t.event !== 'string') bad('"event" must be an event id')
  } else if ('offset' in t) {
    if (typeof t.offset !== 'number') bad('"offset" must be a number of minutes')
    checkTime(t.of, `${at} › of`, errors)
  } else if ('earliest' in t || 'latest' in t) {
    const list = t.earliest ?? t.latest
    if (!Array.isArray(list) || !list.length) bad('"earliest"/"latest" must be a non-empty list')
    else list.forEach((x, i) => checkTime(x, `${at} › [${i}]`, errors))
  } else if ('clamp' in t) {
    checkTime(t.clamp, `${at} › clamp`, errors)
    if (t.min !== undefined) checkTime(t.min, `${at} › min`, errors)
    if (t.max !== undefined) checkTime(t.max, `${at} › max`, errors)
  } else if ('round' in t) {
    checkTime(t.round, `${at} › round`, errors)
    if (typeof t.to !== 'number' || t.to <= 0) bad('"to" must be a positive number of minutes')
    if (!['down', 'up', 'nearest', 'withTrend', 'againstTrend'].includes(t.mode as string))
      bad('"mode" must be "down", "up", "nearest", "withTrend" or "againstTrend"')
  } else if ('weekly' in t) {
    checkTime(t.weekly, `${at} › weekly`, errors)
    if (t.pick !== 'earliest' && t.pick !== 'latest') bad('"pick" must be "earliest" or "latest"')
  } else bad(`unknown time ${JSON.stringify(t)}`)
}

/** The JSON in an AI's reply: a ```json block, or the outermost {…}/[…] in the text. */
function extractJson(text: string): unknown {
  const candidates: string[] = []
  for (const m of text.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)) candidates.push(m[1])
  const start = text.search(/[{[]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))
  // The biggest block is the schedule; a small one is likely a snippet in the explanation.
  candidates.sort((a, b) => b.length - a.length)
  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch {}
  }
  throw new Error('No JSON found. Paste the whole answer, or just its JSON block.')
}

/** Parses and checks what an AI sent back. Accepts `{ events }`, a bare list, or a whole schedule. */
export function parseAiImport(text: string): ImportResult {
  let data: unknown
  try {
    data = extractJson(text)
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] }
  }
  const list = Array.isArray(data)
    ? data
    : isObj(data) && Array.isArray(data.events)
      ? data.events
      : null
  if (!list) return { ok: false, errors: ['Expected { "events": [ … ] }.'] }
  if (!list.length) return { ok: false, errors: ['The list of events is empty.'] }

  const errors: string[] = []
  const ids = new Set<string>()
  const events = list.map((raw: unknown, i): EventDef => {
    const e = isObj(raw) ? raw : {}
    const name: EventDef['name'] | null =
      typeof e.name === 'string'
        ? { en: e.name }
        : isObj(e.name) && typeof e.name.en === 'string'
          ? (e.name as unknown as EventDef['name'])
          : null
    const label = name?.en ? `"${name.en}"` : `Event ${i + 1}`
    if (!isObj(raw)) errors.push(`${label}: must be an object`)
    if (!name?.en) errors.push(`${label}: needs a name ({ "en": … })`)
    const id = typeof e.id === 'string' && e.id ? e.id : null
    if (!id) errors.push(`${label}: needs an id`)
    else if (ids.has(id)) errors.push(`${label}: id "${id}" is used twice`)
    if (id) ids.add(id)
    if (!KINDS.includes(e.kind as EventKind))
      errors.push(`${label}: "kind" must be tefila, shiur or other`)
    if (!Array.isArray(e.rules)) errors.push(`${label}: needs a "rules" list`)
    const rules = Array.isArray(e.rules) ? e.rules : []
    rules.forEach((r: unknown, j: number) => {
      const at = `${label} rule ${j + 1}`
      if (!isObj(r)) return errors.push(`${at}: must be an object`)
      if (r.when !== undefined) checkCondition(r.when, at, errors)
      if (!('time' in r)) errors.push(`${at}: needs "time" (or null for "not on these days")`)
      else if (r.time !== null) checkTime(r.time, at, errors)
    })
    return {
      ...(e as object),
      id: id ?? '',
      name: name ?? { en: '' },
      kind: e.kind as EventKind,
      rules: rules as Rule[],
    } as EventDef
  })
  return errors.length ? { ok: false, errors } : { ok: true, events }
}

/** `replace`: the imported events are the whole list. `merge`: same id replaces, new ones are added. */
export function applyImport(
  current: EventDef[],
  imported: EventDef[],
  mode: 'replace' | 'merge',
): EventDef[] {
  if (mode === 'replace') return imported
  const byId = new Map(imported.map((e) => [e.id, e]))
  const kept = current.map((e) => byId.get(e.id) ?? e)
  return [...kept, ...imported.filter((e) => !current.some((c) => c.id === e.id))]
}
