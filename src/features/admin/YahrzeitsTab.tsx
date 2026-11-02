import { Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  gregorianToHebrew,
  hebrewMonths,
  hebrewToGregorian,
  isRealHebrewDate,
  makeT,
  yahrzeitsBetween,
  type DateString,
  type HebrewDate,
  type Yahrzeit,
  type YahrzeitDates,
  type YahrzeitSettings,
} from '@beitecha/engine'
import React, { useState } from 'react'

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
import { FormButtons, isNamed, NameFields, RememberedTab } from './RememberedTab'
import { newId, useAdmin } from './store'

const DATES: { key: YahrzeitDates; label: string }[] = [
  { key: 'both', label: 'Both dates' },
  { key: 'hebrew', label: 'Hebrew date only' },
  { key: 'english', label: 'English date only' },
]

const DAYS = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

/** A Hebrew date and the civil date it falls on; change either and the other follows. */
function DateEditor({
  hebrew,
  gregorian,
  onChange,
}: {
  hebrew: HebrewDate
  gregorian: DateString
  onChange: (d: { hebrew: HebrewDate; gregorian: DateString }) => void
}) {
  const [year, setYear] = useState(String(hebrew.year))
  const months = hebrewMonths(hebrew.year).map((m) => ({ value: String(m.month), label: m.name }))
  const setHebrew = (h: HebrewDate) => {
    // A month that does not exist in this year (Adar II in a plain one) moves to Adar.
    const fixed =
      months.some((m) => m.value === String(h.month)) || h.year === hebrew.year
        ? h
        : { ...h, month: h.month === 13 ? 12 : h.month }
    onChange({
      hebrew: fixed,
      gregorian: isRealHebrewDate(fixed) ? hebrewToGregorian(fixed) : gregorian,
    })
  }
  const real = isRealHebrewDate(hebrew)
  return (
    <Stack gap="md">
      <DateField
        label="Date of passing"
        value={gregorian}
        onChange={(d) => d && onChange({ gregorian: d, hebrew: gregorianToHebrew(d) })}
        help="Choose the civil date and the Hebrew date fills in. If they passed after nightfall, set the Hebrew date below."
      />
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
          <Stack width={180}>
            <Select
              accessibilityLabel="Hebrew month"
              value={String(hebrew.month)}
              options={months}
              onChange={(m) => setHebrew({ ...hebrew, month: +m })}
            />
          </Stack>
          <Stack width={110}>
            <Field
              label=""
              accessibilityLabel="Hebrew year"
              value={year}
              keyboardType="number-pad"
              onChangeText={(y) => {
                setYear(y)
                if (/^\d{4}$/.test(y)) setHebrew({ ...hebrew, year: +y })
              }}
            />
          </Stack>
        </Stack>
        {!real && (
          <Text variant="caption" color={SemanticColor.TextDanger}>
            That Hebrew date doesn’t exist in {hebrew.year}.
          </Text>
        )}
        {real && gregorian > new Date().toISOString().slice(0, 10) && (
          <Text variant="caption" color={SemanticColor.TextDanger}>
            This is the year of the passing, and it hasn’t happened yet. Set the year they passed
            away, or this yahrzeit won’t be listed.
          </Text>
        )}
      </Stack>
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
      <FormButtons
        canSave={isNamed(y) && isRealHebrewDate(y.hebrew)}
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
      blank={() => ({ id: newId(), hebrew: gregorianToHebrew(today), gregorian: today })}
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
          `${t.yahrzeitNames(p).join(' · ')} · ${hebrewDateWords(p.hebrew)} · ${p.gregorian}`,
        csv: yahrzeitsToCsv,
        json: yahrzeitsToJson,
      }}
    />
  )
}
