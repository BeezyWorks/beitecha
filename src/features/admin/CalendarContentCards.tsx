import { Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  CALENDAR_GROUPS,
  CALENDAR_GROUP_LABELS,
  type CalendarMonth,
  type CalendarPrintSettings,
  type EventKind,
  type Occasion,
  type Schedule,
  type Yahrzeit,
  ZMAN_IDS,
  type ZmanKey,
  holidayChoices,
  monthKey,
  monthTitles,
  type CalendarBasis,
} from '@beitecha/engine'
import React from 'react'

import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { adminLabel, zmanLabel } from './forms'

type Set = (patch: Partial<CalendarPrintSettings>) => void

/** A switch with its words beside it. */
function Row({
  label,
  help,
  value,
  onChange,
}: {
  label: string
  help?: string
  value: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <Stack direction="row" align="center" gap="md">
      <Stack grow gap="xs">
        <Text variant="body">{label}</Text>
        {!!help && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {help}
          </Text>
        )}
      </Stack>
      <ToggleSwitch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </Stack>
  )
}

/** `list` with `item` in it or not. */
const toggled = (list: string[] | undefined, item: string, present: boolean) => {
  const rest = (list ?? []).filter((x) => x !== item)
  const next = present ? [...rest, item] : rest
  return next.length ? next : undefined
}

const ADD = ''
const SKIP_ZMANIM = ['candleLighting', 'havdalah', 'fastEnds']

/** A list of zmanim picked from the shul's own, with the ones taken. */
function ZmanList({
  label,
  help,
  ids,
  custom,
  onChange,
}: {
  label: string
  help: string
  ids: ZmanKey[]
  custom: NonNullable<Schedule['settings']['zmanim']>['custom']
  onChange: (ids: ZmanKey[] | undefined) => void
}) {
  const known = [
    ...ZMAN_IDS.filter((z) => !SKIP_ZMANIM.includes(z)),
    ...(custom ?? []).map((c) => c.id),
  ]
  return (
    <Stack gap="sm">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        {label}
      </Text>
      {ids.map((id) => (
        <Stack key={id} direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">{zmanLabel(id, custom)}</Text>
          </Stack>
          <Button
            variant="ghost"
            size="sm"
            title="Remove"
            onPress={() =>
              onChange(ids.filter((x) => x !== id).length ? ids.filter((x) => x !== id) : undefined)
            }
          />
        </Stack>
      ))}
      <Select
        accessibilityLabel={`Add a zman to ${label}`}
        value={ADD}
        options={[
          { value: ADD, label: 'Add a zman…' },
          ...known
            .filter((id) => !ids.includes(id))
            .map((id) => ({ value: id, label: zmanLabel(id, custom) })),
        ]}
        onChange={(id) => id !== ADD && onChange([...ids, id])}
      />
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {help}
      </Text>
    </Stack>
  )
}

/** Candle lighting, havdalah, fast times, the parsha, the omer and any zmanim. */
export function CalendarTimesCard({
  settings,
  schedule,
  set,
}: {
  settings: CalendarPrintSettings
  schedule: Schedule
  set: Set
}) {
  const custom = schedule.settings.zmanim?.custom
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Zmanim & days</Text>
      <Row
        label="Candle lighting and havdalah"
        help="On the days they fall."
        value={settings.restTimes !== false}
        onChange={(on) => set({ restTimes: on ? undefined : false })}
      />
      <Row
        label="Fast times"
        help="When a fast begins and ends, on its day."
        value={settings.fastTimes !== false}
        onChange={(on) => set({ fastTimes: on ? undefined : false })}
      />
      <Row
        label="Parsha"
        value={settings.parsha !== false}
        onChange={(on) => set({ parsha: on ? undefined : false })}
      />
      <Row
        label="Sefiras HaOmer"
        help="The day of the omer, on the days it's counted."
        value={settings.omer !== false}
        onChange={(on) => set({ omer: on ? undefined : false })}
      />
      <ZmanList
        label="Zmanim on every day"
        help="A time on each day: keep the list short, a day is a small box."
        ids={settings.dayZmanim ?? []}
        custom={custom}
        onChange={(ids) => set({ dayZmanim: ids })}
      />
      <ZmanList
        label="Zmanim on Shabbos and Yom Tov only"
        help="Like the end of Shema on Shabbos morning."
        ids={settings.restZmanim ?? []}
        custom={custom}
        onChange={(ids) => set({ restZmanim: ids })}
      />
    </Card>
  )
}

/** The kinds of holiday, and each one by name once the months are known. */
export function CalendarHolidaysCard({
  settings,
  months,
  set,
}: {
  settings: CalendarPrintSettings
  months: CalendarMonth[]
  set: Set
}) {
  const [open, setOpen] = React.useState(false)
  const hiddenGroups = settings.hiddenGroups ?? []
  const choices = holidayChoices(months)
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Holidays</Text>
      {CALENDAR_GROUPS.map((group) => (
        <Row
          key={group}
          label={CALENDAR_GROUP_LABELS[group]}
          value={!hiddenGroups.includes(group)}
          onChange={(on) =>
            set({ hiddenGroups: toggled(hiddenGroups, group, !on) as typeof hiddenGroups })
          }
        />
      ))}
      <Row
        label="Clock changes"
        help="The Sundays the clocks go forward and back, by the shul's time zone."
        value={settings.clockChange !== false}
        onChange={(on) => set({ clockChange: on ? undefined : false })}
      />
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Chanukah
        </Text>
        <Segments<'days' | 'nights'>
          options={[
            { key: 'days', label: 'By its days' },
            { key: 'nights', label: 'By its nights' },
          ]}
          value={settings.chanukah ?? 'days'}
          onChange={(c) => set({ chanukah: c === 'days' ? undefined : c })}
          accessibilityLabel="How Chanukah is written"
        />
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          By its days: “Erev Chanukah”, then “Chanukah 1” to “Chanukah 8”, each with that many
          candles. By its nights, as hebcal has it: “1 Candle” on the eve.
        </Text>
      </Stack>
      <Row
        label="Candles icon"
        help="Two candles over the times on a day candles are lit."
        value={settings.iconCandles !== false}
        onChange={(on) => set({ iconCandles: on ? undefined : false })}
      />
      <Row
        label="Menorah icon"
        help="A menorah with the day's candles on each day of Chanukah."
        value={settings.iconChanukah !== false}
        onChange={(on) => set({ iconChanukah: on ? undefined : false })}
      />
      <Row
        label="Clock icon"
        help="Beside “Clocks forward” and “Clocks back”."
        value={settings.iconClock !== false}
        onChange={(on) => set({ iconClock: on ? undefined : false })}
      />
      <Stack direction="row">
        <Button
          variant="secondary"
          size="sm"
          title={open ? 'Hide the list of days' : 'Choose individual days'}
          onPress={() => setOpen(!open)}
        />
      </Stack>
      {open && (
        <Stack gap="sm">
          {choices
            .filter((c) => !hiddenGroups.includes(c.group))
            .map((c) => (
              <Row
                key={c.id}
                label={c.count > 1 ? `${c.name} (${c.count} days)` : c.name}
                value={!(settings.hiddenHolidays ?? []).includes(c.id)}
                onChange={(on) =>
                  set({ hiddenHolidays: toggled(settings.hiddenHolidays, c.id, !on) })
                }
              />
            ))}
        </Stack>
      )}
    </Card>
  )
}

const KIND_TITLES: Record<EventKind, string> = {
  tefila: 'Minyanim',
  shiur: 'Shiurim',
  other: 'Kiddush & programs',
}

/** The shul's own minyanim, shiurim and programs to write on the days they happen. */
export function CalendarEventsCard({
  settings,
  schedule,
  set,
}: {
  settings: CalendarPrintSettings
  schedule: Schedule
  set: Set
}) {
  const picked = settings.events ?? []
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Shul events</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Pick the ones to write on the days they happen, with their time. A day only has room for a
        few: Shabbos minyanim and a shiur or two fit best.
      </Text>
      <Row
        label="One-time events"
        help="Events added for one date, on that date."
        value={settings.oneTime !== false}
        onChange={(on) => set({ oneTime: on ? undefined : false })}
      />
      {(['tefila', 'shiur', 'other'] as EventKind[]).map((kind) => {
        const events = schedule.events.filter((e) => e.kind === kind && e.visibility !== 'internal')
        if (!events.length) return null
        return (
          <Stack key={kind} gap="sm">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              {KIND_TITLES[kind]}
            </Text>
            {events.map((e) => (
              <Row
                key={e.id}
                label={adminLabel(e)}
                value={picked.includes(e.id)}
                onChange={(on) => set({ events: toggled(settings.events, e.id, on) })}
              />
            ))}
          </Stack>
        )
      })}
    </Card>
  )
}

type Person = Yahrzeit | Occasion

const personName = (p: Person) =>
  p.displayName?.en || p.displayName?.he || p.hebrewName || 'Unnamed'

/** Whether the kind is on the calendar, and which of its people. */
function PeopleList({
  title,
  help,
  list,
  on,
  onToggle,
  settings,
  set,
}: {
  title: string
  help: string
  list: Person[]
  on: boolean
  onToggle: (on: boolean) => void
  settings: CalendarPrintSettings
  set: Set
}) {
  const [open, setOpen] = React.useState(false)
  const hidden = settings.hiddenPeople ?? []
  const off = list.filter((p) => hidden.includes(p.id)).length
  return (
    <Stack gap="sm">
      <Row label={title} help={help} value={on} onChange={onToggle} />
      {on && !!list.length && (
        <>
          <Stack direction="row" align="center" gap="sm">
            <Button
              variant="secondary"
              size="sm"
              title={open ? 'Hide the list' : 'Choose people'}
              onPress={() => setOpen(!open)}
            />
            {off > 0 && (
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {off} left off
              </Text>
            )}
          </Stack>
          {open &&
            [...list]
              .sort((a, b) => personName(a).localeCompare(personName(b)))
              .map((p) => (
                <Row
                  key={p.id}
                  label={personName(p)}
                  value={!hidden.includes(p.id)}
                  onChange={(show) =>
                    set({ hiddenPeople: toggled(settings.hiddenPeople, p.id, !show) })
                  }
                />
              ))}
        </>
      )}
    </Stack>
  )
}

/** Yahrzeits, birthdays and anniversaries, each kind and each person. */
export function CalendarPeopleCard({
  settings,
  schedule,
  set,
}: {
  settings: CalendarPrintSettings
  schedule: Schedule
  set: Set
}) {
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Yahrzeits, birthdays & anniversaries</Text>
      <PeopleList
        title="Yahrzeits"
        help="On the day they are kept."
        list={schedule.yahrzeits ?? []}
        on={settings.yahrzeits !== false}
        onToggle={(on) => set({ yahrzeits: on ? undefined : false })}
        settings={settings}
        set={set}
      />
      <PeopleList
        title="Birthdays"
        help="Each year, by the calendar they were entered in."
        list={schedule.birthdays ?? []}
        on={settings.birthdays !== false}
        onToggle={(on) => set({ birthdays: on ? undefined : false })}
        settings={settings}
        set={set}
      />
      <PeopleList
        title="Anniversaries"
        help="Each year, by the calendar they were entered in."
        list={schedule.anniversaries ?? []}
        on={settings.anniversaries !== false}
        onToggle={(on) => set({ anniversaries: on ? undefined : false })}
        settings={settings}
        set={set}
      />
    </Card>
  )
}

/** Text under every month, or under one month on its own. */
export function CalendarFooterCard({
  settings,
  months,
  basis,
  lang,
  set,
}: {
  settings: CalendarPrintSettings
  months: CalendarMonth[]
  basis: CalendarBasis
  lang: 'en' | 'he'
  set: Set
}) {
  const [chosen, setChosen] = React.useState('')
  const own = settings.monthFooters ?? {}
  const key = months.some((m) => monthKey(m) === chosen)
    ? chosen
    : (months[0] && monthKey(months[0])) || ''
  const nameOf = (start: string) => {
    const m = months.find((x) => monthKey(x) === start)
    return m ? monthTitles(basis, m.start, m.end, lang).title : start
  }
  const setOwn = (text: string) => {
    const next = { ...own, [key]: text }
    if (!text.trim()) delete next[key]
    set({ monthFooters: Object.keys(next).length ? next : undefined })
  }
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Footer</Text>
      <Field
        label="Under every month"
        placeholder="Seudah schedule, office hours, a donation line…"
        help="Optional. A month with a footer of its own shows that one instead."
        value={settings.footer ?? ''}
        onChangeText={(footer) => set({ footer: footer || undefined })}
        multiline
      />
      {!!months.length && (
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Under one month only
          </Text>
          <Select
            accessibilityLabel="Month for its own footer"
            value={key}
            options={months.map((m) => ({
              value: monthKey(m),
              label: nameOf(monthKey(m)) + (own[monthKey(m)] ? ' ✓' : ''),
            }))}
            onChange={setChosen}
          />
          <Field
            label={`Footer for ${nameOf(key)}`}
            placeholder="Leave empty to use the one for every month"
            value={own[key] ?? ''}
            onChangeText={setOwn}
            multiline
          />
        </Stack>
      )}
    </Card>
  )
}
