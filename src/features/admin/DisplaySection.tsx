import {
  Button,
  Card,
  ScrollStack,
  SemanticColor,
  Stack,
  Text,
  useIsWideLayout,
} from '@beezyworks/design'
import { startOfWeek } from '@beitecha/engine'
import { router } from 'expo-router'
import React from 'react'

import { paperFor, PrintSheet, SheetStyle, type Paper } from '@/components/Print'
import { Segments } from '@/components/Segments'
import { ThemeRoot } from '@/components/ThemeRoot'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useShulClock } from '@/features/luach/useShulClock'
import { useWeek } from '@/features/print/useWeek'
import {
  hasAnnouncements,
  NoticesSide,
  TimesSide,
  type WeekProps,
} from '@/features/print/WeekSheet'
import { SITE_URL } from '@/lib/config'
import { PrintCard } from './PrintCard'
import { useAdmin } from './store'

const RAIL = 360
const GAP = 12
/** A sheet's width and height in CSS px (96 per inch). */
const PX: Record<Paper, { width: number; height: number }> = {
  a4: { width: 793.7, height: 1122.5 },
  letter: { width: 816, height: 1056 },
}

/** The lobby display, and the printed week: what goes on the sheet, with a small live look at it. */
export function DisplaySection({ slug }: { slug: string }) {
  const { profile, schedule, dirty, setSchedule, persist } = useAdmin()
  const wide = useIsWideLayout()
  const { today } = useShulClock(schedule?.settings.location.timeZone, 60_000)
  const [paper, setPaper] = React.useState<Paper | null>(null)
  const sunday = startOfWeek(today)
  const week = useWeek(slug, profile ?? undefined, schedule ?? undefined, sunday)
  if (!profile || !schedule) return null

  const chosen = paper ?? paperFor(schedule.settings.location.timeZone)
  // The sheet prints the published schedule, so save first.
  const print = async () => {
    if (dirty) await persist()
    if (!useAdmin.getState().dirty) router.push(`/${slug}/print?paper=${chosen}`)
  }

  const controls = (
    <ScrollStack padding="xl" gap="lg">
      <Stack maxWidth={880} gap="lg">
        <Stack gap="xs">
          <Text variant="largeTitle">Lobby display</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            The monitor in the lobby, and the week on paper.
          </Text>
        </Stack>
        <Card gap="sm">
          <Text variant="sectionHeader">On the monitor</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Open this on the monitor’s browser and leave it.
          </Text>
          <Text variant="bodyStrong" selectable>
            {SITE_URL}/{slug}/display
          </Text>
          <Stack direction="row">
            <Button
              variant="secondary"
              size="sm"
              title="Open the display"
              icon="external-link"
              onPress={() => router.push(`/${slug}/display`)}
            />
          </Stack>
        </Card>
        <PrintCard
          settings={schedule.settings}
          onChange={(settings) => setSchedule({ ...schedule, settings })}
        />
        <Card gap="md">
          <Text variant="sectionHeader">Print the week</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Saves your changes, then opens the sheet, where you can pick the week, paper and sides.
          </Text>
          <Stack direction="row" align="center" gap="md" wrap>
            <Segments<Paper>
              options={[
                { key: 'letter', label: 'Letter' },
                { key: 'a4', label: 'A4' },
              ]}
              value={chosen}
              onChange={setPaper}
              accessibilityLabel="Paper size"
            />
            <Button title="Print it" icon="print" onPress={print} />
          </Stack>
        </Card>
      </Stack>
    </ScrollStack>
  )

  if (!wide)
    return (
      <Stack grow height={0}>
        {controls}
      </Stack>
    )

  return (
    <Stack direction="row" grow height={0}>
      <Stack grow width={0}>
        {controls}
      </Stack>
      <Stack width={1} background={SemanticColor.BorderDefault} />
      <Stack width={RAIL} background={SemanticColor.SurfaceSelected}>
        <ScrollStack padding="md" gap="md">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            This week’s sheet
          </Text>
          {week && <SheetPreview week={week} paper={chosen} />}
        </ScrollStack>
      </Stack>
    </Stack>
  )
}

/** The sheets shrunk to the rail, laid out at full size, so what's here is what prints. */
function SheetPreview({ week, paper }: { week: WeekProps; paper: Paper }) {
  const { profile, schedule } = useAdmin()
  if (!profile || !schedule) return null
  const t = makeT(schedule.settings.language, schedule.settings.timeFormat, schedule.settings.names)
  const twoSided = hasAnnouncements(week)
  const sheets = twoSided ? 2 : 1
  const width = RAIL - 32
  const k = width / PX[paper].width
  return (
    <ThemeRoot brandColor={profile.brandColor} mode="light">
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <SheetStyle />
        <div
          style={{
            width,
            height: PX[paper].height * k * sheets + (sheets - 1) * GAP,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: PX[paper].width,
              transform: `scale(${k})`,
              transformOrigin: 'top left',
              display: 'flex',
              flexDirection: 'column',
              gap: GAP / k,
              pointerEvents: 'none',
            }}
          >
            <PrintSheet paper={paper} rtl={t.rtl}>
              <TimesSide {...week} withNotices={!twoSided} />
            </PrintSheet>
            {twoSided && (
              <PrintSheet paper={paper} rtl={t.rtl}>
                <NoticesSide {...week} />
              </PrintSheet>
            )}
          </div>
        </div>
      </LanguageProvider>
    </ThemeRoot>
  )
}
