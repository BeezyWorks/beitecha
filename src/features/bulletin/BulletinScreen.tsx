import { Button } from '@beezyworks/design'
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
import { rangeFromParams, weekContaining } from './range'
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
  const range = rangeFromParams(params, today, print)
  const week = useWeek(slug, feed?.profile, feed?.schedule, range)
  const t = makeT(
    feed?.schedule.settings.language,
    feed?.schedule.settings.timeFormat,
    feed?.schedule.settings.names,
  )
  usePageTitle(feed ? `${feed.profile.name.en} · Bulletin · Beitecha` : undefined)

  if (!feed) {
    if (notFound) return <Centered title="No such shul" body={`Nothing lives at /${slug} yet.`} />
    if (error) return <Centered title="Couldn’t load the schedule" body={error} />
    return <Centered loading />
  }
  if (!week) return <Centered loading />

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
              usual={weekContaining(range.from, print)}
              paper={paper}
              onPaper={(p) => router.setParams({ paper: p })}
              leading={
                <Button
                  variant="ghost"
                  size="sm"
                  title="Back"
                  icon="chevron-left"
                  onPress={() => router.replace(`/${slug}/admin?s=bulletin`)}
                />
              }
              note={
                maxPages > 1 && hasAnnouncements(week)
                  ? 'Print double-sided, flip on long edge.'
                  : undefined
              }
            />
          }
        >
          <BulletinSheets
            key={key}
            week={week}
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
