import { QRCode, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  type Choleh,
  DAILY_ZMANIM,
  type DateString,
  type DaySchedule,
  type Localized,
  localize,
  noticeCategory,
  type Notice,
  type NoticeCategory,
  NOTICE_LABELS,
  type Occurrence,
  parseDate,
  type ShulProfile,
  type OccasionKind,
  type OccasionSettings,
  type UpcomingOccasion,
  type UpcomingYahrzeit,
  weekdayOf,
  type YahrzeitSettings,
  ZMAN_LABELS,
  type ZmanId,
  zmanimList,
  type ZmanKey,
} from '@beitecha/engine'
import React from 'react'

import { Struck } from '@/components/Print'
import { makeT, useT } from '@/features/luach/language'
import { SponsorName } from '@/features/luach/SponsorName'
import { hasSponsor, sponsorGroups } from '@/features/luach/sponsorGroups'
import {
  erevShabbosEvents,
  type InlineZman,
  shabbosGroups,
  type ShabbosGroup,
  type ShabbosRow,
} from '@/features/luach/shabbosGroups'
import { siddurShulUrl } from '@/lib/config'
import { Flow, type FlowItem } from './Flow'

const NAME_W = 180
const QR = 76
/** A notice's own QR codes, a little smaller than the shul's, each beside what scanning it does. */
const LINK_QR = 60
const LINK_W = 220
/** Headings are in Hebrew whenever the page or its names are, whatever the labels' language. */
const HE = makeT('he')
const HEBREW = /[\u0590-\u05FF]/
/** The sheet's own words, where the engine has none. */
const WORDS = {
  shabbosMorning: { en: 'Shabbos morning', he: 'שבת בבוקר' },
  shabbosAfternoon: { en: 'Shabbos afternoon', he: 'שבת אחר הצהריים' },
  changed: { en: 'Changed this week', he: 'שינויים השבוע' },
} satisfies Record<string, Localized>
/** Marks a time that was changed for this week only. */
const CHANGED = '◆'

export interface WeekProps {
  slug: string
  profile: ShulProfile
  /** Sunday to Shabbos. */
  days: DaySchedule[]
  notices: Notice[]
  /** The shul's announcement categories, each its own heading. */
  categories?: NoticeCategory[]
  /** Starred events from this week to their lead time (`Calendar.announced`). */
  comingUp: { date: DateString; event: Occurrence }[]
  /** The refuah shleimah list. */
  cholim: Choleh[]
  /** The yahrzeits kept this week, and how to show them. */
  yahrzeits: UpcomingYahrzeit[]
  yahrzeitSettings?: YahrzeitSettings
  /** The week's birthdays and anniversaries, and how to show them. */
  birthdays: UpcomingOccasion[]
  birthdaySettings?: OccasionSettings
  anniversaries: UpcomingOccasion[]
  anniversarySettings?: OccasionSettings
  /** The week's zmanim table on the front. */
  zmanimTable: boolean
  /** The week's shiurim on the announcements side. */
  shiurim: boolean
  /** Zmanim listed among Friday night's and Shabbos day's minyanim (`settings.print.shabbosZmanim`). */
  shabbosZmanim: { friday: InlineZman[]; shabbos: InlineZman[] }
}

/** Weekday shiurim have their own timetable with the announcements; the front's weekday grid keeps to the minyanim. */
const notShiur = (e: Occurrence) => e.kind !== 'shiur'

/** The days the shiurim list covers: Shabbos's (Friday from chatzos, and Shabbos itself) are on the Shabbos timeline. */
const shiurDays = (days: DaySchedule[]): DaySchedule[] => {
  const erevShabbos = erevShabbosEvents(days[5])
  return days
    .slice(0, 6)
    .map((d) =>
      d === days[5] ? { ...d, events: d.events.filter((e) => !erevShabbos.includes(e)) } : d,
    )
}

/** Whether the week has anything for the announcements side. */
export const hasAnnouncements = ({
  days,
  notices,
  comingUp,
  cholim,
  yahrzeits,
  birthdays,
  anniversaries,
  shiurim,
}: Pick<
  WeekProps,
  | 'days'
  | 'notices'
  | 'comingUp'
  | 'cholim'
  | 'yahrzeits'
  | 'birthdays'
  | 'anniversaries'
  | 'shiurim'
>) =>
  notices.length > 0 ||
  comingUp.length > 0 ||
  cholim.length > 0 ||
  yahrzeits.length > 0 ||
  birthdays.length > 0 ||
  anniversaries.length > 0 ||
  (shiurim && shiurDays(days).some((d) => d.events.some((e) => !notShiur(e))))

/** The front: the masthead, Shabbos, the weekday minyanim and the week's zmanim (and, `withNotices`, the rest). */
export function TimesSide({ withNotices, ...week }: WeekProps & { withNotices: boolean }) {
  const t = useT()
  const { days, notices } = week
  const friday = days[5]
  const erevShabbos = erevShabbosEvents(friday)
  const weekdays = days.slice(0, 6).map((d) => ({
    ...d,
    events: d.events.filter((e) => notShiur(e) && !(d === friday && erevShabbos.includes(e))),
  }))
  return (
    <Stack grow gap="lg">
      <Masthead {...week} />
      <ShabbosBlock
        friday={friday}
        shabbos={days[6]}
        notices={notices}
        zmanim={week.shabbosZmanim}
      />
      {withNotices && <Announcements {...week} />}
      <EventGrid days={weekdays} notices={notices} en={t.s.weekdays} he={HE.s.weekdays} />
      {week.zmanimTable && <ZmanimGrid days={days} />}
      <Stack grow />
      {withNotices && <Footer slug={week.slug} />}
    </Stack>
  )
}

/** The back: the week's shiurim, what's coming up, sponsorships and announcements. */
export function NoticesSide(week: WeekProps) {
  return (
    <Stack grow gap="lg">
      <Masthead {...week} />
      <Announcements {...week} />
      <Stack grow />
      <Footer slug={week.slug} />
    </Stack>
  )
}

/** The announcements side's parts in order, each a block that can start a page of its own. */
function announcementBlocks({
  days,
  notices,
  categories,
  comingUp,
  cholim,
  yahrzeits,
  yahrzeitSettings,
  birthdays,
  birthdaySettings,
  anniversaries,
  anniversarySettings,
  shiurim: showShiurim,
}: WeekProps): { key: string; node: React.ReactNode }[] {
  const blocks: { key: string; node: React.ReactNode }[] = []
  if (showShiurim && shiurDays(days).some((d) => d.events.some((e) => !notShiur(e))))
    blocks.push({ key: 'shiurim', node: <Shiurim days={shiurDays(days)} notices={notices} /> })
  if (comingUp.length > 0) blocks.push({ key: 'comingUp', node: <ComingUp items={comingUp} /> })
  if (notices.length > 0)
    blocks.push({
      key: 'notices',
      node: <Notices notices={notices} categories={categories ?? []} days={days} />,
    })
  if (yahrzeits.length > 0 || cholim.length > 0)
    blocks.push({
      key: 'remembrance',
      node: <Remembrance yahrzeits={yahrzeits} settings={yahrzeitSettings} cholim={cholim} />,
    })
  if (birthdays.length > 0 || anniversaries.length > 0)
    blocks.push({
      key: 'celebrations',
      node: (
        <Celebrations
          lists={[
            { kind: 'birthday', items: birthdays, settings: birthdaySettings },
            { kind: 'anniversary', items: anniversaries, settings: anniversarySettings },
          ]}
        />
      ),
    })
  return blocks
}

function Announcements(week: WeekProps) {
  const t = useT()
  return (
    <Stack gap="lg">
      {announcementBlocks(week).map((b) => (
        <React.Fragment key={b.key}>{b.node}</React.Fragment>
      ))}
    </Stack>
  )
}

/** The announcements side as a masthead, blocks and footer, for spreading over as many pages as it takes. */
export function useNoticesParts(week: WeekProps) {
  const t = useT()
  return {
    head: <Masthead {...week} />,
    blocks: announcementBlocks(week),
    foot: <Footer slug={week.slug} />,
  }
}

// ---------------------------------------------------------------------------

function Masthead({ profile, days }: WeekProps) {
  const t = useT()
  const [sunday, shabbos] = [days[0], days[6]]
  return (
    <Stack gap="sm">
      <Stack direction="row" align="end" gap="lg">
        <Stack grow width={0} gap="none">
          <Text
            variant="pageHeader"
            rtl={t.nameRtl && !!profile.name.he}
            align={t.rtl ? undefined : 'left'}
          >
            {t.text(profile.name)}
          </Text>
          {t.bothNames && !!profile.name.he && (
            <Text variant="itemHeader" rtl align="left" color={SemanticColor.TextAccent}>
              {profile.name.he}
            </Text>
          )}
          {!!(profile.address || profile.city) && (
            <Text variant="body" color={SemanticColor.TextSecondary}>
              {[profile.address, profile.city].filter(Boolean).join(', ')}
            </Text>
          )}
        </Stack>
        {/* The Gregorian and Hebrew ranges stacked on the same side, so they read as one date. */}
        <Stack align="end" gap="none">
          <Text
            variant="pageHeader"
            rtl={shabbos.parsha ? t.nameRtl : t.rtl}
            color={SemanticColor.TextPrimary}
          >
            {t.dayTitle(shabbos)}
          </Text>
          <Text variant={strong(t)} color={SemanticColor.TextSecondary}>
            {civilRange(t, sunday.date, shabbos.date)}
          </Text>
          <Text variant={strong(t)} rtl color={SemanticColor.TextSecondary}>
            {hebrewRange(sunday, shabbos)}
          </Text>
        </Stack>
      </Stack>
      <Stack height={3} radius="sm" background={SemanticColor.AccentPrimary} />
    </Stack>
  )
}

/**
 * Shabbos as one list in time order from Friday afternoon to Havdalah, in two balanced columns, the shul's
 * picked zmanim (candle lighting, havdalah) among the minyanim in italics.
 */
function ShabbosBlock({
  friday,
  shabbos,
  notices,
  zmanim,
}: {
  friday: DaySchedule
  shabbos: DaySchedule
  notices: Notice[]
  zmanim: WeekProps['shabbosZmanim']
}) {
  const t = useT()
  const groups = shabbosGroups(friday, shabbos, zmanim)
  if (groups.length === 0) return null
  const holidays = [...new Set([...friday.holidays, ...shabbos.holidays].map(t.text))]
  const sponsors = new Map([
    [friday.date, sponsorsOn(t, notices, friday)],
    [shabbos.date, sponsorsOn(t, notices, shabbos)],
  ])
  // A day's date goes on the first group of it only.
  const dated = new Set<DateString>()
  const items: FlowItem[] = groups.flatMap((g, i) => {
    const first = !dated.has(g.day.date)
    dated.add(g.day.date)
    return [
      {
        key: g.key,
        weight: 1.6,
        keep: true,
        start: true,
        node: <GroupHeading group={g} dated={first} spaced={i > 0} />,
      },
      ...g.rows.map((row) => {
        const sponsor = row.type === 'event' ? sponsors.get(g.day.date)?.get(row.key) : undefined
        return {
          key: `${g.key}|${row.key}`,
          weight: rowWeight(row, sponsor),
          node: <ShabbosRowView row={row} sponsor={sponsor} />,
        }
      }),
    ]
  })
  const changes = groups.flatMap((g) =>
    g.rows.flatMap((r) =>
      r.type === 'event' && isChange(r.event) ? [changeLine(t, g.day, r.event)] : [],
    ),
  )
  return (
    <Stack
      radius="lg"
      padding="md"
      gap="sm"
      borderWidth={1}
      borderColor={SemanticColor.AccentPrimary}
    >
      {holidays.length > 0 && (
        <Text variant="sectionHeader" rtl={t.nameRtl} color={SemanticColor.TextAccent}>
          {holidays.join(' · ')}
        </Text>
      )}
      <Flow items={items} />
      <ChangedNote lines={changes} />
    </Stack>
  )
}

/** About how many lines a row takes, for balancing the columns. */
function rowWeight(row: ShabbosRow, sponsor?: string) {
  if (row.type === 'zman') return 1
  return 1 + (row.event.note ? 0.7 : 0) + (sponsor ? 0.7 : 0)
}

/** "Friday", "Shabbos morning" or "Shabbos afternoon" under a rule, with the date (both calendars, together) on the first. */
function GroupHeading({
  group,
  dated,
  spaced,
}: {
  group: ShabbosGroup
  dated: boolean
  spaced: boolean
}) {
  const t = useT()
  const { day } = group
  const name =
    group.key === 'friday'
      ? { en: t.weekday(5), he: HE.weekday(5) }
      : group.key === 'morning'
        ? WORDS.shabbosMorning
        : WORDS.shabbosAfternoon
  return (
    <Ruled spaced={spaced}>
      <Stack direction="row" align="center" gap="sm">
        <Heading en={name.en} he={name.he} />
        {dated && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {t.dateShort(day.date)} · {hebrewShort(day)}
          </Text>
        )}
      </Stack>
    </Ruled>
  )
}

/** A heading with a rule under it, to start a group of rows. */
function Ruled({ spaced, children }: { spaced?: boolean; children: React.ReactNode }) {
  return (
    <Stack
      paddingTop={spaced ? 'sm' : undefined}
      paddingBottom="xs"
      borderBottomWidth="hairline"
      borderColor={SemanticColor.BorderStrong}
    >
      {children}
    </Stack>
  )
}

/** In Hebrew when the page or its names are; with the Hebrew beside it when names show in both. */
/** `he` can be missing for a shul's own heading (a category it only named in English). */
function Heading({ en, he }: { en: string; he?: string }) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  return (
    <Stack direction="row" align="center" gap="sm">
      <Text variant="sectionHeader" rtl={hebrew && !!he} color={SemanticColor.TextAccent}>
        {hebrew ? (he ?? en) : en}
      </Text>
      {!hebrew && t.bothNames && !!he && (
        <Text variant="sectionHeader" rtl color={SemanticColor.TextSecondary}>
          {he}
        </Text>
      )}
    </Stack>
  )
}

/** Who sponsors each of a day's events, by event id: "Sponsored by the Greenblats". */
function sponsorsOn(t: T, notices: Notice[], day: DaySchedule) {
  const by = new Map<string, string>()
  for (const e of day.events)
    for (const n of notices)
      if (
        n.kind === 'sponsor' &&
        // Named sponsors go under their heading with the other sponsors, not beside the event.
        !hasSponsor(n) &&
        n.eventId === e.eventId &&
        n.from <= day.date &&
        // A one-time event's sponsorship can go up before it and lasts until it.
        (day.date <= (n.to ?? n.from) || (!n.to && e.source === 'added'))
      ) {
        const line = t.text(n.text)
        by.set(e.eventId, by.has(e.eventId) ? `${by.get(e.eventId)} · ${line}` : line)
      }
  return by
}

/** One-time retimes of the week (not rule-driven seasonal changes) get a box and a footnote. */
const isChange = (e: Occurrence) => e.source === 'exception' && !e.cancelled

/** "Mincha Thursday 6:30 — Hosting the Levy bris" */
function changeLine(t: T, day: DaySchedule, e: Occurrence) {
  const when =
    e.untimed && e.relative ? t.relative(e.relative) : e.minutes === null ? '' : t.clock(e.minutes)
  return `${t.text(e.name)} ${t.weekday(day.weekday)} ${when}${e.note ? ` — ${t.text(e.note)}` : ''}`.replace(
    /\s+/g,
    ' ',
  )
}

/** "◆ Changed this week: …", under the times it explains. */
function ChangedNote({ lines }: { lines: string[] }) {
  const t = useT()
  if (lines.length === 0) return null
  return (
    <Text variant="caption" color={SemanticColor.TextSecondary}>
      <Text variant="caption" color={SemanticColor.TextAccent}>
        {CHANGED}
      </Text>{' '}
      {localize(WORDS.changed, t.lang)}: {lines.join(' · ')}
    </Text>
  )
}

/** A name, with its Hebrew beside it when names show in both. */
function NameLine({
  name,
  strike,
  italic,
}: {
  name: Localized
  strike?: boolean
  italic?: boolean
}) {
  const t = useT()
  const line = (
    <Stack direction="row" align="center" gap="sm">
      <Text variant="item" italic={italic} rtl={t.nameRtl && !!name.he}>
        {t.text(name)}
      </Text>
      {t.bothNames && !!name.he && (
        <Text variant="item" italic={italic} rtl color={SemanticColor.TextSecondary}>
          {name.he}
        </Text>
      )}
    </Stack>
  )
  return strike ? <Struck>{line}</Struck> : line
}

/**
 * An event's time: "after Shacharis" instead of a clock when it hangs on a minyan; boxed with a ◆ when it was changed
 * for this week; the word "Cancelled" (struck through with `strike`) when it isn't happening.
 */
function Time({ e, strike, range }: { e: Occurrence; strike?: boolean; range?: boolean }) {
  const t = useT()
  if (e.cancelled) {
    const word = <Text variant={strong(t)}>{t.s.cancelled}</Text>
    return strike ? <Struck>{word}</Struck> : word
  }
  const said = e.untimed && e.relative ? t.relative(e.relative) : undefined
  const label =
    said ??
    (e.minutes === null ? '—' : range ? t.timeRange(e.minutes, e.endMinutes) : t.clock(e.minutes))
  const time = <Text variant={said ? 'caption' : 'headline'}>{label}</Text>
  if (!isChange(e)) return time
  return (
    <Stack direction="row" align="center" gap="xs">
      <Text variant="caption" color={SemanticColor.TextAccent}>
        {CHANGED}
      </Text>
      <Stack
        borderWidth={1}
        borderColor={SemanticColor.TextPrimary}
        radius="sm"
        paddingHorizontal="xs"
      >
        {time}
      </Stack>
    </Stack>
  )
}

function ShabbosRowView({ row, sponsor }: { row: ShabbosRow; sponsor?: string }) {
  const t = useT()
  if (row.type === 'zman')
    return (
      <Stack direction="row" align="center" gap="sm" paddingVertical={3}>
        <Stack grow width={0}>
          <NameLine name={row.zman.name} italic />
        </Stack>
        <Text variant="item" italic>
          {t.clock(row.zman.minutes)}
        </Text>
      </Stack>
    )
  const e = row.event
  return (
    <Stack direction="row" align="center" gap="sm" paddingVertical={3}>
      {/* Takes what the time leaves: a long note or sponsor wraps instead of pushing the time off the sheet. */}
      <Stack grow width={0} gap="none">
        <NameLine name={e.name} strike={e.cancelled} />
        {!!e.note && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {t.text(e.note)}
          </Text>
        )}
        {!!sponsor && !e.cancelled && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {sponsor}
          </Text>
        )}
      </Stack>
      <Time e={e} />
    </Stack>
  )
}

/** A row per event, a column per day: the weekday minyanim (Sunday to Friday morning). */
function EventGrid({
  days,
  notices,
  en,
  he,
}: {
  days: DaySchedule[]
  notices: Notice[]
  en: string
  he: string
}) {
  const t = useT()
  const sponsors = days.map((d) => sponsorsOn(t, notices, d))
  const ids: string[] = []
  const first = new Map<string, Occurrence>()
  for (const d of days)
    for (const e of d.events)
      if (!first.has(e.eventId)) {
        ids.push(e.eventId)
        first.set(e.eventId, e)
      }
  if (!ids.length) return null
  const earliest = (id: string) =>
    Math.min(...days.map((d) => d.events.find((e) => e.eventId === id)?.minutes ?? Infinity))
  ids.sort((a, b) => earliest(a) - earliest(b))
  const changes = days.flatMap((d) => d.events.filter(isChange).map((e) => changeLine(t, d, e)))
  return (
    <Stack gap="xs">
      <Heading en={en} he={he} />
      <Stack gap="none">
        <DayColumns days={days} />
        {ids.map((id) => {
          const e = first.get(id)!
          return (
            <TableRow key={id} label={<RowName name={e.name} />}>
              {days.map((d, i) => {
                const e = d.events.find((x) => x.eventId === id)
                const sponsor = e && !e.cancelled && sponsors[i].get(id)
                return (
                  <Cell key={d.date}>
                    {!e ? (
                      <Text variant="body" color={SemanticColor.TextSecondary}>
                        ·
                      </Text>
                    ) : (
                      <Time e={e} strike />
                    )}
                    {!!e?.note && !e.cancelled && (
                      <Text
                        variant="caption"
                        align="center"
                        numberOfLines={2}
                        color={SemanticColor.TextSecondary}
                      >
                        {t.text(e.note)}
                      </Text>
                    )}
                    {!!sponsor && (
                      <Text
                        variant="caption"
                        align="center"
                        numberOfLines={2}
                        color={SemanticColor.TextSecondary}
                      >
                        {sponsor}
                      </Text>
                    )}
                  </Cell>
                )
              })}
            </TableRow>
          )
        })}
      </Stack>
      <ChangedNote lines={changes} />
    </Stack>
  )
}

/**
 * The week's shiurim as a list: the name, who gives it and where, and on the right its days and time: the same
 * time on several days is one range ("Sun–Fri 5:45"), different times are listed per day.
 */
function Shiurim({ days, notices }: { days: DaySchedule[]; notices: Notice[] }) {
  const t = useT()
  const sponsors = days.map((d) => sponsorsOn(t, notices, d))
  const shiurim = new Map<
    string,
    { first: Occurrence; entries: { day: DaySchedule; e: Occurrence; sponsor?: string }[] }
  >()
  days.forEach((day, i) => {
    for (const e of day.events) {
      if (notShiur(e)) continue
      const item = shiurim.get(e.eventId) ?? { first: e, entries: [] }
      item.entries.push({ day, e, sponsor: sponsors[i].get(e.eventId) })
      shiurim.set(e.eventId, item)
    }
  })
  const earliest = (entries: { e: Occurrence }[]) =>
    Math.min(...entries.map((x) => x.e.minutes ?? Infinity))
  const list = [...shiurim.values()].sort((a, b) => earliest(a.entries) - earliest(b.entries))
  const changes = list.flatMap((s) =>
    s.entries.filter((x) => isChange(x.e)).map((x) => changeLine(t, x.day, x.e)),
  )
  return (
    <Stack gap="xs">
      <Heading en={t.s.shiurimThisWeek} he={HE.s.shiurimThisWeek} />
      <Stack gap="none">
        {list.map(({ first, entries }) => {
          // Days with the same time (and the same changed or cancelled state) are one line.
          const lines = new Map<string, { days: DaySchedule['weekday'][]; e: Occurrence }>()
          for (const { day, e } of entries) {
            const said = e.untimed && e.relative ? t.relative(e.relative) : undefined
            const at = said ?? (e.minutes === null ? '—' : t.timeRange(e.minutes, e.endMinutes))
            const key = e.cancelled ? 'cancelled' : `${isChange(e) ? '◆' : ''}${at}`
            const line = lines.get(key) ?? { days: [], e }
            line.days.push(day.weekday)
            lines.set(key, line)
          }
          const sponsor = [
            ...new Set(entries.flatMap((x) => (x.sponsor && !x.e.cancelled ? [x.sponsor] : []))),
          ]
          return (
            <Stack
              key={first.eventId}
              direction="row"
              align="center"
              gap="md"
              paddingVertical="xs"
              borderBottomWidth="hairline"
              borderColor={SemanticColor.BorderDefault}
            >
              <Stack grow width={0} gap="none">
                <RowName name={first.name} caption={aboutShiur(t, first) || undefined} />
                {sponsor.map((line) => (
                  <Text key={line} variant="caption" color={SemanticColor.TextSecondary}>
                    {line}
                  </Text>
                ))}
              </Stack>
              <Stack align="end" gap="none">
                {[...lines.entries()].map(([key, line]) => (
                  <Stack key={key} direction="row" align="center" gap="sm">
                    <Text variant="body" color={SemanticColor.TextSecondary}>
                      {dayRange(t, line.days)}
                    </Text>
                    <Time e={line.e} range strike />
                  </Stack>
                ))}
              </Stack>
            </Stack>
          )
        })}
      </Stack>
      <ChangedNote lines={changes} />
    </Stack>
  )
}

/** `Sun–Fri`, or `Mon, Wed` where the days aren't in a run of three. */
function dayRange(t: T, days: DaySchedule['weekday'][]) {
  const runs: DaySchedule['weekday'][][] = []
  for (const d of [...days].sort((a, b) => a - b)) {
    const run = runs[runs.length - 1]
    if (run && d === run[run.length - 1] + 1) run.push(d)
    else runs.push([d])
  }
  return runs
    .map((r) =>
      r.length >= 3
        ? `${t.weekdayShort(r[0])}–${t.weekdayShort(r[r.length - 1])}`
        : r.map((d) => t.weekdayShort(d)).join(', '),
    )
    .join(', ')
}

function ZmanimGrid({ days }: { days: DaySchedule[] }) {
  const t = useT()
  const shown = days.map((d) => zmanimList(d))
  const ids = weekOrder(shown)
  const names = Object.assign({}, ...days.map((d) => d.zmanNames))
  return (
    <Stack gap="xs">
      <Heading en={t.s.zmanimThisWeek} he={HE.s.zmanimThisWeek} />
      <Stack gap="none">
        <DayColumns days={days} />
        {ids.map((id) => {
          const lit = id === 'candleLighting' || id === 'havdalah'
          return (
            <TableRow
              key={id}
              compact
              label={
                <Text
                  variant="body"
                  italic={lit}
                  rtl={t.nameRtl}
                  color={SemanticColor.TextSecondary}
                >
                  {t.zman(id, names)}
                </Text>
              }
            >
              {days.map((d, i) => {
                const m = shown[i].find((z) => z.id === id)?.minutes
                return (
                  <Cell key={d.date}>
                    <Text variant="bodyStrong" italic={lit}>
                      {m === undefined ? '' : t.clock(m)}
                    </Text>
                  </Cell>
                )
              })}
            </TableRow>
          )
        })}
      </Stack>
    </Stack>
  )
}

/**
 * The week's zmanim in one order: the built-ins by `zmanOrder`, each of the shul's own just after the built-in
 * before it on the first day it shows.
 */
function weekOrder(shown: ReturnType<typeof zmanimList>[]): ZmanKey[] {
  const rank = new Map<ZmanKey, number>()
  for (const list of shown) {
    let prev = -1
    let k = 0
    for (const { id } of list) {
      if (id in ZMAN_LABELS) {
        prev = zmanOrder(id as ZmanId)
        k = 0
        rank.set(id, prev)
      } else if (!rank.has(id)) rank.set(id, prev + 0.01 * ++k)
      else k++
    }
  }
  return [...rank.keys()].sort((a, b) => rank.get(a)! - rank.get(b)!)
}

/** Candle lighting before sunset, havdalah at the end. */
const zmanOrder = (id: ZmanId) =>
  id === 'candleLighting'
    ? DAILY_ZMANIM.indexOf('sunset') - 0.5
    : id === 'havdalah'
      ? 99
      : DAILY_ZMANIM.indexOf(id)

const special = (d: DaySchedule) => d.weekday === 6 || d.tags.includes('yomTov')

/** The column headings: weekday, date, and any holiday. */
function DayColumns({ days }: { days: DaySchedule[] }) {
  const t = useT()
  return (
    <TableRow label={null} header>
      {days.map((d) => (
        <Cell key={d.date} header>
          <Text variant={strong(t)} color={special(d) ? SemanticColor.TextAccent : undefined}>
            {t.weekdayShort(d.weekday)} {parseDate(d.date).day}
          </Text>
          <Text variant="caption" numberOfLines={1} color={SemanticColor.TextSecondary}>
            {hebrewShort(d)}
          </Text>
          {d.holidays.length > 0 && (
            <Text
              variant="caption"
              numberOfLines={1}
              rtl={t.nameRtl}
              color={SemanticColor.TextAccent}
            >
              {t.text(d.holidays[0])}
            </Text>
          )}
        </Cell>
      ))}
    </TableRow>
  )
}

function TableRow({
  label,
  header,
  compact,
  children,
}: {
  label: React.ReactNode
  header?: boolean
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <Stack
      direction="row"
      align="stretch"
      borderBottomWidth={header ? 1 : 'hairline'}
      borderColor={header ? SemanticColor.BorderStrong : SemanticColor.BorderDefault}
      minHeight={compact ? 24 : 32}
    >
      <Stack width={NAME_W} justify="center" paddingVertical={compact ? 2 : 'xs'} paddingEnd="sm">
        {label}
      </Stack>
      {children}
    </Stack>
  )
}

/** A day's cell, all of them one width. */
function Cell({ header, children }: { header?: boolean; children: React.ReactNode }) {
  return (
    <Stack
      grow
      width={0}
      align="center"
      justify="center"
      paddingVertical={header ? 'xs' : 2}
      paddingHorizontal={2}
    >
      {children}
    </Stack>
  )
}

function RowName({ name, caption }: { name: Localized; caption?: string }) {
  const t = useT()
  return (
    <Stack gap="none">
      <Stack direction="row" align="center" gap="sm">
        <Text variant="item" numberOfLines={1} rtl={t.nameRtl && !!name.he}>
          {t.text(name)}
        </Text>
        {t.bothNames && !!name.he && (
          <Text variant="item" rtl numberOfLines={1} color={SemanticColor.TextSecondary}>
            {name.he}
          </Text>
        )}
      </Stack>
      {!!caption && (
        <Text variant="caption" numberOfLines={2} color={SemanticColor.TextSecondary}>
          {caption}
        </Text>
      )}
    </Stack>
  )
}

/** "R’ Stern · Hilchos Shabbos · Beis Medrash" */
function aboutShiur(t: T, e: Occurrence) {
  return [e.speaker, e.topic]
    .flatMap((l) => (l ? [t.text(l)] : []))
    .concat(e.room ?? [], e.location ?? [])
    .join(' · ')
}

/** Starred events from now to their lead time: the date, what, when, and where. */
function ComingUp({ items }: { items: WeekProps['comingUp'] }) {
  const t = useT()
  return (
    <Stack gap="xs">
      <Heading en={t.s.comingUp} he={HE.s.comingUp} />
      <Stack gap="none">
        {items.map(({ date, event: e }) => {
          const about = [aboutShiur(t, e), e.note && t.text(e.note)].filter(Boolean).join(' · ')
          return (
            <Stack
              key={`${date}|${e.eventId}`}
              direction="row"
              align="center"
              gap="md"
              paddingVertical="xs"
              borderBottomWidth="hairline"
              borderColor={SemanticColor.BorderDefault}
            >
              <Stack width={NAME_W - 40} gap="none">
                <Text variant={strong(t)}>
                  {t.weekday(weekdayOf(date))}, {t.dateShort(date)}
                </Text>
              </Stack>
              <Stack grow width={0} gap="none">
                <RowName name={e.name} caption={about || undefined} />
              </Stack>
              <Text variant={e.untimed ? 'caption' : 'headline'}>
                {e.untimed && e.relative
                  ? t.relative(e.relative)
                  : e.minutes === null
                    ? '—'
                    : t.timeRange(e.minutes, e.endMinutes)}
              </Text>
            </Stack>
          )
        })}
      </Stack>
    </Stack>
  )
}

/**
 * Each kind of notice under a heading of its own, in order: sponsorships, mazal tov, condolences, the shul's own
 * categories, then plain announcements and reminders. A notice's title (the people's names) is its sub-heading and
 * its text sits under it; the sections flow in two columns.
 */
function Notices({
  notices,
  categories,
  days,
}: {
  notices: Notice[]
  categories: NoticeCategory[]
  days: DaySchedule[]
}) {
  const t = useT()
  const of = (kind: Notice['kind']) => notices.filter((n) => n.kind === kind)
  const filed = (n: Notice) => noticeCategory({ noticeCategories: categories }, n)
  const sections: { key: string; en: string; he?: string; notices: Notice[] }[] = [
    ...sponsorGroups(t, notices, days).map((g) => ({
      key: g.key,
      en: g.title,
      notices: g.sponsors,
    })),
    {
      key: 'sponsor',
      en: t.s.sponsorships,
      he: HE.s.sponsorships,
      notices: of('sponsor').filter((n) => !hasSponsor(n)),
    },
    ...(['simcha', 'condolence'] as const).map((k) => ({
      key: k,
      en: t.noticeKind(k),
      he: NOTICE_LABELS[k].he,
      notices: of(k),
    })),
    ...categories.map((c) => ({
      key: c.id,
      en: c.name.en,
      he: c.name.he,
      notices: notices.filter((n) => filed(n)?.id === c.id),
    })),
    {
      key: 'announcement',
      en: t.s.announcements,
      he: HE.s.announcements,
      notices: notices.filter(
        (n) => n.kind === 'reminder' || (n.kind === 'announcement' && !filed(n)),
      ),
    },
  ]
  const items: FlowItem[] = sections
    .filter((g) => g.notices.length > 0)
    .flatMap((g) => [
      {
        key: g.key,
        weight: 1.6,
        keep: true,
        start: true,
        node: (
          <Ruled spaced={g.key !== sections.find((s) => s.notices.length > 0)?.key}>
            <Heading en={g.en} he={g.he} />
          </Ruled>
        ),
      },
      ...g.notices.map((n) => ({
        key: n.id,
        weight: noticeWeight(n),
        node: <NoticeBlock notice={n} />,
      })),
    ])
  return <Flow items={items} gap="sm" />
}

/** About how many lines a notice takes, for balancing the columns. */
function noticeWeight(n: Notice) {
  const lines = (l: Localized) => Math.ceil(Math.max(l.en.length, l.he?.length ?? 0) / 40)
  return (n.title ? 1 : 0) + lines(n.text) + (n.links?.length ?? 0) * 3.5 + 0.5
}

/** The week's yahrzeits and the refuah shleimah list side by side. */
function Remembrance({
  yahrzeits,
  settings,
  cholim,
}: {
  yahrzeits: UpcomingYahrzeit[]
  settings?: YahrzeitSettings
  cholim: Choleh[]
}) {
  const both = yahrzeits.length > 0 && cholim.length > 0
  return (
    <Stack direction="row" align="stretch" gap="md">
      {yahrzeits.length > 0 && (
        <Stack grow width={0}>
          <Yahrzeits items={yahrzeits} settings={settings} />
        </Stack>
      )}
      {both && <Stack width={1} background={SemanticColor.BorderStrong} />}
      {cholim.length > 0 && (
        <Stack grow width={0}>
          <Cholim cholim={cholim} />
        </Stack>
      )}
    </Stack>
  )
}

/** The week's birthdays and anniversaries side by side, each in a box of its own. */
function Celebrations({
  lists,
}: {
  lists: { kind: OccasionKind; items: UpcomingOccasion[]; settings?: OccasionSettings }[]
}) {
  const shown = lists.filter((l) => l.items.length > 0)
  return (
    <Stack direction="row" align="stretch" gap="md">
      {shown.map((l, i) => (
        <React.Fragment key={l.kind}>
          {i > 0 && <Stack width={1} background={SemanticColor.BorderStrong} />}
          <Stack grow width={0}>
            <Occasions {...l} />
          </Stack>
        </React.Fragment>
      ))}
    </Stack>
  )
}

/** The week's birthdays or anniversaries, soonest first, each dated by the calendar it is kept by. */
function Occasions({
  kind,
  items,
  settings,
}: {
  kind: OccasionKind
  items: UpcomingOccasion[]
  settings?: OccasionSettings
}) {
  const t = useT()
  return (
    <Stack gap="sm">
      <Heading
        en={settings?.title ? settings.title.en : t.occasionTitle(kind)}
        he={
          settings?.title
            ? settings.title.he
            : kind === 'birthday'
              ? HE.s.birthdays
              : HE.s.anniversaries
        }
      />
      <ColumnBox
        items={items}
        render={({ date, occasion, by }) => (
          <Stack key={`${occasion.id}-${date}`} gap="none">
            {t.yahrzeitNames(occasion, settings?.names).map((n) => (
              <Text key={n} variant="bodySerifLarge" rtl={HEBREW.test(n)}>
                {n}
              </Text>
            ))}
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {t.occasionDate(date, by)}
            </Text>
          </Stack>
        )}
      />
    </Stack>
  )
}

/** A box of items in three columns, filled top to bottom, so a short list still reads in order. */
function ColumnBox<T>({ items, render }: { items: T[]; render: (item: T) => React.ReactNode }) {
  const size = Math.ceil(items.length / 3)
  const columns = [0, 1, 2].map((i) => items.slice(i * size, (i + 1) * size))
  return (
    <Stack
      direction="row"
      gap="md"
      padding="sm"
      radius="md"
      borderWidth={1}
      borderColor={SemanticColor.BorderStrong}
    >
      {columns
        .filter((column) => column.length > 0)
        .map((column, i) => (
          <Stack key={i} grow width={0} gap="xs">
            {column.map(render)}
          </Stack>
        ))}
    </Stack>
  )
}

/** The week's yahrzeits, soonest first: the names the shul chose, and the day, in a box of their own. */
function Yahrzeits({
  items,
  settings,
}: {
  items: UpcomingYahrzeit[]
  settings?: YahrzeitSettings
}) {
  const t = useT()
  return (
    <Stack gap="sm">
      <Heading
        en={settings?.title ? settings.title.en : t.s.yahrzeits}
        he={settings?.title ? settings.title.he : HE.s.yahrzeits}
      />
      <ColumnBox
        items={items}
        render={({ date, yahrzeit }) => (
          <Stack key={`${yahrzeit.id}-${date}`} gap="none">
            {t.yahrzeitNames(yahrzeit, settings?.names).map((n) => (
              <Text key={n} variant="bodySerifLarge" rtl={HEBREW.test(n)}>
                {n}
              </Text>
            ))}
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {t.yahrzeitDate(date, settings?.dates)}
            </Text>
          </Stack>
        )}
      />
    </Stack>
  )
}

/** The names to daven for, in three columns in a box of their own, like a Mi Shebeirach list. */
function Cholim({ cholim }: { cholim: Choleh[] }) {
  const t = useT()
  const names = cholim.map((c) => ({ id: c.id, name: t.choleh(c) }))
  return (
    <Stack gap="sm">
      <Heading en={t.s.refuahShleimah} he={HE.s.refuahShleimah} />
      <ColumnBox
        items={names}
        render={({ id, name }) => (
          <Text key={id} variant="bodySerifLarge" rtl={HEBREW.test(name)}>
            {name}
          </Text>
        )}
      />
    </Stack>
  )
}

/** The title (the people's names, or what's sponsored) as a sub-heading, the text under it, then any QR codes. */
function NoticeBlock({ notice: n }: { notice: Notice }) {
  const t = useT()
  // The days only matter for a reminder or a run of days; a one-day posting is the week it's printed in.
  const when =
    n.to && n.to !== n.from
      ? `${t.dateShort(n.from)} – ${t.dateShort(n.to)}`
      : n.kind === 'reminder'
        ? t.dateShort(n.from)
        : ''
  return (
    <Stack gap="none">
      {(!!n.title || !!when) && (
        <Stack direction="row" align="center" gap="sm">
          {!!n.title && (
            <Text variant="itemHeader" rtl={t.nameRtl && !!n.title.he}>
              {t.text(n.title)}
            </Text>
          )}
          {!!when && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {when}
            </Text>
          )}
        </Stack>
      )}
      {hasSponsor(n) && <SponsorName notice={n} variant={strong(t)} />}
      {!!t.text(n.text) && (
        <Text variant="bodySerif" rtl={t.nameRtl && !!n.text.he}>
          {t.text(n.text)}
        </Text>
      )}
      {t.bothNames && !!n.text.he && (
        <Text variant="bodySerif" rtl>
          {n.text.he}
        </Text>
      )}
      {!!n.links?.length && (
        <Stack direction="row" wrap gap="lg" paddingTop="xs">
          {n.links.map((l, i) => (
            <Stack key={i} direction="row" align="center" gap="sm" width={LINK_W}>
              <QRCode value={l.url} size={LINK_QR} logo={false} />
              <Stack grow width={0}>
                <Text variant={strong(t)} rtl={t.nameRtl && !!l.title.he} numberOfLines={3}>
                  {t.text(l.title)}
                </Text>
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}

function Footer({ slug }: { slug: string }) {
  const t = useT()
  const url = siddurShulUrl(slug)
  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      paddingTop="sm"
      borderTopWidth="hairline"
      borderColor={SemanticColor.BorderDefault}
    >
      <QRCode value={url} size={QR} logo={false} />
      <Stack grow gap="none">
        <Text variant={strong(t)}>{t.s.upToDate}</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          {url.replace(/^https?:\/\//, '')}
        </Text>
      </Stack>
    </Stack>
  )
}

// ---------------------------------------------------------------------------

type T = ReturnType<typeof useT>

/** A bold label: Hebrew in Frank Ruhl Libre Bold, not a faux-bold system font. */
const strong = (t: T) => (t.rtl ? 'sectionHeader' : 'bodyStrong')

/** `October 18 – 24, 2026`, or across months `October 25 – November 1, 2026`. */
function civilRange(t: T, from: string, to: string) {
  const a = parseDate(from)
  const b = parseDate(to)
  const year = b.year
  if (a.month !== b.month) return `${t.date(from)} – ${t.date(to)}, ${year}`
  return t.lang === 'he' ? `${a.day}–${t.date(to)} ${year}` : `${t.date(from)} – ${b.day}, ${year}`
}

/** `כ״ו חשון`: the Hebrew day and month. */
const hebrewShort = (d: DaySchedule) => d.hebrew.he.split(' ').slice(0, 2).join(' ')

/** `ט״ז – כ״ב חשון תשפ״ז` when the week stays in one month. */
function hebrewRange(a: DaySchedule, b: DaySchedule) {
  if (a.hebrew.month !== b.hebrew.month) return `${a.hebrew.he} – ${b.hebrew.he}`
  return `${a.hebrew.he.split(' ')[0]} – ${b.hebrew.he}`
}
