import { SemanticColor, Stack, Text } from '@beezyworks/design'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'

import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { paperFor, BulletinRoot, bulletinBrand, type Paper } from '@/components/Bulletin'
import { ThemeRoot } from '@/components/ThemeRoot'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { BulletinSheets, bulletinLayout } from './BulletinSheets'
import { BulletinToolbar } from './BulletinToolbar'
import { rangeFromParams, shiftRange, weekContaining } from './range'
import { useWeek } from './useWeek'
import { hasAnnouncements } from './WeekSheet'

/**
 * The week on paper for the shul's tables: Shabbos, the weekday minyanim and the zmanim on
 * the front; the week's shiurim, starred events coming up, sponsorships and announcements on the
 * back (or all on one side), as many pages as the shul's print settings allow.
 */
export function BulletinScreen({ slug }: { slug: string }) {
  const params = useLocalSearchParams<{
    week?: string
    from?: string
    to?: string
    paper?: string
  }>()
  const { feed, notFound, error } = useShulFeed(slug)
  const tz = feed?.schedule.settings.location.timeZone
  const { today } = useShulClock(tz, 60_000)
  const print = feed?.schedule.settings.print
  const asked = rangeFromParams(params, today, print)
  // Anyone may open this page, so the shul decides how far from this week it goes (`publicPast`/`publicFuture`).
  // A week the shul hasn't opened shows this week instead; one ahead of it is marked tentative.
  const current = weekContaining(today, print)
  const early = asked.from < current.from
  const late = asked.to > current.to
  const range = (early && !print?.publicPast) || (late && !print?.publicFuture) ? current : asked
  const tentative = range.to > current.to
  const canPrev = !!print?.publicPast || shiftRange(range, -1).to >= current.from
  const canNext = !!print?.publicFuture || shiftRange(range, 1).from <= current.to
  const week = useWeek(slug, feed?.profile, feed?.schedule, range)
  const t = makeT(
    feed?.schedule.settings.language,
    feed?.schedule.settings.timeFormat,
    feed?.schedule.settings.names,
  )
  const shown = React.useMemo(() => week && { ...week, tentative }, [week, tentative])
  usePageTitle(feed ? `${feed.profile.name.en} · Bulletin · Beitecha` : undefined)

  if (!feed) {
    if (notFound) return <Centered title="No such shul" body={`Nothing lives at /${slug} yet.`} />
    if (error) return <Centered title="Couldn’t load the schedule" body={error} />
    return <Centered loading />
  }
  if (!shown) return <Centered loading />

  const paper: Paper =
    params.paper === 'a4' || params.paper === 'letter' ? params.paper : paperFor(tz!)
  const { maxPages, textSize, ink } = bulletinLayout(feed.schedule.settings.print)
  // A new layout starts its fit-to-page over.
  const key = `${range.from}|${range.to}|${paper}|${maxPages}|${textSize}`

  return (
    <ThemeRoot brandColor={bulletinBrand(ink, feed.profile.brandColor)} mode="light">
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <BulletinRoot
          paper={paper}
          toolbar={
            <BulletinToolbar
              range={range}
              onRange={({ from, to }) => router.setParams({ week: undefined, from, to })}
              canPrev={canPrev}
              canNext={canNext}
              canEditDates={false}
              usual={weekContaining(range.from, print)}
              paper={paper}
              onPaper={(p) => router.setParams({ paper: p })}
              leading={
                tentative ? (
                  <Stack padding="sm" radius="sm" background={SemanticColor.AccentAlertFaded}>
                    <Text variant="bodyStrong" color={SemanticColor.TextDanger}>
                      Tentative — this week’s plans may still change
                    </Text>
                  </Stack>
                ) : null
              }
              note={
                maxPages > 1 && hasAnnouncements(shown)
                  ? 'Print double-sided, flip on long edge.'
                  : undefined
              }
            />
          }
        >
          <BulletinSheets
            key={key}
            week={shown}
            paper={paper}
            rtl={t.rtl}
            maxPages={maxPages}
            textSize={textSize}
          />
        </BulletinRoot>
      </LanguageProvider>
    </ThemeRoot>
  )
}
