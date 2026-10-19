import type { BrandPalette } from '@beezyworks/design'

/** Beitecha's own hue: the Siddur's blue, so the family reads as one. A shul's page and display use the shul's brand color instead. */
export const BEITECHA_BLUE = '#3E7FD1'

const isHex = (c: string | undefined): c is `#${string}` => !!c && /^#[0-9a-f]{6}$/i.test(c)

export const brandFor = (color?: string): BrandPalette => ({ primary: isHex(color) ? color : BEITECHA_BLUE })
