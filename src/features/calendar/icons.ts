import type { CalendarIcon } from '@beitecha/engine'

// Small icons for the days of a printed calendar, drawn in the style of Lucide: a 24 px grid, round 2 px strokes, no
// fill (but for the flames of a menorah, too small to outline). They take the ink of the day's text.

const svg = (body: string, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

/** A candle's flame, its base at (`x`, `y`). */
const flame = (x: number, y: number) =>
  `<path d="M${x} ${y}c-1.4-.9-1.9-2.4-1.3-3.9.3-.7.9-1.3 1.3-2.3.4 1 1 1.6 1.3 2.3.6 1.5.1 3-1.3 3.9z"/>`

const candle = (x: number) =>
  `<rect x="${x - 3}" y="13" width="6" height="8" rx="1"/>${flame(x, 10.5)}`

// The branches of a chanukiah, left to right, the shamash in the middle.
const BRANCHES = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => 2 + i * 2.5)
const SHAMASH = 4

const menorah = (night: number) => {
  // The nights' candles are the eight branches from the right.
  const lit = new Set(
    BRANCHES.map((_, i) => i)
      .filter((i) => i !== SHAMASH)
      .reverse()
      .slice(0, night),
  )
  const sticks = BRANCHES.map((x, i) => `<path d="M${x} 15V${i === SHAMASH ? 8.5 : 11.5}"/>`).join(
    '',
  )
  const flames = BRANCHES.map((x, i) =>
    i === SHAMASH
      ? `<circle cx="${x}" cy="5.5" r="1" fill="currentColor"/>`
      : lit.has(i)
        ? `<circle cx="${x}" cy="8.5" r=".85" fill="currentColor"/>`
        : '',
  ).join('')
  return svg(`<path d="M2 15h20M12 15v6M8 21h8"/>${sticks}${flames}`, 1.1)
}

const ICONS: Record<string, string> = {
  // Two candles: lit before Shabbos and Yom Tov.
  candles: svg(candle(7) + candle(17)),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`menorah${n}`, menorah(n)])),
}

export const iconSvg = (icon: CalendarIcon) => ICONS[icon]
