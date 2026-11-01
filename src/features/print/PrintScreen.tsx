import { Button } from '@beezyworks/design'
import { startOfWeek } from '@beitecha/engine'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'

import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { paperFor, PrintRoot, printBrand, type Paper } from '@/components/Print'
import { ThemeRoot } from '@/components/ThemeRoot'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { PrintSheets, printLayout } from './PrintSheets'
import { PrintToolbar } from './PrintToolbar'
import { useWeek } from './useWeek'
import { hasAnnouncements } from './WeekSheet'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The week on paper for the shul's tables: Shabbos, the weekday minyanim and the zmanim on
 * the front; the week's shiurim, starred events coming up, sponsorships and announcements on the
 * back (or all on one side), as many pages as the shul's print settings allow.
 */
export function PrintScreen({ slug }: { slug: string }) {
  const params = useLocalSearchParams<{ week?: string; paper?: string }>()
  const { feed, notFound, error } = useShulFeed(slug)
  const tz = feed?.schedule.settings.location.timeZone
  const { today } = useShulClock(tz, 60_000)
  const sunday = startOfWeek(params.week && DATE_RE.test(params.week) ? params.week : today)
  const week = useWeek(slug, feed?.profile, feed?.schedule, sunday)
  const t = makeT(
    feed?.schedule.settings.language,
    feed?.schedule.settings.timeFormat,
    feed?.schedule.settings.names,
  )
  usePageTitle(feed ? `${feed.profile.name.en} · Print · Beitecha` : undefined)

  if (!feed) {
    if (notFound) return <Centered title="No such shul" body={`Nothing lives at /${slug} yet.`} />
    if (error) return <Centered title="Couldn’t load the schedule" body={error} />
    return <Centered loading />
  }
  if (!week) return <Centered loading />

  const paper: Paper =
    params.paper === 'a4' || params.paper === 'letter' ? params.paper : paperFor(tz!)
  const { maxPages, textSize, ink } = printLayout(feed.schedule.settings.print)
  // A new layout starts its fit-to-page over.
  const key = `${sunday}|${paper}|${maxPages}|${textSize}`

  return (
    <ThemeRoot brandColor={printBrand(ink, feed.profile.brandColor)} mode="light">
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <PrintRoot
          paper={paper}
          toolbar={
            <PrintToolbar
              sunday={sunday}
              onSunday={(week) => router.setParams({ week })}
              paper={paper}
              onPaper={(p) => router.setParams({ paper: p })}
              leading={
                <Button
                  variant="ghost"
                  size="sm"
                  title="Back"
                  icon="chevron-left"
                  onPress={() => router.replace(`/${slug}/admin?s=print`)}
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
          <PrintSheets
            key={key}
            week={week}
            paper={paper}
            rtl={t.rtl}
            maxPages={maxPages}
            textSize={textSize}
          />
        </PrintRoot>
      </LanguageProvider>
    </ThemeRoot>
  )
}
