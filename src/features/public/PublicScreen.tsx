import { Button, Card, QRCode, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays } from '@beitecha/engine'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { Linking } from 'react-native'

import { Centered } from '@/components/Centered'
import { Page } from '@/components/Page'
import { usePageTitle } from '@/components/PageTitle'
import { ThemeRoot } from '@/components/ThemeRoot'
import { DayHeading } from '@/features/luach/DayHeading'
import { NoticeCard } from '@/features/luach/NoticeCard'
import { TimesList } from '@/features/luach/TimesList'
import { ZmanimList } from '@/features/luach/ZmanimList'
import { civilDateShort, clock } from '@/features/luach/format'
import { WEEKDAYS } from '@/features/luach/labels'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { SITE_URL } from '@/lib/config'

const DAYS_SHOWN = 8

/** What the QR code opens: the shul's times today and this week, and how to keep them. */
export function PublicScreen({ slug }: { slug: string }) {
  const { feed, notFound, error } = useShulFeed(slug)
  const tz = feed?.schedule.settings.location.timeZone
  const { today, minutes } = useShulClock(tz)
  const days = useDays(feed?.schedule, today, DAYS_SHOWN)
  const [showZmanim, setShowZmanim] = useState(false)
  usePageTitle(feed ? `${feed.profile.name.en} · Beitecha` : undefined)

  if (!feed) {
    if (notFound) return <Centered title="No such shul" body={`Nothing lives at /${slug} yet.`} />
    if (error) return <Centered title="Couldn’t load the schedule" body={error} />
    return <Centered loading />
  }

  const [day, ...rest] = days
  const pageUrl = `${SITE_URL}/${slug}`
  const icsUrl = `${SITE_URL}/${slug}.ics`
  const notices = feed.schedule.notices
    .filter((n) => (n.to ?? n.from) >= today && n.from <= addDays(today, 7))
    .sort((a, b) => a.from.localeCompare(b.from))

  return (
    <ThemeRoot brandColor={feed.profile.brandColor}>
      <Page>
        <Stack gap="xs" paddingTop="lg">
          <Text variant="pageHeader">{feed.profile.name.en}</Text>
          {!!feed.profile.name.he && (
            <Text variant="titleLarge" rtl color={SemanticColor.TextAccent} align="left">
              {feed.profile.name.he}
            </Text>
          )}
          {!!(feed.profile.address || feed.profile.city) && (
            <Text variant="body" color={SemanticColor.TextSecondary}>
              {[feed.profile.address, feed.profile.city].filter(Boolean).join(', ')}
            </Text>
          )}
        </Stack>

        {day && (
          <Card gap="md">
            <DayHeading day={day} />
            {day.events.length ? (
              <TimesList events={day.events} now={minutes} />
            ) : (
              <Text variant="body" color={SemanticColor.TextSecondary}>
                No minyanim listed today.
              </Text>
            )}
            <Button
              variant="ghost"
              size="sm"
              title={showZmanim ? 'Hide zmanim' : 'Zmanim'}
              icon={showZmanim ? undefined : 'chevron-down'}
              onPress={() => setShowZmanim((v) => !v)}
            />
            {showZmanim && <ZmanimList day={day} />}
          </Card>
        )}

        {notices.length > 0 && (
          <Stack gap="sm">
            {notices.map((n) => (
              <NoticeCard key={n.id} notice={n} />
            ))}
          </Stack>
        )}

        <Stack gap="sm">
          <Text variant="sectionHeader">This week</Text>
          {rest.map((d) => (
            <Card key={d.date} gap="xs" paddingVertical={14}>
              <Stack direction="row" align="center" gap="sm" wrap>
                <Text variant="bodyStrong">{WEEKDAYS[d.weekday].en}</Text>
                <Text variant="body" color={SemanticColor.TextSecondary}>
                  {civilDateShort(d.date)}
                </Text>
                <Stack grow />
                <Text variant="body" rtl color={SemanticColor.TextAccent}>
                  {d.hebrew.he}
                </Text>
              </Stack>
              {d.holidays.length > 0 && (
                <Text variant="caption" color={SemanticColor.TextAccent}>
                  {d.holidays.map((h) => h.en).join(' · ')}
                </Text>
              )}
              <Stack direction="row" wrap gap="md">
                {d.events.map((e) => (
                  <Text key={e.eventId} variant="body" color={e.cancelled ? SemanticColor.TextDanger : undefined}>
                    {e.name.en} {e.cancelled ? 'cancelled' : e.minutes === null ? '—' : clock(e.minutes)}
                  </Text>
                ))}
              </Stack>
            </Card>
          ))}
        </Stack>

        <Card gap="md" align="center">
          <Text variant="sectionHeader">Keep these times with you</Text>
          <QRCode value={pageUrl} size={180} logo={false} />
          <Stack direction="row" gap="sm" wrap justify="center">
            <Button
              title="Add to my calendar"
              icon="calendar-today"
              onPress={() => Linking.openURL(icsUrl.replace(/^https?:/, 'webcal:'))}
            />
          </Stack>
          <Text variant="caption" color={SemanticColor.TextSecondary} align="center">
            Times update by themselves when the shul changes them.
          </Text>
        </Card>

        <Stack direction="row" gap="sm" justify="center" paddingBottom="xl" wrap>
          <Button variant="ghost" size="sm" title="Show on a monitor" onPress={() => router.push(`/${slug}/display`)} />
          <Button variant="ghost" size="sm" title="Gabbai sign-in" onPress={() => router.push(`/${slug}/admin`)} />
        </Stack>
      </Page>
    </ThemeRoot>
  )
}
