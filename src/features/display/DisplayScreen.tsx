import { QRCode, SemanticColor, Stack, Surface, Text } from '@beezyworks/design'
import { addDays, type DaySchedule, type Notice } from '@beitecha/engine'
import { useLocalSearchParams } from 'expo-router'
import React, { useEffect, useState } from 'react'

import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { ScaleToFit } from '@/components/ScaleToFit'
import { ThemeRoot } from '@/components/ThemeRoot'
import { NoticeCard } from '@/features/luach/NoticeCard'
import { TimesList } from '@/features/luach/TimesList'
import { ZmanimList } from '@/features/luach/ZmanimList'
import { ampm, civilDate, clock, untilText } from '@/features/luach/format'
import { WEEKDAYS } from '@/features/luach/labels'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { SITE_URL } from '@/lib/config'
import { useDisplayUpkeep } from './useDisplayUpkeep'

const W = 1600
const H = 900
const PAD = 32
const GAP = 24
const TODAY_W = 640
const ZMANIM_W = 400
/** Fixed rather than `grow`: a growing column takes its content's width and pushes off the canvas. */
const SIDE_W = W - 2 * PAD - TODAY_W - ZMANIM_W - 2 * GAP
const POLL_MS = 5 * 60_000
const NOTICE_MS = 12_000

/** The monitor in the lobby: point a TV's browser here and leave it. */
export function DisplayScreen({ slug }: { slug: string }) {
  const params = useLocalSearchParams<{ theme?: string; label?: string }>()
  const { feed, notFound } = useShulFeed(slug, POLL_MS)
  const tz = feed?.schedule.settings.location.timeZone
  const { today, minutes } = useShulClock(tz, 5_000)
  const days = useDays(feed?.schedule, today, 8)
  useDisplayUpkeep(slug, today, params.label)
  usePageTitle(feed ? `${feed.profile.name.en} · Display` : undefined)

  if (!feed) return notFound ? <Centered title="No such shul" body={`Check the address: /${slug}/display`} /> : <Centered loading />

  const mode = params.theme === 'dark' ? 'dark' : 'light'
  // Drift a pixel or two each hour so nothing sits still for days.
  const hour = Math.floor(minutes / 60)
  const shift = { x: (hour % 3) - 1, y: (Math.floor(hour / 3) % 3) - 1 }
  const notices = feed.schedule.notices
    .filter((n) => (n.to ?? n.from) >= today && n.from <= addDays(today, 7))
    .sort((a, b) => a.from.localeCompare(b.from))

  return (
    <ThemeRoot brandColor={feed.profile.brandColor} mode={mode}>
      <Stack fill background={SemanticColor.SurfaceBackground}>
        <ScaleToFit width={W} height={H} shift={shift}>
          {days[0] && (
            <Board
              name={feed.profile.name}
              slug={slug}
              days={days}
              minutes={minutes}
              notices={notices}
            />
          )}
        </ScaleToFit>
      </Stack>
    </ThemeRoot>
  )
}

function Board({
  name,
  slug,
  days,
  minutes,
  notices,
}: {
  name: { en: string; he?: string }
  slug: string
  days: DaySchedule[]
  minutes: number
  notices: Notice[]
}) {
  const [day] = days
  const next = day.events.find((e) => !e.cancelled && e.minutes !== null && e.minutes >= minutes)
  const extras = [...day.holidays.map((h) => h.en), ...(day.parsha ? [`Parshas ${day.parsha.en}`] : [])]
  const upcoming = upcomingDays(days)

  return (
    <Stack fill padding="xl" gap="lg">
      {/* Header: shul, clock, date */}
      <Stack direction="row" align="center" gap="xl">
        <Stack grow gap="xs">
          <Text variant="displayMedium" color={SemanticColor.TextAccent}>
            {name.en}
          </Text>
          {!!name.he && (
            <Text variant="largeTitle" rtl align="left" color={SemanticColor.TextSecondary}>
              {name.he}
            </Text>
          )}
        </Stack>
        <Stack direction="row" align="end" gap="xs">
          <Text variant="displayLarge">{clock(minutes)}</Text>
          <Stack paddingBottom="sm">
            <Text variant="titleLarge" color={SemanticColor.TextSecondary}>
              {ampm(minutes)}
            </Text>
          </Stack>
        </Stack>
        <Stack grow align="end" gap="xs">
          <Text variant="largeTitle">
            {WEEKDAYS[day.weekday].en}, {civilDate(day.date)}
          </Text>
          <Text variant="largeTitle" rtl color={SemanticColor.TextAccent}>
            {day.hebrew.he}
          </Text>
          {extras.length > 0 && (
            <Text variant="titleLarge" color={SemanticColor.TextAccent}>
              {extras.join(' · ')}
            </Text>
          )}
        </Stack>
      </Stack>

      <Stack direction="row" grow gap="lg">
        {/* Today */}
        <Stack width={TODAY_W} gap="md">
          {next && next.minutes !== null && (
            <Stack direction="row" align="center" gap="md" padding="md" radius="lg" background={SemanticColor.AccentPrimary}>
              <Text variant="largeTitle" color={SemanticColor.TextOnAccent}>
                Next: {next.name.en} at {clock(next.minutes)}
              </Text>
              <Stack grow />
              <Text variant="largeTitle" color={SemanticColor.TextOnAccent}>
                {untilText(next.minutes - minutes)}
              </Text>
            </Stack>
          )}
          <Surface grow radius="xl" shadow="card">
            <Stack padding="lg" gap="sm">
              <Text variant="largeTitle" color={SemanticColor.TextAccent}>
                Today
              </Text>
              {day.events.length ? (
                <TimesList events={day.events} now={minutes} size="display" />
              ) : (
                <Text variant="titleLarge" color={SemanticColor.TextSecondary}>
                  No minyanim listed today
                </Text>
              )}
            </Stack>
          </Surface>
        </Stack>

        {/* Zmanim */}
        <Stack width={ZMANIM_W}>
          <Surface grow radius="xl" shadow="card">
            <Stack padding="lg" gap="sm">
              <Text variant="largeTitle" color={SemanticColor.TextAccent}>
                Zmanim
              </Text>
              <ZmanimList day={day} size="display" />
            </Stack>
          </Surface>
        </Stack>

        {/* Coming up + sponsors */}
        <Stack width={SIDE_W} gap="md">
          {upcoming.map((d) => (
            <Surface key={d.date} radius="xl" shadow="card">
              <Stack padding="md" gap="xs">
                <Stack direction="row" align="center" gap="sm">
                  <Text variant="largeTitle" color={SemanticColor.TextAccent}>
                    {d.weekday === 6 && d.parsha ? `Shabbos ${d.parsha.en}` : WEEKDAYS[d.weekday].en}
                  </Text>
                  <Stack grow />
                  <Text variant="body" rtl color={SemanticColor.TextSecondary}>
                    {d.hebrew.he}
                  </Text>
                </Stack>
                {d.holidays.length > 0 && (
                  <Text variant="body" color={SemanticColor.TextAccent}>
                    {d.holidays.map((h) => h.en).join(' · ')}
                  </Text>
                )}
                {d.events
                  .filter((e) => e.minutes !== null || e.cancelled)
                  .map((e) => (
                    <Stack key={e.eventId} direction="row" gap="sm">
                      <Text variant="title">{e.name.en}</Text>
                      <Stack grow />
                      <Text variant="title" color={e.cancelled ? SemanticColor.TextDanger : undefined}>
                        {e.cancelled ? 'Cancelled' : clock(e.minutes!)}
                      </Text>
                    </Stack>
                  ))}
              </Stack>
            </Surface>
          ))}
          <Stack grow />
          <NoticeRotator notices={notices} />
          <Stack direction="row" align="center" justify="end" gap="md">
            <Stack align="end" gap="xs">
              <Text variant="title">Times on your phone</Text>
              <Text variant="body" color={SemanticColor.TextSecondary}>
                {SITE_URL.replace(/^https?:\/\//, '')}/{slug}
              </Text>
            </Stack>
            <QRCode value={`${SITE_URL}/${slug}`} size={120} logo={false} />
          </Stack>
        </Stack>
      </Stack>

    </Stack>
  )
}

/** Tomorrow, and this Shabbos when it's further off. */
function upcomingDays(days: DaySchedule[]): DaySchedule[] {
  const [, tomorrow, ...later] = days
  const out = tomorrow ? [tomorrow] : []
  const shabbos = later.find((d) => d.weekday === 6)
  if (shabbos && tomorrow?.weekday !== 6) out.push(shabbos)
  return out
}

function NoticeRotator({ notices }: { notices: Notice[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (notices.length < 2) return
    const t = setInterval(() => setI((n) => n + 1), NOTICE_MS)
    return () => clearInterval(t)
  }, [notices.length])
  if (!notices.length) return null
  const notice = notices[i % notices.length]
  return <NoticeCard key={notice.id} notice={notice} size="display" />
}
