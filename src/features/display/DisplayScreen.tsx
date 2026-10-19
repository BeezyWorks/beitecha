import { SemanticColor, Stack } from '@beezyworks/design'
import { addDays } from '@beitecha/engine'
import { useLocalSearchParams } from 'expo-router'
import React from 'react'

import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { ScaleToFit } from '@/components/ScaleToFit'
import { ThemeRoot } from '@/components/ThemeRoot'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { Board, H, W } from './Board'
import { useDisplayUpkeep } from './useDisplayUpkeep'

const POLL_MS = 5 * 60_000

/** The monitor in the lobby: point a TV's browser here and leave it. */
export function DisplayScreen({ slug }: { slug: string }) {
  const params = useLocalSearchParams<{ theme?: string; label?: string }>()
  const { feed, notFound } = useShulFeed(slug, POLL_MS)
  const tz = feed?.schedule.settings.location.timeZone
  const { today, minutes } = useShulClock(tz, 5_000)
  const days = useDays(feed?.schedule, today, 8)
  useDisplayUpkeep(slug, today, params.label)
  usePageTitle(feed ? `${feed.profile.name.en} · Display` : undefined)

  if (!feed)
    return notFound ? (
      <Centered title="No such shul" body={`Check the address: /${slug}/display`} />
    ) : (
      <Centered loading />
    )

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
