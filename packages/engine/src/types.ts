/** A civil date in the shul's own time zone, `YYYY-MM-DD`. */
export type DateString = string

/** Minutes since local midnight in the shul's time zone (e.g. 6:30 → 390). */
export type Minutes = number

/** 0 = Sunday … 6 = Shabbos. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Localized {
  en: string
  he?: string
}

/** The language a shul's public page, display and calendar feed are written in. */
export type Language = 'en' | 'he'

/** Which language names (minyanim, zmanim, parsha, holidays, notices) are shown in; `both` where there is room. */
export type NameStyle = Language | 'both'

// ---------------------------------------------------------------------------
// Shul settings

export interface ShulLocation {
  latitude: number
  longitude: number
  /** Meters above sea level. Only used when `zmanim.useElevation` is on. */
  elevation?: number
  /** IANA zone, e.g. `America/New_York`. */
  timeZone: string
  /** Israel holiday schedule (one day Yom Tov). */
  israel: boolean
}

export interface ZmanimSettings {
  /** Minutes before sunset. Default 18. */
  candleLightingMinutes?: number
  /** Sun angle below the horizon for tzeis. Default 8.5. */
  tzeisAngle?: number
  /** Motzei Shabbos/Yom Tov: a sun angle, or fixed minutes after sunset. Default 8.5°. */
  havdalah?: { angle: number } | { minutes: number }
  /** When a public fast ends (siyum hatzom): a sun angle, or fixed minutes after sunset. Default 6.45°, as in the Siddur. */
  fastEnds?: { angle: number } | { minutes: number }
  useElevation?: boolean
  /** Zmanim the shul doesn't show on the display, public page or ICS (built-in or custom). Rules can still use them. */
  hidden?: ZmanKey[]
  /** The shul's own zmanim, beside the built-in ones. */
  custom?: CustomZman[]
}

/**
 * Where the sun is: rising, setting, or `degrees` below the horizon (negative = above) in the morning or evening.
 * Sunrise and sunset follow the zman's `elevation`; angles are always from sea level.
 */
export type SunPosition = 'sunrise' | 'sunset' | { degrees: number; at: 'morning' | 'evening' }

/** Another custom zman, by id. Only one counted straight from the sun in fixed minutes (an alos or a tzeis). */
export type ZmanRef = { zman: string }

/**
 * A zman the shul defines: `minutes` from a sun position (or from another custom zman), in clock minutes or, with
 * `zmani`, in minutes of a sha'a zmanis (1/720 of the day from `zmani.start` to `zmani.end`). Sof zman Shema of the
 * Magen Avraham by 16.1° is 180 zmani minutes from alos 16.1°, the day running from alos 16.1° to tzeis 16.1°.
 */
export interface CustomZman {
  /** What rules say (`{ zman: id }`): a letter, then letters and digits; never a built-in id. */
  id: string
  name: { he: string; en?: string }
  from: SunPosition | ZmanRef
  /** After `from`; negative = before. Default 0. */
  minutes?: number
  /** Count `minutes` as zmani minutes of the day from `start` (sunrise or an alos) to `end` (sunset or a tzeis). */
  zmani?: { start: 'sunrise' | ZmanRef; end: 'sunset' | ZmanRef }
  /** A time to act by (a sof zman): rounds down. Otherwise it rounds up, like alos or tzeis. */
  deadline?: boolean
  /**
   * Its sunrise and sunset (in `from` and its zmani day) as seen from the shul's `location.elevation`, or from sea
   * level. Absent: the shul's `useElevation`. Sun angles are always from sea level.
   */
  elevation?: boolean
}

export type SelichosMinhag = 'ashkenaz' | 'sefard' | 'none'

/** The nusach a selichos minyan says; it follows that nusach's own selichos days (see `isSelichosDay`). */
export type SelichosNusach = Exclude<SelichosMinhag, 'none'>
export const SELICHOS_NUSACHIM = ['ashkenaz', 'sefard'] as const satisfies readonly SelichosNusach[]

/**
 * When a local (civil) holiday falls. Hebcal knows nothing of Thanksgiving or a UK
 * bank holiday, so the shul lists the ones it cares about.
 */
export type LocalHolidayDate =
  /** The same civil date every year. `observed` moves a weekend one to the nearest weekday
   * (`nearest`: Saturday → Friday, Sunday → Monday, as in the US) or the next free one
   * (`next`: as in the UK, where a holiday already taken by another is skipped). */
  | { month: number; day: number; observed?: 'nearest' | 'next' }
  /** The `nth` (1–4, or -1 for the last) `weekday` of `month`, e.g. Thanksgiving. */
  | { month: number; weekday: Weekday; nth: 1 | 2 | 3 | 4 | -1 }
  /** The last `weekdayBefore` strictly before a date, e.g. Victoria Day (the Monday before 25 May). */
  | { month: number; day: number; weekdayBefore: Weekday }
  /** Days after (negative: before) Western Easter, e.g. Good Friday is -2. */
  | { easter: number }
  /** Exact dates, for anything that follows no rule (a one-off royal occasion). */
  | { on: DateString[] }

/** Israel has none: its legal holidays are the Jewish ones Hebcal already knows. */
export type CivilCalendar = 'us' | 'uk' | 'ca' | 'ca-qc' | 'fr' | 'none'

export interface LocalHoliday {
  /** Referenced by `{ localHoliday: id }` conditions. */
  id: string
  name: Localized
  date: LocalHolidayDate
}

export interface ShulSettings {
  location: ShulLocation
  /** Default `en`. `he` shows Hebrew names and labels only (falling back to English where there is none). */
  language?: Language
  /**
   * Names can differ from the rest, e.g. English dates and "Coming up" but Hebrew minyan and parsha
   * names. Default: `both` when `language` is `en`, `he` when it is `he`.
   */
  names?: NameStyle
  /** How times are written, in moment tokens (see `timeFormat.ts`). Default `h:mm`. */
  timeFormat?: string
  zmanim?: ZmanimSettings
  /**
   * Built-in civil calendar. Absent = by time zone (US zones → `us`, Europe/London → `uk`).
   * Its holidays, and `localHolidays`, are tagged `legalHoliday`.
   */
  civilHolidays?: CivilCalendar
  /** Built-in holidays this shul doesn't count (by id), e.g. `columbus-day`. */
  ignoredHolidays?: string[]
  /** The shul's own extras (or replacements: the same id overrides a built-in one). */
  localHolidays?: LocalHoliday[]
  /** Which selichos period the `selichos` day tag follows. Default `ashkenaz`. */
  selichos?: SelichosMinhag
  /** How many weeks ahead a one-time event is listed under "Coming up" unless its `announce` says otherwise. Default 3. */
  announceWeeks?: number
  /**
   * The shul's own headings for announcements ("Community", "School"), in order, beside the built-in mazal tovs and
   * condolences. The printed week groups announcements under them; the display and the Siddur tag each with its name.
   */
  noticeCategories?: NoticeCategory[]
  /** How the printed week looks. */
  print?: PrintSettings
  /** How the printed wall calendar looks and what's on it. */
  calendar?: CalendarPrintSettings
  /** Who leads the shul and how to reach it; all optional. The printed week can list it as a contact section. */
  contact?: ShulContact
  /** How the upcoming yahrzeits are titled and shown. */
  yahrzeits?: YahrzeitSettings
  /** How the upcoming birthdays and anniversaries are titled and shown. */
  birthdays?: OccasionSettings
  anniversaries?: OccasionSettings
  /**
   * The shul's display setups ("Main lobby", "Upstairs, portrait"), each at `/<slug>/display/<id>`. Absent or empty =
   * one default landscape setup, which `/<slug>/display` shows; otherwise that address shows the first.
   */
  displays?: DisplaySetup[]
}

/** The shul's rabbi, its rabbis emeritus and how to reach them and the office. Every part is optional. */
export interface ShulContact {
  rabbi?: string
  /** Rabbis emeritus, one name each. */
  emeritus?: string[]
  rabbiPhone?: string
  rabbiEmail?: string
  officePhone?: string
  officeEmail?: string
}

/** The parts a display can show or hide; absent from `DisplaySetup.blocks` = shown. */
export const DISPLAY_BLOCKS = [
  'next',
  'today',
  'shabbos',
  'zmanim',
  'notices',
  'yahrzeits',
  'birthdays',
  'anniversaries',
  'cholim',
  'specialZmanim',
  'qr',
] as const
export type DisplayBlock = (typeof DISPLAY_BLOCKS)[number]

export interface DisplaySetup {
  /** In the address: `/<slug>/display/<id>`. Lowercase letters, digits and dashes. */
  id: string
  /** What the gabbai calls it ("Upstairs, portrait"); never shown on the screen. */
  name: string
  /** Default `landscape`. */
  orientation?: 'landscape' | 'portrait'
  blocks?: Partial<Record<DisplayBlock, boolean>>
  /**
   * When this Shabbos takes the screen's main place: `auto` from Thursday's last Maariv (or erev Yom Tov's eve) to
   * Havdalah; `always`; or `never` (it stays a small panel). Default `auto`.
   */
  shabbosFocus?: 'auto' | 'always' | 'never'
  /** Default `light`. */
  theme?: 'light' | 'dark'
  /** OLED panels burn in: they get a dark theme by default and a wider drift. Default `unknown` (treated as LCD). */
  screen?: 'lcd' | 'oled' | 'unknown'
  /**
   * A black screen while the shul is quiet. `auto` (default): from an hour after the day's last event to an hour
   * before the next day's first. `off`, or set hours in the shul's time (`from` may be after `to`, past midnight).
   */
  sleep?: 'auto' | 'off' | { from: Minutes; to: Minutes }
}

/** Which of a yahrzeit's names are shown: the Hebrew name ("Menachem ben Maimon"), the display name ("Menachem Kohen"), or both. */
export type YahrzeitNames = 'both' | 'hebrew' | 'display'
/** Which date: the Hebrew one, the civil one, or both. */
export type YahrzeitDates = 'both' | 'hebrew' | 'english'

export interface YahrzeitSettings {
  /** The heading over the list. Default "Upcoming yahrzeits". */
  title?: Localized
  /** Default `both`. */
  names?: YahrzeitNames
  /** Default `both`. */
  dates?: YahrzeitDates
  /** How many days ahead (counting today) a yahrzeit is listed on the display and the Siddur. Default 7; the printed week lists its own days. */
  days?: number
}

/** How a list of birthdays or anniversaries looks; each person shows by the calendar they were entered in (`Occasion.by`). */
export interface OccasionSettings {
  /** The heading over the list. Default "Upcoming birthdays" / "Upcoming anniversaries". */
  title?: Localized
  /** Default `both`. */
  names?: YahrzeitNames
  /** How many days ahead (counting today) one is listed on the display and the Siddur. Default 7; the printed week lists its own days. */
  days?: number
}

/** The parts of the printed week, in their automatic order. */
export const BULLETIN_SECTIONS = [
  'shabbos',
  'specialZmanim',
  'weekdays',
  'zmanimTable',
  'shiurim',
  'programs',
  'comingUp',
  'sponsors',
  'simcha',
  'condolence',
  'announcements',
  'yahrzeits',
  'cholim',
  'birthdays',
  'anniversaries',
  'contact',
] as const
/**
 * Sections that once held several (`notices`: all sponsors and announcements; `remembrance`: yahrzeits and the refuah
 * shleimah list; `celebrations`: birthdays and anniversaries). A saved layout may still name them; they stand for the
 * parts that replaced them, in place.
 */
export const LEGACY_BULLETIN_SECTIONS = ['notices', 'remembrance', 'celebrations'] as const
/** A shul's own announcement category (`category:<id>`) is a section of its own. */
export type BulletinSection =
  | (typeof BULLETIN_SECTIONS)[number]
  | (typeof LEGACY_BULLETIN_SECTIONS)[number]
  | `category:${string}`

/** Which pages of the printed week carry a header or footer. */
export type BandPages = 'all' | 'first' | 'last' | 'off'

/**
 * The header or footer of the printed week: who the shul is and how to reach it. The header starts from the shul's
 * name and address; the footer shows only what is filled in, plus (unless `qr` says otherwise) the link to the
 * shul's page in the Siddur.
 */
export interface BulletinBand {
  /** Default `first` for the header (beside the week's dates), `last` for the footer. */
  pages?: BandPages
  /** A small picture on the left: an image address, or a data URL of an uploaded one. */
  logo?: string
  /** Instead of the shul's name. */
  name?: Localized
  rabbi?: string
  /** Instead of the shul's address (header), or the address to print (footer). */
  address?: string
  officePhone?: string
  rabbiPhone?: string
  email?: string
  /**
   * A QR code with what scanning it does. Absent: the shul's Siddur page (footer only). `false`: none. `url` blank:
   * the Siddur page again, with the given `label`.
   */
  qr?: { url?: string; label?: string } | false
}

export type CalendarBasis = 'civil' | 'hebrew'

/** The kinds of holiday a printed calendar can turn off together. */
export type CalendarGroup = 'yomTov' | 'cholHamoed' | 'fast' | 'minor' | 'other' | 'israeli' | 'civil'

/** The printed wall calendar: a month to a sheet, with the shul's holidays, zmanim, events and people. */
export interface CalendarPrintSettings {
  /** The calendar the months and the big numbers are; the other is small. Default `civil`. */
  basis?: CalendarBasis
  /** Default `letter`. */
  paper?: 'letter' | 'a4' | 'tabloid' | 'a3'
  /** Default `landscape`. */
  orientation?: 'portrait' | 'landscape'
  /** `color` (default) or black ink only. */
  ink?: 'color' | 'mono'
  /** Kinds of holiday left off. */
  hiddenGroups?: CalendarGroup[]
  /** Individual holidays (or families of them, every Rosh Chodesh) left off, by `CalendarHoliday.id`. */
  hiddenHolidays?: string[]
  /** The parsha on Shabbos. Default true. */
  parsha?: boolean
  /** The day of the omer. Default true. */
  omer?: boolean
  /** Candle lighting and havdalah on the days they fall. Default true. */
  restTimes?: boolean
  /** When a fast begins and ends. Default true. */
  fastTimes?: boolean
  /** Zmanim on every day. */
  dayZmanim?: ZmanKey[]
  /** Zmanim on Shabbos and Yom Tov only. */
  restZmanim?: ZmanKey[]
  /** The shul's own events (minyanim, shiurim, programs) written on the days they happen, by event id. Default none. */
  events?: string[]
  /** One-time events written on their day, whether or not the event is picked. Default true. */
  oneTime?: boolean
  /** Yahrzeits, birthdays and anniversaries on their days. Default true each. */
  yahrzeits?: boolean
  birthdays?: boolean
  anniversaries?: boolean
  /** People (by yahrzeit/birthday/anniversary id) left off. */
  hiddenPeople?: string[]
  /** Text under every month. */
  footer?: string
  /** Text under one month instead of `footer`, by the month's first day (`2026-11-01`). */
  monthFooters?: Record<string, string>
}

export interface PrintSettings {
  /** The first day of the usual bulletin, 0 (Sunday) to 6 (Shabbos). Default 0. */
  weekStart?: Weekday
  /** The last day of the usual bulletin; before `weekStart` means the next week (Friday to Thursday is 5 to 4). Default 6. */
  weekEnd?: Weekday
  /** Top of the sheet, by default on the first page only. */
  header?: BulletinBand
  /** Bottom of the sheet, by default on the last page only. */
  footer?: BulletinBand
  /** The week's zmanim, day by day, on the front. Default true. */
  zmanimTable?: boolean
  /** The week's shiurim, with the announcements. Default true. */
  shiurim?: boolean
  /** The week's weekday programs (mahjong, kiddush clubs), with the announcements. Default true. */
  programs?: boolean
  /** Starred events coming up after this week. Default true. */
  comingUp?: boolean
  /** Sponsorships and announcements. Default true. */
  notices?: boolean
  /** The week's yahrzeits. Default true. */
  yahrzeits?: boolean
  /** The week's birthdays and anniversaries. Default true. */
  birthdays?: boolean
  anniversaries?: boolean
  /** The refuah shleimah list. Default true. */
  cholim?: boolean
  /** The contact section: the rabbi, rabbis emeritus, phones and emails from the shul's settings. Default true. */
  contact?: boolean
  /** Below Shabbos, in weeks with a fast (when it begins and ends) or Erev Pesach (chametz); Tish'a B'Av adds chatzos. Default true. */
  specialZmanim?: boolean
  /**
   * How many pages the sheet may run to, or `'unlimited'`. The content is shrunk to fit; unlimited keeps it at
   * full size and adds pages as needed. Default 2 (a second page only when there are announcements).
   */
  pages?: number | 'unlimited'
  /**
   * Which page each section goes on, and in what order: the list's order is the order on the page. Absent = the
   * automatic layout (times on the front, announcements behind). Sections left out of the list go after the
   * listed ones, on the last page; empty sections and pages are dropped.
   */
  layout?: { section: BulletinSection; page: number }[]
  /** Day names (`BULLETIN_DAY_NAMES` keys) left out of the weekday grid's column headings. Default none. */
  hideDays?: string[]
  /** Text size on the sheet as a multiple of normal (1), shrunk anyway where it wouldn't fit the pages. Default 1. */
  textSize?: number
  /** `color` (default) tints headings and rules with the shul's brand color; `mono` is black ink only, for copiers. */
  ink?: 'color' | 'mono'
  /**
   * Zmanim listed among Friday night's minyanim and Shabbos day's, each at its time (built-in or custom, shown even
   * when `zmanim.hidden`). Default candle lighting and havdalah.
   */
  shabbosZmanim?: { friday: ZmanKey[]; shabbos: ZmanKey[] }
}

/** Minor days a shul may not want named in the printed week's headings: each matches the English name's start. */
export const BULLETIN_DAY_NAMES: { key: string; label: string }[] = [
  { key: 'Rosh Chodesh', label: 'Rosh Chodesh' },
  { key: 'Yom Kippur Katan', label: 'Yom Kippur Katan' },
  { key: 'Chanukah', label: 'Chanukah (each day)' },
  { key: 'Erev', label: 'Erev Pesach, Sukkos, etc.' },
  { key: 'Shushan Purim', label: 'Shushan Purim' },
  { key: 'Purim Katan', label: 'Purim Katan' },
  { key: 'Tu BiShvat', label: 'Tu BiShvat' },
  { key: 'Lag BaOmer', label: 'Lag BaOmer' },
  { key: 'Tu B\'Av', label: 'Tu B’Av' },
  { key: 'Pesach Sheni', label: 'Pesach Sheni' },
  { key: 'Leil Selichot', label: 'Leil Selichot' },
]

/** The zmanim the printed week lists among Friday night's and Shabbos day's minyanim. */
export const DEFAULT_SHABBOS_ZMANIM: NonNullable<PrintSettings['shabbosZmanim']> = {
  friday: ['candleLighting'],
  shabbos: ['havdalah'],
}

/** A heading a shul files announcements under. Old clients show its notices as plain announcements. */
export interface NoticeCategory {
  id: string
  name: Localized
}

// ---------------------------------------------------------------------------
// Zmanim

export const ZMAN_IDS = [
  'alos',
  'misheyakir',
  'sunrise',
  'sofZmanShmaMga',
  'sofZmanShma',
  'sofZmanTefilaMga',
  'sofZmanTefila',
  'chatzos',
  'minchaGedola',
  'minchaKetana',
  'plag',
  'candleLighting',
  'sunset',
  'tzeis',
  'havdalah',
  'fastEnds',
] as const
export type ZmanId = (typeof ZMAN_IDS)[number]

/** A built-in zman, or the id of one of the shul's `settings.zmanim.custom`. */
export type ZmanKey = ZmanId | (string & {})

/** A day's zmanim by id, built-in and custom. */
export type ZmanTimes = Partial<Record<ZmanId, Minutes>> & { [id: string]: Minutes | undefined }

// ---------------------------------------------------------------------------
// Day conditions

/**
 * Tags describing a civil day. A day's tags come from the Hebrew date that
 * starts at its *morning* — so Friday is `erevShabbos`, and a Rosh Chodesh
 * that begins Sunday night tags Monday.
 */
export const DAY_TAGS = [
  'shabbos',
  'erevShabbos',
  'motzeiShabbos',
  'yomTov',
  'erevYomTov',
  'motzeiYomTov',
  'cholHamoed',
  'roshChodesh',
  /** The Shabbos on which the coming month is blessed. */
  'shabbosMevarchim',
  'fast',
  'chanukah',
  'purim',
  'noTachanun',
  'selichos',
  'aseresYemeiTeshuva',
  'omer',
  'dst',
  /** Any of the shul's local holidays. */
  'legalHoliday',
] as const
export type DayTag = (typeof DAY_TAGS)[number]

export type Condition =
  | { weekday: Weekday[] }
  | { tag: DayTag }
  /** A holiday by its Hebcal name, e.g. `Purim`, `Tish'a B'Av`, `Erev Pesach`. */
  | { holiday: string }
  /** One of the shul's `settings.localHolidays`, by id. */
  | { localHoliday: string }
  /** A yearly civil range, `MM-DD` inclusive; wraps the new year if `from > to`. */
  | { civil: { from: string; to: string } }
  /** A one-time civil range, `YYYY-MM-DD` inclusive. */
  | { dates: { from: DateString; to: DateString } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }

// ---------------------------------------------------------------------------
// Time expressions

/**
 * `withTrend` rounds the way the time is moving: down while it gets earlier from week to week
 * (autumn, for afternoon zmanim), up while it gets later; `againstTrend` the other way. A time
 * that isn't moving rounds to the nearest.
 */
export type RoundMode = 'down' | 'up' | 'nearest' | 'withTrend' | 'againstTrend'

export type TimeTest = 'before' | 'atOrBefore' | 'after' | 'atOrAfter'

export type TimeExpr =
  /** A fixed clock time, `HH:MM` 24-hour. */
  | { clock: string }
  | { zman: ZmanKey }
  /** Another event's time on the same day. */
  | { event: string }
  /** `of` plus `minutes` (negative = before). */
  | { offset: number; of: TimeExpr }
  | { earliest: TimeExpr[] }
  | { latest: TimeExpr[] }
  /** `value`, kept between `min` and `max`. */
  | { clamp: TimeExpr; min?: TimeExpr; max?: TimeExpr }
  /** Round to a multiple of `to` minutes. */
  | { round: TimeExpr; to: number; mode: RoundMode }
  /**
   * The same expression evaluated on each of `days` of this week (Sunday to
   * Shabbos), picking the earliest or latest, so the time stays put all week.
   * Days the expression has no value on are skipped.
   */
  | { weekly: TimeExpr; pick: 'earliest' | 'latest'; days?: Weekday[] }
  /**
   * `then` when `left` is `is` `right`, else `otherwise`. No `otherwise` (or one with no value) = no
   * time that day, so the event doesn't happen: "Mincha at 12:45 if that's after Mincha Gedola, else no minyan".
   * A side with no value that day makes the test false.
   */
  | { if: { left: TimeExpr; is: TimeTest; right: TimeExpr }; then: TimeExpr; otherwise?: TimeExpr }

// ---------------------------------------------------------------------------
// Events, exceptions, notices

/** `tefila` is a minyan, `shiur` a shiur, `other` any other event (a kiddush, a melava malka). */
export type EventKind = 'tefila' | 'shiur' | 'other'

/**
 * Which tefila a minyan davens. `minchaMaariv` is Mincha with Maariv straight after it. `selichos` happens only on
 * its `nusach`'s selichos days, however its rules read.
 */
export const TEFILA_TYPES = ['shacharis', 'mincha', 'maariv', 'minchaMaariv', 'selichos'] as const
export type TefilaType = (typeof TEFILA_TYPES)[number]

/**
 * What a non-minyan event is, for a viewer's filters. Old clients go by `kind` alone, so this sits beside it.
 * Absent: guessed from the name (a Kiddush is a `meal`), else `program`.
 */
export const EVENT_CATEGORIES = ['program', 'meal'] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

/** Who an event is for. Absent: guessed from the name ("Pirchei" is for kids), else everyone. */
export const AUDIENCES = ['everyone', 'men', 'women', 'kids', 'teens'] as const
export type Audience = (typeof AUDIENCES)[number]

/**
 * How people say when something is, by the minyanim around it: "after Maariv", "before Mincha",
 * "between Mincha and Maariv". Event ids.
 */
export type RelativeTo = { after: string } | { before: string } | { between: [string, string] }

export interface Rule {
  /** Absent = every day. */
  when?: Condition
  /** First day the rule is in force, `YYYY-MM-DD` inclusive. Absent = no start. Applies on top of `when`. */
  from?: DateString
  /** Last day the rule is in force, `YYYY-MM-DD` inclusive. Absent = no end. */
  to?: DateString
  /** `null` = the event doesn't happen on matching days. */
  time: TimeExpr | null
  /** When it ends on these days, e.g. Seudas Shlishis until shkia. Overrides the event's `duration`. */
  end?: TimeExpr
  /**
   * How the time is said. Absent: from `time` when it is another event's (or an offset of one), so 15 minutes
   * after Maariv is "after Maariv". `null`: just the time.
   */
  relative?: RelativeTo | null
  /**
   * No clock time at all: the event just follows another ("after Shacharis"). Needs `relative` to be an
   * `after`/`before` of a minyan, and `time` to be that minyan (`{ event }`), which only places it in the list.
   */
  untimed?: boolean
  note?: Localized
}

export interface EventDef {
  id: string
  /** What the display, the printed week and the Siddur show. */
  name: Localized
  /**
   * What the gabbai calls it in the admin, when the shown name doesn't tell it apart: "Shabbos Mincha" shown as
   * Mincha. Never shown to the public.
   */
  adminName?: string
  kind: EventKind
  /** Which tefila; every `tefila` event has one, other kinds none. */
  tefila?: TefilaType
  /** Which nusach a `selichos` minyan says (a shul may have one of each); other minyanim none. */
  nusach?: SelichosNusach
  /** Non-minyanim only. See `EventCategory`. */
  category?: EventCategory
  audience?: Audience
  /** Who exactly, in the shul's words: "Boys 1st–5th", "Ages 3–6 and 7–10". */
  ages?: Localized
  /** Who gives the shiur or runs the program. */
  speaker?: Localized
  /** What it's on: "Hilchos Shabbos", "Bava Kamma". */
  topic?: Localized
  /**
   * A paragraph about it under its name: "Exploring the parsha through the lens of the Maharal…". Shiurim set this
   * instead of `topic`; clients that don't know it show `topic` or nothing.
   */
  description?: Localized
  /** Minutes it lasts, when that's worth saying (youth groups 10:15–11:30). */
  duration?: number
  /** The room in the shul. */
  room?: string
  /** Somewhere else altogether: an address or a park, for an event that isn't at the shul. */
  location?: string
  /** An `https` link for details or to RSVP. */
  link?: string
  /** `internal` events can be referenced but are never shown. */
  visibility?: 'public' | 'internal'
  /**
   * Whether it is listed under "Coming up" with the announcements. Unset = the default: a one-time event from
   * `settings.announceWeeks` weeks before it (recurring events aren't). `true` = always, however far ahead (until it
   * has passed); `false` = never.
   */
  announce?: boolean
  /** First matching rule wins. No match = no occurrence. */
  rules: Rule[]
}

export type Exception =
  | { id: string; date: DateString; type: 'cancel'; eventId: string; note?: Localized }
  | {
      id: string
      date: DateString
      type: 'retime'
      eventId: string
      time: TimeExpr
      note?: Localized
    }
  | { id: string; date: DateString; type: 'note'; eventId: string; note: Localized }
  | {
      id: string
      date: DateString
      type: 'add'
      event: Omit<EventDef, 'rules'>
      time: TimeExpr
      end?: TimeExpr
      note?: Localized
    }

/**
 * `reminder`: something coming up ("Shul BBQ next Sunday"). `simcha`: a mazal tov. `condolence`: aveilus, shiva
 * and yahrzeits, shown quietly. Old clients show the new kinds as announcements.
 */
export const NOTICE_KINDS = ['sponsor', 'announcement', 'reminder', 'simcha', 'condolence'] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]

export interface Notice {
  id: string
  kind: NoticeKind
  /** First day shown. */
  from: DateString
  /**
   * Last day shown. Defaults to `from`, or for a notice about a one-time event (`eventId`), that event's day,
   * so a reminder takes itself down.
   */
  to?: DateString
  /** The event it's about: what a sponsorship is for (the kiddush, a shiur), or what a reminder is for. */
  eventId?: string
  /** An announcement's `NoticeCategory` (by id); absent or unknown = a plain announcement. */
  category?: string
  /** What a sponsorship without an event is for: the day (default, "today's learning") or the notices themselves. */
  sponsors?: 'day' | 'notices'
  title?: Localized
  /**
   * A sponsorship's who and why: "the Greenblat family", "in honor of her mother's third yahrzeit" (the words after
   * "in honor of"). The printed week shows `sponsoredBy` beside the event; `text` still holds the whole line, for
   * every other surface and for clients that don't know these.
   */
  sponsoredBy?: Localized
  inHonorOf?: Localized
  text: Localized
  /** An `https` link for details or to sign up. The admin keeps it to the first of `links`, for old clients. */
  link?: string
  /** Links with what scanning them does ("To sponsor", "Download the shiur"); the printed week prints each as a QR code. */
  links?: NoticeLink[]
}

export interface NoticeLink {
  /** What you're doing when you scan it: "To sponsor a kiddush", "Download the shiur". */
  title: Localized
  /** An `https` address. */
  url: string
}

/** Someone the shul davens for, by name and mother's name as said in a Mi Shebeirach: "Yosef Chaim ben Rivka". */
export interface Choleh {
  id: string
  /** Transliterated in `en`, in Hebrew in `he`; either one may be blank (use `cholehName`). */
  name: Localized
  /** When it went on the list (or was last confirmed), so the gabbai can ask about old names. */
  added: DateString
}

/** A Hebrew date. `month` is Hebcal's number: 1 Nisan … 6 Elul, 7 Tishrei … 11 Shevat, 12 Adar (Adar I in a leap year), 13 Adar II. */
export interface HebrewDate {
  day: number
  month: number
  year: number
}

/** Someone whose yahrzeit the shul keeps, listed in the days before it each year. */
export interface Yahrzeit {
  id: string
  /** The Hebrew name, in Hebrew letters: "מנחם בן מימון". */
  hebrewName?: string
  /** The name people know them by, in `en` and/or `he`: "Menachem Kohen" / "מנחם כהן". */
  displayName?: Localized
  /** The Hebrew day and month of the passing; the one the yahrzeit is kept by. The year is optional. */
  hebrew: HebrewMonthDay
  /** The civil date of the passing, if known (derived from `hebrew` when it has a year, or the one the gabbai entered). */
  gregorian?: DateString
  /** Keep this one off the printed bulletin (it still shows on the display and in the Siddur). */
  hideFromBulletin?: boolean
}

/** A Hebrew date; the year is optional for birthdays and anniversaries, which come back every year. */
export interface HebrewMonthDay {
  day: number
  /** Hebcal's numbering: 1 Nisan … 6 Elul, 7 Tishrei … 12 Adar (Adar I in a leap year), 13 Adar II. */
  month: number
  year?: number
}

export type OccasionKind = 'birthday' | 'anniversary'

/**
 * A birthday or an anniversary, kept by whichever calendar the gabbai chose. Only one date is needed: the other is
 * derived (a Hebrew date without a year has no civil date, and is kept by the Hebrew calendar).
 */
export interface Occasion {
  id: string
  /** Hebrew name(s) in Hebrew letters: "מנחם בן מימון", or for an anniversary "מנחם ושרה". */
  hebrewName?: string
  /** What people know them by, in `en` and/or `he`: "Menachem Kohen", "Menachem & Sarah Kohen". */
  displayName?: Localized
  hebrew?: HebrewMonthDay
  gregorian?: DateString
  /** Which date it is kept and shown by. Default: `hebrew`, unless only a civil date was given. */
  by?: 'hebrew' | 'gregorian'
  /** Keep this one off the printed bulletin (it still shows on the display and in the Siddur). */
  hideFromBulletin?: boolean
}

export interface Schedule {
  settings: ShulSettings
  events: EventDef[]
  exceptions: Exception[]
  notices: Notice[]
  /** The refuah shleimah list. Absent on schedules from before it. */
  cholim?: Choleh[]
  /** The yahrzeits the shul keeps. Absent on schedules from before them. */
  yahrzeits?: Yahrzeit[]
  /** Birthdays and anniversaries the shul keeps. Absent on schedules from before them. */
  birthdays?: Occasion[]
  anniversaries?: Occasion[]
}

// ---------------------------------------------------------------------------
// Output

/** An event a time is said by: its name that day and its time. */
export interface Anchor {
  eventId: string
  name: Localized
  minutes: Minutes
  /** Another event that day has the same name, so say its time too: "before the 9:00 Shacharis". */
  needsTime?: boolean
}

export type Relative =
  | { position: 'after' | 'before'; anchors: [Anchor] }
  | { position: 'between'; anchors: [Anchor, Anchor] }

export interface Occurrence {
  eventId: string
  name: Localized
  kind: EventKind
  tefila?: TefilaType
  nusach?: SelichosNusach
  /** Non-minyanim always have one: the event's, else guessed from its name. */
  category?: EventCategory
  /** The event's, else guessed from its name; absent = everyone. */
  audience?: Audience
  ages?: Localized
  speaker?: Localized
  topic?: Localized
  description?: Localized
  room?: string
  location?: string
  link?: string
  /** Null when cancelled or when the time couldn't be worked out (see `error`). */
  minutes: Minutes | null
  /** When it ends, if the shul said. */
  endMinutes?: Minutes
  /** "after Maariv": how the time is said, when it hangs on a minyan that happens that day. */
  relative?: Relative
  /** Say `relative` instead of a time: "after Shacharis". `minutes` is the anchor's, only for ordering. */
  untimed?: boolean
  cancelled: boolean
  note?: Localized
  source: 'rule' | 'exception' | 'added'
  /** Index of the rule that matched, for "why is it at this time?". */
  ruleIndex?: number
  error?: string
}

export interface DaySchedule {
  date: DateString
  weekday: Weekday
  hebrew: { day: number; month: string; year: number; en: string; he: string }
  /** Jewish holidays, then the shul's local ones. */
  holidays: Localized[]
  /** The coming (or current) Shabbos's parsha. */
  parsha?: Localized
  tags: DayTag[]
  zmanim: ZmanTimes
  /** Names of the shul's custom zmanim in `zmanim` (the built-ins' are `ZMAN_LABELS`). Use `zmanimList` to show them. */
  zmanNames?: Record<string, Localized>
  /** Public occurrences sorted by time; cancelled ones keep their place. */
  events: Occurrence[]
  notices: Notice[]
}

// ---------------------------------------------------------------------------
// The shul itself (stored beside its schedule)

export interface ShulProfile {
  name: Localized
  /** Street address, shown on the public page. */
  address?: string
  city?: string
  website?: string
  /** `#rrggbb`; the display and public page are tinted with it. */
  brandColor?: string
}
