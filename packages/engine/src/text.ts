/** Caps for text and lists a write-API connection can fill (the admin has none of these). */
export const LIMITS = {
  /** Names, titles, rooms, notes. */
  name: 100,
  /** A notice's text, an event's description, a dedication. */
  text: 500,
  /** The longest word, so one can't break the 1280×720 layout. */
  word: 40,
  link: 500,
  /** Refuah names in all. */
  cholim: 300,
  /** Yahrzeits, birthdays and anniversaries, each list. */
  people: 1000,
  /** Announcements, reminders and the like a connection has up at once. */
  liveNotices: 5,
  liveSponsors: 10,
  liveEvents: 20,
  /** An announcement or reminder runs 14 days unless told, and never more than 90. */
  noticeDefaultDays: 14,
  noticeMaxDays: 90,
  /** Exceptions and one-time events: at most this many days back and ahead. */
  pastDays: 1,
  aheadDays: 365,
} as const

/** C0 and C1 controls (but not tab and newline, handled first), soft hyphen, zero-width and invisible characters, bidi overrides and isolates, tag characters. */
const STRIPPED =
  /[\u0000-\u0008\u000B-\u001F\u007F-\u009F­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿￹-￻\u{E0000}-\u{E007F}]/gu

export type TextResult = { ok: true; text: string } | { ok: false; message: string }

const length = (s: string) => [...s].length

/**
 * Plain text from outside: invisible and direction-changing characters stripped (Hebrew, niqqud and ordinary
 * punctuation pass untouched), whitespace tidied (newlines kept only for `multiline`), then checked against `max`
 * characters and the longest word. An empty result is fine unless `required`.
 */
export function sanitizeText(
  input: unknown,
  { max = LIMITS.name, multiline = false, required = false }: { max?: number; multiline?: boolean; required?: boolean } = {},
): TextResult {
  if (typeof input !== 'string') return { ok: false, message: 'must be text' }
  let s = input.replace(/\r\n?|\u2028|\u2029/g, '\n').replace(/\t/g, ' ')
  if (!multiline) s = s.replace(/\n/g, ' ')
  s = s
    .replace(STRIPPED, '')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (required && !s) return { ok: false, message: 'is required' }
  if (s.split(/\s+/).some((w) => length(w) > LIMITS.word))
    return { ok: false, message: `has a word over ${LIMITS.word} characters` }
  if (length(s) > max) return { ok: false, message: `is over ${max} characters` }
  return { ok: true, text: s }
}

/** An `https` link without credentials, as written (trimmed), or why not. */
export function sanitizeLink(input: unknown): TextResult {
  if (typeof input !== 'string') return { ok: false, message: 'must be text' }
  const s = input.replace(STRIPPED, '').trim()
  if (!s || length(s) > LIMITS.link || /\s/.test(s)) return { ok: false, message: 'must be an https link' }
  try {
    const u = new URL(s)
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.'))
      return { ok: false, message: 'must be an https link' }
  } catch {
    return { ok: false, message: 'must be an https link' }
  }
  return { ok: true, text: s }
}

/** Lower case, no diacritics or niqqud, single spaces: what `match` compares. */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
