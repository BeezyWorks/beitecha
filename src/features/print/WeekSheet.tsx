import { QRCode, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  parseDate,
  type DaySchedule,
  type Localized,
  type Minutes,
  type Notice,
  type Occurrence,
  type ShulProfile,
  type ZmanId,
} from '@beitecha/engine'
import React from 'react'

import { DAILY_ZMANIM, ZMAN_LABELS, zmanimForDay } from '@/features/luach/labels'
import { makeT, useT } from '@/features/luach/language'
import { SITE_URL } from '@/lib/config'

/** Where the Shabbos panel takes over Friday's times from the weekday grid, without a chatzos. */
const NOON = 12 * 60
const NAME_W = 180
const QR = 76
/** Headings are in Hebrew whenever the page or its names are, whatever the labels' language. */
const HE = makeT('he')

export interface WeekProps {
  slug: string
  profile: ShulProfile
  /** Sunday to Shabbos. */
  days: DaySchedule[]
  notices: Notice[]
}

/** The front: the masthead, Shabbos, the weekday minyanim and the week's zmanim (and, `withNotices`, the rest). */
export function TimesSide({ withNotices, ...week }: WeekProps & { withNotices: boolean }) {
  const { days, notices } = week
  const friday = days[5]
  const afternoon = friday.zmanim.chatzos ?? NOON
  const erevShabbos = friday.events.filter((e) => e.minutes !== null && e.minutes >= afternoon)
  const weekdays = days
    .slice(0, 6)
    .map((d) =>
      d === friday ? { ...d, events: d.events.filter((e) => !erevShabbos.includes(e)) } : d,
    )
  return (
    <Stack grow gap="lg">
      <Masthead {...week} />
      <ShabbosPanel friday={friday} erevShabbos={erevShabbos} shabbos={days[6]} />
      {withNotices && notices.length > 0 && <Notices notices={notices} />}
      <WeekdayGrid days={weekdays} />
      <ZmanimGrid days={days} />
      <Stack grow />
      {(withNotices || !notices.length) && <Footer slug={week.slug} />}
    </Stack>
  )
}

/** The back: sponsorships and announcements. */
export function NoticesSide(week: WeekProps) {
  return (
    <Stack grow gap="lg">
      <Masthead {...week} />
      <Notices notices={week.notices} />
      <Stack grow />
      <Footer slug={week.slug} />
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

/** Friday night and Shabbos day side by side, candle lighting and havdalah among the minyanim. */
function ShabbosPanel({
  friday,
  erevShabbos,
  shabbos,
}: {
  friday: DaySchedule
  erevShabbos: Occurrence[]
  shabbos: DaySchedule
}) {
  const t = useT()
  const candles = friday.zmanim.candleLighting
  const havdalah = shabbos.zmanim.havdalah
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
            zman={candles === undefined ? undefined : { id: 'candleLighting', minutes: candles }}
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
            zman={havdalah === undefined ? undefined : { id: 'havdalah', minutes: havdalah }}
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
function Heading({ en, he }: { en: string; he: string }) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  return (
    <Stack direction="row" align="center" gap="sm">
      <Text variant="sectionHeader" rtl={hebrew} color={SemanticColor.TextAccent}>
        {hebrew ? he : en}
      </Text>
      {!hebrew && t.bothNames && (
        <Text variant="sectionHeader" rtl color={SemanticColor.TextSecondary}>
          {he}
        </Text>
      )}
    </Stack>
  )
}

/** A day's events as name … time rows, with one zman slotted in at its time. */
function Rows({ events, zman }: { events: Occurrence[]; zman?: { id: ZmanId; minutes: Minutes } }) {
  const t = useT()
  type Row = {
    key: string
    name: Localized
    minutes: Minutes | null
    note?: string
    cancelled?: boolean
    lit?: boolean
  }
  const rows: Row[] = events.map((e) => ({
    key: e.eventId,
    name: e.name,
    minutes: e.minutes,
    cancelled: e.cancelled,
    note: e.cancelled
      ? e.note
        ? `${t.s.cancelled} — ${t.text(e.note)}`
        : t.s.cancelled
      : e.note && t.text(e.note),
  }))
  if (zman) {
    const at = rows.findIndex((r) => r.minutes !== null && r.minutes > zman.minutes)
    const row: Row = {
      key: zman.id,
      name: ZMAN_LABELS[zman.id],
      minutes: zman.minutes,
      lit: true,
    }
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
          <Stack grow gap="none">
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
          </Stack>
          <Text variant="headline" color={r.lit ? SemanticColor.TextAccent : undefined}>
            {r.cancelled ? '—' : r.minutes === null ? '—' : t.clock(r.minutes)}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

/** Sunday to Friday morning: a row per minyan or shiur, a column per day. */
function WeekdayGrid({ days }: { days: DaySchedule[] }) {
  const t = useT()
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
      <Heading en={t.s.weekdays} he={HE.s.weekdays} />
      <Stack gap="none">
        <DayColumns days={days} />
        {ids.map((id) => {
          const name = first.get(id)!.name
          return (
            <TableRow key={id} label={<RowName name={name} />}>
              {days.map((d) => {
                const e = d.events.find((x) => x.eventId === id)
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
                      <Text variant="headline">
                        {e.minutes === null ? '—' : t.clock(e.minutes)}
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
  const shown = days.map((d) => zmanimForDay(d.tags))
  const ids = [...DAILY_ZMANIM, 'candleLighting', 'havdalah'].filter((id) =>
    days.some((d, i) => shown[i].includes(id as ZmanId) && d.zmanim[id as ZmanId] !== undefined),
  ) as ZmanId[]
  ids.sort((a, b) => zmanOrder(a) - zmanOrder(b))
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
                  {t.zman(id)}
                </Text>
              }
            >
              {days.map((d, i) => {
                const m = shown[i].includes(id) ? d.zmanim[id] : undefined
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

function RowName({ name }: { name: Localized }) {
  const t = useT()
  return (
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
  )
}

/** Sponsorships first (the kiddush is what people look for), then announcements. */
function Notices({ notices }: { notices: Notice[] }) {
  const t = useT()
  const sponsors = notices.filter((n) => n.kind === 'sponsor')
  const announcements = notices.filter((n) => n.kind === 'announcement')
  return (
    <Stack gap="lg">
      {sponsors.length > 0 && (
        <Stack gap="sm">
          <Heading en={t.s.sponsorships} he={HE.s.sponsorships} />
          {sponsors.map((n) => (
            <NoticeBlock key={n.id} notice={n} />
          ))}
        </Stack>
      )}
      {announcements.length > 0 && (
        <Stack gap="sm">
          <Heading en={t.s.announcements} he={HE.s.announcements} />
          {announcements.map((n) => (
            <NoticeBlock key={n.id} notice={n} />
          ))}
        </Stack>
      )}
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
    </Stack>
  )
}

function Footer({ slug }: { slug: string }) {
  const t = useT()
  const url = `${SITE_URL}/${slug}`
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
