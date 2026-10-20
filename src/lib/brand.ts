import type { BrandPalette } from '@beezyworks/design'

/** Beitecha's own hue: the Siddur's blue, so the family reads as one. A shul's page and display use the shul's brand color instead. */
export const BEITECHA_BLUE = '#3E7FD1'

/** The design system throws unless the brand carries white text at this contrast. */
const MIN_CONTRAST = 3

const isHex = (c: string | undefined): c is `#${string}` => !!c && /^#[0-9a-f]{6}$/i.test(c)

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

const luminance = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrastOnWhite = (rgb: number[]) => 1.05 / (luminance(rgb) + 0.05)

const toHex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` as const

/** Darken (keeping the hue) until white text reads on it, so a pale pick can't break the page. */
export function readableBrand(color: `#${string}`): `#${string}` {
  let rgb = channels(color)
  for (let i = 0; i < 40 && contrastOnWhite(rgb) < MIN_CONTRAST; i++) {
    rgb = rgb.map((v) => v * 0.93)
  }
  return toHex(rgb)
}

export const brandFor = (color?: string): BrandPalette => ({
  primary: isHex(color) ? readableBrand(color) : BEITECHA_BLUE,
})
