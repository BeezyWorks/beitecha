import { Button, SegmentedControl, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays, startOfWeek, type DateString } from '@beitecha/engine'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'

import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { paperFor, PrintRoot, PrintSheet, type Paper } from '@/components/Print'
import { ThemeRoot } from '@/components/ThemeRoot'
import { civilDateShort } from '@/features/luach/format'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { NoticesSide, TimesSide } from './WeekSheet'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The week on paper for the shul's tables: Shabbos, the weekday minyanim and the zmanim on
 * the front, sponsorships and announcements on the back (or all on one side).
 */
export function PrintScreen({ slug }: { slug: string }) {
  const params = useLocalSearchParams<{ week?: string; paper?: string; sides?: string }>()
  const { feed, notFound, error } = useShulFeed(slug)
  const tz = feed?.schedule.settings.location.timeZone
  const { today } = useShulClock(tz, 60_000)
  const sunday = startOfWeek(params.week && DATE_RE.test(params.week) ? params.week : today)
  const days = useDays(feed?.schedule, sunday, 7)
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
  if (days.length < 7) return <Centered loading />

  const paper: Paper =
    params.paper === 'a4' || params.paper === 'letter' ? params.paper : paperFor(tz!)
  const shabbos = addDays(sunday, 6)
  const notices = feed.schedule.notices
    .filter((n) => (n.to ?? n.from) >= sunday && n.from <= shabbos)
    .sort((a, b) => a.from.localeCompare(b.from))
  const twoSided = notices.length > 0 && params.sides !== '1'
  const week = { slug, profile: feed.profile, days, notices }
  // A new layout starts its fit-to-page over.
  const key = `${sunday}|${paper}|${twoSided}`

  return (
    <ThemeRoot brandColor={feed.profile.brandColor} mode="light">
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <PrintRoot
          paper={paper}
          toolbar={
            <Toolbar
              slug={slug}
              sunday={sunday}
              paper={paper}
              twoSided={twoSided}
              hasNotices={notices.length > 0}
            />
          }
        >
          <PrintSheet key={`front|${key}`} paper={paper} rtl={t.rtl}>
            <TimesSide {...week} withNotices={!twoSided} />
          </PrintSheet>
          {twoSided && (
            <PrintSheet key={`back|${key}`} paper={paper} rtl={t.rtl}>
              <NoticesSide {...week} />
            </PrintSheet>
          )}
        </PrintRoot>
      </LanguageProvider>
    </ThemeRoot>
  )
}

function Toolbar({
  slug,
  sunday,
  paper,
  twoSided,
  hasNotices,
}: {
  slug: string
  sunday: DateString
  paper: Paper
  twoSided: boolean
  hasNotices: boolean
}) {
  const set = (p: { week?: string; paper?: Paper; sides?: string }) => router.setParams(p)
  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      paddingHorizontal="lg"
      paddingVertical="md"
      wrap
      borderBottomWidth="hairline"
      borderColor={SemanticColor.BorderDefault}
      background={SemanticColor.SurfaceCard}
    >
      <Button
        variant="ghost"
        size="sm"
        title="Back"
        icon="chevron-left"
        onPress={() => router.replace(`/${slug}/admin`)}
      />
      <Stack direction="row" align="center" gap="xs">
        <Button
          variant="ghost"
          size="sm"
          title=""
          icon="chevron-left"
          onPress={() => set({ week: addDays(sunday, -7) })}
        />
        <Text variant="bodyStrong">
          {civilDateShort(sunday)} – {civilDateShort(addDays(sunday, 6))}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          title=""
          icon="chevron-right"
          onPress={() => set({ week: addDays(sunday, 7) })}
        />
      </Stack>
      <SegmentedControl<Paper>
        options={[
          { key: 'letter', label: 'Letter' },
          { key: 'a4', label: 'A4' },
        ]}
        value={paper}
        onChange={(p) => set({ paper: p })}
        accessibilityLabel="Paper size"
      />
      {hasNotices && (
        <SegmentedControl<'1' | '2'>
          options={[
            { key: '2', label: 'Two sides' },
            { key: '1', label: 'One side' },
          ]}
          value={twoSided ? '2' : '1'}
          onChange={(sides) => set({ sides })}
          accessibilityLabel="Sides"
        />
      )}
      <Stack grow />
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {twoSided ? 'Print double-sided, flip on long edge.' : 'Fits on one side.'}
      </Text>
      <Button size="sm" title="Print" icon="print" onPress={() => window.print()} />
    </Stack>
  )
}
