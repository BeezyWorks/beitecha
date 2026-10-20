import type { Minutes } from './types'

/**
 * Time formats use moment's tokens, so `h:mm A` is `3:05 PM`. Only the time ones exist here:
 *
 * | token | gives        | token | gives          |
 * | ----- | ------------ | ----- | -------------- |
 * | `H`   | 0–23         | `h`   | 1–12           |
 * | `HH`  | 00–23        | `hh`  | 01–12          |
 * | `k`   | 1–24         | `m`   | 0–59           |
 * | `kk`  | 01–24        | `mm`  | 00–59          |
 * | `A`   | AM / PM      | `a`   | am / pm        |
 * | `AA`  | A / P        | `aa`  | a / p          |
 *
 * `[text]` is shown as it is; any other character is too. (`AA`/`aa` are ours, not moment's.)
 */
export const DEFAULT_TIME_FORMAT = 'h:mm'

export interface TimeFormatPreset {
  format: string
  label: string
}

export const TIME_FORMAT_PRESETS: TimeFormatPreset[] = [
  { format: 'h:mm', label: '3:05' },
  { format: 'h:mm A', label: '3:05 PM' },
  { format: 'h:mm a', label: '3:05 pm' },
  { format: 'h:mmAA', label: '3:05P' },
  { format: 'HH:mm', label: '15:05' },
  { format: 'H:mm', label: '15:05 (no leading zero)' },
]

const TOKEN = /\[([^\]]*)\]|HH?|hh?|kk?|mm?|AA?|aa?/g
const HOUR_TOKEN = /^(HH?|hh?|kk?)$/

const pad = (n: number, width: number) => String(n).padStart(width, '0')

/** Formats minutes since midnight (24 and over wrap to the next day). */
export function formatTime(minutes: Minutes, format: string = DEFAULT_TIME_FORMAT): string {
  const total = ((Math.floor(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  const pm = h >= 12
  return format.replace(TOKEN, (token, literal?: string) => {
    if (literal !== undefined) return literal
    switch (token) {
      case 'H': return String(h)
      case 'HH': return pad(h, 2)
      case 'h': return String(h % 12 || 12)
      case 'hh': return pad(h % 12 || 12, 2)
      case 'k': return String(h || 24)
      case 'kk': return pad(h || 24, 2)
      case 'm': return String(m)
      case 'mm': return pad(m, 2)
      case 'A': return pm ? 'PM' : 'AM'
      case 'a': return pm ? 'pm' : 'am'
      case 'AA': return pm ? 'P' : 'A'
      default: return pm ? 'p' : 'a'
    }
  })
}

/** Why a format can't be used, or `null` if it can. */
export function timeFormatProblem(format: string): string | null {
  if (!format.trim()) return 'Enter a format'
  if (format.length > 40) return 'That format is too long'
  const tokens = [...format.matchAll(TOKEN)].filter((t) => t[1] === undefined).map((t) => t[0])
  if (!tokens.some((t) => HOUR_TOKEN.test(t))) return 'It needs an hour: h, hh, H or HH'
  if (!tokens.some((t) => t === 'm' || t === 'mm')) return 'It needs minutes: mm'
  return null
}
