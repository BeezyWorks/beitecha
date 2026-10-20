import { FontFamily } from '@beezyworks/design'

const HEBREW = 'U+0590-05FF, U+FB1D-FB4F'

/**
 * Cardo Bold, the header face, draws most of its Hebrew at regular weight, so a Hebrew
 * heading comes out half bold, half thin. On the web a later `@font-face` with the same
 * family and a `unicode-range` wins for that range: this one sets Cardo Bold's Hebrew in
 * Frank Ruhl Libre Bold and leaves its Latin alone. Call once the DL's fonts are loaded.
 *
 * Appended to expo-font's own style element so it always comes after Cardo's rule.
 */
export function pairHebrewHeaders() {
  if (typeof document === 'undefined') return
  const style = document.getElementById('expo-generated-fonts')
  const css = style?.textContent ?? ''
  const marker = `/* ${FontFamily.CardoBold} hebrew */`
  if (!style || css.includes(marker)) return
  const src = css.match(
    new RegExp(`font-family:"${FontFamily.FrankRuhlLibreBold}";src:(url\\([^)]*\\))`),
  )?.[1]
  if (!src) return
  style.appendChild(
    document.createTextNode(
      `${marker}@font-face{font-family:"${FontFamily.CardoBold}";src:${src};unicode-range:${HEBREW};font-display:auto}`,
    ),
  )
}
