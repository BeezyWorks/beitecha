import {
  Button,
  Card,
  IconButton,
  ScrollStack,
  ToggleSwitch,
  SemanticColor,
  Stack,
  Text,
  useIsWideLayout,
} from '@beezyworks/design'
import { WEEKDAYS, type Weekday } from '@beitecha/engine'
import React from 'react'

import {
  paperFor,
  BulletinRoot,
  bulletinBrand,
  SHEET_PX,
  SheetStyle,
  type Paper,
} from '@/components/Bulletin'
import { SITE_URL } from '@/lib/config'
import { useCollapsed } from '@/lib/useCollapsed'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { ThemeRoot } from '@/components/ThemeRoot'
import { LanguageProvider, makeT } from '@/features/luach/language'
import { useShulClock } from '@/features/luach/useShulClock'
import { BulletinSheets, bulletinLayout } from '@/features/bulletin/BulletinSheets'
import { BulletinToolbar } from '@/features/bulletin/BulletinToolbar'
import { shiftRange, weekContaining, type DateRange } from '@/features/bulletin/range'
import { useWeek } from '@/features/bulletin/useWeek'
import { BulletinBandCard } from './BulletinBandCard'
import { BulletinCard } from './BulletinCard'
import { BulletinDaysCard } from './BulletinDaysCard'
import { BulletinZmanimCard } from './BulletinZmanimCard'
import { CopyLinkButton } from './CopyLinkButton'
import { CollapsibleCard } from './CollapsibleCard'
import { useAdmin } from './store'

const RAIL = 360
const PAGES = ['1', '2', '3', '4', '5', 'unlimited']
const SIZES = [
  { key: '0.85', label: 'Small' },
  { key: '1', label: 'Normal' },
  { key: '1.15', label: 'Large' },
  { key: '1.3', label: 'Larger' },
]

/** the bulletin, under "See it": how it's laid out and what's on it, with the sheets beside it. */
export function BulletinSection({ slug }: { slug: string }) {
  const { profile, schedule, setSchedule } = useAdmin()
  const wide = useIsWideLayout()
  const { today } = useShulClock(schedule?.settings.location.timeZone, 60_000)
  const [paper, setPaper] = React.useState<Paper | null>(null)
  const [full, setFull] = React.useState(false)
  const [folded, toggleFolded] = useCollapsed('bulletin-preview')
  if (!profile || !schedule) return null

  // The bulletin being prepared is next week's.
  const range = shiftRange(weekContaining(today, schedule.settings.print), 1)
  const chosen = paper ?? paperFor(schedule.settings.location.timeZone)
  const print = schedule.settings.print ?? {}
  const layout = bulletinLayout(print)
  const set = (patch: Partial<typeof print>) =>
    setSchedule({ ...schedule, settings: { ...schedule.settings, print: { ...print, ...patch } } })

  const controls = (
    <ScrollStack padding="xl" gap="lg">
      <Stack maxWidth={880} gap="lg">
        <Stack direction="row" align="center" gap="md" wrap>
          <Stack grow gap="xs">
            <Text variant="largeTitle">Bulletin</Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              The week on paper, for the board or the bimah.
            </Text>
          </Stack>
          <Button
            variant="secondary"
            title="Full screen"
            icon="external-link"
            onPress={() => setFull(true)}
          />
        </Stack>
        <CollapsibleCard id="bulletin-card-layout" title="Layout">
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Paper
            </Text>
            <Segments<Paper>
              options={[
                { key: 'letter', label: 'Letter' },
                { key: 'a4', label: 'A4' },
              ]}
              value={chosen}
              onChange={setPaper}
              accessibilityLabel="Paper size"
            />
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Usual week
            </Text>
            <Stack direction="row" gap="sm" align="center" wrap>
              <Select
                accessibilityLabel="First day"
                value={String(print.weekStart ?? 0)}
                options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d.en }))}
                onChange={(d) =>
                  set({ weekStart: Number(d) === 0 ? undefined : (Number(d) as Weekday) })
                }
              />
              <Text variant="body">to</Text>
              <Select
                accessibilityLabel="Last day"
                value={String(print.weekEnd ?? 6)}
                options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d.en }))}
                onChange={(d) =>
                  set({ weekEnd: Number(d) === 6 ? undefined : (Number(d) as Weekday) })
                }
              />
            </Stack>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              The days a bulletin covers, e.g. Friday to Thursday. For one bulletin on other days,
              open it in full screen and use Dates.
            </Text>
          </Stack>
          <Stack gap="sm">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Public link
            </Text>
            <Card>
              <Stack direction="row" align="center" gap="sm">
                <Stack grow>
                  <Text variant="body" selectable>
                    {SITE_URL}/{slug}/bulletin
                  </Text>
                </Stack>
                <CopyLinkButton text={`${SITE_URL}/${slug}/bulletin`} label="Copy public link" />
              </Stack>
            </Card>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Anyone can open this without an account. It shows this week’s bulletin.
            </Text>
            {(
              [
                ['publicPast', 'Let visitors look at past weeks'],
                ['publicFuture', 'Let visitors look ahead (marked tentative)'],
              ] as const
            ).map(([key, label]) => (
              <Stack key={key} direction="row" align="center" gap="md">
                <Stack grow>
                  <Text variant="body">{label}</Text>
                </Stack>
                <ToggleSwitch
                  value={!!print[key]}
                  onValueChange={(on) => set({ [key]: on ? true : undefined })}
                  accessibilityLabel={label}
                />
              </Stack>
            ))}
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Pages
            </Text>
            <Stack direction="row">
              <Select
                accessibilityLabel="Pages"
                value={print.pages === undefined ? '2' : String(print.pages)}
                options={PAGES.map((p) => ({
                  value: p,
                  label:
                    p === 'unlimited' ? 'Unlimited' : p === '1' ? '1 page' : `Up to ${p} pages`,
                }))}
                onChange={(p) => set({ pages: p === 'unlimited' ? p : Number(p) })}
              />
            </Stack>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              The text shrinks to fit the pages you allow, and grows to fill them when there’s room.
              Unlimited keeps the text at full size and adds pages as it needs them. The second page
              is only used when the announcements don’t fit on the front.
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Text size
            </Text>
            <Segments
              options={SIZES}
              value={String(print.textSize ?? 1)}
              onChange={(k) => set({ textSize: Number(k) === 1 ? undefined : Number(k) })}
              accessibilityLabel="Text size"
            />
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Text can grow up to 40% bigger to fill the page, and still shrinks if it won’t fit in{' '}
              {layout.maxPages === Infinity
                ? 'the pages'
                : layout.maxPages === 1
                  ? 'one page'
                  : `${layout.maxPages} pages`}
              .
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Ink
            </Text>
            <Segments<'color' | 'mono'>
              options={[
                { key: 'color', label: 'Color' },
                { key: 'mono', label: 'Black and white' },
              ]}
              value={layout.ink}
              onChange={(k) => set({ ink: k === 'mono' ? k : undefined })}
              accessibilityLabel="Ink"
            />
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Color uses your brand color for headings and rules. Black and white is plain black
              ink, for the copier.
            </Text>
          </Stack>
        </CollapsibleCard>
        {(['header', 'footer'] as const).map((kind) => (
          <BulletinBandCard
            key={kind}
            kind={kind}
            profile={profile}
            settings={schedule.settings}
            onChange={(settings) => setSchedule({ ...schedule, settings })}
          />
        ))}
        <BulletinDaysCard
          schedule={schedule}
          today={today}
          onChange={(settings) => setSchedule({ ...schedule, settings })}
        />
        <BulletinZmanimCard
          settings={schedule.settings}
          onChange={(settings) => setSchedule({ ...schedule, settings })}
        />
        <BulletinCard
          settings={schedule.settings}
          events={schedule.events}
          notices={schedule.notices}
          onChange={(settings) => setSchedule({ ...schedule, settings })}
        />
      </Stack>
    </ScrollStack>
  )

  const preview = (
    <ScrollStack padding="md" gap="md">
      <Stack direction="row" align="center" gap="sm">
        <Stack grow>
          <Text variant="label" color={SemanticColor.TextSecondary}>
            This week’s sheet
          </Text>
        </Stack>
        <IconButton
          name="external-link"
          size={18}
          onPress={() => setFull(true)}
          accessibilityLabel="Expand preview"
        />
        <IconButton
          name="chevrons-right"
          size={18}
          onPress={toggleFolded}
          accessibilityLabel="Hide preview"
        />
      </Stack>
      <SheetPreview slug={slug} range={range} paper={chosen} width={RAIL - 32} />
    </ScrollStack>
  )

  return (
    <>
      {wide ? (
        <Stack direction="row" grow height={0}>
          <Stack grow width={0}>
            {controls}
          </Stack>
          <Stack width={1} background={SemanticColor.BorderDefault} />
          {folded ? (
            <Stack
              width={48}
              align="center"
              padding="xs"
              background={SemanticColor.SurfaceSelected}
            >
              <IconButton
                name="chevrons-left"
                size={18}
                onPress={toggleFolded}
                accessibilityLabel="Show preview"
              />
            </Stack>
          ) : (
            <Stack width={RAIL} background={SemanticColor.SurfaceSelected}>
              {preview}
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack grow height={0}>
          {controls}
        </Stack>
      )}
      {full && (
        <FullScreen
          slug={slug}
          initialRange={range}
          paper={chosen}
          onPaper={setPaper}
          onClose={() => setFull(false)}
        />
      )}
    </>
  )
}

/** The draft's week as it would print, in the shul's language and brand. */
function useSheet(slug: string, range: DateRange) {
  const { profile, schedule } = useAdmin()
  const week = useWeek(slug, profile ?? undefined, schedule ?? undefined, range)
  if (!profile || !schedule || !week) return null
  const t = makeT(schedule.settings.language, schedule.settings.timeFormat, schedule.settings.names)
  return { week, t, profile, ...bulletinLayout(schedule.settings.print) }
}

/** The sheets shrunk to `width`, laid out at full size, so what's here is what prints. */
function SheetPreview({
  slug,
  range,
  paper,
  width,
}: {
  slug: string
  range: DateRange
  paper: Paper
  width: number
}) {
  const sheet = useSheet(slug, range)
  const inner = React.useRef<HTMLDivElement>(null)
  const [height, setHeight] = React.useState(0)
  const k = width / SHEET_PX[paper].width
  React.useEffect(() => {
    const el = inner.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight * k)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [k, !!sheet])
  if (!sheet) return null
  const { week, t, profile, maxPages, textSize, ink } = sheet
  return (
    <ThemeRoot brandColor={bulletinBrand(ink, profile.brandColor)} mode="light">
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <SheetStyle />
        <div style={{ width, height, overflow: 'hidden' }}>
          <div
            ref={inner}
            style={{
              position: 'relative',
              width: SHEET_PX[paper].width,
              transform: `scale(${k})`,
              transformOrigin: 'top left',
              display: 'flex',
              flexDirection: 'column',
              gap: 12 / k,
              pointerEvents: 'none',
            }}
          >
            <BulletinSheets
              key={`${range.from}|${range.to}|${paper}|${maxPages}|${textSize}`}
              week={week}
              paper={paper}
              rtl={t.rtl}
              maxPages={maxPages}
              textSize={textSize}
            />
          </div>
        </div>
      </LanguageProvider>
    </ThemeRoot>
  )
}

/** The sheets over the whole admin, the draft as it stands, with the print button. */
function FullScreen({
  slug,
  initialRange,
  paper,
  onPaper,
  onClose,
}: {
  slug: string
  initialRange: DateRange
  paper: Paper
  onPaper: (paper: Paper) => void
  onClose: () => void
}) {
  const [range, setRange] = React.useState(initialRange)
  const sheet = useSheet(slug, range)
  const { schedule } = useAdmin()
  if (!sheet) return null
  const { week, t, profile, maxPages, textSize, ink } = sheet
  return (
    <ThemeRoot brandColor={bulletinBrand(ink, profile.brandColor)} mode="light">
      <LanguageProvider language={t.lang} timeFormat={t.customTimeFormat} names={t.names}>
        <BulletinRoot
          paper={paper}
          toolbar={
            <BulletinToolbar
              range={range}
              onRange={setRange}
              usual={weekContaining(range.from, schedule?.settings.print)}
              paper={paper}
              onPaper={onPaper}
              leading={
                <Stack direction="row" align="center" gap="xs">
                  <Button variant="ghost" size="sm" title="Close" icon="close" onPress={onClose} />
                  <CopyLinkButton text={`${SITE_URL}/${slug}/bulletin`} label="Copy public link" />
                </Stack>
              }
            />
          }
        >
          <BulletinSheets
            key={`${range.from}|${range.to}|${paper}|${maxPages}|${textSize}`}
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
