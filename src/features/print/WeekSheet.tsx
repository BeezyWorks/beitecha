import { QRCode, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  type Choleh,
  DAILY_ZMANIM,
  type DateString,
  type DaySchedule,
  type Localized,
  type Minutes,
  type Notice,
  type NoticeCategory,
  noticeCategory,
  NOTICE_LABELS,
  type Occurrence,
  parseDate,
  type ShulProfile,
  type UpcomingYahrzeit,
  weekdayOf,
  type YahrzeitSettings,
  ZMAN_LABELS,
  type ZmanId,
  zmanimList,
  type ZmanKey,
} from '@beitecha/engine'
import React from 'react'

import { makeT, useT } from '@/features/luach/language'
import { siddurShulUrl } from '@/lib/config'

/** Where the Shabbos panel takes over Friday's times from the weekday grid, without a chatzos. */
const NOON = 12 * 60
const NAME_W = 180
const QR = 76
/** A notice's own QR codes, a little smaller than the shul's, each beside what scanning it does. */
const LINK_QR = 60
const LINK_W = 220
/** Headings are in Hebrew whenever the page or its names are, whatever the labels' language. */
const HE = makeT('he')
const HEBREW = /[\u0590-\u05FF]/

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
  /** The week's zmanim table on the front. */
  zmanimTable: boolean
  /** The week's shiurim on the announcements side. */
  shiurim: boolean
  /** Zmanim listed among Friday night's and Shabbos day's minyanim (`settings.print.shabbosZmanim`). */
  shabbosZmanim: { friday: InlineZman[]; shabbos: InlineZman[] }
}

/** A zman among a day's minyanim, at its time. */
export interface InlineZman {
  id: ZmanKey
  name: Localized
  minutes: Minutes
}

/** Shiurim have their own timetable with the announcements; the front keeps to the minyanim. */
const notShiur = (e: Occurrence) => e.kind !== 'shiur'

/** Whether the week has anything for the announcements side. */
export const hasAnnouncements = ({
  days,
  notices,
  comingUp,
  cholim,
  yahrzeits,
  shiurim,
}: Pick<WeekProps, 'days' | 'notices' | 'comingUp' | 'cholim' | 'yahrzeits' | 'shiurim'>) =>
  notices.length > 0 ||
  comingUp.length > 0 ||
  cholim.length > 0 ||
  yahrzeits.length > 0 ||
  (shiurim && days.some((d) => d.events.some((e) => !notShiur(e))))

/** The front: the masthead, Shabbos, the weekday minyanim and the week's zmanim (and, `withNotices`, the rest). */
export function TimesSide({ withNotices, ...week }: WeekProps & { withNotices: boolean }) {
  const t = useT()
  const { days, notices } = week
  const friday = days[5]
  const afternoon = friday.zmanim.chatzos ?? NOON
  const erevShabbos = friday.events.filter((e) => e.minutes !== null && e.minutes >= afternoon)
  const weekdays = days.slice(0, 6).map((d) => ({
    ...d,
    events: d.events.filter((e) => notShiur(e) && !(d === friday && erevShabbos.includes(e))),
  }))
  return (
    <Stack grow gap="lg">
      <Masthead {...week} />
      <ShabbosPanel
        friday={friday}
        erevShabbos={erevShabbos}
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

function Announcements({ days, notices, categories, comingUp, cholim, yahrzeits, yahrzeitSettings, shiurim: showShiurim }: WeekProps) {
  const t = useT()
  const shiurim = days.map((d) => ({ ...d, events: d.events.filter((e) => !notShiur(e)) }))
  return (
    <Stack gap="lg">
      {showShiurim && (
        <EventGrid
          days={shiurim}
          notices={notices}
          en={t.s.shiurimThisWeek}
          he={HE.s.shiurimThisWeek}
          details
        />
      )}
      {comingUp.length > 0 && <ComingUp items={comingUp} />}
      {notices.length > 0 && <Notices notices={notices} categories={categories ?? []} />}
      {yahrzeits.length > 0 && <Yahrzeits items={yahrzeits} settings={yahrzeitSettings} />}
      {cholim.length > 0 && <Cholim cholim={cholim} />}
    </Stack>
  )
}

// ---------------------------------------------------------------------------

function Masthead({ profile, days }: WeekProps) {
  const t = useT()
  const [sunday, shabbos] = [days[0], days[6]]
  return (
    <Stack gap="sm">
      <Stack direction="row" align="end" gap="lg">
        <Stack grow gap="none">
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
          <Text variant="sectionHeader" rtl color={SemanticColor.TextAccent}>
            {hebrewRange(sunday, shabbos)}
          </Text>
        </Stack>
      </Stack>
      <Stack height={3} radius="sm" background={SemanticColor.AccentPrimary} />
    </Stack>
  )
}

/** Friday night and Shabbos day side by side, the shul's picked zmanim (candle lighting, havdalah) among the minyanim. */
function ShabbosPanel({
  friday,
  erevShabbos,
  shabbos,
  notices,
  zmanim,
}: {
  friday: DaySchedule
  erevShabbos: Occurrence[]
  shabbos: DaySchedule
  notices: Notice[]
  zmanim: WeekProps['shabbosZmanim']
}) {
  const t = useT()
  const holidays = [...friday.holidays, ...shabbos.holidays].map(t.text)
  return (
    <Stack
      radius="lg"
      padding="md"
      gap="sm"
      background={SemanticColor.AccentTint}
      borderWidth={1}
      borderColor={SemanticColor.AccentTintSelected}
    >
      {holidays.length > 0 && (
        <Text variant="sectionHeader" rtl={t.nameRtl} color={SemanticColor.TextAccent}>
          {[...new Set(holidays)].join(' · ')}
        </Text>
      )}
      <Stack direction="row" gap="lg">
        <Stack grow gap="xs">
          <ColumnHeading
            en={t.s.erevShabbos}
            he={HE.s.erevShabbos}
            date={t.dateShort(friday.date)}
            hebrewDate={friday.hebrew.he}
          />
          <Rows
            events={erevShabbos}
            sponsors={sponsorsOn(t, notices, friday)}
            zmanim={zmanim.friday}
          />
        </Stack>
        <Stack width={1} background={SemanticColor.AccentTintSelected} />
        <Stack grow gap="xs">
          <ColumnHeading
            en={t.weekday(6)}
            he={HE.weekday(6)}
            date={t.dateShort(shabbos.date)}
            hebrewDate={shabbos.hebrew.he}
          />
          <Rows
            events={shabbos.events}
            sponsors={sponsorsOn(t, notices, shabbos)}
            zmanim={zmanim.shabbos}
          />
        </Stack>
      </Stack>
    </Stack>
  )
}

function ColumnHeading({
  en,
  he,
  date,
  hebrewDate,
}: {
  en: string
  he: string
  date: string
  hebrewDate: string
}) {
  return (
    <Stack direction="row" align="center" gap="sm" paddingBottom="xs">
      <Heading en={en} he={he} />
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {date}
      </Text>
      <Stack grow />
      <Text variant="caption" rtl color={SemanticColor.TextSecondary}>
        {hebrewDate}
      </Text>
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
        n.eventId === e.eventId &&
        n.from <= day.date &&
        // A one-time event's sponsorship can go up before it and lasts until it.
        (day.date <= (n.to ?? n.from) || (!n.to && e.source === 'added'))
      ) {
        const line = n.sponsoredBy ? `${t.s.sponsoredBy} ${t.text(n.sponsoredBy)}` : t.text(n.text)
        by.set(e.eventId, by.has(e.eventId) ? `${by.get(e.eventId)} · ${line}` : line)
      }
  return by
}

/** A day's events as name … time rows, with zmanim slotted in at their times. */
function Rows({
  events,
  sponsors,
  zmanim,
}: {
  events: Occurrence[]
  sponsors: Map<string, string>
  zmanim: InlineZman[]
}) {
  const t = useT()
  type Row = {
    key: string
    name: Localized
    minutes: Minutes | null
    /** "after Shacharis", instead of a time. */
    said?: string
    note?: string
    sponsor?: string
    cancelled?: boolean
    lit?: boolean
  }
  const rows: Row[] = events.map((e) => ({
    key: e.eventId,
    name: e.name,
    minutes: e.minutes,
    said: e.untimed && e.relative ? t.relative(e.relative) : undefined,
    cancelled: e.cancelled,
    note: e.cancelled
      ? e.note
        ? `${t.s.cancelled} — ${t.text(e.note)}`
        : t.s.cancelled
      : e.note && t.text(e.note),
    sponsor: sponsors.get(e.eventId),
  }))
  for (const zman of zmanim) {
    const at = rows.findIndex((r) => r.minutes !== null && r.minutes > zman.minutes)
    const row: Row = { key: `zman:${zman.id}`, name: zman.name, minutes: zman.minutes, lit: true }
    rows.splice(at < 0 ? rows.length : at, 0, row)
  }
  return (
    <Stack gap="none">
      {rows.map((r) => (
        <Stack
          key={r.key}
          direction="row"
          align="center"
          gap="sm"
          paddingVertical={3}
          opacity={r.cancelled ? 0.6 : 1}
        >
          {/* Takes what the time leaves: a long note or sponsor wraps instead of pushing the time off the sheet. */}
          <Stack grow width={0} gap="none">
            <Stack direction="row" align="center" gap="sm">
              <Text
                variant={r.lit ? 'itemHeader' : 'item'}
                rtl={t.nameRtl && !!r.name.he}
                color={r.lit ? SemanticColor.TextAccent : undefined}
              >
                {t.text(r.name)}
              </Text>
              {t.bothNames && !!r.name.he && (
                <Text variant="item" rtl color={SemanticColor.TextSecondary}>
                  {r.name.he}
                </Text>
              )}
            </Stack>
            {!!r.note && (
              <Text
                variant="caption"
                color={r.cancelled ? SemanticColor.TextDanger : SemanticColor.TextSecondary}
              >
                {r.note}
              </Text>
            )}
            {!!r.sponsor && !r.cancelled && (
              <Text variant="caption" color={SemanticColor.TextAccent}>
                {r.sponsor}
              </Text>
            )}
          </Stack>
          <Text variant="headline" color={r.lit ? SemanticColor.TextAccent : undefined}>
            {r.said ?? (r.cancelled ? '—' : r.minutes === null ? '—' : t.clock(r.minutes))}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

/**
 * A row per event, a column per day: the weekday minyanim (Sunday to Friday morning), or the week's shiurim with
 * who gives them and where (`details`).
 */
function EventGrid({
  days,
  notices,
  en,
  he,
  details,
}: {
  days: DaySchedule[]
  notices: Notice[]
  en: string
  he: string
  details?: boolean
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
  return (
    <Stack gap="xs">
      <Heading en={en} he={he} />
      <Stack gap="none">
        <DayColumns days={days} />
        {ids.map((id) => {
          const e = first.get(id)!
          return (
            <TableRow
              key={id}
              label={<RowName name={e.name} caption={details ? aboutShiur(t, e) : undefined} />}
            >
              {days.map((d, i) => {
                const e = d.events.find((x) => x.eventId === id)
                const sponsor = e && !e.cancelled && sponsors[i].get(id)
                return (
                  <Cell key={d.date} day={d}>
                    {!e ? (
                      <Text variant="body" color={SemanticColor.TextSecondary}>
                        ·
                      </Text>
                    ) : e.cancelled ? (
                      <Text variant="caption" color={SemanticColor.TextDanger}>
                        {t.s.cancelled}
                      </Text>
                    ) : (
                      <Text variant={e.untimed ? 'caption' : 'headline'} align="center">
                        {e.untimed && e.relative
                          ? t.relative(e.relative)
                          : e.minutes === null
                            ? '—'
                            : t.clock(e.minutes)}
                      </Text>
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
                        color={SemanticColor.TextAccent}
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
    </Stack>
  )
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
                  rtl={t.nameRtl}
                  color={lit ? SemanticColor.TextAccent : SemanticColor.TextSecondary}
                >
                  {t.zman(id, names)}
                </Text>
              }
            >
              {days.map((d, i) => {
                const m = shown[i].find((z) => z.id === id)?.minutes
                return (
                  <Cell key={d.date} day={d}>
                    <Text variant="bodyStrong" color={lit ? SemanticColor.TextAccent : undefined}>
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
        <Cell key={d.date} day={d} header>
          <Text variant={strong(t)} color={special(d) ? SemanticColor.TextAccent : undefined}>
            {t.weekdayShort(d.weekday)} {parseDate(d.date).day}
          </Text>
          <Text variant="caption" numberOfLines={1} color={SemanticColor.TextSecondary}>
            {d.hebrew.he.split(' ').slice(0, 2).join(' ')}
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

/** A day's cell, all of them one width; Shabbos and Yom Tov sit on a brand wash, as on the public page. */
function Cell({
  day,
  header,
  children,
}: {
  day: DaySchedule
  header?: boolean
  children: React.ReactNode
}) {
  return (
    <Stack
      grow
      width={0}
      align="center"
      justify="center"
      paddingVertical={header ? 'xs' : 2}
      paddingHorizontal={2}
      background={special(day) ? SemanticColor.AccentTint : undefined}
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
                <Text variant={strong(t)} color={SemanticColor.TextAccent}>
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
 * Sponsorships first (the kiddush is what people look for), then plain announcements and reminders, then each of the
 * shul's own categories, then mazal tovs, condolences last.
 */
function Notices({ notices, categories }: { notices: Notice[]; categories: NoticeCategory[] }) {
  const t = useT()
  const of = (kind: Notice['kind']) => notices.filter((n) => n.kind === kind)
  const filed = (n: Notice) => noticeCategory({ noticeCategories: categories }, n)
  const groups: { key: string; en: string; he?: string; notices: Notice[] }[] = [
    { key: 'sponsor', en: t.s.sponsorships, he: HE.s.sponsorships, notices: of('sponsor') },
    {
      key: 'announcement',
      en: t.s.announcements,
      he: HE.s.announcements,
      notices: notices.filter(
        (n) => n.kind === 'reminder' || (n.kind === 'announcement' && !filed(n)),
      ),
    },
    ...categories.map((c) => ({
      key: c.id,
      en: c.name.en,
      he: c.name.he,
      notices: notices.filter((n) => filed(n)?.id === c.id),
    })),
    ...(['simcha', 'condolence'] as const).map((k) => ({
      key: k,
      en: t.noticeKind(k),
      he: NOTICE_LABELS[k].he,
      notices: of(k),
    })),
  ]
  return (
    <Stack gap="lg">
      {groups
        .filter((g) => g.notices.length > 0)
        .map((g) => (
          <Stack key={g.key} gap="sm">
            <Heading en={g.en} he={g.he} />
            {g.notices.map((n) => (
              <NoticeBlock key={n.id} notice={n} />
            ))}
          </Stack>
        ))}
    </Stack>
  )
}

/** The week's yahrzeits, soonest first: the names the shul chose, and the day. */
function Yahrzeits({ items, settings }: { items: UpcomingYahrzeit[]; settings?: YahrzeitSettings }) {
  const t = useT()
  return (
    <Stack gap="sm">
      <Heading
        en={settings?.title ? settings.title.en : t.s.yahrzeits}
        he={settings?.title ? settings.title.he : HE.s.yahrzeits}
      />
      {items.map(({ date, yahrzeit }) => (
        <Stack key={`${yahrzeit.id}-${date}`} direction="row" align="center" gap="md" wrap>
          <Stack grow width={0} direction="row" gap="md" wrap>
            {t.yahrzeitNames(yahrzeit, settings?.names).map((n) => (
              <Text key={n} variant="bodySerifLarge" rtl={HEBREW.test(n)}>
                {n}
              </Text>
            ))}
          </Stack>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {t.yahrzeitDate(date, settings?.dates)}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

/** The names to daven for, flowing in rows like a Mi Shebeirach list. */
function Cholim({ cholim }: { cholim: Choleh[] }) {
  const t = useT()
  return (
    <Stack gap="sm">
      <Heading en={t.s.refuahShleimah} he={HE.s.refuahShleimah} />
      <Stack direction="row" wrap gap="md">
        {cholim.map((c) => {
          const name = t.choleh(c)
          return (
            <Text key={c.id} variant="bodySerifLarge" rtl={HEBREW.test(name)}>
              {name}
            </Text>
          )
        })}
      </Stack>
    </Stack>
  )
}

function NoticeBlock({ notice: n }: { notice: Notice }) {
  const t = useT()
  const sponsor = n.kind === 'sponsor'
  const when =
    n.to && n.to !== n.from ? `${t.dateShort(n.from)} – ${t.dateShort(n.to)}` : t.dateShort(n.from)
  return (
    <Stack
      radius="md"
      padding="md"
      gap="xs"
      borderWidth={1}
      borderColor={sponsor ? SemanticColor.AccentTintSelected : SemanticColor.BorderDefault}
      background={sponsor ? SemanticColor.AccentTint : undefined}
    >
      <Stack direction="row" align="center" gap="sm">
        {!!n.title && (
          <Text
            variant="itemHeader"
            rtl={t.nameRtl && !!n.title.he}
            color={SemanticColor.TextAccent}
          >
            {t.text(n.title)}
          </Text>
        )}
        <Stack grow />
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      <Text variant="bodySerifLarge" rtl={t.nameRtl && !!n.text.he}>
        {t.text(n.text)}
      </Text>
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

/** `ט״ז – כ״ב חשון תשפ״ז` when the week stays in one month. */
function hebrewRange(a: DaySchedule, b: DaySchedule) {
  if (a.hebrew.month !== b.hebrew.month) return `${a.hebrew.he} – ${b.hebrew.he}`
  return `${a.hebrew.he.split(' ')[0]} – ${b.hebrew.he}`
}
