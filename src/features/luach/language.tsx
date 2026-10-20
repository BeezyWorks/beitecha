import { makeT, type Language, type NameStyle } from '@beitecha/engine'
import React, { createContext, useContext, useMemo } from 'react'

export { makeT }

interface Wording {
  language: Language
  timeFormat?: string
  /** Resolved with `nameStyle()`; absent = what `language` implies. */
  names?: NameStyle
}

const LanguageContext = createContext<Wording>({ language: 'en' })

/** The language and time format of a shul's public page or display (its `settings`). */
export function LanguageProvider({
  language = 'en',
  timeFormat,
  names,
  children,
}: Wording & { children: React.ReactNode }) {
  const value = useMemo(() => ({ language, timeFormat, names }), [language, timeFormat, names])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

/** Everything a viewer surface writes (the engine's `makeT`), in the wording of the enclosing `LanguageProvider`. */
export function useT() {
  const { language, timeFormat, names } = useContext(LanguageContext)
  return makeT(language, timeFormat, names)
}
