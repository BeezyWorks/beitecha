import { Calendar, addDays, todayIn, type Schedule, type ShulProfile } from '@beitecha/engine'

const DAYS = 60

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

const stamp = (date: string, minutes: number) =>
  `${date.replace(/-/g, '')}T${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}00`

/** Lines over 75 octets are folded (RFC 5545 §3.1). */
const fold = (line: string) => {
  const out: string[] = []
  let rest = line
  while (new TextEncoder().encode(rest).length > 75) {
    let cut = 74
    while (new TextEncoder().encode(rest.slice(0, cut)).length > 74) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

/** The next two months of the shul's public times as an iCalendar feed. */
export function icsFeed(slug: string, profile: ShulProfile, schedule: Schedule, host: string, now = new Date()): string {
  const tz = schedule.settings.location.timeZone
  const cal = new Calendar(schedule)
  const from = todayIn(tz, now)
  const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BeezyWorks//Beitecha//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(profile.name.en)}`,
    `X-WR-TIMEZONE:${tz}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
  ]
  for (let i = 0; i < DAYS; i++) {
    const date = addDays(from, i)
    for (const o of cal.occurrences(date)) {
      if (o.cancelled || o.minutes === null) continue
      const length = o.kind === 'shiur' ? 45 : 30
      lines.push(
        'BEGIN:VEVENT',
        `UID:${o.eventId}-${date}@${host}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;TZID=${tz}:${stamp(date, o.minutes)}`,
        `DURATION:PT${length}M`,
        `SUMMARY:${escape(o.name.en)}`,
        ...(o.room ? [`LOCATION:${escape(o.room)}`] : []),
        ...(o.note ? [`DESCRIPTION:${escape(o.note.en)}`] : []),
        `URL:https://${host}/${slug}`,
        'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
