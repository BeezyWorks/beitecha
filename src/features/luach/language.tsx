import {
  formatTime,
  localize,
  nameStyle,
  parseDate,
  type DateString,
  type DaySchedule,
  type Language,
  type Localized,
  type NameStyle,
  type Weekday,
  type ZmanId,
} from '@beitecha/engine'
import React, { createContext, useContext, useMemo } from 'react'

import { civilDate, civilDateShort, clock, untilText } from './format'
import { WEEKDAYS, WEEKDAY_SHORT, ZMAN_LABELS } from './labels'

const STRINGS = {
  en: {
    cancelled: 'Cancelled',
    sponsored: 'Sponsored',
    announcement: 'Announcement',
    next: 'Next',
    tomorrow: 'Tomorrow',
    comingUp: 'Coming up',
    shabbos: 'Shabbos',
    parshas: 'Parshas',
    today: 'Today',
    thisWeek: 'This week',
    zmanim: 'Zmanim',
    allZmanim: 'All zmanim',
    fewer: 'Fewer',
    noMinyanim: 'No minyanim listed today.',
    keepTimes: 'Keep these times with you',
    addToCalendar: 'Add to my calendar',
    scanToOpen: 'Scan to open this page on your phone. ',
    calendarUpdates: 'Calendar times update by themselves when the shul changes them.',
    showOnMonitor: 'Show on a monitor',
    gabbaiSignIn: 'Gabbai sign-in',
    timesOnPhone: 'Times on your phone',
    erevShabbos: 'Erev Shabbos',
    weekdays: 'Weekdays',
    zmanimThisWeek: 'Zmanim this week',
    sponsorships: 'Sponsorships',
    announcements: 'Announcements',
    upToDate: 'Always up to date: scan for this week’s times.',
  },
  he: {
    cancelled: 'בוטל',
    sponsored: 'בחסות',
    announcement: 'הודעה',
    next: 'הבא',
    tomorrow: 'מחר',
    comingUp: 'בקרוב',
    shabbos: 'שבת',
    parshas: 'פרשת',
    today: 'סדר היום',
    thisWeek: 'השבוע',
    zmanim: 'זמנים',
    allZmanim: 'כל הזמנים',
    fewer: 'פחות',
    noMinyanim: 'אין תפילות היום.',
    keepTimes: 'הזמנים שלנו אצלך',
    addToCalendar: 'הוסף ללוח השנה שלי',
    scanToOpen: 'סרקו כדי לפתוח את הדף בטלפון. ',
    calendarUpdates: 'הזמנים בלוח השנה מתעדכנים מעצמם כשבית הכנסת משנה אותם.',
    showOnMonitor: 'הצג על מסך',
    gabbaiSignIn: 'כניסת גבאי',
    timesOnPhone: 'הזמנים בטלפון',
    erevShabbos: 'ערב שבת',
    weekdays: 'ימות החול',
    zmanimThisWeek: 'זמני השבוע',
    sponsorships: 'הקדשות',
    announcements: 'הודעות',
    upToDate: 'סרקו לזמנים המעודכנים של השבוע.',
  },
} as const satisfies Record<Language, Record<string, string>>

const HE_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת']

const HE_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
]

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

const cache = new Map<string, ReturnType<typeof build>>()

/** Everything a viewer surface writes, in the given language (for code outside the provider). */
export function makeT(lang: Language = 'en', timeFormat?: string, names?: NameStyle) {
  const style = nameStyle({ language: lang, names })
  const key = `${lang}|${timeFormat ?? ''}|${style}`
  let t = cache.get(key)
  if (!t) cache.set(key, (t = build(lang, timeFormat, style)))
  return t
}

/** Everything a viewer surface writes, in the wording of the enclosing `LanguageProvider`. */
export function useT() {
  const { language, timeFormat, names } = useContext(LanguageContext)
  return makeT(language, timeFormat, names)
}

function build(lang: Language, timeFormat: string | undefined, names: NameStyle) {
  const he = lang === 'he'
  const s = STRINGS[lang]
  /** Names (minyanim, zmanim, parsha, holidays, notices) can be in another language than the labels. */
  const nameLang: Language = names === 'he' ? 'he' : 'en'
  const text = (l: Localized) => localize(l, nameLang)
  const label = (l: Localized) => localize(l, lang)
  return {
    lang,
    names,
    /** Names show in English with the Hebrew beside them. */
    bothNames: names === 'both',
    /** Hebrew pages are laid out right to left. */
    rtl: he,
    /** A name set by `text` is Hebrew. */
    nameRtl: nameLang === 'he',
    s,
    /** A name in the shul's names language (not the labels'). */
    text,
    /** The shul's time format, or plain `3:05` when it hasn't picked one. */
    customTimeFormat: timeFormat,
    clock: (minutes: number) => (timeFormat ? formatTime(minutes, timeFormat) : clock(minutes)),
    weekday: (d: Weekday) => label(WEEKDAYS[d]),
    /** `Mon` / `ב׳` */
    weekdayShort: (d: Weekday) => (he ? HE_WEEKDAYS_SHORT[d] : WEEKDAY_SHORT[d]),
    zman: (id: ZmanId) => text(ZMAN_LABELS[id]),
    /** `October 19` / `19 באוקטובר` */
    date: (date: DateString) => {
      if (!he) return civilDate(date)
      const { month, day } = parseDate(date)
      return `${day} ב${HE_MONTHS[month - 1]}`
    },
    /** `Oct 19` / `19 באוק׳` */
    dateShort: (date: DateString) => {
      if (!he) return civilDateShort(date)
      const { month, day } = parseDate(date)
      return `${day} ב${HE_MONTHS[month - 1].slice(0, 3)}׳`
    },
    /** "in 23 min" / "בעוד 23 דק׳" */
    until: (minutes: number) => {
      if (!he) return untilText(minutes)
      if (minutes <= 0) return 'עכשיו'
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return `בעוד ${h ? `${h} שע׳${m ? ` ${m} דק׳` : ''}` : `${m} דק׳`}`
    },
    /** The parsha of a Shabbos: "Parshas Noach" / "פרשת נח". */
    parsha: (day: Pick<DaySchedule, 'parsha'>) =>
      day.parsha ? `${STRINGS[nameLang].parshas} ${text(day.parsha)}` : undefined,
    /** The weekday, or on Shabbos its parsha: "Shabbos Noach" / "שבת נח". */
    dayTitle: (day: Pick<DaySchedule, 'weekday' | 'parsha'>) =>
      day.weekday === 6 && day.parsha
        ? `${STRINGS[nameLang].shabbos} ${text(day.parsha)}`
        : label(WEEKDAYS[day.weekday]),
  }
}
