import type { BrandPalette } from '@beezyworks/design'

/** Beitecha's own hue (cedar green). A shul's page and display use the shul's brand color instead. */
export const BEITECHA_GREEN = '#2e5a4f'

const isHex = (c: string | undefined): c is `#${string}` => !!c && /^#[0-9a-f]{6}$/i.test(c)

export const brandFor = (color?: string): BrandPalette => ({ primary: isHex(color) ? color : BEITECHA_GREEN })
