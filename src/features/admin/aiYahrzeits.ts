import {
  gregorianToHebrew,
  hebrewMonths,
  hebrewToGregorian,
  isRealMonthDay,
  type DateString,
  type HebrewMonthDay,
  type ShulProfile,
  type Yahrzeit,
} from '@beitecha/engine'

import { DATE, extractJson, isObj } from './aiSetup'
import type { Parsed } from './aiItems'

// ---------------------------------------------------------------------------
// Yahrzeits in and out as CSV or JSON: a prompt for any chat AI to turn a spreadsheet into one of them,
// a parser that takes either, and the two exports.

const HEBREW_MONTHS: Record<string, number> = {
  nisan: 1,
  nissan: 1,
  ניסן: 1,
  iyar: 2,
  iyyar: 2,
  אייר: 2,
  sivan: 3,
  סיון: 3,
  סיוון: 3,
  tamuz: 4,
  tammuz: 4,
  תמוז: 4,
  av: 5,
  menachemav: 5,
  אב: 5,
  מנחםאב: 5,
  elul: 6,
  אלול: 6,
  tishrei: 7,
  tishri: 7,
  tishrey: 7,
  תשרי: 7,
  cheshvan: 8,
  heshvan: 8,
  marcheshvan: 8,
  חשון: 8,
  חשוון: 8,
  מרחשון: 8,
  kislev: 9,
  כסלו: 9,
  teves: 10,
  tevet: 10,
  tevess: 10,
  טבת: 10,
  shvat: 11,
  shevat: 11,
  shevatt: 11,
  שבט: 11,
  adari: 12,
  adar1: 12,
  adaralef: 12,
  אדרא: 12,
  אדראשון: 12,
  adarii: 13,
  adar2: 13,
  adarbeis: 13,
  adarbet: 13,
  אדרב: 13,
  אדרשני: 13,
}

/** A month typed as a name in English or Hebrew, or as 1–13; plain "Adar" is Adar II in a leap year. */
export function monthFromText(text: string, year?: number): number | undefined {
  const t = text.trim()
  if (/^\d{1,2}$/.test(t)) return +t >= 1 && +t <= 13 ? +t : undefined
  const key = t
    .toLowerCase()
    .replace(/['’"״׳.\s-]/g, '')
    .replace(/^month/, '')
  if (key === 'adar' || key === 'אדר') {
    const leap = year !== undefined && hebrewMonths(year).some((m) => m.month === 13)
    return leap ? 13 : 12
  }
  return HEBREW_MONTHS[key]
}

/** "18 Cheshvan 5781" (also "18 Cheshvan, 5781"); the year may be left off. */
export function parseHebrewDate(text: string): HebrewMonthDay | undefined {
  const m = /^\s*(\d{1,2})\s+(?:of\s+)?([^\d,]+?)(?:[\s,]+(\d{4}))?\s*$/i.exec(text)
  if (!m) return undefined
  const month = monthFromText(m[2], m[3] ? +m[3] : undefined)
  return month === undefined ? undefined : { day: +m[1], month, ...(m[3] && { year: +m[3] }) }
}

const monthName = (h: HebrewMonthDay) =>
  hebrewMonths(h.year ?? (h.month === 13 ? 5779 : 5780)).find((m) => m.month === h.month)?.name ??
  String(h.month)
export const hebrewDateWords = (h: HebrewMonthDay) =>
  `${h.day} ${monthName(h)}${h.year ? ` ${h.year}` : ''}`

// ---------------------------------------------------------------------------
// Export

const COLUMNS = [
  'hebrew_name',
  'display_name',
  'display_name_hebrew',
  'hebrew_date',
  'gregorian_date',
] as const

const cell = (v: string) => (/[",\n\r;\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function yahrzeitsToCsv(list: Yahrzeit[]): string {
  const rows = list.map((y) =>
    [
      y.hebrewName ?? '',
      y.displayName?.en ?? '',
      y.displayName?.he ?? '',
      hebrewDateWords(y.hebrew),
      y.gregorian ?? '',
    ]
      .map(cell)
      .join(','),
  )
  return [COLUMNS.join(','), ...rows].join('\n') + '\n'
}

export function yahrzeitsToJson(list: Yahrzeit[]): string {
  return JSON.stringify(
    {
      yahrzeits: list.map((y) => ({
        ...(y.hebrewName && { hebrewName: y.hebrewName }),
        ...(y.displayName && { displayName: y.displayName }),
        hebrew: {
          day: y.hebrew.day,
          month: monthName(y.hebrew),
          ...(y.hebrew.year && { year: y.hebrew.year }),
        },
        ...(y.gregorian && { gregorian: y.gregorian }),
      })),
    },
    null,
    2,
  )
}

// ---------------------------------------------------------------------------
// CSV

/** Rows of cells; quotes, doubled quotes and line breaks inside quotes are handled. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') ((field += '"'), i++)
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) (row.push(field), (field = ''))
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

export const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9֐-׿]/g, '')

export const HEADERS: Record<string, string[]> = {
  hebrewName: ['hebrewname', 'hebrewnamewithfather', 'shem', 'שם', 'שםעברי'],
  displayEn: [
    'displayname',
    'displaynameen',
    'displaynameenglish',
    'name',
    'englishname',
    'display',
  ],
  displayHe: ['displaynamehebrew', 'displaynamehe', 'hebrewdisplayname'],
  hebrewDate: ['hebrewdate', 'hdate', 'yahrzeit', 'yahrzeitdate'],
  day: ['hebrewday', 'hday', 'day'],
  month: ['hebrewmonth', 'hmonth', 'month'],
  year: ['hebrewyear', 'hyear', 'year'],
  gregorian: [
    'gregoriandate',
    'gdate',
    'civildate',
    'englishdate',
    'date',
    'dateofpassing',
    'dateofdeath',
  ],
}

export function column(headers: string[], key: string): number {
  return headers.findIndex((h) => HEADERS[key].includes(h))
}

/** The rows of a CSV, TSV or semicolon file, found in a code block if an AI's answer wraps it in one. */
export function csvTable(text: string): string[][] {
  const fenced = /```(?:csv|CSV)?\s*\n([\s\S]*?)```/.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  const first = body.split(/\r?\n/)[0] ?? ''
  const count = (c: string) => first.split(c).length - 1
  const delimiter =
    count('\t') > 0 && count('\t') >= count(',') ? '\t' : count(';') > count(',') ? ';' : ','
  return parseCsv(body, delimiter)
}

function parseCsvRows(text: string): Parsed<Yahrzeit[]> {
  const rows = csvTable(text)
  if (rows.length < 2)
    return { ok: false, errors: ['Expected a CSV: a header row, then one row for each person.'] }
  const headers = rows[0].map(norm)
  const at = Object.fromEntries(Object.keys(HEADERS).map((k) => [k, column(headers, k)]))
  const errors: string[] = []
  if (at.hebrewName < 0 && at.displayEn < 0)
    errors.push('The header row needs a name column: hebrew_name and/or display_name.')
  if (at.hebrewDate < 0 && at.gregorian < 0 && (at.day < 0 || at.month < 0))
    errors.push(
      'The header row needs a date column: hebrew_date ("18 Cheshvan", year optional) and/or gregorian_date (YYYY-MM-DD).',
    )
  if (errors.length) return { ok: false, errors }
  const get = (r: string[], k: string) => (at[k] >= 0 ? (r[at[k]] ?? '').trim() : '')

  const out: Yahrzeit[] = []
  rows.slice(1).forEach((r, i) => {
    const label = `Row ${i + 2}${get(r, 'displayEn') || get(r, 'hebrewName') ? ` (${get(r, 'displayEn') || get(r, 'hebrewName')})` : ''}`
    let hebrew: HebrewMonthDay | undefined
    if (get(r, 'hebrewDate')) {
      hebrew = parseHebrewDate(get(r, 'hebrewDate'))
      if (!hebrew)
        return void errors.push(`${label}: hebrew_date must look like "18 Cheshvan" or "18 Cheshvan 5781"`)
    } else if (get(r, 'day') || get(r, 'month') || get(r, 'year')) {
      const year = get(r, 'year') ? +get(r, 'year') : undefined
      const month = monthFromText(get(r, 'month'), year)
      if (month === undefined)
        return void errors.push(`${label}: don’t know the Hebrew month "${get(r, 'month')}"`)
      hebrew = { day: +get(r, 'day'), month, ...(year && { year }) }
    }
    out.push(
      ...build(
        {
          hebrewName: get(r, 'hebrewName'),
          en: get(r, 'displayEn'),
          he: get(r, 'displayHe'),
          hebrew,
          gregorian: get(r, 'gregorian'),
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
      : { ok: false, errors: ['No people found.'] }
}

/** One person from either format, checked; their other date is derived from the one given. */
function build(
  p: { hebrewName: string; en: string; he: string; hebrew?: HebrewMonthDay; gregorian: string },
  label: string,
  errors: string[],
): Yahrzeit[] {
  const before = errors.length
  if (!p.hebrewName && !p.en && !p.he) errors.push(`${label}: needs a name`)
  if (p.gregorian && !DATE.test(p.gregorian))
    errors.push(`${label}: the Gregorian date must be YYYY-MM-DD`)
  if (!p.hebrew && !p.gregorian) errors.push(`${label}: needs a date, Hebrew or Gregorian`)
  if (p.hebrew && !isRealMonthDay(p.hebrew))
    errors.push(`${label}: that Hebrew date doesn’t exist`)
  if (errors.length > before) return []
  const hebrew = p.hebrew ?? gregorianToHebrew(p.gregorian as DateString)
  const gregorian: DateString | undefined = DATE.test(p.gregorian)
    ? (p.gregorian as DateString)
    : hebrew.year
      ? hebrewToGregorian({ ...hebrew, year: hebrew.year })
      : undefined
  return [
    {
      id: '',
      ...(p.hebrewName && { hebrewName: p.hebrewName }),
      ...((p.en || p.he) && { displayName: { en: p.en, ...(p.he && { he: p.he }) } }),
      hebrew,
      ...(gregorian && { gregorian }),
    },
  ]
}

// ---------------------------------------------------------------------------
// JSON

function parseJsonList(data: unknown): Parsed<Yahrzeit[]> {
  const list = Array.isArray(data)
    ? data
    : isObj(data) && Array.isArray(data.yahrzeits)
      ? data.yahrzeits
      : isObj(data)
        ? [data]
        : []
  if (!list.length) return { ok: false, errors: ['Expected { "yahrzeits": [ … ] }.'] }
  const errors: string[] = []
  const out: Yahrzeit[] = []
  list.forEach((raw: unknown, i: number) => {
    const y = isObj(raw) ? raw : {}
    const dn = isObj(y.displayName)
      ? y.displayName
      : typeof y.displayName === 'string'
        ? { en: y.displayName }
        : {}
    const en = String(dn.en ?? '').trim()
    const he = String(dn.he ?? '').trim()
    const hebrewName = String(y.hebrewName ?? '').trim()
    const label = `Person ${i + 1}${en || hebrewName ? ` (${en || hebrewName})` : ''}`
    let hebrew: HebrewMonthDay | undefined
    if (isObj(y.hebrew)) {
      const year = y.hebrew.year ? Number(y.hebrew.year) : undefined
      const month = monthFromText(String(y.hebrew.month ?? ''), year)
      if (month === undefined)
        return void errors.push(`${label}: don’t know the Hebrew month "${y.hebrew.month}"`)
      hebrew = { day: Number(y.hebrew.day), month, ...(year && { year }) }
    } else if (typeof y.hebrew === 'string') {
      hebrew = parseHebrewDate(y.hebrew)
      if (!hebrew) return void errors.push(`${label}: "hebrew" must look like "18 Cheshvan" or "18 Cheshvan 5781"`)
    }
    out.push(
      ...build({ hebrewName, en, he, hebrew, gregorian: String(y.gregorian ?? '') }, label, errors),
    )
  })
  return errors.length ? { ok: false, errors } : { ok: true, value: out }
}

/** People from a CSV or JSON: pasted from a spreadsheet, an AI's answer (its code block is found), or a file. */
export function parseYahrzeits(text: string): Parsed<Yahrzeit[]> {
  const t = text.trim()
  if (/^[{[]/.test(t) || /```json/i.test(t)) {
    try {
      return parseJsonList(extractJson(t))
    } catch {
      // not JSON after all; try it as a CSV
    }
  }
  return parseCsvRows(t)
}

/** Same person: the same names on the same Hebrew date. */
export const sameYahrzeit = (a: Yahrzeit, b: Yahrzeit) =>
  (a.hebrewName ?? '') === (b.hebrewName ?? '') &&
  (a.displayName?.en ?? '') === (b.displayName?.en ?? '') &&
  (a.displayName?.he ?? '') === (b.displayName?.he ?? '') &&
  a.hebrew.day === b.hebrew.day &&
  a.hebrew.month === b.hebrew.month &&
  a.hebrew.year === b.hebrew.year

// ---------------------------------------------------------------------------
// The prompt

export function yahrzeitPrompt(profile: ShulProfile, ask: string): string {
  return `You are helping the gabbai of ${profile.name.en} load their list of yahrzeits into Beitecha, which shows each one in the shul's announcements in the days before it, every year. The gabbai may paste rows from a spreadsheet (Excel, Google Sheets), a typed list or a photo's text. Take every person from it.

How to answer:
1. If something important is unclear, ask a short question first. Otherwise go straight to the CSV.
2. Reply with ONE CSV code block, nothing else inside it.
3. After it, say in a line or two what you did and list any rows you were unsure of, so the gabbai can check.
4. If Beitecha reports problems and the gabbai pastes them back, fix them and send the whole CSV again.

The CSV has this header row, exactly:

${COLUMNS.join(',')}

One row per person:
- hebrew_name: their Hebrew name with the father's name, in Hebrew letters: מנחם בן מימון. Leave empty if not given. Do not make one up.
- display_name: the name people know them by, in English letters: Menachem Kohen. Leave empty if not given.
- display_name_hebrew: the same name in Hebrew letters (מנחם כהן), only if the list gives it or the Hebrew is certain. Otherwise leave empty.
- hebrew_date: the Hebrew date of the passing as day and month, and the year when the list has it: 18 Cheshvan 5781, or just 18 Cheshvan. The year is optional (the yahrzeit is kept on the same day every year either way); when given it is the full four digits (5781), never abbreviated. Use these month names: Nisan, Iyyar, Sivan, Tamuz, Av, Elul, Tishrei, Cheshvan, Kislev, Tevet, Shvat, Adar (in a plain year), Adar I and Adar II (in a leap year). Leave empty if the list only has a civil date.
- gregorian_date: the civil date of the passing as YYYY-MM-DD (2020-11-05). Optional; leave empty if the list has none.
Each person needs at least a Hebrew day and month or a civil date; give more when the list does. Never guess a date. If someone's date is missing or you can't read it, leave that row out and say so after the CSV. Put any cell with a comma in double quotes. Keep Hebrew text as real Hebrew letters, without vowel points.

Example:

\`\`\`csv
${COLUMNS.join(',')}
מנחם בן מימון,Menachem Kohen,מנחם כהן,18 Cheshvan 5781,2020-11-05
,Sarah Levy,,,2019-03-14
,David Katz,,5 Shvat,
\`\`\`

The gabbai's list:

${ask || '(The gabbai will paste it in the next message.)'}
`
}
