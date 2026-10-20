import {
  Button,
  Card,
  GradientCard,
  Grid,
  QRCode,
  SemanticColor,
  Stack,
  Text,
  useIsWideLayout,
} from '@beezyworks/design'
import {
  addDays,
  type DaySchedule,
  type Localized,
  type Minutes,
  type ZmanId,
} from '@beitecha/engine'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { Linking } from 'react-native'

import { Centered } from '@/components/Centered'
import { Page } from '@/components/Page'
import { usePageTitle } from '@/components/PageTitle'
import { ThemeRoot } from '@/components/ThemeRoot'
import { NoticeCard } from '@/features/luach/NoticeCard'
import { Pill } from '@/features/luach/Pill'
import { TimesList } from '@/features/luach/TimesList'
import { ZmanimList } from '@/features/luach/ZmanimList'
import { zmanimForDay } from '@/features/luach/labels'
import { LanguageProvider, makeT, useT } from '@/features/luach/language'
import { nextUp } from '@/features/luach/nextUp'
import { useDays } from '@/features/luach/useDays'
import { useShulClock } from '@/features/luach/useShulClock'
import { useShulFeed } from '@/features/luach/useShulFeed'
import { SITE_URL } from '@/lib/config'

const DAYS_SHOWN = 8
/** The zmanim worth a glance, short enough for a phone tile; the rest are a tap away. */
const KEY_ZMANIM: Partial<Record<ZmanId, Localized>> = {
  sunrise: { en: 'Netz', he: 'הנץ' },
  sofZmanShma: { en: 'Shema', he: 'ק״ש' },
  candleLighting: { en: 'Candles', he: 'נרות' },
  sunset: { en: 'Shkia', he: 'שקיעה' },
  tzeis: { en: 'Tzeis', he: 'צאת' },
  havdalah: { en: 'Havdalah', he: 'הבדלה' },
}

/** What the QR code opens: the shul's times today and this week, and how to keep them. */
export function PublicScreen({ slug }: { slug: string }) {
  const { feed, notFound, error } = useShulFeed(slug)
  const tz = feed?.schedule.settings.location.timeZone
  const { today, minutes } = useShulClock(tz)
  const days = useDays(feed?.schedule, today, DAYS_SHOWN)
  const wide = useIsWideLayout()
  const t = makeT(
    feed?.schedule.settings.language,
    feed?.schedule.settings.timeFormat,
    feed?.schedule.settings.names,
  )
  usePageTitle(feed ? `${t.text(feed.profile.name)} · Beitecha` : undefined)

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
  const { profile } = feed

  return (
    <ThemeRoot brandColor={profile.brandColor}>
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <Page>
          <Stack paddingTop={wide ? 'lg' : 'none'}>
            <GradientCard padding="lg">
              <Stack gap="md">
                <Stack gap="xs">
                  <Text variant="pageHeader" color={SemanticColor.TextOnAccent}>
                    {t.text(profile.name)}
                  </Text>
                  {t.bothNames && !!profile.name.he && (
                    <Text variant="titleLarge" rtl align="left" color={SemanticColor.TextOnAccent}>
                      {profile.name.he}
                    </Text>
                  )}
                  {!!(profile.address || profile.city) && (
                    <Text variant="body" color={SemanticColor.TextOnAccent}>
                      {[profile.address, profile.city].filter(Boolean).join(', ')}
                    </Text>
                  )}
                </Stack>
                {day && <HeroToday day={day} tomorrow={rest[0]} minutes={minutes} />}
              </Stack>
            </GradientCard>
          </Stack>

          {day && <TodayCard day={day} minutes={minutes} />}

          {notices.length > 0 && (
            <Stack gap="sm">
              {notices.map((n) => (
                <NoticeCard key={n.id} notice={n} />
              ))}
            </Stack>
          )}

          <Stack gap="sm">
            <SectionHeading en={t.s.thisWeek} he={t.lang === 'en' ? 'השבוע' : undefined} />
            {rest.map((d) => (
              <WeekDay key={d.date} day={d} columns={wide ? 4 : 3} />
            ))}
          </Stack>

          <Card gap="md" align="center">
            <Text variant="sectionHeader">{t.s.keepTimes}</Text>
            {wide && <QRCode value={pageUrl} size={160} logo={false} />}
            <Button
              title={t.s.addToCalendar}
              icon="calendar-today"
              onPress={() => Linking.openURL(icsUrl.replace(/^https?:/, 'webcal:'))}
            />
            <Text variant="caption" color={SemanticColor.TextSecondary} align="center">
              {wide ? t.s.scanToOpen : ''}
              {t.s.calendarUpdates}
            </Text>
          </Card>

          <Stack direction="row" gap="sm" justify="center" paddingBottom="xl" wrap>
            <Button
              variant="ghost"
              size="sm"
              title={t.s.showOnMonitor}
              onPress={() => router.push(`/${slug}/display`)}
            />
            <Button
              variant="ghost"
              size="sm"
              title={t.s.gabbaiSignIn}
              onPress={() => router.push(`/${slug}/admin`)}
            />
          </Stack>
        </Page>
      </LanguageProvider>
    </ThemeRoot>
  )
}

/** Inside the hero: today's date and what's next — the one thing most visitors came for. */
function HeroToday({
  day,
  tomorrow,
  minutes,
}: {
  day: DaySchedule
  tomorrow?: DaySchedule
  minutes: Minutes
}) {
  const t = useT()
  const next = nextUp(day, tomorrow, minutes)
  const extras = [
    ...day.holidays.map(t.text),
    ...(day.weekday === 6 && t.parsha(day) ? [t.parsha(day)!] : []),
  ]
  return (
    <Stack gap="md">
      <Stack height={1} background={SemanticColor.SurfaceOnAccent} />
      <Stack gap="xs">
        <Stack direction="row" align="center" gap="sm" wrap>
          <Text variant="title" color={SemanticColor.TextOnAccent}>
            {t.weekday(day.weekday)}, {t.date(day.date)}
          </Text>
          <Stack grow />
          <Text variant="title" rtl color={SemanticColor.TextOnAccent}>
            {day.hebrew.he}
          </Text>
        </Stack>
        {extras.length > 0 && (
          <Stack direction="row" wrap gap="xs" paddingTop="xs">
            {extras.map((x) => (
              <Pill key={x} label={x} variant="label" />
            ))}
          </Stack>
        )}
      </Stack>
      {next && (
        <Stack radius="lg" padding="md" gap="xs" background={SemanticColor.SurfaceOnAccent}>
          <Stack direction="row" align="center" gap="sm">
            <Text variant="bodyStrong" color={SemanticColor.TextOnAccent}>
              {next.today ? t.s.next : t.s.tomorrow}
            </Text>
            <Stack grow />
            {next.today && (
              <Text variant="bodyStrong" color={SemanticColor.TextOnAccent}>
                {t.until(next.event.minutes - minutes)}
              </Text>
            )}
          </Stack>
          <Stack direction="row" align="center" gap="sm">
            <Stack grow>
              <Text variant="pageHeader" numberOfLines={1} color={SemanticColor.TextOnAccent}>
                {t.text(next.event.name)}
              </Text>
            </Stack>
            <Text variant="pageHeader" color={SemanticColor.TextOnAccent}>
              {t.clock(next.event.minutes)}
            </Text>
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}

function TodayCard({ day, minutes }: { day: DaySchedule; minutes: Minutes }) {
  const t = useT()
  const [allZmanim, setAllZmanim] = useState(false)
  const shown = zmanimForDay(day.tags)
  const key = (Object.keys(KEY_ZMANIM) as ZmanId[]).filter(
    (id) => shown.includes(id) && day.zmanim[id] !== undefined,
  )
  return (
    <Card gap="md">
      <SectionHeading en={t.s.today} he={t.lang === 'en' ? 'סדר היום' : undefined} />
      {day.events.length ? (
        <TimesList events={day.events} now={minutes} />
      ) : (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          {t.s.noMinyanim}
        </Text>
      )}
      <Stack height={1} background={SemanticColor.BorderDefault} />
      <Stack direction="row" align="center">
        <Text variant="bodyStrong" color={SemanticColor.TextAccent}>
          {t.s.zmanim}
        </Text>
        <Stack grow />
        <Button
          variant="ghost"
          size="sm"
          title={allZmanim ? t.s.fewer : t.s.allZmanim}
          icon={allZmanim ? undefined : 'chevron-down'}
          iconPosition="end"
          onPress={() => setAllZmanim((v) => !v)}
        />
      </Stack>
      {allZmanim ? (
        <ZmanimList day={day} />
      ) : (
        <Grid columns={key.length > 4 ? 3 : key.length} gap="sm">
          {key.map((id) => (
            <TimeTile
              key={id}
              label={t.text(KEY_ZMANIM[id]!)}
              time={t.clock(day.zmanim[id]!)}
              accent={id === 'candleLighting' || id === 'havdalah'}
            />
          ))}
        </Grid>
      )}
    </Card>
  )
}

/** One of the coming days: its times as a grid of tiles, Shabbos and Yom Tov washed in the brand. */
function WeekDay({ day: d, columns }: { day: DaySchedule; columns: number }) {
  const t = useT()
  const shabbos = d.weekday === 6
  const special = shabbos || d.tags.includes('yomTov')
  const title = t.dayTitle(d)
  return (
    <Card
      gap="sm"
      {...(special && {
        background: SemanticColor.AccentTint,
        borderColor: SemanticColor.AccentTintSelected,
        shadow: 'none' as const,
      })}
    >
      <Stack direction="row" align="center" gap="sm" wrap>
        <Text
          variant={special ? 'sectionHeader' : 'bodyStrong'}
          color={special ? SemanticColor.TextAccent : undefined}
        >
          {title}
        </Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          {t.dateShort(d.date)}
        </Text>
        <Stack grow />
        <Text variant="body" rtl color={SemanticColor.TextAccent}>
          {d.hebrew.he}
        </Text>
      </Stack>
      {d.holidays.length > 0 && (
        <Text variant="caption" color={SemanticColor.TextAccent}>
          {d.holidays.map(t.text).join(' · ')}
        </Text>
      )}
      {d.events.length > 0 && (
        <Grid columns={columns} gap="sm">
          {d.events.map((e) => (
            <TimeTile
              key={e.eventId}
              label={t.text(e.name)}
              time={e.cancelled ? t.s.cancelled : e.minutes === null ? '—' : t.clock(e.minutes)}
              cancelled={e.cancelled}
              onTint={special}
            />
          ))}
        </Grid>
      )}
    </Card>
  )
}

function TimeTile({
  label,
  time,
  accent,
  cancelled,
  onTint,
}: {
  label: string
  time: string
  accent?: boolean
  cancelled?: boolean
  onTint?: boolean
}) {
  return (
    <Stack
      radius="md"
      paddingHorizontal="sm"
      paddingVertical="xs"
      gap="none"
      background={onTint ? SemanticColor.SurfaceCard : SemanticColor.SurfaceBackground}
    >
      <Text variant="caption" numberOfLines={1} color={SemanticColor.TextSecondary}>
        {label}
      </Text>
      <Text
        variant="headline"
        color={cancelled ? SemanticColor.TextDanger : accent ? SemanticColor.TextAccent : undefined}
      >
        {time}
      </Text>
    </Stack>
  )
}

function SectionHeading({ en, he }: { en: string; he?: string }) {
  return (
    <Stack direction="row" align="center" gap="sm">
      <Text variant="sectionHeader">{en}</Text>
      <Stack grow />
      {!!he && (
        <Text variant="bodyStrong" rtl color={SemanticColor.TextAccent}>
          {he}
        </Text>
      )}
    </Stack>
  )
}
