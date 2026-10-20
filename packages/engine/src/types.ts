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
  useElevation?: boolean
  /** Zmanim the shul doesn't show on the display, public page or ICS. Rules can still use them. */
  hidden?: ZmanId[]
}

export type SelichosMinhag = 'ashkenaz' | 'sefard' | 'none'

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
] as const
export type ZmanId = (typeof ZMAN_IDS)[number]

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

export type TimeExpr =
  /** A fixed clock time, `HH:MM` 24-hour. */
  | { clock: string }
  | { zman: ZmanId }
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

// ---------------------------------------------------------------------------
// Events, exceptions, notices

export type EventKind = 'tefila' | 'shiur' | 'other'

export interface Rule {
  /** Absent = every day. */
  when?: Condition
  /** `null` = the event doesn't happen on matching days. */
  time: TimeExpr | null
  note?: Localized
}

export interface EventDef {
  id: string
  name: Localized
  kind: EventKind
  room?: string
  /** `internal` events can be referenced but are never shown. */
  visibility?: 'public' | 'internal'
  /** First matching rule wins. No match = no occurrence. */
  rules: Rule[]
}

export type Exception =
  | { id: string; date: DateString; type: 'cancel'; eventId: string; note?: Localized }
  | { id: string; date: DateString; type: 'retime'; eventId: string; time: TimeExpr; note?: Localized }
  | { id: string; date: DateString; type: 'note'; eventId: string; note: Localized }
  | {
      id: string
      date: DateString
      type: 'add'
      event: Omit<EventDef, 'rules'>
      time: TimeExpr
      note?: Localized
    }

export type NoticeKind = 'sponsor' | 'announcement'

export interface Notice {
  id: string
  kind: NoticeKind
  /** First day shown. */
  from: DateString
  /** Last day shown; defaults to `from`. */
  to?: DateString
  /** What a sponsorship is for (an event id), e.g. the kiddush or a shiur. */
  eventId?: string
  title?: Localized
  text: Localized
}

export interface Schedule {
  settings: ShulSettings
  events: EventDef[]
  exceptions: Exception[]
  notices: Notice[]
}

// ---------------------------------------------------------------------------
// Output

export interface Occurrence {
  eventId: string
  name: Localized
  kind: EventKind
  room?: string
  /** Null when cancelled or when the time couldn't be worked out (see `error`). */
  minutes: Minutes | null
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
  zmanim: Partial<Record<ZmanId, Minutes>>
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
