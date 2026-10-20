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

import { ShrinkToFit } from '@/components/ShrinkToFit'
import { ampm } from '@/features/luach/format'
import { zmanimForDay } from '@/features/luach/labels'
import { useT } from '@/features/luach/language'
import { nextUp, type NextUp } from '@/features/luach/nextUp'
import { Pill } from '@/features/luach/Pill'
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
  next?: NextUp
}) {
  const t = useT()
  const parsha = t.parsha(day)
  const extras = [...day.holidays.map(t.text), ...(parsha ? [parsha] : [])]
  return (
    <GradientCard padding="lg">
      <Stack height={HERO_INNER_H} gap="md">
        <Stack gap="xs">
          <Text variant="pageHeader" color={SemanticColor.TextOnAccent}>
            {t.text(name)}
          </Text>
          {t.bothNames && !!name.he && (
            <Text variant="pageHeader" rtl align="left" color={SemanticColor.TextOnAccent}>
              {name.he}
            </Text>
          )}
        </Stack>
        <Stack height={1} background={SemanticColor.SurfaceOnAccent} />

        <Stack gap="xs">
          <Stack direction="row" align="end" gap="sm">
            <Text variant="displayLarge" color={SemanticColor.TextOnAccent}>
              {t.clock(minutes)}
            </Text>
            {!t.customTimeFormat && (
              <Stack paddingBottom="md">
                <Text variant="titleLarge" color={SemanticColor.TextOnAccent}>
                  {ampm(minutes)}
                </Text>
              </Stack>
            )}
          </Stack>
          <Text variant="titleLarge" color={SemanticColor.TextOnAccent}>
            {t.weekday(day.weekday)}, {t.date(day.date)}
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
                {next.today ? t.s.next : t.s.tomorrow}
              </Text>
              <Stack grow />
              {next.today && (
                <Text variant="title" color={SemanticColor.TextOnAccent}>
                  {t.until(next.event.minutes - minutes)}
                </Text>
              )}
            </Stack>
            <Stack direction="row" align="end" gap="sm">
              <ShrinkToFit>
                <Text variant="displayMedium" numberOfLines={1} color={SemanticColor.TextOnAccent}>
                  {t.text(next.event.name)}
                </Text>
              </ShrinkToFit>
              <Text variant="displayMedium" color={SemanticColor.TextOnAccent}>
                {t.clock(next.event.minutes)}
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
              {t.s.timesOnPhone}
            </Text>
          </Stack>
        </Stack>
      </Stack>
    </GradientCard>
  )
}

// ---------------------------------------------------------------------------
// Today: the day's minyanim and shiurim, big

function Today({ day, minutes, next }: { day: DaySchedule; minutes: Minutes; next?: Occurrence }) {
  const t = useT()
  const compact = day.events.length > ROOMY_ROWS
  return (
    <Surface grow radius="xl" shadow="card">
      <Stack padding="lg" gap="sm">
        <PanelHeading en={t.s.today} he="סדר היום" />
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
            {t.s.noMinyanim}
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
  const t = useT()
  const big = compact ? 'pageHeader' : 'displayMedium'
  const tone = isNext ? SemanticColor.TextOnAccent : undefined
  const quiet = isNext ? SemanticColor.TextOnAccent : SemanticColor.TextSecondary
  const note = e.cancelled
    ? e.note
      ? `${t.s.cancelled} — ${t.text(e.note)}`
      : t.s.cancelled
    : e.note && t.text(e.note)
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
        <Text variant={big} numberOfLines={1} rtl={t.nameRtl} color={tone}>
          {t.text(e.name)}
        </Text>
        {!!note && (
          <Text variant="title" color={e.cancelled ? SemanticColor.TextDanger : quiet}>
            {note}
          </Text>
        )}
      </Stack>
      {t.bothNames && !!e.name.he && (
        <Text variant="pageHeader" rtl color={quiet}>
          {e.name.he}
        </Text>
      )}
      <Stack width={compact ? 80 : 100} align="end">
        <Text variant={big} color={tone}>
          {e.minutes === null ? '—' : t.clock(e.minutes)}
        </Text>
      </Stack>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Zmanim and the days ahead

function Zmanim({ day, minutes }: { day: DaySchedule; minutes: Minutes }) {
  const t = useT()
  return (
    <Surface radius="xl" shadow="card">
      <Stack padding="lg" gap="sm">
        <PanelHeading en={t.s.zmanim} he="זמני היום" />
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
                  {t.zman(id)}
                </Text>
                <Stack grow />
                <Text variant="titleLarge" color={lit ? SemanticColor.TextAccent : undefined}>
                  {t.clock(m)}
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
  const t = useT()
  const pages = upcomingDays(days)
  const i = useRotation(pages.length)
  const d = pages[i % pages.length]
  if (!d) return null
  const title = t.dayTitle(d)
  const events = d.events.filter((e) => e.minutes !== null || e.cancelled)
  return (
    <Surface grow radius="xl" shadow="card">
      <Stack fill padding="lg" gap="sm">
        <Stack gap="none">
          <Stack direction="row" align="center" gap="sm">
            <Text variant="headline" color={SemanticColor.TextSecondary}>
              {d === days[1] ? t.s.tomorrow : t.s.comingUp} · {t.dateShort(d.date)}
            </Text>
            <Stack grow />
            <Text variant="sectionHeader" rtl color={SemanticColor.TextAccent}>
              {d.hebrew.he}
            </Text>
          </Stack>
          <Text variant="pageHeader" numberOfLines={1}>
            {title}
          </Text>
          {d.holidays.length > 0 && (
            <Text variant="headline" color={SemanticColor.TextAccent}>
              {d.holidays.map(t.text).join(' · ')}
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
                rtl={t.nameRtl}
                color={e.cancelled ? SemanticColor.TextSecondary : undefined}
              >
                {t.text(e.name)}
              </Text>
              <Stack grow />
              <Text variant="title" color={e.cancelled ? SemanticColor.TextDanger : undefined}>
                {e.cancelled ? t.s.cancelled : t.clock(e.minutes!)}
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
  const t = useT()
  const i = useRotation(notices.length)
  if (!notices.length) return null
  const n = notices[i % notices.length]
  const sponsor = n.kind === 'sponsor'
  const when =
    n.to && n.to !== n.from ? `${t.dateShort(n.from)} – ${t.dateShort(n.to)}` : t.dateShort(n.from)
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
          {sponsor ? t.s.sponsored : t.s.announcement}
          {n.title ? ` · ${t.text(n.title)}` : ''}
        </Text>
        <Stack grow />
        <Text variant="headline" color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      <Text variant="headerTitleWide" numberOfLines={3} color={SemanticColor.TextPrimary}>
        {t.text(n.text)}
      </Text>
      {t.bothNames && !!n.text.he && (
        <Text variant="pageHeader" rtl numberOfLines={2} color={SemanticColor.TextSecondary}>
          {n.text.he}
        </Text>
      )}
      <Stack grow />
      {notices.length > 1 && <PageDots count={notices.length} index={i % notices.length} />}
    </Stack>
  )
}

// ---------------------------------------------------------------------------

/** In Hebrew when the page or its names are; with the Hebrew beside it when names show in both. */
function PanelHeading({ en, he }: { en: string; he: string }) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  return (
    <Stack direction="row" align="center" gap="sm" paddingBottom="xs">
      <Text variant="pageHeader" rtl={hebrew}>
        {hebrew ? he : en}
      </Text>
      <Stack grow />
      {!hebrew && t.bothNames && (
        <Text variant="pageHeader" rtl color={SemanticColor.TextAccent}>
          {he}
        </Text>
      )}
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
