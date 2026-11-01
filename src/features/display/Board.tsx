import { GradientCard, QRCode, SemanticColor, Stack, Surface, Text } from '@beezyworks/design'
import {
  ampm,
  type Choleh,
  type DaySchedule,
  DEFAULT_SHABBOS_ZMANIM,
  type DisplaySetup,
  type Minutes,
  nextUp,
  type NextUp,
  type Notice,
  type NoticeCategory,
  type UpcomingYahrzeit,
  type YahrzeitSettings,
  type ZmanKey,
} from '@beitecha/engine'
import React from 'react'

import { ShrinkToFit } from '@/components/ShrinkToFit'
import { useT } from '@/features/luach/language'
import { Pill } from '@/features/luach/Pill'
import { siddurShulUrl } from '@/lib/config'
import { NoticeRotator } from './Notices'
import { inlineZmanim, ShabbosPanel, Today, todayHeight, Zmanim } from './Panels'
import { blockOn, shabbosFocused, shabbosSpan } from './setup'

/** The canvases `DisplayScreen` scales to the screen: small enough that the DL's type ramp reads across a lobby. */
export const CANVAS = {
  landscape: { width: 1280, height: 720 },
  portrait: { width: 720, height: 1280 },
}
const PAD = 24
const GAP = 16
const HERO_W = 360
const TODAY_W = 480
/** While Shabbos has the screen the clock narrows and Today reduces to a column beside it. */
const FOCUS_HERO_W = 340
const FOCUS_SIDE_W = 300
const NOTICE_H = 200
const PORTRAIT_NOTICE_H = 190
/** Today beside Shabbos on a portrait screen. */
const PORTRAIT_TODAY_H = 230
/** The most Today takes of a portrait screen before Shabbos beneath it. */
const PORTRAIT_TODAY_MAX = 420
/** Shabbos keeps at least this much of the middle column. */
const SHABBOS_MIN_H = 240

export interface BoardProps {
  name: { en: string; he?: string }
  slug: string
  setup: DisplaySetup
  /** Yesterday (the erev, when today is Shabbos), then today and the days after. */
  yesterday: DaySchedule
  days: DaySchedule[]
  minutes: Minutes
  notices: Notice[]
  /** The shul's announcement categories, for each notice's tag. */
  categories?: NoticeCategory[]
  cholim: Choleh[]
  /** The yahrzeits kept in the days ahead, soonest first. */
  yahrzeits: UpcomingYahrzeit[]
  yahrzeitSettings?: YahrzeitSettings
  /** The zmanim listed among the Shabbos minyanim (`settings.print.shabbosZmanim`). */
  shabbosZmanim?: { friday: ZmanKey[]; shabbos: ZmanKey[] }
}

/**
 * The display's parts, laid out by what's switched on: each block that's off gives its room to the rest. Shabbos
 * takes the main place from Thursday's last event to Havdalah; the Next card stays the biggest thing after the clock.
 */
export function Board({
  name,
  slug,
  setup,
  yesterday,
  days,
  minutes,
  notices,
  categories,
  cholim,
  yahrzeits,
  yahrzeitSettings,
  shabbosZmanim = DEFAULT_SHABBOS_ZMANIM,
}: BoardProps) {
  const portrait = setup.orientation === 'portrait'
  const on = (block: Parameters<typeof blockOn>[1]) => blockOn(setup, block)
  const [day, tomorrow] = days
  const next = on('next') ? nextUp(day, tomorrow, minutes) : undefined
  const span = on('shabbos') ? shabbosSpan([yesterday, ...days], minutes) : undefined
  const focus =
    !!span && shabbosFocused(setup.shabbosFocus ?? 'auto', [yesterday, ...days], minutes)
  const hasNotices =
    (on('notices') && notices.length > 0) ||
    (on('yahrzeits') && yahrzeits.length > 0) ||
    (on('cholim') && cholim.length > 0)

  const today = on('today') && (
    <Today
      day={day}
      minutes={minutes}
      next={next?.today ? next.event : undefined}
      reduced={focus}
      grow
    />
  )
  const shabbos = span && (
    <ShabbosPanel
      span={span}
      zmanim={inlineZmanim(span, shabbosZmanim)}
      today={day.date}
      minutes={minutes}
      main={focus}
      columns={focus || portrait ? 2 : 1}
      grow
    />
  )
  const rotator = (height?: number) =>
    hasNotices && (
      <NoticeRotator
        height={height}
        notices={on('notices') ? notices : []}
        categories={categories}
        cholim={on('cholim') ? cholim : []}
        yahrzeits={on('yahrzeits') ? yahrzeits : []}
        yahrzeitSettings={yahrzeitSettings}
      />
    )
  // The Shabbos minyanim list its own zmanim, so the zmanim panel gives way while Shabbos has the screen.
  const zmanim = on('zmanim') && !focus

  if (portrait)
    return (
      <Stack fill padding={PAD} gap={GAP}>
        <Hero
          name={name}
          slug={slug}
          day={day}
          minutes={minutes}
          next={next}
          portrait
          showQr={false}
        />
        {focus ? (
          <>
            {today && <Stack height={PORTRAIT_TODAY_H}>{today}</Stack>}
            {shabbos && <Stack grow>{shabbos}</Stack>}
          </>
        ) : (
          <>
            {today && (
              <Stack
                height={shabbos ? todayHeight(day, minutes, PORTRAIT_TODAY_MAX) : undefined}
                grow={!shabbos}
              >
                {today}
              </Stack>
            )}
            {shabbos && <Stack grow>{shabbos}</Stack>}
            {zmanim && <Zmanim day={day} minutes={minutes} columns={3} />}
          </>
        )}
        {rotator(PORTRAIT_NOTICE_H)}
        {on('qr') && <QrFooter slug={slug} />}
      </Stack>
    )

  const heroW = focus ? FOCUS_HERO_W : HERO_W
  const rot = rotator(focus ? NOTICE_H : undefined)
  const hero = (
    <Stack width={heroW}>
      <Hero name={name} slug={slug} day={day} minutes={minutes} next={next} showQr={on('qr')} />
    </Stack>
  )
  if (focus && shabbos)
    return (
      <Stack fill direction="row" padding={PAD} gap={GAP}>
        {hero}
        <Stack grow width={0}>
          {shabbos}
        </Stack>
        {(today || rot) && (
          <Stack width={FOCUS_SIDE_W} gap={GAP}>
            {today}
            {rot}
          </Stack>
        )}
      </Stack>
    )

  // Today and this Shabbos in the middle (Today as tall as its rows, Shabbos the rest), the zmanim and the notices at
  // the right; an empty column gives its width away.
  const middle = today || shabbos
  const right = zmanim || rot
  const cap = CANVAS.landscape.height - 2 * PAD - GAP - SHABBOS_MIN_H
  return (
    <Stack fill direction="row" padding={PAD} gap={GAP}>
      {hero}
      {middle && (
        <Stack width={right ? TODAY_W : 0} grow={!right} gap={GAP}>
          {today && (
            <Stack height={shabbos ? todayHeight(day, minutes, cap) : undefined} grow={!shabbos}>
              {today}
            </Stack>
          )}
          {shabbos && <Stack grow>{shabbos}</Stack>}
        </Stack>
      )}
      {right && (
        <Stack grow width={0} gap={GAP}>
          {zmanim && <Zmanim day={day} minutes={minutes} grow={!rot} />}
          {rot}
        </Stack>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Hero: the shul, the time, the day, what's next

/** The Gregorian and Hebrew dates, stacked and aligned the same way. */
function DateLines({ day, portrait }: { day: DaySchedule; portrait?: boolean }) {
  const t = useT()
  return (
    <Stack gap="xs">
      <Text variant="titleLarge" align="left" color={SemanticColor.TextOnAccent}>
        {t.weekday(day.weekday)}, {t.date(day.date)}
      </Text>
      <Text
        variant={portrait ? 'pageHeader' : 'displayMedium'}
        rtl
        align="left"
        color={SemanticColor.TextOnAccent}
      >
        {day.hebrew.he}
      </Text>
    </Stack>
  )
}

function Hero({
  name,
  slug,
  day,
  minutes,
  next,
  portrait,
  showQr,
}: {
  name: BoardProps['name']
  slug: string
  day: DaySchedule
  minutes: Minutes
  next?: NextUp
  portrait?: boolean
  showQr: boolean
}) {
  const t = useT()
  const parsha = t.parsha(day)
  const extras = [...day.holidays.map(t.text), ...(parsha ? [parsha] : [])]
  const clock = (
    <Stack direction="row" align="end" gap="sm">
      <Text variant="displayLarge" color={SemanticColor.TextOnAccent}>
        {t.clock(minutes)}
      </Text>
      {!t.customTimeFormat && (
        <Stack paddingBottom="md">
          <Text variant="titleLarge" color={SemanticColor.TextOnAccent}>
            {ampm(minutes)}
          </Text>
        </Stack>
      )}
    </Stack>
  )
  const nextCard = next && (
    <Stack radius="xl" padding="md" gap="xs" background={SemanticColor.SurfaceOnAccent}>
      <Stack direction="row" align="center" gap="sm">
        <Text variant="title" color={SemanticColor.TextOnAccent}>
          {next.today ? t.s.next : t.s.tomorrow}
        </Text>
        <Stack grow />
        {next.today && (
          <Text variant="title" color={SemanticColor.TextOnAccent}>
            {t.until(next.event.minutes - minutes)}
          </Text>
        )}
      </Stack>
      <Stack direction="row" align="end" gap="sm">
        <ShrinkToFit>
          <Text variant="displayMedium" numberOfLines={1} color={SemanticColor.TextOnAccent}>
            {t.text(next.event.name)}
          </Text>
        </ShrinkToFit>
        <Text variant="displayMedium" color={SemanticColor.TextOnAccent}>
          {t.clock(next.event.minutes)}
        </Text>
      </Stack>
    </Stack>
  )
  return (
    <GradientCard padding="lg">
      <Stack height={portrait ? undefined : CANVAS.landscape.height - 2 * PAD - 2 * 24} gap="md">
        <Stack gap="xs">
          <Text variant="pageHeader" color={SemanticColor.TextOnAccent}>
            {t.text(name)}
          </Text>
          {t.bothNames && !!name.he && (
            <Text variant="pageHeader" rtl align="left" color={SemanticColor.TextOnAccent}>
              {name.he}
            </Text>
          )}
        </Stack>
        <Stack height={1} background={SemanticColor.SurfaceOnAccent} />

        {portrait ? (
          <Stack direction="row" align="center" gap="lg">
            {clock}
            <Stack grow width={0}>
              <DateLines day={day} portrait />
            </Stack>
          </Stack>
        ) : (
          <Stack gap="xs">
            {clock}
            <DateLines day={day} />
          </Stack>
        )}
        {extras.length > 0 && (
          <Stack direction="row" wrap gap="xs">
            {extras.map((x) => (
              <Pill key={x} label={x} />
            ))}
          </Stack>
        )}

        {!portrait && <Stack grow />}
        {nextCard}

        {showQr && (
          <Stack direction="row" align="center" gap="md">
            <Stack
              radius="md"
              overflow="hidden"
              background={SemanticColor.SurfaceCard}
              padding="xs"
            >
              <QRCode value={siddurShulUrl(slug)} size={72} logo={false} />
            </Stack>
            <Stack grow width={0} gap="xs">
              <Text variant="title" color={SemanticColor.TextOnAccent}>
                {t.s.timesOnPhone}
              </Text>
            </Stack>
          </Stack>
        )}
      </Stack>
    </GradientCard>
  )
}

/** The portrait screen's QR code, under everything else. */
function QrFooter({ slug }: { slug: string }) {
  const t = useT()
  return (
    <Surface radius="xl" shadow="card">
      <Stack direction="row" align="center" gap="md" padding="sm">
        <Stack radius="md" overflow="hidden" background={SemanticColor.SurfaceCard} padding="xs">
          <QRCode value={siddurShulUrl(slug)} size={64} logo={false} />
        </Stack>
        <Stack grow width={0}>
          <Text variant="title">{t.s.timesOnPhone}</Text>
        </Stack>
      </Stack>
    </Surface>
  )
}
