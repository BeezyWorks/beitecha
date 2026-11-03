import { PageDots, SemanticColor, Stack, Surface, Text } from '@beezyworks/design'
import {
  type DaySchedule,
  type Localized,
  type Minutes,
  type Occurrence,
  type SpecialZmanimGroup,
  ZMAN_LABELS,
  type ZmanId,
  type ZmanKey,
  weekdayOf,
  zmanimList,
} from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import { ShrinkToFit } from '@/components/ShrinkToFit'
import { useT } from '@/features/luach/language'
import {
  shabbosGroups,
  type InlineZman,
  type ShabbosGroup,
  type ShabbosRow,
} from '@/features/luach/shabbosGroups'
import { paginate, splitColumns } from './paging'
import type { ShabbosSpan } from './setup'

export const ROTATE_MS = 12_000
/** A minyan that started this recently is still shown, dimmed. */
const JUST_STARTED_MIN = 20
/** Between two rows: the gap, a hairline and the gap. */
const SEP = 9

/** Words the engine has no string for yet; the page's language picks one. */
const JUST_STARTED: Localized = { en: 'Just started', he: 'התחיל זה עתה' }
const THIS_SHABBOS: Localized = { en: 'This Shabbos', he: 'שבת הקרובה' }
const GROUP_TITLES: Record<ShabbosGroup['key'], Localized> = {
  friday: { en: 'Friday night', he: 'ליל שבת' },
  morning: { en: 'Shabbos morning', he: 'שבת בבוקר' },
  afternoon: { en: 'Shabbos afternoon', he: 'שבת אחר הצהריים' },
}

/** Steps 0, 1, 2… every `ROTATE_MS` while there's more than one thing to show. */
export function useRotation(count: number) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (count < 2) return
    const t = setInterval(() => setI((n) => n + 1), ROTATE_MS)
    return () => clearInterval(t)
  }, [count])
  return i
}

/** In Hebrew when the page or its names are; with the Hebrew beside it when names show in both. */
export function PanelHeading({ en, he }: { en: string; he: string }) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  return (
    <Stack direction="row" align="center" gap="sm" paddingBottom="xs">
      <Text variant="pageHeader" rtl={hebrew}>
        {hebrew ? he : en}
      </Text>
      <Stack grow />
      {!hebrew && t.bothNames && (
        <Text variant="itemHeader" rtl color={SemanticColor.TextAccent}>
          {he}
        </Text>
      )}
    </Stack>
  )
}

/** The room a body has once the canvas has laid it out. */
function useRoom() {
  const [room, setRoom] = useState(0)
  return {
    room,
    onLayout: (e: { nativeEvent: { layout: { height: number } } }) =>
      setRoom(e.nativeEvent.layout.height),
  }
}

const Divider = () => <Stack height={1} background={SemanticColor.BorderDefault} />

/** The ◆ by a name whose time was changed for this one day. */
const CHANGED = ' ◆'

// ---------------------------------------------------------------------------
// Today

type Density = 'roomy' | 'compact'
/** Row heights are fixed so the rows that fit a panel can be counted: [one line, with a second]. */
const TODAY_ROW: Record<Density, [number, number]> = { roomy: [60, 88], compact: [44, 68] }

/** The small heading over the day's shiurim and programs, which are listed apart from the minyanim. */
const OTHERS_HEADING = { en: 'Shiurim & programs', he: 'שיעורים ותוכניות' }
const HEADING_ROW: Record<Density, number> = { roomy: 44, compact: 36 }

const hasSub = (r: TodayRowItem) =>
  !!r.event &&
  (r.justStarted || r.event.cancelled || !!r.event.note || (r.event.untimed && !!r.event.relative))

/** A row of Today: an event, or the heading that starts the non-minyanim. */
type TodayRowItem =
  { event: Occurrence; justStarted: boolean } | { event?: undefined; justStarted?: undefined }

const rowHeight = (r: TodayRowItem, d: Density) =>
  r.event ? TODAY_ROW[d][hasSub(r) ? 1 : 0] : HEADING_ROW[d]

/** What's left of the day: past ones go, except one that started a moment ago. */
function remaining(events: Occurrence[], minutes: Minutes): TodayRowItem[] {
  const past = events.filter((e) => e.minutes !== null && e.minutes < minutes)
  const latest = past.reduce<Occurrence | undefined>(
    (a, e) => (!a || e.minutes! >= a.minutes! ? e : a),
    undefined,
  )
  const recent = latest && !latest.cancelled && minutes - latest.minutes! <= JUST_STARTED_MIN
  const rows = events.flatMap<TodayRowItem>((e) =>
    e.minutes === null || e.minutes >= minutes
      ? [{ event: e, justStarted: false }]
      : recent && e === latest
        ? [{ event: e, justStarted: true }]
        : [],
  )
  // Minyanim first; shiurim and programs (mahjong) follow under a heading of their own.
  const minyanim = rows.filter((r) => r.event!.kind === 'tefila')
  const others = rows.filter((r) => r.event!.kind !== 'tefila')
  return minyanim.length && others.length ? [...minyanim, {}, ...others] : rows
}

/** Panel padding, heading and the gap under it, with a little to spare. */
const TODAY_CHROME = 116

/** The height Today needs for what's left of the day, roomy if that fits in `cap`, else compact, else `cap`. */
export function todayHeight(day: DaySchedule, minutes: Minutes, cap: number): number {
  const rows = remaining(day.events, minutes)
  const need = (d: Density) =>
    TODAY_CHROME +
    Math.max(
      rows.length ? 0 : 40,
      rows.reduce((sum, r, i) => sum + rowHeight(r, d) + (i ? SEP : 0), 0),
    )
  return Math.min(cap, need(need('roomy') <= cap ? 'roomy' : 'compact'))
}

/** The day's minyanim and shiurim, big; paged in place when they don't fit. `reduced` is the small version beside Shabbos. */
export function Today({
  day,
  minutes,
  next,
  reduced,
  grow,
}: {
  day: DaySchedule
  minutes: Minutes
  next?: Occurrence
  reduced?: boolean
  grow?: boolean
}) {
  const t = useT()
  const { room, onLayout } = useRoom()
  const rows = remaining(day.events, minutes)
  const heights = (d: Density) => rows.map((r) => rowHeight(r, d))
  const density: Density =
    !reduced && paginate(heights('roomy'), room, SEP).length <= 1 ? 'roomy' : 'compact'
  const pages = paginate(heights(density), room, SEP)
  const i = useRotation(pages.length)
  const page = pages[i % Math.max(pages.length, 1)] ?? []
  return (
    <Surface grow={grow} radius="xl" shadow="card">
      <Stack fill padding="lg" gap="sm">
        <PanelHeading en={t.s.today} he="סדר היום" />
        <Stack grow height={0} overflow="hidden" gap="xs" onLayout={onLayout}>
          {page.flatMap((n, k) => {
            const row = rows[n]
            if (!row.event)
              return [
                <Stack key="others" height={HEADING_ROW[density]} justify="end" paddingBottom="xs">
                  <Text variant="itemHeader" color={SemanticColor.TextSecondary}>
                    {t.text(OTHERS_HEADING)}
                  </Text>
                </Stack>,
              ]
            return [
              ...(k > 0 && rows[page[k - 1]].event ? [<Divider key={`${n}-rule`} />] : []),
              <TodayRow
                key={row.event.eventId}
                item={row}
                isNext={row.event === next}
                density={density}
              />,
            ]
          })}
          {!day.events.length && (
            <Text variant="titleLarge" color={SemanticColor.TextSecondary}>
              {t.s.noMinyanim}
            </Text>
          )}
        </Stack>
        {pages.length > 1 && <PageDots count={pages.length} index={i % pages.length} />}
      </Stack>
    </Surface>
  )
}

function TodayRow({
  item: { event: e, justStarted },
  isNext,
  density,
}: {
  item: TodayRowItem & { event: Occurrence }
  isNext: boolean
  density: Density
}) {
  const t = useT()
  const compact = density === 'compact'
  const big = compact ? 'pageHeader' : 'displayMedium'
  const tone = isNext ? SemanticColor.TextOnAccent : undefined
  const quiet = isNext ? SemanticColor.TextOnAccent : SemanticColor.TextSecondary
  const sub = [
    e.untimed && e.relative ? t.relative(e.relative) : undefined,
    e.cancelled ? t.s.cancelled : undefined,
    e.note ? t.text(e.note) : undefined,
    justStarted ? t.text(JUST_STARTED) : undefined,
  ]
    .filter(Boolean)
    .join(' — ')
  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      paddingHorizontal="md"
      height={TODAY_ROW[density][sub ? 1 : 0]}
      radius="lg"
      background={isNext ? SemanticColor.AccentPrimaryStrong : undefined}
      opacity={justStarted || e.cancelled ? 0.5 : 1}
    >
      <Stack grow width={0} gap="none">
        <Stack direction="row">
          <ShrinkToFit>
            <Text variant={big} numberOfLines={1} rtl={t.nameRtl} color={tone}>
              {t.text(e.name)}
              {e.source === 'exception' && (
                <Text
                  variant={big}
                  color={isNext ? SemanticColor.TextOnAccent : SemanticColor.TextAccent}
                >
                  {CHANGED}
                </Text>
              )}
            </Text>
          </ShrinkToFit>
        </Stack>
        {!!sub && (
          <Text
            variant="title"
            numberOfLines={1}
            color={e.cancelled && !isNext ? SemanticColor.TextDanger : quiet}
          >
            {sub}
          </Text>
        )}
      </Stack>
      {t.bothNames && !!e.name.he && (
        <Text variant="pageHeader" rtl color={quiet}>
          {e.name.he}
        </Text>
      )}
      <Stack width={compact ? 80 : 100} align="end">
        <Text variant={big} color={tone}>
          {e.untimed ? '' : e.minutes === null ? '—' : t.clock(e.minutes)}
        </Text>
      </Stack>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Zmanim

/** The day's zmanim in time order, one column or two. */
export function Zmanim({
  day,
  minutes,
  columns = 1,
  grow,
}: {
  day: DaySchedule
  minutes: Minutes
  columns?: 1 | 2 | 3
  grow?: boolean
}) {
  const t = useT()
  const list = zmanimList(day)
  const size = Math.ceil(list.length / columns)
  const chunks = Array.from({ length: columns }, (_, k) => list.slice(k * size, (k + 1) * size))
  const column = (items: typeof list) => (
    <Stack grow width={columns > 1 ? 0 : undefined} gap="none">
      {items.map(({ id, name, minutes: m }) => {
        const lit = id === 'candleLighting' || id === 'havdalah'
        return (
          <Stack
            key={id}
            direction="row"
            align="center"
            gap="sm"
            paddingVertical={2}
            opacity={m < minutes ? 0.45 : 1}
          >
            <Stack grow width={0}>
              <Text
                variant="headline"
                numberOfLines={1}
                color={lit ? SemanticColor.TextAccent : SemanticColor.TextSecondary}
              >
                {t.text(name)}
              </Text>
            </Stack>
            <Text
              variant={columns > 1 ? 'title' : 'titleLarge'}
              color={lit ? SemanticColor.TextAccent : undefined}
            >
              {t.clock(m)}
            </Text>
          </Stack>
        )
      })}
    </Stack>
  )
  return (
    <Surface grow={grow} radius="xl" shadow="card">
      <Stack padding={columns > 1 ? 'md' : 'lg'} gap="sm">
        <PanelHeading en={t.s.zmanim} he="זמני היום" />
        <Stack direction="row" gap="md">
          {chunks.map((items, k) => (
            <React.Fragment key={k}>{column(items)}</React.Fragment>
          ))}
        </Stack>
      </Stack>
    </Surface>
  )
}

// ---------------------------------------------------------------------------
// Shabbos

/** The zmanim listed among the Shabbos minyanim, from the days themselves. */
export function inlineZmanim(
  span: ShabbosSpan,
  picked: { friday: ZmanKey[]; shabbos: ZmanKey[] },
): { friday: InlineZman[]; shabbos: InlineZman[] } {
  const on = (day: DaySchedule, ids: ZmanKey[]): InlineZman[] =>
    ids.flatMap((id) => {
      const minutes = day.zmanim[id]
      const name = day.zmanNames?.[id] ?? ZMAN_LABELS[id as ZmanId]
      return minutes === undefined || !name ? [] : [{ id, name, minutes }]
    })
  return { friday: on(span.friday, picked.friday), shabbos: on(span.shabbos, picked.shabbos) }
}

type Entry =
  | { type: 'heading'; key: string; group: ShabbosGroup }
  | { type: 'row'; key: string; row: ShabbosRow; date: string }

/** [heading, row, row with a note] heights, `main` being the big version beside the clock. */
const SHABBOS_ROW = { main: [40, 64, 44], compact: [30, 50, 32] } as const

function entryHeight(entry: Entry, main: boolean) {
  const [row, sub, heading] = SHABBOS_ROW[main ? 'main' : 'compact']
  if (entry.type === 'heading') return heading
  return entry.row.type === 'event' && entry.row.event.note ? sub : row
}

/**
 * Shabbos in time order, grouped Friday night, morning and afternoon: the big panel (`main`, two columns balanced)
 * when it has the screen, a small one in the week. Paged in place when it doesn't fit.
 */
export function ShabbosPanel({
  span,
  zmanim,
  today,
  minutes,
  main,
  columns,
  grow,
}: {
  span: ShabbosSpan
  zmanim: { friday: InlineZman[]; shabbos: InlineZman[] }
  today: string
  minutes: Minutes
  main?: boolean
  columns: 1 | 2
  grow?: boolean
}) {
  const t = useT()
  const { room, onLayout } = useRoom()
  const hebrew = t.rtl || t.nameRtl
  const day = span.shabbos
  const title =
    day.weekday === 6 || !day.holidays.length ? t.dayTitle(day) : t.text(day.holidays[0])
  const entries: Entry[] = shabbosGroups(
    span.friday,
    span.shabbos,
    zmanim,
    (e) => e.minutes !== null || e.cancelled,
  ).flatMap((group) => [
    { type: 'heading' as const, key: group.key, group },
    ...group.rows.map((row) => ({
      type: 'row' as const,
      key: `${group.key}-${row.key}`,
      row,
      date: group.day.date,
    })),
  ])
  const heights = entries.map((e) => entryHeight(e, !!main))
  const keep = entries.map((e) => e.type === 'heading')
  // Two columns hold twice the room, less what an uneven cut can overshoot by.
  const slack = columns === 2 ? 2 * Math.max(0, ...heights) : 0
  const pages = paginate(heights, room * columns - slack, 0, keep)
  const i = useRotation(pages.length)
  const page = pages[i % Math.max(pages.length, 1)] ?? []
  const cut =
    columns === 2
      ? splitColumns(
          page.map((n) => heights[n]),
          page.map((n) => keep[n]),
        )
      : page.length
  const view = (items: number[]) => (
    <Stack grow width={0} gap="none">
      {items.map((n) => (
        <ShabbosEntry
          key={entries[n].key}
          entry={entries[n]}
          main={!!main}
          today={today}
          minutes={minutes}
        />
      ))}
    </Stack>
  )
  return (
    <Surface grow={grow} radius="xl" shadow="card">
      <Stack fill padding="lg" gap="sm">
        <Stack gap="none" paddingBottom="xs">
          <Stack direction="row" align="center" gap="sm">
            <Text variant="pageHeader" rtl={hebrew}>
              {hebrew ? THIS_SHABBOS.he : THIS_SHABBOS.en}
            </Text>
            <Stack grow />
            {!hebrew && t.bothNames && (
              <Text variant="itemHeader" rtl color={SemanticColor.TextAccent}>
                {THIS_SHABBOS.he}
              </Text>
            )}
          </Stack>
          <Text variant="headline" color={SemanticColor.TextSecondary}>
            {title}
          </Text>
        </Stack>
        <Stack grow height={0} overflow="hidden" direction="row" gap="lg" onLayout={onLayout}>
          {view(page.slice(0, cut))}
          {columns === 2 && view(page.slice(cut))}
        </Stack>
        {pages.length > 1 && <PageDots count={pages.length} index={i % pages.length} />}
      </Stack>
    </Surface>
  )
}

function ShabbosEntry({
  entry,
  main,
  today,
  minutes,
}: {
  entry: Entry
  main: boolean
  today: string
  minutes: Minutes
}) {
  const t = useT()
  const height = entryHeight(entry, main)
  if (entry.type === 'heading') {
    const title = GROUP_TITLES[entry.group.key]
    const hebrew = t.rtl || t.nameRtl
    return (
      <Stack height={height} justify="end" paddingBottom="xs">
        <Text
          variant={main ? 'itemHeader' : 'headline'}
          rtl={hebrew}
          color={SemanticColor.TextAccent}
        >
          {hebrew ? title.he : title.en}
        </Text>
      </Stack>
    )
  }
  const { row, date } = entry
  const at = row.type === 'event' ? row.event.minutes : row.zman.minutes
  const past = date === today && at !== null && at < minutes
  const size = main ? 'titleLarge' : 'title'
  if (row.type === 'zman') {
    return (
      <Stack height={height} direction="row" align="center" gap="sm" opacity={past ? 0.45 : 1}>
        <Stack grow width={0}>
          <Text variant="headline" numberOfLines={1} color={SemanticColor.TextAccent}>
            {t.text(row.zman.name)}
          </Text>
        </Stack>
        <Text variant={size} color={SemanticColor.TextAccent}>
          {t.clock(row.zman.minutes)}
        </Text>
      </Stack>
    )
  }
  const e = row.event
  const time = e.cancelled
    ? t.s.cancelled
    : e.untimed && e.relative
      ? t.relative(e.relative)
      : e.minutes === null
        ? '—'
        : t.clock(e.minutes)
  return (
    <Stack height={height} justify="center" opacity={past || e.cancelled ? 0.5 : 1}>
      <Stack direction="row" align="center" gap="sm">
        <Stack grow width={0}>
          <Text variant={size} numberOfLines={1} rtl={t.nameRtl}>
            {t.text(e.name)}
            {e.source === 'exception' && (
              <Text variant={size} color={SemanticColor.TextAccent}>
                {CHANGED}
              </Text>
            )}
          </Text>
        </Stack>
        <Text variant={size} color={e.cancelled ? SemanticColor.TextDanger : undefined}>
          {time}
        </Text>
      </Stack>
      {!!e.note && (
        <Text variant="caption" numberOfLines={1} color={SemanticColor.TextSecondary}>
          {t.text(e.note)}
        </Text>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Fast and Pesach zmanim

const SPECIAL_TITLE: Localized = { en: 'Zmanim for the week', he: 'זמנים השבוע' }

/** The week's fast or Erev Pesach zmanim in a small box, under Shabbos; times already past are dimmed. */
export function SpecialZmanimPanel({
  groups,
  today,
  minutes,
}: {
  groups: SpecialZmanimGroup[]
  today: string
  minutes: Minutes
}) {
  const t = useT()
  return (
    <Surface radius="xl" shadow="card">
      <Stack padding="md" gap="xs">
        <PanelHeading en={SPECIAL_TITLE.en} he={SPECIAL_TITLE.he ?? SPECIAL_TITLE.en} />
        {groups.map((g) => (
          <Stack key={g.key} gap="none">
            <Text variant="headline" color={SemanticColor.TextAccent} rtl={t.nameRtl}>
              {t.text(g.title)}
            </Text>
            {g.rows.map((r) => {
              const past = r.date < today || (r.date === today && r.minutes < minutes)
              return (
                <Stack
                  key={r.id}
                  direction="row"
                  align="center"
                  gap="sm"
                  paddingVertical={2}
                  opacity={past ? 0.45 : 1}
                >
                  <Stack grow width={0}>
                    <Text variant="headline" numberOfLines={1} color={SemanticColor.TextSecondary}>
                      {t.text(r.name)}
                    </Text>
                  </Stack>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    {t.weekday(weekdayOf(r.date))}
                  </Text>
                  <Text variant="title">{t.clock(r.minutes)}</Text>
                </Stack>
              )
            })}
          </Stack>
        ))}
      </Stack>
    </Surface>
  )
}
