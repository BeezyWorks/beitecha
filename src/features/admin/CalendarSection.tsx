import {
  Button,
  Card,
  ScrollStack,
  SemanticColor,
  Stack,
  Text,
  useIsWideLayout,
} from '@beezyworks/design'
import {
  Calendar,
  type CalendarBasis,
  type CalendarMonth,
  type CalendarPrintSettings,
  addDays,
  buildMonth,
  calendarOptions,
  makeT,
  monthBounds,
  monthStarts,
  monthTitles,
} from '@beitecha/engine'
import React from 'react'

import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { useShulClock } from '@/features/luach/useShulClock'
import {
  CALENDAR_PAPERS,
  type CalendarPaper,
  PAPER_SIZES,
  type Orientation,
  pagePixels,
  renderCalendarHtml,
} from '@/features/calendar/html'
import {
  CalendarEventsCard,
  CalendarFooterCard,
  CalendarHolidaysCard,
  CalendarPeopleCard,
  CalendarTimesCard,
} from './CalendarContentCards'
import { useAdmin } from './store'

/** How many months ahead can be chosen. */
const REACH = 30

/** The wall calendar, under "See it": what's on it and how it's laid out, with the sheets beside it. */
export function CalendarSection() {
  const { schedule, setSchedule } = useAdmin()
  const wide = useIsWideLayout()
  const { today } = useShulClock(schedule?.settings.location.timeZone, 60_000)
  // The chosen months, as first days; absent = the next twelve.
  const [range, setRange] = React.useState<{ from: string; to: string } | null>(null)
  const [paneWidth, setPaneWidth] = React.useState(0)
  const pane = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = pane.current
    if (!el) return
    const measure = () => setPaneWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  })

  const settings: CalendarPrintSettings = schedule?.settings.calendar ?? {}
  const options = calendarOptions(settings)
  const basis: CalendarBasis = options.basis
  const lang = schedule?.settings.language === 'he' ? 'he' : 'en'

  const choices = React.useMemo(
    () => monthStarts(basis, today, addDays(today, REACH * 30)),
    [basis, today],
  )
  const first = choices[0]
  const from = range && choices.includes(range.from) ? range.from : first
  const to =
    range && choices.includes(range.to) ? range.to : choices[Math.min(11, choices.length - 1)]
  const shown = choices.filter((c) => c >= from && c <= to)

  const months: CalendarMonth[] = React.useMemo(() => {
    if (!schedule) return []
    const cal = new Calendar(schedule)
    const t = makeT(
      schedule.settings.language,
      schedule.settings.timeFormat,
      schedule.settings.names,
    )
    return shown.map((start) => buildMonth(cal, start, schedule.settings.calendar, t))
    // `shown` follows from `from`, `to` and `choices`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, from, to, choices])

  const html = React.useMemo(() => {
    if (!schedule || !months.length) return ''
    const t = makeT(
      schedule.settings.language,
      schedule.settings.timeFormat,
      schedule.settings.names,
    )
    const pixels = pagePixels(options.paper, options.orientation)
    const available = Math.max(200, paneWidth - 24)
    return renderCalendarHtml({
      title: months[0].title,
      months,
      weekdays: ([0, 1, 2, 3, 4, 5, 6] as const).map((d) => t.weekday(d)),
      options,
      settings: schedule.settings.calendar,
      rtl: t.rtl,
      previewScale: Math.min(1, available / pixels.width),
    })
    // `options` is derived from the schedule's calendar settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, months, paneWidth])

  if (!schedule) return null
  const set = (patch: Partial<CalendarPrintSettings>) =>
    setSchedule({
      ...schedule,
      settings: { ...schedule.settings, calendar: { ...settings, ...patch } },
    })
  const label = (start: string) => {
    const { end } = monthBounds(basis, start)
    return monthTitles(basis, start, end, lang).title
  }
  const monthOptions = choices.map((c) => ({ value: c, label: label(c) }))

  const print = () => {
    // The preview is shrunk and gapped for the screen; the print is the plain page.
    const printable = renderCalendarHtml({
      title: months[0]?.title ?? 'Calendar',
      months,
      weekdays: ([0, 1, 2, 3, 4, 5, 6] as const).map((d) =>
        makeT(schedule.settings.language).weekday(d),
      ),
      options,
      settings: schedule.settings.calendar,
      rtl: lang === 'he',
    })
    const hidden = document.createElement('iframe')
    hidden.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
    hidden.srcdoc = printable
    hidden.onload = () => {
      hidden.contentWindow?.focus()
      hidden.contentWindow?.print()
      setTimeout(() => hidden.remove(), 60_000)
    }
    document.body.appendChild(hidden)
  }

  const controls = (
    <ScrollStack padding="xl" gap="lg">
      <Stack maxWidth={880} gap="lg">
        <Stack direction="row" align="center" gap="md" wrap>
          <Stack grow gap="xs">
            <Text variant="largeTitle">Wall calendar</Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              A month to a sheet, with holidays, zmanim, your events and your people, to print for
              the year.
            </Text>
          </Stack>
          <Button variant="primary" title="Print" icon="print" onPress={print} />
        </Stack>
        <Card gap="md">
          <Text variant="sectionHeader">Layout</Text>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Months
            </Text>
            <Stack direction="row" gap="sm" align="center" wrap>
              <Select
                accessibilityLabel="First month"
                value={from}
                options={monthOptions}
                onChange={(f) => setRange({ from: f, to: to < f ? f : to })}
              />
              <Text variant="body">to</Text>
              <Select
                accessibilityLabel="Last month"
                value={to}
                options={monthOptions.filter((o) => o.value >= from)}
                onChange={(l) => setRange({ from, to: l })}
              />
            </Stack>
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Main calendar
            </Text>
            <Segments<CalendarBasis>
              options={[
                { key: 'civil', label: 'Civil months' },
                { key: 'hebrew', label: 'Hebrew months' },
              ]}
              value={basis}
              onChange={(b) => {
                setRange(null)
                set({ basis: b === 'civil' ? undefined : b })
              }}
              accessibilityLabel="Main calendar"
            />
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              The months and the big numbers; the other calendar is small.
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Paper
            </Text>
            <Stack direction="row">
              <Select<CalendarPaper>
                accessibilityLabel="Paper size"
                value={options.paper}
                options={CALENDAR_PAPERS.map((p) => ({ value: p, label: PAPER_SIZES[p].label }))}
                onChange={(p) => set({ paper: p === 'letter' ? undefined : p })}
              />
            </Stack>
            <Segments<Orientation>
              options={[
                { key: 'landscape', label: 'Landscape' },
                { key: 'portrait', label: 'Portrait' },
              ]}
              value={options.orientation}
              onChange={(o) => set({ orientation: o === 'landscape' ? undefined : o })}
              accessibilityLabel="Orientation"
            />
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
              value={options.ink}
              onChange={(k) => set({ ink: k === 'mono' ? k : undefined })}
              accessibilityLabel="Ink"
            />
          </Stack>
        </Card>
        <CalendarTimesCard settings={settings} schedule={schedule} set={set} />
        <CalendarHolidaysCard settings={settings} months={months} set={set} />
        <CalendarEventsCard settings={settings} schedule={schedule} set={set} />
        <CalendarPeopleCard settings={settings} schedule={schedule} set={set} />
        <CalendarFooterCard
          settings={settings}
          months={months}
          basis={basis}
          lang={lang}
          set={set}
        />
      </Stack>
    </ScrollStack>
  )

  // The page shown shrunk to the pane, as it will print.
  const preview = (
    <div ref={pane} style={{ width: '100%', height: '100%' }}>
      <iframe
        title="Calendar preview"
        srcDoc={html}
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )

  return wide ? (
    <Stack direction="row" grow height={0}>
      <Stack grow width={0}>
        {controls}
      </Stack>
      <Stack width={1} background={SemanticColor.BorderDefault} />
      <Stack grow width={0} background={SemanticColor.SurfaceSelected}>
        {preview}
      </Stack>
    </Stack>
  ) : (
    <Stack grow height={0}>
      {controls}
      <Stack height={420}>{preview}</Stack>
    </Stack>
  )
}
