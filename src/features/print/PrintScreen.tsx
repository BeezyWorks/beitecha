import { Button, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  customZmanName,
  type DateString,
  DEFAULT_SHABBOS_ZMANIM,
  type Schedule,
  startOfWeek,
  ZMAN_LABELS,
  type ZmanId,
  type ZmanKey,
} from '@beitecha/engine'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useMemo } from 'react'

import { Segments } from '@/components/Segments'
import { Centered } from '@/components/Centered'
import { usePageTitle } from '@/components/PageTitle'
import { paperFor, PrintRoot, PrintSheet, type Paper } from '@/components/Print'
import { ThemeRoot } from '@/components/ThemeRoot'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { hasAnnouncements, type InlineZman, NoticesSide, TimesSide } from './WeekSheet'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The week on paper for the shul's tables: Shabbos, the weekday minyanim and the zmanim on
 * the front; the week's shiurim, starred events coming up, sponsorships and announcements on the
 * back (or all on one side).
 */
export function PrintScreen({ slug }: { slug: string }) {
  const params = useLocalSearchParams<{ week?: string; paper?: string; sides?: string }>()
  const { feed, notFound, error } = useShulFeed(slug)
  const tz = feed?.schedule.settings.location.timeZone
  const { today } = useShulClock(tz, 60_000)
  const sunday = startOfWeek(params.week && DATE_RE.test(params.week) ? params.week : today)
  const days = useDays(feed?.schedule, sunday, 7)
  const comingUp = useMemo(
    () => (feed ? new Calendar(feed.schedule).announced(sunday) : []),
    [feed, sunday],
  )
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
  const week = {
    slug,
    profile: feed.profile,
    days,
    notices,
    categories: feed.schedule.settings.noticeCategories,
    comingUp,
    cholim: feed.schedule.cholim ?? [],
    zmanimTable: feed.schedule.settings.print?.zmanimTable !== false,
    shabbosZmanim: shabbosZmanim(feed.schedule, addDays(sunday, 5)),
  }
  const hasBack = hasAnnouncements(week)
  const twoSided = hasBack && params.sides !== '1'
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
              hasNotices={hasBack}
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

/** The zmanim the shul lists among Friday night's and Shabbos day's minyanim, hidden or not. */
function shabbosZmanim(schedule: Schedule, friday: DateString) {
  const picked = schedule.settings.print?.shabbosZmanim ?? DEFAULT_SHABBOS_ZMANIM
  const custom = schedule.settings.zmanim?.custom ?? []
  const cal = new Calendar(schedule)
  const on = (date: DateString, ids: ZmanKey[]): InlineZman[] => {
    const times = cal.zmanimOn(date)
    return ids.flatMap((id) => {
      const minutes = times[id]
      const own = custom.find((c) => c.id === id)
      const name = ZMAN_LABELS[id as ZmanId] ?? (own && customZmanName(own))
      return minutes === undefined || !name ? [] : [{ id, name, minutes }]
    })
  }
  return { friday: on(friday, picked.friday), shabbos: on(addDays(friday, 1), picked.shabbos) }
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
      <Segments<Paper>
        options={[
          { key: 'letter', label: 'Letter' },
          { key: 'a4', label: 'A4' },
        ]}
        value={paper}
        onChange={(p) => set({ paper: p })}
        accessibilityLabel="Paper size"
      />
      {hasNotices && (
        <Segments<'1' | '2'>
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
