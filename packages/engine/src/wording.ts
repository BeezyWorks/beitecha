import { parseDate } from './dates'
import { WEEKDAYS, WEEKDAY_SHORT, ZMAN_LABELS } from './labels'
import { localize, nameStyle } from './localize'
import { formatTime } from './timeFormat'
import type { DateString, DaySchedule, Language, Localized, Minutes, NameStyle, Weekday, ZmanId } from './types'

/** `6:30` (no AM/PM) — shul schedules read better without it. */
export const clock = (m: Minutes) => {
  const h = Math.floor(m / 60) % 24
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')}`
}

export const ampm = (m: Minutes) => (Math.floor(m / 60) % 24 < 12 ? 'AM' : 'PM')

export const clockFull = (m: Minutes) => `${clock(m)} ${ampm(m)}`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `October 19` */
export const civilDate = (date: DateString) => {
  const { month, day } = parseDate(date)
  return `${MONTHS[month - 1]} ${day}`
}

/** `Oct 19` */
export const civilDateShort = (date: DateString) => {
  const { month, day } = parseDate(date)
  return `${MONTHS[month - 1].slice(0, 3)} ${day}`
}

/** "in 23 min", "in 1 hr 5 min" */
export const untilText = (minutes: number) => {
  if (minutes <= 0) return 'now'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `in ${h} hr${m ? ` ${m} min` : ''}` : `in ${m} min`
}

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
    timesOnPhone: 'Times on your phone, in the Siddur',
    erevShabbos: 'Erev Shabbos',
    weekdays: 'Weekdays',
    zmanimThisWeek: 'Zmanim this week',
    sponsorships: 'Sponsorships',
    announcements: 'Announcements',
    upToDate: 'Always up to date: scan for this week’s times in the Siddur.',
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
    timesOnPhone: 'הזמנים בטלפון, בסידור',
    erevShabbos: 'ערב שבת',
    weekdays: 'ימות החול',
    zmanimThisWeek: 'זמני השבוע',
    sponsorships: 'הקדשות',
    announcements: 'הודעות',
    upToDate: 'סרקו לזמנים המעודכנים של השבוע בסידור.',
  },
} as const satisfies Record<Language, Record<string, string>>

const HE_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת']

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export type Wording = ReturnType<typeof build>

const cache = new Map<string, Wording>()

/**
 * Everything a viewer surface (display, public page, print, the Siddur's shul page) writes, in a shul's language,
 * time format and names style (its `settings.language`, `timeFormat` and `names`).
 */
export function makeT(lang: Language = 'en', timeFormat?: string, names?: NameStyle): Wording {
  const style = nameStyle({ language: lang, names })
  const key = `${lang}|${timeFormat ?? ''}|${style}`
  let t = cache.get(key)
  if (!t) cache.set(key, (t = build(lang, timeFormat, style)))
  return t
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
      day.weekday === 6 && day.parsha ? `${STRINGS[nameLang].shabbos} ${text(day.parsha)}` : label(WEEKDAYS[day.weekday]),
  }
}
