import { SemanticColor, Stack } from '@beezyworks/design'
import { addDays, yahrzeitsBetween } from '@beitecha/engine'
import React from 'react'

import { Blackout } from '@/components/Blackout'
import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { ScaleToFit } from '@/components/ScaleToFit'
import { ThemeRoot } from '@/components/ThemeRoot'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { Board, CANVAS } from './Board'
import { driftFor, findSetup, isAsleep } from './setup'
import { useDisplayUpkeep } from './useDisplayUpkeep'

const POLL_MS = 5 * 60_000

/** The monitor in the lobby: point a TV's browser here and leave it. `setup` is the id in `/<slug>/display/<id>`. */
export function DisplayScreen({ slug, setup: setupId }: { slug: string; setup?: string }) {
  const { feed, notFound } = useShulFeed(slug, POLL_MS)
  const tz = feed?.schedule.settings.location.timeZone
  const { today, minutes } = useShulClock(tz, 5_000)
  // From yesterday: when today is Shabbos, yesterday is the erev its minyanim start from.
  const [yesterday, ...days] = useDays(feed?.schedule, addDays(today, -1), 9)
  const displays = feed?.schedule.settings.displays
  const setup = findSetup(displays, setupId)
  useDisplayUpkeep(slug, today, setup?.id)
  const t = makeT(
    feed?.schedule.settings.language,
    feed?.schedule.settings.timeFormat,
    feed?.schedule.settings.names,
  )
  usePageTitle(feed ? `${t.text(feed.profile.name)} · Display` : undefined)

  if (!feed)
    return notFound ? (
      <Centered title="No such shul" body={`Check the address: /${slug}/display`} />
    ) : (
      <Centered loading />
    )
  if (!setup)
    return <Centered title="No such display" body={`Check the address: /${slug}/display`} />

  // OLED panels burn in, so they default to the dark theme.
  const mode = setup.theme ?? (setup.screen === 'oled' ? 'dark' : 'light')
  const { width, height } = CANVAS[setup.orientation ?? 'landscape']
  const notices = feed.schedule.notices
    .filter((n) => (n.to ?? n.from) >= today && n.from <= addDays(today, 7))
    .sort((a, b) => a.from.localeCompare(b.from))
  const asleep = !!days[0] && isAsleep(setup.sleep, days[0], minutes)

  return (
    <ThemeRoot brandColor={feed.profile.brandColor} mode={mode}>
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <Stack fill background={SemanticColor.SurfaceBackground}>
          <ScaleToFit width={width} height={height} shift={driftFor(setup.screen, minutes)}>
            {days[0] && !asleep && (
              <Board
                name={feed.profile.name}
                slug={slug}
                setup={setup}
                yesterday={yesterday}
                days={days}
                minutes={minutes}
                notices={notices}
                categories={feed.schedule.settings.noticeCategories}
                cholim={feed.schedule.cholim ?? []}
                yahrzeits={yahrzeitsBetween(
                  feed.schedule.yahrzeits,
                  days[0].date,
                  addDays(days[0].date, (feed.schedule.settings.yahrzeits?.days ?? 7) - 1),
                )}
                yahrzeitSettings={feed.schedule.settings.yahrzeits}
                shabbosZmanim={feed.schedule.settings.print?.shabbosZmanim}
              />
            )}
          </ScaleToFit>
          {asleep && <Blackout />}
        </Stack>
      </LanguageProvider>
    </ThemeRoot>
  )
}
