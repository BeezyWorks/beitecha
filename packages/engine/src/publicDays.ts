import { Calendar } from './schedule'
import { addDays, parseDate, utcOffsetAt } from './dates'
import { zmanimList } from './labels'
import { makeT } from './wording'
import type { Audience, DateString, DayTag, EventCategory, EventKind, Language, Minutes, NameStyle, Schedule, TefilaType, Weekday } from './types'

/** The most days one read covers. */
export const MAX_PUBLIC_DAYS = 62

/** A time of day: minutes since local midnight, and the same as an ISO string with that moment's UTC offset. */
export interface PublicTime {
  minutes: Minutes
  iso: string
}

export interface PublicEvent {
  id: string
  /** `<id>@<date>`, what writes take. */
  ref: string
  name: string
  kind: EventKind
  tefila?: TefilaType
  category?: EventCategory
  audience?: Audience
  /** Null for a cancelled event with no time. */
  time: PublicTime | null
  end?: PublicTime
  /** How the time is said ("after Maariv"), when the shul says it that way. */
  relative?: { position: 'after' | 'before' | 'between'; anchors: { id: string; name: string; time: PublicTime }[]; text: string }
  /** Follows another event with no time of its own. */
  untimed?: boolean
  cancelled: boolean
  note?: string
  source: 'rule' | 'exception' | 'added'
  ages?: string
  speaker?: string
  topic?: string
  description?: string
  room?: string
  location?: string
  link?: string
}

export interface PublicDay {
  date: DateString
  weekday: Weekday
  hebrew: { day: number; month: string; year: number; text: string }
  holidays: string[]
  parsha?: string
  tags: DayTag[]
  zmanim: { id: string; name: string; time: PublicTime }[]
  events: PublicEvent[]
}

export interface PublicDays {
  /** IANA zone every time here is in. */
  timeZone: string
  language: Language
  from: DateString
  to: DateString
  days: PublicDay[]
}

export interface ComputeDaysOptions {
  /** Default: the shul's `settings.language`. */
  lang?: Language
  /** Default: the shul's `settings.names`. */
  names?: NameStyle
  /** Leave zmanim out (an events-only read). Default: true. */
  zmanim?: boolean
}

const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

/**
 * A range of days as the public API gives them: computed times only (never rules, and never the yahrzeits, birthdays,
 * anniversaries or refuah names), events in the shul's language and names, internal events left out. `from` through
 * `to` inclusive, at most `MAX_PUBLIC_DAYS`.
 */
export function computeDays(schedule: Schedule, from: DateString, to: DateString, opts: ComputeDaysOptions = {}): PublicDays {
  parseDate(from)
  parseDate(to)
  const count = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  if (count < 1 || count > MAX_PUBLIC_DAYS) throw new RangeError(`from..to must cover 1 to ${MAX_PUBLIC_DAYS} days`)
  const { settings } = schedule
  const tz = settings.location.timeZone
  const language = opts.lang ?? settings.language ?? 'en'
  const t = makeT(language, settings.timeFormat, opts.names ?? (opts.lang ? undefined : settings.names))
  const cal = new Calendar(schedule)

  const days = Array.from({ length: count }, (_, i): PublicDay => {
    const date = addDays(from, i)
    const d = cal.day(date)
    const time = (minutes: Minutes): PublicTime => {
      const offset = utcOffsetAt(date, minutes, tz)
      const wall = new Date(Date.parse(`${date}T00:00:00Z`) + minutes * 60_000)
      const sign = offset < 0 ? '-' : '+'
      const pad = (n: number) => String(Math.trunc(n)).padStart(2, '0')
      const abs = Math.abs(offset)
      const iso = `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:00${sign}${pad(abs / 60)}:${pad(abs % 60)}`
      return { minutes, iso }
    }
    const events = d.events
      .filter((o) => o.minutes !== null || o.cancelled)
      .map((o): PublicEvent => {
        const l = (v: typeof o.note) => (v ? t.text(v) : undefined)
        return defined({
          id: o.eventId,
          ref: `${o.eventId}@${date}`,
          name: t.text(o.name),
          kind: o.kind,
          tefila: o.tefila,
          category: o.category,
          audience: o.audience,
          time: o.minutes === null ? null : time(o.minutes),
          end: o.endMinutes === undefined ? undefined : time(o.endMinutes),
          relative: o.relative && {
            position: o.relative.position,
            anchors: o.relative.anchors.map((a) => ({ id: a.eventId, name: t.text(a.name), time: time(a.minutes) })),
            text: t.relative(o.relative),
          },
          untimed: o.untimed,
          cancelled: o.cancelled,
          note: l(o.note),
          source: o.source,
          ages: l(o.ages),
          speaker: l(o.speaker),
          topic: l(o.topic),
          description: l(o.description),
          room: o.room,
          location: o.location,
          link: o.link,
        })
      })
    return defined({
      date,
      weekday: d.weekday,
      hebrew: { day: d.hebrew.day, month: d.hebrew.month, year: d.hebrew.year, text: language === 'he' ? d.hebrew.he : d.hebrew.en },
      holidays: d.holidays.map((h) => t.text(h)),
      parsha: t.parsha(d),
      tags: d.tags,
      zmanim: opts.zmanim === false ? [] : zmanimList(d).map((z) => ({ id: String(z.id), name: t.zman(z.id, d.zmanNames), time: time(z.minutes) })),
      events,
    })
  })
  return { timeZone: tz, language, from, to, days }
}
