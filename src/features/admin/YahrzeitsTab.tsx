import { Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  gregorianToHebrew,
  hebrewMonths,
  hebrewToGregorian,
  isRealMonthDay,
  makeT,
  yahrzeitsBetween,
  type DateString,
  type HebrewMonthDay,
  type Yahrzeit,
  type YahrzeitDates,
  type YahrzeitSettings,
} from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import {
  hebrewDateWords,
  parseYahrzeits,
  sameYahrzeit,
  yahrzeitPrompt,
  yahrzeitsToCsv,
  yahrzeitsToJson,
} from './aiYahrzeits'
import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { DateField } from './DateField'
import { BulletinToggle, FormButtons, isNamed, NameFields, RememberedTab } from './RememberedTab'
import { newId, useAdmin } from './store'

const DATES: { key: YahrzeitDates; label: string }[] = [
  { key: 'both', label: 'Both dates' },
  { key: 'hebrew', label: 'Hebrew date only' },
  { key: 'english', label: 'English date only' },
]

const ANY_YEAR = 5784
const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

/** A Hebrew day and month (the year and the civil date are optional); change the civil date or a Hebrew date with a year and the other follows. */
function DateEditor({
  hebrew,
  gregorian,
  onChange,
}: {
  hebrew: HebrewMonthDay
  gregorian?: DateString
  onChange: (d: { hebrew: HebrewMonthDay; gregorian?: DateString }) => void
}) {
  const [year, setYear] = useState(hebrew.year ? String(hebrew.year) : '')
  useEffect(() => setYear(hebrew.year ? String(hebrew.year) : ''), [hebrew.year])
  const months = hebrewMonths(hebrew.year ?? ANY_YEAR).map((m) => ({
    value: String(m.month),
    label: !hebrew.year && m.month === 12 ? 'Adar (Adar I in a leap year)' : m.name,
  }))
  const setHebrew = (h: HebrewMonthDay) => {
    // A month that does not exist in this year (Adar II in a plain one) moves to Adar.
    const fixed =
      h.year && h.month === 13 && !months.some((m) => m.value === '13') ? { ...h, month: 12 } : h
    onChange({
      hebrew: fixed,
      gregorian:
        fixed.year && isRealMonthDay(fixed)
          ? hebrewToGregorian({ ...fixed, year: fixed.year })
          : undefined,
    })
  }
  const real = isRealMonthDay(hebrew)
  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Hebrew date
        </Text>
        <Stack direction="row" gap="sm" align="center" wrap>
          <Stack width={90}>
            <Select
              accessibilityLabel="Hebrew day"
              value={String(hebrew.day)}
              options={DAYS}
              onChange={(d) => setHebrew({ ...hebrew, day: +d })}
            />
          </Stack>
          <Stack width={230}>
            <Select
              accessibilityLabel="Hebrew month"
              value={String(hebrew.month)}
              options={months}
              onChange={(m) => setHebrew({ ...hebrew, month: +m })}
            />
          </Stack>
          <Stack width={130}>
            <Field
              label=""
              accessibilityLabel="Hebrew year (optional)"
              placeholder="Year"
              value={year}
              keyboardType="number-pad"
              onChangeText={(y) => {
                setYear(y)
                if (/^\d{4}$/.test(y)) setHebrew({ ...hebrew, year: +y })
                else if (!y) setHebrew({ day: hebrew.day, month: hebrew.month })
              }}
            />
          </Stack>
        </Stack>
        <Text
          variant="caption"
          color={real ? SemanticColor.TextSecondary : SemanticColor.TextDanger}
        >
          {real
            ? 'The year is optional: it’s kept on the same Hebrew date every year either way.'
            : 'That Hebrew date doesn’t exist.'}
        </Text>
      </Stack>
      <DateField
        label="Civil date of passing"
        value={gregorian}
        unsetLabel="Add a civil date"
        initial="2000-01-01"
        onChange={(d) =>
          d
            ? onChange({ gregorian: d, hebrew: gregorianToHebrew(d) })
            : onChange({ hebrew: { day: hebrew.day, month: hebrew.month } })
        }
        help="Optional. Choosing it fills in the Hebrew date. If they passed after nightfall, set the Hebrew date above."
      />
    </Stack>
  )
}

function YahrzeitForm({ initial, onDone }: { initial: Yahrzeit; onDone: (y?: Yahrzeit) => void }) {
  const [y, setY] = useState(initial)
  return (
    <Card gap="md">
      <NameFields
        value={y}
        onChange={setY}
        placeholder={{ hebrew: 'מנחם בן מימון', display: 'Menachem Kohen', displayHe: 'מנחם כהן' }}
        nameHelp="With the father’s name, as said at the yahrzeit."
      />
      <DateEditor
        hebrew={y.hebrew}
        gregorian={y.gregorian}
        onChange={(d) => setY({ ...y, ...d })}
      />
      <BulletinToggle value={y} onChange={setY} />
      <FormButtons
        canSave={isNamed(y) && isRealMonthDay(y.hebrew)}
        onSave={() => onDone(y)}
        onCancel={() => onDone()}
      />
    </Card>
  )
}

/** The yahrzeits the shul keeps: each shows in the announcements in the days before it, every year. */
export function YahrzeitsTab({ today }: { today: DateString }) {
  const items = useAdmin((s) => s.schedule?.yahrzeits) ?? []
  const settings = useAdmin((s) => s.schedule?.settings.yahrzeits) ?? {}
  const setYahrzeits = useAdmin((s) => s.setYahrzeits)
  const t = makeT('en')
  return (
    <RememberedTab<Yahrzeit, YahrzeitSettings>
      title="Yahrzeits"
      intro="Shown under “Upcoming yahrzeits” in the announcements on the display, the bulletin and the Siddur, in the days before each one."
      add="Add a yahrzeit"
      empty="No yahrzeits yet. Add one and it shows up on its own every year."
      many="yahrzeits"
      titlePlaceholder={{ en: 'Upcoming yahrzeits', he: 'יארצייט בקרוב' }}
      items={items}
      settings={settings}
      save={setYahrzeits}
      today={today}
      form={YahrzeitForm}
      blank={() => ({ id: newId(), hebrew: gregorianToHebrew(today) })}
      next={(y) => yahrzeitsBetween([y], today, addDays(today, 400))[0]?.date}
      detail={(_, coming) =>
        coming ? `Next: ${t.yahrzeitDate(coming)}` : 'Date doesn’t recur yet'
      }
      settingsExtra={
        <Stack gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Dates
          </Text>
          <Segments
            accessibilityLabel="Dates shown"
            options={DATES}
            value={settings.dates ?? 'both'}
            onChange={(dates) => setYahrzeits(items, { ...settings, dates })}
          />
        </Stack>
      }
      daysHelp="How many days before a yahrzeit it appears on the display and in the Siddur. the bulletin lists its own days."
      importHelp="Have a spreadsheet already? Use “Import with AI”: copy the prompt into ChatGPT, Claude or Gemini along with your list, and paste back the CSV it gives you. A CSV or JSON file, or this tab’s own export, can also be loaded as is. Anyone already on the list is skipped."
      io={{
        prompt: yahrzeitPrompt,
        parse: parseYahrzeits,
        same: sameYahrzeit,
        preview: (p) =>
          `${t.yahrzeitNames(p).join(' · ')} · ${hebrewDateWords(p.hebrew)}${p.gregorian ? ` · ${p.gregorian}` : ''}`,
        csv: yahrzeitsToCsv,
        json: yahrzeitsToJson,
      }}
    />
  )
}
