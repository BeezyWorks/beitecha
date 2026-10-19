import {
  GradientCard,
  PageDots,
  QRCode,
  SemanticColor,
  Stack,
  Surface,
  Text,
} from '@beezyworks/design'
import type { DaySchedule, Minutes, Notice, Occurrence } from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import { ampm, civilDate, civilDateShort, clock, untilText } from '@/features/luach/format'
import { WEEKDAYS, ZMAN_LABELS, zmanimForDay } from '@/features/luach/labels'
import { SITE_URL } from '@/lib/config'

/** The canvas `DisplayScreen` scales to the screen: small enough that the DL's type ramp reads across a lobby. */
export const W = 1280
export const H = 720
const PAD = 24
const GAP = 16
const HERO_W = 360
const TODAY_W = 480
const SIDE_W = W - 2 * PAD - HERO_W - TODAY_W - 2 * GAP
/** The hero's content, inside the gradient card's own `lg` padding. */
const HERO_INNER_H = H - 2 * PAD - 2 * 24
/** More rows than this and Today switches to compact rows. */
const ROOMY_ROWS = 6
const NOTICE_H = 200
const ROTATE_MS = 12_000

export interface BoardProps {
  name: { en: string; he?: string }
  slug: string
  days: DaySchedule[]
  minutes: Minutes
  notices: Notice[]
}

export function Board({ name, slug, days, minutes, notices }: BoardProps) {
  const [day, tomorrow] = days
  const next = nextUp(day, tomorrow, minutes)
  return (
    <Stack fill direction="row" padding={PAD} gap={GAP}>
      <Stack width={HERO_W}>
        <Hero name={name} slug={slug} day={day} minutes={minutes} next={next} />
      </Stack>
      <Stack width={TODAY_W} gap={GAP}>
        <Today day={day} minutes={minutes} next={next?.today ? next.event : undefined} />
        <NoticeRotator notices={notices} />
      </Stack>
      <Stack width={SIDE_W} gap={GAP}>
        <Zmanim day={day} minutes={minutes} />
        <ComingUp days={days} />
      </Stack>
    </Stack>
  )
}

interface Next {
  event: Occurrence & { minutes: Minutes }
  /** False when today is over and this is tomorrow's first. */
  today: boolean
}

function nextUp(
  day: DaySchedule,
  tomorrow: DaySchedule | undefined,
  now: Minutes,
): Next | undefined {
  const upcoming = (d: DaySchedule | undefined, from: Minutes) =>
    d?.events.find(
      (e): e is Next['event'] => !e.cancelled && e.minutes !== null && e.minutes >= from,
    )
  const today = upcoming(day, now)
  if (today) return { event: today, today: true }
  const first = upcoming(tomorrow, 0)
  return first && { event: first, today: false }
}

// ---------------------------------------------------------------------------
// Hero: the shul, the time, the day, what's next

function Hero({
  name,
  slug,
  day,
  minutes,
  next,
}: {
  name: BoardProps['name']
  slug: string
  day: DaySchedule
  minutes: Minutes
  next?: Next
}) {
  const extras = [
    ...day.holidays.map((h) => h.en),
    ...(day.parsha ? [`Parshas ${day.parsha.en}`] : []),
  ]
  return (
    <GradientCard padding="lg">
      <Stack height={HERO_INNER_H} gap="md">
        <Stack gap="xs">
          <Text variant="pageHeader" color={SemanticColor.TextOnAccent}>
            {name.en}
          </Text>
          {!!name.he && (
            <Text variant="largeTitle" rtl align="left" color={SemanticColor.TextOnAccent}>
              {name.he}
            </Text>
          )}
        </Stack>
        <Stack height={1} background={SemanticColor.SurfaceOnAccent} />

        <Stack gap="xs">
          <Stack direction="row" align="end" gap="sm">
            <Text variant="displayLarge" color={SemanticColor.TextOnAccent}>
              {clock(minutes)}
            </Text>
            <Stack paddingBottom="md">
              <Text variant="titleLarge" color={SemanticColor.TextOnAccent}>
                {ampm(minutes)}
              </Text>
            </Stack>
          </Stack>
          <Text variant="titleLarge" color={SemanticColor.TextOnAccent}>
            {WEEKDAYS[day.weekday].en}, {civilDate(day.date)}
          </Text>
          <Text variant="displayMedium" rtl align="left" color={SemanticColor.TextOnAccent}>
            {day.hebrew.he}
          </Text>
          {extras.length > 0 && (
            <Stack direction="row" wrap gap="xs" paddingTop="xs">
              {extras.map((x) => (
                <Pill key={x} label={x} />
              ))}
            </Stack>
          )}
        </Stack>

        <Stack grow />

        {next && (
          <Stack radius="xl" padding="md" gap="xs" background={SemanticColor.SurfaceOnAccent}>
            <Stack direction="row" align="center" gap="sm">
              <Text variant="title" color={SemanticColor.TextOnAccent}>
                {next.today ? 'Next' : 'Tomorrow'}
              </Text>
              <Stack grow />
              {next.today && (
                <Text variant="title" color={SemanticColor.TextOnAccent}>
                  {untilText(next.event.minutes - minutes)}
                </Text>
              )}
            </Stack>
            <Stack direction="row" align="end" gap="sm">
              <Stack grow>
                <Text variant="displayMedium" numberOfLines={1} color={SemanticColor.TextOnAccent}>
                  {next.event.name.en}
                </Text>
              </Stack>
              <Text variant="displayMedium" color={SemanticColor.TextOnAccent}>
                {clock(next.event.minutes)}
              </Text>
            </Stack>
          </Stack>
        )}

        <Stack direction="row" align="center" gap="md">
          <Stack radius="md" overflow="hidden" background={SemanticColor.SurfaceCard} padding="xs">
            <QRCode value={`${SITE_URL}/${slug}`} size={72} logo={false} />
          </Stack>
          <Stack grow gap="xs">
            <Text variant="title" color={SemanticColor.TextOnAccent}>
              Times on your phone
            </Text>
            <Text variant="headline" color={SemanticColor.TextOnAccent}>
              {SITE_URL.replace(/^https?:\/\//, '')}/{slug}
            </Text>
          </Stack>
        </Stack>
      </Stack>
    </GradientCard>
  )
}

function Pill({ label }: { label: string }) {
  return (
    <Stack
      radius="full"
      paddingHorizontal="sm"
      paddingVertical="xs"
      background={SemanticColor.SurfaceOnAccent}
    >
      <Text variant="headline" color={SemanticColor.TextOnAccent}>
        {label}
      </Text>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Today: the day's minyanim and shiurim, big

function Today({ day, minutes, next }: { day: DaySchedule; minutes: Minutes; next?: Occurrence }) {
  const compact = day.events.length > ROOMY_ROWS
  return (
    <Surface grow radius="xl" shadow="card">
      <Stack padding="lg" gap="sm">
        <PanelHeading en="Today" he="סדר היום" />
        {day.events.length ? (
          <Stack gap={compact ? 'xs' : 'sm'}>
            {day.events.map((e, i) => (
              <Stack key={e.eventId} gap={compact ? 'xs' : 'sm'}>
                {i > 0 && <Stack height={1} background={SemanticColor.BorderDefault} />}
                <TodayRow
                  event={e}
                  isNext={e === next}
                  past={e.minutes !== null && e.minutes < minutes}
                  compact={compact}
                />
              </Stack>
            ))}
          </Stack>
        ) : (
          <Text variant="titleLarge" color={SemanticColor.TextSecondary}>
            No minyanim listed today
          </Text>
        )}
      </Stack>
    </Surface>
  )
}

function TodayRow({
  event: e,
  isNext,
  past,
  compact,
}: {
  event: Occurrence
  isNext: boolean
  past: boolean
  compact: boolean
}) {
  const big = compact ? 'pageHeader' : 'displayMedium'
  const tone = isNext ? SemanticColor.TextOnAccent : undefined
  const quiet = isNext ? SemanticColor.TextOnAccent : SemanticColor.TextSecondary
  const note = e.cancelled ? (e.note ? `Cancelled — ${e.note.en}` : 'Cancelled') : e.note?.en
  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      paddingHorizontal="md"
      paddingVertical={compact ? 'xs' : 'sm'}
      radius="lg"
      background={isNext ? SemanticColor.AccentPrimaryStrong : undefined}
      opacity={past || e.cancelled ? 0.4 : 1}
    >
      <Stack grow gap="none">
        <Text variant={big} numberOfLines={1} color={tone}>
          {e.name.en}
        </Text>
        {!!note && (
          <Text variant="title" color={e.cancelled ? SemanticColor.TextDanger : quiet}>
            {note}
          </Text>
        )}
      </Stack>
      {!!e.name.he && (
        <Text variant="largeTitle" rtl color={quiet}>
          {e.name.he}
        </Text>
      )}
      <Stack width={compact ? 80 : 100} align="end">
        <Text variant={big} color={tone}>
          {e.minutes === null ? '—' : clock(e.minutes)}
        </Text>
      </Stack>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Zmanim and the days ahead

function Zmanim({ day, minutes }: { day: DaySchedule; minutes: Minutes }) {
  return (
    <Surface radius="xl" shadow="card">
      <Stack padding="lg" gap="sm">
        <PanelHeading en="Zmanim" he="זמני היום" />
        <Stack gap="none">
          {zmanimForDay(day.tags).map((id) => {
            const m = day.zmanim[id]
            if (m === undefined) return null
            const lit = id === 'candleLighting' || id === 'havdalah'
            return (
              <Stack
                key={id}
                direction="row"
                align="center"
                gap="sm"
                paddingVertical={2}
                opacity={m < minutes ? 0.45 : 1}
              >
                <Text
                  variant="headline"
                  color={lit ? SemanticColor.TextAccent : SemanticColor.TextSecondary}
                >
                  {ZMAN_LABELS[id].en}
                </Text>
                <Stack grow />
                <Text variant="titleLarge" color={lit ? SemanticColor.TextAccent : undefined}>
                  {clock(m)}
                </Text>
              </Stack>
            )
          })}
        </Stack>
      </Stack>
    </Surface>
  )
}

/** Tomorrow, and this Shabbos when it's further off, taking turns. */
function ComingUp({ days }: { days: DaySchedule[] }) {
  const pages = upcomingDays(days)
  const i = useRotation(pages.length)
  const d = pages[i % pages.length]
  if (!d) return null
  const title = d.weekday === 6 && d.parsha ? `Shabbos ${d.parsha.en}` : WEEKDAYS[d.weekday].en
  const events = d.events.filter((e) => e.minutes !== null || e.cancelled)
  return (
    <Surface grow radius="xl" shadow="card">
      <Stack fill padding="lg" gap="sm">
        <Stack gap="none">
          <Stack direction="row" align="center" gap="sm">
            <Text variant="headline" color={SemanticColor.TextSecondary}>
              {d === days[1] ? 'Tomorrow' : 'Coming up'} · {civilDateShort(d.date)}
            </Text>
            <Stack grow />
            <Text variant="headline" rtl color={SemanticColor.TextAccent}>
              {d.hebrew.he}
            </Text>
          </Stack>
          <Text variant="pageHeader" numberOfLines={1}>
            {title}
          </Text>
          {d.holidays.length > 0 && (
            <Text variant="headline" color={SemanticColor.TextAccent}>
              {d.holidays.map((h) => h.en).join(' · ')}
            </Text>
          )}
        </Stack>
        <Stack height={1} background={SemanticColor.BorderDefault} />
        <Stack gap="xs">
          {events.map((e) => (
            <Stack key={e.eventId} direction="row" align="center" gap="sm">
              <Text
                variant="title"
                numberOfLines={1}
                color={e.cancelled ? SemanticColor.TextSecondary : undefined}
              >
                {e.name.en}
              </Text>
              <Stack grow />
              <Text variant="title" color={e.cancelled ? SemanticColor.TextDanger : undefined}>
                {e.cancelled ? 'Cancelled' : clock(e.minutes!)}
              </Text>
            </Stack>
          ))}
        </Stack>
        <Stack grow />
        {pages.length > 1 && <PageDots count={pages.length} index={i % pages.length} />}
      </Stack>
    </Surface>
  )
}

function upcomingDays(days: DaySchedule[]): DaySchedule[] {
  const [, tomorrow, ...later] = days
  const out = tomorrow ? [tomorrow] : []
  const shabbos = later.find((d) => d.weekday === 6)
  if (shabbos && tomorrow?.weekday !== 6) out.push(shabbos)
  return out
}

// ---------------------------------------------------------------------------
// Sponsors and announcements

function NoticeRotator({ notices }: { notices: Notice[] }) {
  const i = useRotation(notices.length)
  if (!notices.length) return null
  const n = notices[i % notices.length]
  const sponsor = n.kind === 'sponsor'
  const when =
    n.to && n.to !== n.from
      ? `${civilDateShort(n.from)} – ${civilDateShort(n.to)}`
      : civilDateShort(n.from)
  return (
    <Stack
      key={n.id}
      height={NOTICE_H}
      radius="xl"
      padding="lg"
      gap="sm"
      background={sponsor ? SemanticColor.AccentTint : SemanticColor.SurfaceCard}
      borderWidth={1}
      borderColor={sponsor ? SemanticColor.AccentTintSelected : SemanticColor.BorderDefault}
    >
      <Stack direction="row" align="center" gap="sm">
        <Text variant="title" color={SemanticColor.TextAccent}>
          {sponsor ? 'Sponsored' : 'Announcement'}
          {n.title ? ` · ${n.title.en}` : ''}
        </Text>
        <Stack grow />
        <Text variant="headline" color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      <Text variant="headerTitleWide" numberOfLines={3} color={SemanticColor.TextPrimary}>
        {n.text.en}
      </Text>
      {!!n.text.he && (
        <Text variant="titleLarge" rtl numberOfLines={2} color={SemanticColor.TextSecondary}>
          {n.text.he}
        </Text>
      )}
      <Stack grow />
      {notices.length > 1 && <PageDots count={notices.length} index={i % notices.length} />}
    </Stack>
  )
}

// ---------------------------------------------------------------------------

function PanelHeading({ en, he }: { en: string; he: string }) {
  return (
    <Stack direction="row" align="center" gap="sm" paddingBottom="xs">
      <Text variant="pageHeader">{en}</Text>
      <Stack grow />
      <Text variant="titleLarge" rtl color={SemanticColor.TextAccent}>
        {he}
      </Text>
    </Stack>
  )
}

/** Steps 0, 1, 2… every `ROTATE_MS` while there's more than one thing to show. */
function useRotation(count: number) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (count < 2) return
    const t = setInterval(() => setI((n) => n + 1), ROTATE_MS)
    return () => clearInterval(t)
  }, [count])
  return i
}
