import {
  Button,
  Card,
  ScrollStack,
  SemanticColor,
  Stack,
  Text,
  ToggleSwitch,
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
  type CalendarPage,
  pagePixels,
  renderCalendarHtml,
} from '@/features/calendar/html'
import { type BackImage, frameFor, picturesForMonths } from '@/features/calendar/pictures'
import { CalendarPreview } from '@/features/calendar/CalendarPreview'
import {
  buildDraftFile,
  downloadText,
  parseDraftFile,
  pickTextFile,
} from '@/features/calendar/draftFile'
import { previewFor } from '@/features/calendar/images'
import { usePictures } from '@/features/calendar/usePictures'
import {
  CalendarEventsCard,
  CalendarFooterCard,
  CalendarHolidaysCard,
  CalendarPeopleCard,
  CalendarTimesCard,
} from './CalendarContentCards'
import { CalendarPicturesCard } from './CalendarPicturesCard'
import { useAdmin } from './store'

/** How many months ahead can be chosen. */
const REACH = 30

/** The wall calendar, under "See it": what's on it and how it's laid out, with the sheets beside it. */
export function CalendarSection({ slug }: { slug: string }) {
  const { schedule, setSchedule } = useAdmin()
  const pics = usePictures(slug)
  // The preview moves a picture itself as it's dragged, so a new crop must not rebuild it (that would flash the page):
  // the crops are read when the page is built for another reason.
  const cropsRef = React.useRef(pics.settings.frames)
  cropsRef.current = pics.settings.frames
  const wide = useIsWideLayout()
  const { today } = useShulClock(schedule?.settings.location.timeZone, 60_000)
  // The chosen months, as first days; absent = the next twelve.
  const [range, setRange] = React.useState<{ from: string; to: string } | null>(null)
  const [paneWidth, setPaneWidth] = React.useState(0)
  const pane = React.useRef<HTMLDivElement>(null)
  const setCrop = pics.setCrop
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
  // Written in English whatever the shul's language, when asked.
  const english = options.english
  const lang = !english && schedule?.settings.language === 'he' ? 'he' : 'en'

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
    const t = english
      ? makeT('en', schedule.settings.timeFormat, 'en')
      : makeT(schedule.settings.language, schedule.settings.timeFormat, schedule.settings.names)
    return shown.map((start) => buildMonth(cal, start, schedule.settings.calendar, t))
    // `shown` follows from `from`, `to` and `choices`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, from, to, choices, english])

  const { settings: ps, images } = pics
  /** The calendar as a page: for the screen (small pictures, shrunk) or for the printer (full size). */
  const makePage = (scale?: number): CalendarPage | null => {
    if (!schedule || !months.length) return null
    const t = english
      ? makeT('en', schedule.settings.timeFormat, 'en')
      : makeT(schedule.settings.language, schedule.settings.timeFormat, schedule.settings.names)
    const src = (image: BackImage) => (scale === undefined ? image.url : image.preview)
    const frame = (image: BackImage) => frameFor(image, cropsRef.current)
    const matched = picturesForMonths(months, images, ps.matches)
    const byId = (id?: string) => images.find((i) => i.id === id)
    const cover = (image?: BackImage) =>
      image ? { src: src(image), frame: frame(image) } : undefined
    return {
      title: months[0].title,
      months,
      weekdays: ([0, 1, 2, 3, 4, 5, 6] as const).map((d) => t.weekday(d)),
      options,
      settings: schedule.settings.calendar,
      rtl: t.rtl,
      addLabel: 'Click or drop a picture',
      pictures:
        ps.placement !== 'none'
          ? {
              images: matched.map((i) => i && src(i)),
              frames: matched.map((i) => i && frame(i)),
              fit: ps.fit,
              placement: ps.placement,
              titleOver: ps.titleOver && ps.placement === 'above',
            }
          : undefined,
      covers: {
        front: ps.front,
        back: ps.back,
        title: ps.coverTitle.trim() || undefined,
        subtitle: ps.coverSubtitle.trim() || undefined,
        image: cover(byId(ps.coverId)),
        backImage: cover(byId(ps.backCoverId)),
      },
      previewScale:
        scale === undefined
          ? undefined
          : Math.min(1, scale / pagePixels(options.paper, options.orientation).width),
    }
  }

  const html = React.useMemo(() => {
    const page = makePage(Math.max(200, paneWidth - 24))
    return page ? renderCalendarHtml(page) : ''
    // `makePage` reads the schedule, the months, the pictures and the crops; the crops are left out on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    schedule,
    months,
    paneWidth,
    images,
    ps.matches,
    ps.fit,
    ps.placement,
    ps.titleOver,
    ps.front,
    ps.back,
    ps.coverId,
    ps.backCoverId,
    ps.coverTitle,
    ps.coverSubtitle,
  ])

  if (!schedule) return null
  const set = (patch: Partial<CalendarPrintSettings>) =>
    setSchedule({
      ...schedule,
      settings: { ...schedule.settings, calendar: { ...settings, ...patch } },
    })
  const label = (start: string) => {
    const { end } = monthBounds(basis, start)
    return monthTitles(basis, start, end, lang, english).title
  }
  const monthOptions = choices.map((c) => ({ value: c, label: label(c) }))

  const print = () => {
    // The preview is shrunk and gapped for the screen; the print is the plain page.
    const page = makePage()
    if (!page) return
    const printable = renderCalendarHtml(page)
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

  const saveDraft = () =>
    downloadText(
      `${slug}-calendar.json`,
      JSON.stringify(buildDraftFile(settings, pics.settings, images, { from, to })),
    )

  const openDraft = async () => {
    const text = await pickTextFile()
    if (text === undefined) return
    const draft = parseDraftFile(text)
    if (!draft) {
      window.alert('That isn’t a calendar saved from Beitecha.')
      return
    }
    if (!window.confirm('Replace this calendar’s choices and pictures with the ones in the file?'))
      return
    const loaded = await Promise.all(
      draft.images.map(async (i) => ({
        ...i,
        preview: await previewFor(i.url).catch(() => i.url),
      })),
    )
    pics.replace(draft.pictures, loaded)
    setSchedule({ ...schedule, settings: { ...schedule.settings, calendar: draft.calendar } })
    setRange(draft.range ?? null)
  }

  const controls = (
    <ScrollStack padding="xl" gap="lg">
      <Stack maxWidth={880} gap="lg">
        <Stack direction="row" align="center" gap="md" wrap>
          <Stack grow gap="xs">
            <Text variant="largeTitle">Wall calendar</Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              A month to a sheet, with holidays, zmanim, your events and your people, to print for
              the year. Choices save as you go; “Save draft” also makes a file with the pictures, to
              keep or open in another browser.
            </Text>
          </Stack>
          <Button variant="ghost" title="Open draft" onPress={() => void openDraft()} />
          <Button variant="ghost" title="Save draft" onPress={saveDraft} />
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
          <Stack direction="row" align="center" gap="md">
            <Stack grow gap="xs">
              <Text variant="body">English for everything</Text>
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                Months, holidays, parsha and times in English, whatever the shul’s language. The
                Hebrew dates’ numbers stay in gematria.
              </Text>
            </Stack>
            <ToggleSwitch
              value={english}
              onValueChange={(on) => set({ english: on ? true : undefined })}
              accessibilityLabel="English for everything"
            />
          </Stack>
        </Card>
        <CalendarPicturesCard pictures={pics} />
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

  // The page shown shrunk to the pane, as it will print. Its empty pages take a click or a dropped picture.
  const preview = (
    <div ref={pane} style={{ width: '100%', height: '100%' }}>
      <CalendarPreview
        html={html}
        title="Calendar preview"
        onFrame={({ id, ...crop }) => setCrop(id, crop)}
        onAdd={(slot) => void pics.load(slot, months)}
        onDrop={(slot, files) => void pics.load(slot, months, files)}
        onRemove={pics.clearSlot}
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
