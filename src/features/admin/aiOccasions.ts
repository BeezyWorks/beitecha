import {
  hebrewMonths,
  isRealMonthDay,
  resolveOccasion,
  type HebrewMonthDay,
  type Occasion,
  type OccasionKind,
  type ShulProfile,
} from '@beitecha/engine'

import type { Parsed } from './aiItems'
import { csvTable, HEADERS, monthFromText, norm } from './aiYahrzeits'
import { DATE, extractJson, isObj } from './aiSetup'

// ---------------------------------------------------------------------------
// Birthdays and anniversaries in and out as CSV or JSON, like the yahrzeits: a prompt for any chat AI, a parser
// that takes either, and the two exports. Only one date is needed; a Hebrew date needs no year.

export const OCCASION_WORDS: Record<OccasionKind, { one: string; many: string; names: string }> = {
  birthday: { one: 'birthday', many: 'birthdays', names: 'person' },
  anniversary: { one: 'anniversary', many: 'anniversaries', names: 'couple' },
}

const COLUMNS = [
  'hebrew_name',
  'display_name',
  'display_name_hebrew',
  'hebrew_date',
  'gregorian_date',
  'show_as',
] as const

const monthName = (month: number, year?: number) =>
  hebrewMonths(year ?? 5784).find((m) => m.month === month)?.name ?? String(month)

/** `18 Cheshvan` or `18 Cheshvan 5781`. */
export const monthDayWords = (h: HebrewMonthDay) =>
  `${h.day} ${monthName(h.month, h.year)}${h.year ? ` ${h.year}` : ''}`

/** `18 Cheshvan` or `2001-03-05`: the date an entry is kept and shown by. */
export const occasionDateWords = (o: Occasion) => {
  const r = resolveOccasion(o)
  return r.by === 'gregorian' && r.gregorian ? r.gregorian : r.hebrew ? monthDayWords(r.hebrew) : ''
}

/** "18 Cheshvan" or "18 Cheshvan 5781" (also with a comma); the year is optional. */
export function parseMonthDay(text: string): HebrewMonthDay | undefined {
  const m = /^\s*(\d{1,2})\s+(?:of\s+)?([^\d,]+?)(?:[\s,]+(\d{4}))?\s*$/i.exec(text)
  if (!m) return undefined
  const year = m[3] ? +m[3] : undefined
  const month = monthFromText(m[2], year)
  return month === undefined ? undefined : { day: +m[1], month, ...(year && { year }) }
}

// ---------------------------------------------------------------------------
// Export

const cell = (v: string) => (/[",\n\r;\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function occasionsToCsv(list: Occasion[]): string {
  const rows = list.map((o) =>
    [
      o.hebrewName ?? '',
      o.displayName?.en ?? '',
      o.displayName?.he ?? '',
      o.hebrew ? monthDayWords(o.hebrew) : '',
      o.gregorian ?? '',
      resolveOccasion(o).by,
    ]
      .map(cell)
      .join(','),
  )
  return [COLUMNS.join(','), ...rows].join('\n') + '\n'
}

export function occasionsToJson(kind: OccasionKind, list: Occasion[]): string {
  return JSON.stringify(
    {
      [OCCASION_WORDS[kind].many]: list.map((o) => ({
        ...(o.hebrewName && { hebrewName: o.hebrewName }),
        ...(o.displayName && { displayName: o.displayName }),
        ...(o.hebrew && {
          hebrew: {
            day: o.hebrew.day,
            month: monthName(o.hebrew.month, o.hebrew.year),
            ...(o.hebrew.year && { year: o.hebrew.year }),
          },
        }),
        ...(o.gregorian && { gregorian: o.gregorian }),
        by: resolveOccasion(o).by,
      })),
    },
    null,
    2,
  )
}

// ---------------------------------------------------------------------------
// Import

const ALIASES: Record<string, string[]> = {
  ...HEADERS,
  hebrewDate: [...HEADERS.hebrewDate, 'hebrewbirthday', 'hebrewanniversary'],
  gregorian: [
    ...HEADERS.gregorian,
    'birthday',
    'birthdate',
    'dateofbirth',
    'anniversary',
    'anniversarydate',
    'wedding',
    'weddingdate',
    'civilbirthday',
  ],
  showAs: ['showas', 'showby', 'keptby', 'calendar', 'showdateas'],
}

const columnOf = (headers: string[], key: string) =>
  headers.findIndex((h) => ALIASES[key].includes(h))

const showAs = (text: string): 'hebrew' | 'gregorian' | undefined => {
  const t = norm(text)
  return /^(hebrew|heb|jewish|he)/.test(t)
    ? 'hebrew'
    : /^(gregorian|civil|english|secular|greg)/.test(t)
      ? 'gregorian'
      : undefined
}

/** One entry from either format, checked. Nothing is derived here: the stored entry keeps just what was given. */
function build(
  p: {
    hebrewName: string
    en: string
    he: string
    hebrew?: HebrewMonthDay
    gregorian: string
    by?: 'hebrew' | 'gregorian'
  },
  label: string,
  errors: string[],
): Occasion[] {
  const before = errors.length
  if (!p.hebrewName && !p.en && !p.he) errors.push(`${label}: needs a name`)
  if (p.gregorian && !DATE.test(p.gregorian))
    errors.push(`${label}: the Gregorian date must be YYYY-MM-DD`)
  else if (p.gregorian && Number.isNaN(Date.parse(p.gregorian)))
    errors.push(`${label}: that Gregorian date doesn’t exist`)
  if (!p.hebrew && !p.gregorian) errors.push(`${label}: needs a date, Hebrew or Gregorian`)
  if (p.hebrew && !isRealMonthDay(p.hebrew)) errors.push(`${label}: that Hebrew date doesn’t exist`)
  if (errors.length > before) return []
  return [
    {
      id: '',
      ...(p.hebrewName && { hebrewName: p.hebrewName }),
      ...((p.en || p.he) && { displayName: { en: p.en, ...(p.he && { he: p.he }) } }),
      ...(p.hebrew && { hebrew: p.hebrew }),
      ...(p.gregorian && { gregorian: p.gregorian }),
      ...(p.by && { by: p.by }),
    },
  ]
}

function parseCsvRows(text: string): Parsed<Occasion[]> {
  const rows = csvTable(text)
  if (rows.length < 2)
    return { ok: false, errors: ['Expected a CSV: a header row, then one row for each entry.'] }
  const headers = rows[0].map(norm)
  const at = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, columnOf(headers, k)]))
  const errors: string[] = []
  if (at.hebrewName < 0 && at.displayEn < 0 && at.displayHe < 0)
    errors.push('The header row needs a name column: hebrew_name and/or display_name.')
  if (at.hebrewDate < 0 && at.gregorian < 0 && (at.day < 0 || at.month < 0))
    errors.push(
      'The header row needs a date column: hebrew_date ("18 Cheshvan") and/or gregorian_date (YYYY-MM-DD).',
    )
  if (errors.length) return { ok: false, errors }
  const get = (r: string[], k: string) => (at[k] >= 0 ? (r[at[k]] ?? '').trim() : '')

  const out: Occasion[] = []
  rows.slice(1).forEach((r, i) => {
    const who = get(r, 'displayEn') || get(r, 'hebrewName')
    const label = `Row ${i + 2}${who ? ` (${who})` : ''}`
    let hebrew: HebrewMonthDay | undefined
    if (get(r, 'hebrewDate')) {
      hebrew = parseMonthDay(get(r, 'hebrewDate'))
      if (!hebrew)
        return void errors.push(
          `${label}: hebrew_date must look like "18 Cheshvan" or "18 Cheshvan 5781"`,
        )
    } else if (get(r, 'day') || get(r, 'month')) {
      const year = get(r, 'year') ? +get(r, 'year') : undefined
      const month = monthFromText(get(r, 'month'), year)
      if (month === undefined)
        return void errors.push(`${label}: don’t know the Hebrew month "${get(r, 'month')}"`)
      hebrew = { day: +get(r, 'day'), month, ...(year && { year }) }
    }
    const by = showAs(get(r, 'showAs'))
    if (get(r, 'showAs') && !by)
      return void errors.push(`${label}: show_as must be hebrew or gregorian`)
    out.push(
      ...build(
        {
          hebrewName: get(r, 'hebrewName'),
          en: get(r, 'displayEn'),
          he: get(r, 'displayHe'),
          hebrew,
          gregorian: get(r, 'gregorian'),
          by,
        },
        label,
        errors,
      ),
    )
  })
  return errors.length
    ? { ok: false, errors }
    : out.length
      ? { ok: true, value: out }
      : { ok: false, errors: ['Nothing found.'] }
}

function parseJsonList(kind: OccasionKind, data: unknown): Parsed<Occasion[]> {
  const list = Array.isArray(data)
    ? data
    : isObj(data) && Array.isArray(data[OCCASION_WORDS[kind].many])
      ? (data[OCCASION_WORDS[kind].many] as unknown[])
      : isObj(data)
        ? [data]
        : []
  if (!list.length)
    return { ok: false, errors: [`Expected { "${OCCASION_WORDS[kind].many}": [ … ] }.`] }
  const errors: string[] = []
  const out: Occasion[] = []
  list.forEach((raw: unknown, i: number) => {
    const o = isObj(raw) ? raw : {}
    const dn = isObj(o.displayName)
      ? o.displayName
      : typeof o.displayName === 'string'
        ? { en: o.displayName }
        : {}
    const en = String(dn.en ?? '').trim()
    const he = String(dn.he ?? '').trim()
    const hebrewName = String(o.hebrewName ?? '').trim()
    const label = `Entry ${i + 1}${en || hebrewName ? ` (${en || hebrewName})` : ''}`
    let hebrew: HebrewMonthDay | undefined
    if (isObj(o.hebrew)) {
      const year = o.hebrew.year ? Number(o.hebrew.year) : undefined
      const month = monthFromText(String(o.hebrew.month ?? ''), year)
      if (month === undefined)
        return void errors.push(`${label}: don’t know the Hebrew month "${o.hebrew.month}"`)
      hebrew = { day: Number(o.hebrew.day), month, ...(year && { year }) }
    } else if (typeof o.hebrew === 'string') {
      hebrew = parseMonthDay(o.hebrew)
      if (!hebrew)
        return void errors.push(
          `${label}: "hebrew" must look like "18 Cheshvan" or "18 Cheshvan 5781"`,
        )
    }
    const by = showAs(String(o.by ?? o.showAs ?? ''))
    out.push(
      ...build(
        { hebrewName, en, he, hebrew, gregorian: String(o.gregorian ?? ''), by },
        label,
        errors,
      ),
    )
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: out }
}

/** Entries from a CSV or JSON: pasted from a spreadsheet, an AI's answer (its code block is found), or a file. */
export function parseOccasions(kind: OccasionKind, text: string): Parsed<Occasion[]> {
  const t = text.trim()
  if (/^[{[]/.test(t) || /```json/i.test(t)) {
    try {
      return parseJsonList(kind, extractJson(t))
    } catch {
      // not JSON after all; try it as a CSV
    }
  }
  return parseCsvRows(t)
}

/** Same entry: the same names on the same dates. */
export const sameOccasion = (a: Occasion, b: Occasion) =>
  (a.hebrewName ?? '') === (b.hebrewName ?? '') &&
  (a.displayName?.en ?? '') === (b.displayName?.en ?? '') &&
  (a.displayName?.he ?? '') === (b.displayName?.he ?? '') &&
  (a.gregorian ?? '') === (b.gregorian ?? '') &&
  a.hebrew?.day === b.hebrew?.day &&
  a.hebrew?.month === b.hebrew?.month &&
  a.hebrew?.year === b.hebrew?.year

// ---------------------------------------------------------------------------
// The prompt

export function occasionPrompt(profile: ShulProfile, kind: OccasionKind, ask: string): string {
  const w = OCCASION_WORDS[kind]
  const example =
    kind === 'birthday'
      ? `מנחם בן מימון,Menachem Kohen,מנחם כהן,18 Cheshvan,,hebrew
,Sarah Levy,,,2014-03-14,gregorian`
      : `,Menachem & Sarah Kohen,,,2001-06-17,gregorian
מנחם ושרה,David & Rivka Levy,דוד ורבקה לוי,5 Sivan 5761,2001-05-27,hebrew`
  return `You are helping the gabbai of ${profile.name.en} load their list of ${w.many} into Beitecha, which shows each one in the shul's announcements in the days before it, every year. The gabbai may paste rows from a spreadsheet (Excel, Google Sheets), a typed list or a photo's text. Take every ${w.names} from it.

How to answer:
1. If something important is unclear, ask a short question first. Otherwise go straight to the CSV.
2. Reply with ONE CSV code block, nothing else inside it.
3. After it, say in a line or two what you did and list any rows you were unsure of, so the gabbai can check.
4. If Beitecha reports problems and the gabbai pastes them back, fix them and send the whole CSV again.

The CSV has this header row, exactly:

${COLUMNS.join(',')}

One row per ${w.names}:
- hebrew_name: ${kind === 'birthday' ? "their Hebrew name with the father's name, in Hebrew letters: מנחם בן מימון" : "the couple's Hebrew names, in Hebrew letters: מנחם ושרה"}. Leave empty if not given. Do not make one up.
- display_name: the name${kind === 'birthday' ? '' : 's'} people know them by, in English letters: ${kind === 'birthday' ? 'Menachem Kohen' : 'Menachem & Sarah Kohen'}. Leave empty if not given.
- display_name_hebrew: the same in Hebrew letters, only if the list gives it or the Hebrew is certain. Otherwise leave empty.
- hebrew_date: the Hebrew date as day and month: 18 Cheshvan. A year is optional (18 Cheshvan 5781), as the full four digits, never abbreviated. Use these month names: Nisan, Iyyar, Sivan, Tamuz, Av, Elul, Tishrei, Cheshvan, Kislev, Tevet, Shvat, Adar (in a plain year), Adar I and Adar II (in a leap year). Leave empty if the list only has a civil date. Do not convert a civil date to a Hebrew one yourself.
- gregorian_date: the civil date as YYYY-MM-DD (2014-03-14), with the year. Leave empty if the list only has a Hebrew date.
- show_as: which date the shul shows: hebrew or gregorian. If the list says (or shows by only giving one date), use that; if it only has a Hebrew date, hebrew; if it only has a civil date, gregorian. If both dates are given and nothing says which, leave it empty.
Each row needs at least one of the two dates; one is enough. Never guess a date. If a date is missing or you can't read it, leave that row out and say so after the CSV. Put any cell with a comma in double quotes. Keep Hebrew text as real Hebrew letters, without vowel points.

Example:

\`\`\`csv
${COLUMNS.join(',')}
${example}
\`\`\`

The gabbai's list:

${ask || '(The gabbai will paste it in the next message.)'}
`
}
