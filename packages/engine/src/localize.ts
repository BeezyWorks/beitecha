import type { Localized, NameStyle, ShulSettings } from './types'

/** One language's text; Hebrew falls back to English where the shul gave no Hebrew. `both` is for layouts with two slots, so on a single line it is English. */
export function localize(text: Localized, style: NameStyle = 'en'): string {
  return (style === 'he' && text.he) || text.en
}

/** How a shul's names are shown: its `names` setting, else what its `language` implies. */
export function nameStyle({
  language,
  names,
}: Pick<ShulSettings, 'language' | 'names'>): NameStyle {
  return names ?? (language === 'he' ? 'he' : 'both')
}
