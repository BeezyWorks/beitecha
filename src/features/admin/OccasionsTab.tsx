import { Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  gregorianToHebrew,
  hebrewMonths,
  hebrewToGregorian,
  isRealMonthDay,
  makeT,
  occasionsBetween,
  resolveOccasion,
  type DateString,
  type HebrewMonthDay,
  type Occasion,
  type OccasionKind,
  type OccasionSettings,
} from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import {
  OCCASION_WORDS,
  occasionDateWords,
  occasionPrompt,
  occasionsToCsv,
  occasionsToJson,
  parseOccasions,
  sameOccasion,
} from './aiOccasions'
import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { DateField } from './DateField'
import { FormButtons, isNamed, NameFields, RememberedTab } from './RememberedTab'
import { newId, useAdmin } from './store'

const DAYS = Array.from({ length: 30 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))

/** A leap year's months, standing in when no year is given. */
const ANY_YEAR = 5784

const COPY: Record<
  OccasionKind,
  {
    title: string
    add: string
    placeholder: { hebrew: string; display: string; displayHe: string }
    nameHelp: string
    intro: string
    empty: string
  }
> = {
  birthday: {
    title: 'Birthdays',
    add: 'Add a birthday',
    placeholder: { hebrew: 'מנחם בן מימון', display: 'Menachem Kohen', displayHe: 'מנחם כהן' },
    nameHelp: 'With the father’s name, if the shul says it.',
    intro:
      'Shown under “Upcoming birthdays” in the announcements on the display, the bulletin and the Siddur, in the days before each one. Each is shown by the date you choose, Hebrew or civil.',
    empty: 'No birthdays yet. Add one and it shows up on its own every year.',
  },
  anniversary: {
    title: 'Anniversaries',
    add: 'Add an anniversary',
    placeholder: {
      hebrew: 'מנחם ושרה',
      display: 'Menachem & Sarah Kohen',
      displayHe: 'מנחם ושרה כהן',
    },
    nameHelp: 'Both names, as they should read.',
    intro:
      'Shown under “Upcoming anniversaries” in the announcements on the display, the bulletin and the Siddur, in the days before each one. Each is shown by the date you choose, Hebrew or civil.',
    empty: 'No anniversaries yet. Add one and it shows up on its own every year.',
  },
}

/**
 * The dates of one entry. Either one is enough: a civil date gives the Hebrew date, and a Hebrew date with a year
 * gives the civil one. A Hebrew date without a year has no civil date and is shown as Hebrew.
 */
function DatesEditor({
  value,
  onChange,
}: {
  value: Occasion
  onChange: (patch: Pick<Occasion, 'hebrew' | 'gregorian' | 'by'>) => void
}) {
  const r = resolveOccasion(value)
  const hebrew: HebrewMonthDay = r.hebrew ?? { day: 1, month: 7 }
  const [year, setYear] = useState(hebrew.year ? String(hebrew.year) : '')
  useEffect(() => setYear(hebrew.year ? String(hebrew.year) : ''), [hebrew.year])
  const months = hebrewMonths(hebrew.year ?? ANY_YEAR).map((m) => ({
    value: String(m.month),
    label: !hebrew.year && m.month === 12 ? 'Adar (Adar I in a leap year)' : m.name,
  }))
  const setHebrew = (h: HebrewMonthDay) => {
    const civil =
      h.year && isRealMonthDay(h) ? hebrewToGregorian({ ...h, year: h.year }) : undefined
    onChange({
      hebrew: h,
      gregorian: civil,
      by: civil ? (r.by === 'gregorian' ? 'gregorian' : 'hebrew') : 'hebrew',
    })
  }
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
          color={isRealMonthDay(hebrew) ? SemanticColor.TextSecondary : SemanticColor.TextDanger}
        >
          {isRealMonthDay(hebrew)
            ? 'The year is optional. Without one, only the Hebrew date is kept.'
            : 'That Hebrew date doesn’t exist.'}
        </Text>
      </Stack>
      <DateField
        label="Civil date"
        value={r.gregorian}
        unsetLabel="Add a civil date"
        initial={r.gregorian ?? '2000-01-01'}
        onChange={(d) =>
          d
            ? onChange({ gregorian: d, hebrew: gregorianToHebrew(d), by: 'gregorian' })
            : onChange({ hebrew: { day: hebrew.day, month: hebrew.month }, by: 'hebrew' })
        }
        help="Choosing it fills in the Hebrew date. If it was after nightfall, set the Hebrew date above."
      />
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Show as
        </Text>
        <Segments
          accessibilityLabel="Date shown"
          options={[
            { key: 'hebrew', label: 'Hebrew date' },
            ...(r.gregorian ? [{ key: 'gregorian' as const, label: 'Civil date' }] : []),
          ]}
          value={r.by}
          onChange={(by) =>
            onChange({ hebrew: value.hebrew ?? r.hebrew, gregorian: r.gregorian, by })
          }
        />
      </Stack>
    </Stack>
  )
}

function OccasionForm({
  kind,
  initial,
  onDone,
}: {
  kind: OccasionKind
  initial: Occasion
  onDone: (o?: Occasion) => void
}) {
  const [o, setO] = useState(initial)
  const copy = COPY[kind]
  const hebrew = resolveOccasion(o).hebrew
  return (
    <Card gap="md">
      <NameFields
        value={o}
        onChange={setO}
        placeholder={copy.placeholder}
        nameHelp={copy.nameHelp}
      />
      <DatesEditor
        value={o}
        onChange={(patch) =>
          setO({ ...o, hebrew: undefined, gregorian: undefined, by: undefined, ...patch })
        }
      />
      <FormButtons
        canSave={isNamed(o) && !!hebrew && isRealMonthDay(hebrew)}
        onSave={() => onDone(o)}
        onCancel={() => onDone()}
      />
    </Card>
  )
}

const FORMS: Record<
  OccasionKind,
  (p: { initial: Occasion; onDone: (o?: Occasion) => void }) => React.ReactNode
> = {
  birthday: (p) => <OccasionForm kind="birthday" {...p} />,
  anniversary: (p) => <OccasionForm kind="anniversary" {...p} />,
}

/** The birthdays or anniversaries the shul keeps: each shows in the announcements in the days before it, every year. */
export function OccasionsTab({ kind, today }: { kind: OccasionKind; today: DateString }) {
  const key = kind === 'birthday' ? 'birthdays' : 'anniversaries'
  const items = useAdmin((s) => s.schedule?.[key]) ?? []
  const settings = useAdmin((s) => s.schedule?.settings[key]) ?? {}
  const setOccasions = useAdmin((s) => s.setOccasions)
  const t = makeT('en')
  const copy = COPY[kind]
  const words = OCCASION_WORDS[kind]
  const upcoming = (o: Occasion) => occasionsBetween([o], today, addDays(today, 400))[0]
  return (
    <RememberedTab<Occasion, OccasionSettings>
      title={copy.title}
      intro={copy.intro}
      add={copy.add}
      empty={copy.empty}
      many={words.many}
      titlePlaceholder={{
        en: t.occasionTitle(kind),
        he: kind === 'birthday' ? 'ימי הולדת בקרוב' : 'ימי נישואין בקרוב',
      }}
      items={items}
      settings={settings}
      save={(list, s) => setOccasions(kind, list, s)}
      today={today}
      form={FORMS[kind]}
      blank={() => ({ id: newId(), hebrew: gregorianToHebrew(today), by: 'hebrew' })}
      next={(o) => upcoming(o)?.date}
      detail={(o) => {
        const coming = upcoming(o)
        return `${occasionDateWords(o)}${coming ? ` · Next: ${t.occasionDate(coming.date, coming.by)}` : ''}`
      }}
      daysHelp="How many days before one it appears on the display and in the Siddur. the bulletin lists its own days."
      importHelp="Have a spreadsheet already? Use “Import with AI”: copy the prompt into ChatGPT, Claude or Gemini along with your list, and paste back the CSV it gives you. A CSV or JSON file, or this tab’s own export, can also be loaded as is. Each row needs one date, Hebrew (a year is optional) or civil. Anyone already on the list is skipped."
      io={{
        prompt: (profile, ask) => occasionPrompt(profile, kind, ask),
        parse: (text) => parseOccasions(kind, text),
        same: sameOccasion,
        preview: (p) => `${t.yahrzeitNames(p).join(' · ')} · ${occasionDateWords(p)}`,
        csv: occasionsToCsv,
        json: (list) => occasionsToJson(kind, list),
      }}
    />
  )
}
