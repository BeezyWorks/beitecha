import { Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
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
  type YahrzeitNames,
} from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import { AiAssist } from './AiAssist'
import { download, pickTextFile } from './aiClipboard'
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
import { SectionPage } from './SectionPage'
import { newId, useAdmin } from './store'

const NAMES: { key: YahrzeitNames; label: string }[] = [
  { key: 'both', label: 'Both names' },
  { key: 'hebrew', label: 'Hebrew name only' },
  { key: 'display', label: 'Display name only' },
]

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
      'Shown under “Upcoming birthdays” in the announcements on the display, the printed week and the Siddur, in the days before each one. Each is shown by the date you choose, Hebrew or civil.',
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
      'Shown under “Upcoming anniversaries” in the announcements on the display, the printed week and the Siddur, in the days before each one. Each is shown by the date you choose, Hebrew or civil.',
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
  const set = (patch: Partial<Occasion>) => setO({ ...o, ...patch })
  const setDisplay = (patch: { en?: string; he?: string }) => {
    const d = {
      en: o.displayName?.en ?? '',
      ...(o.displayName?.he && { he: o.displayName.he }),
      ...patch,
    }
    set({ displayName: d.en || d.he ? { en: d.en, ...(d.he && { he: d.he }) } : undefined })
  }
  const named = !!(o.hebrewName?.trim() || o.displayName?.en.trim() || o.displayName?.he?.trim())
  const hebrew = resolveOccasion(o).hebrew
  return (
    <Card gap="md">
      <Field
        label="Hebrew name"
        placeholder={copy.placeholder.hebrew}
        help={copy.nameHelp}
        value={o.hebrewName ?? ''}
        onChangeText={(hebrewName) => set({ hebrewName: hebrewName || undefined })}
      />
      <Field
        label="Display name"
        placeholder={copy.placeholder.display}
        help="The name people know them by."
        value={o.displayName?.en ?? ''}
        onChangeText={(en) => setDisplay({ en })}
      />
      <Field
        label="Display name in Hebrew"
        placeholder={copy.placeholder.displayHe}
        value={o.displayName?.he ?? ''}
        onChangeText={(he) => setDisplay({ he })}
      />
      <DatesEditor
        value={o}
        onChange={(patch) =>
          setO({ ...o, hebrew: undefined, gregorian: undefined, by: undefined, ...patch })
        }
      />
      <Stack direction="row" gap="sm">
        <Button
          title="Save"
          disabled={!named || !hebrew || !isRealMonthDay(hebrew)}
          onPress={() => onDone(o)}
        />
        <Button variant="ghost" title="Cancel" onPress={() => onDone()} />
      </Stack>
    </Card>
  )
}

/** The birthdays or anniversaries the shul keeps: each shows in the announcements in the days before it, every year. */
export function OccasionsTab({ kind, today }: { kind: OccasionKind; today: DateString }) {
  const key = kind === 'birthday' ? 'birthdays' : 'anniversaries'
  const list = useAdmin((s) => s.schedule?.[key]) ?? []
  const settings = useAdmin((s) => s.schedule?.settings[key]) ?? {}
  const setOccasions = useAdmin((s) => s.setOccasions)
  const [editing, setEditing] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ answer: string; n: number } | null>(null)
  const profile = useAdmin((s) => s.profile)
  const t = makeT('en')
  const copy = COPY[kind]
  const words = OCCASION_WORDS[kind]
  const save = (next: Occasion[], s: OccasionSettings = settings) => setOccasions(kind, next, s)

  const setSettings = (patch: Partial<OccasionSettings>) => save(list, { ...settings, ...patch })
  const setTitle = (patch: { en?: string; he?: string }) => {
    const title = {
      en: settings.title?.en ?? '',
      ...(settings.title?.he && { he: settings.title.he }),
      ...patch,
    }
    setSettings({
      title: title.en || title.he ? { en: title.en, ...(title.he && { he: title.he }) } : undefined,
    })
  }
  const upsert = (o: Occasion) =>
    save(list.some((x) => x.id === o.id) ? list.map((x) => (x.id === o.id ? o : x)) : [...list, o])
  const addAll = (items: Occasion[]) =>
    save([
      ...list,
      ...items
        .filter((p) => !list.some((x) => sameOccasion(x, p)))
        .map((p) => ({ ...p, id: newId() })),
    ])
  const next = (o: Occasion) => occasionsBetween([o], today, addDays(today, 400))[0]
  const blank = (): Occasion => ({ id: newId(), hebrew: gregorianToHebrew(today), by: 'hebrew' })

  return (
    <SectionPage
      title={copy.title}
      intro={copy.intro}
      actions={
        editing === null && <Button icon="add" title={copy.add} onPress={() => setEditing('new')} />
      }
    >
      {editing === 'new' && (
        <OccasionForm
          kind={kind}
          initial={blank()}
          onDone={(o) => {
            if (o) upsert(o)
            setEditing(null)
          }}
        />
      )}
      <Card gap="md">
        <Text variant="sectionHeader">How they show</Text>
        <Field
          label="Title"
          placeholder={t.occasionTitle(kind)}
          value={settings.title?.en ?? ''}
          onChangeText={(en) => setTitle({ en })}
        />
        <Field
          label="Title in Hebrew"
          placeholder={kind === 'birthday' ? 'ימי הולדת בקרוב' : 'ימי נישואין בקרוב'}
          value={settings.title?.he ?? ''}
          onChangeText={(he) => setTitle({ he })}
        />
        <Stack gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Names
          </Text>
          <Segments
            accessibilityLabel="Names shown"
            options={NAMES}
            value={settings.names ?? 'both'}
            onChange={(names) => setSettings({ names })}
          />
        </Stack>
        <Field
          label="Days ahead"
          help="How many days before one it appears on the display and in the Siddur. The printed week lists its own days."
          value={String(settings.days ?? 7)}
          keyboardType="number-pad"
          onChangeText={(d) => {
            const n = Math.min(60, Math.max(1, parseInt(d, 10) || 0))
            if (n) setSettings({ days: n === 7 ? undefined : n })
          }}
        />
      </Card>
      <Card gap="md">
        <Text variant="sectionHeader">Import & export</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Have a spreadsheet already? Use “Import with AI”: copy the prompt into ChatGPT, Claude or
          Gemini along with your list, and paste back the CSV it gives you. A CSV or JSON file, or
          this tab’s own export, can also be loaded as is. Each row needs one date, Hebrew (a year
          is optional) or civil. Anyone already on the list is skipped.
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Button
            variant="secondary"
            size="sm"
            title="Import with AI"
            onPress={() => setImporting({ answer: '', n: (importing?.n ?? 0) + 1 })}
          />
          <Button
            variant="secondary"
            size="sm"
            title="Import a file"
            onPress={() =>
              pickTextFile((answer) => setImporting({ answer, n: (importing?.n ?? 0) + 1 }))
            }
          />
          <Button
            variant="secondary"
            size="sm"
            title="Export CSV"
            disabled={!list.length}
            onPress={() => download(`${words.many}.csv`, occasionsToCsv(list), 'text/csv')}
          />
          <Button
            variant="secondary"
            size="sm"
            title="Export JSON"
            disabled={!list.length}
            onPress={() =>
              download(`${words.many}.json`, occasionsToJson(kind, list), 'application/json')
            }
          />
        </Stack>
        {importing && profile && (
          <AiAssist<Occasion[]>
            key={importing.n}
            title={`Import ${words.many}`}
            example="Paste your spreadsheet’s rows here (names and dates), or say “my spreadsheet is attached”."
            answerHint="Paste the CSV (or JSON) the AI gave you, or a CSV straight from a spreadsheet."
            initialAnswer={importing.answer}
            prompt={(request) => occasionPrompt(profile, kind, request)}
            parse={(text) => parseOccasions(kind, text)}
            preview={(items) => (
              <Stack gap="xs">
                {items.map((p, i) => (
                  <Text key={i} variant="body">
                    {t.yahrzeitNames(p).join(' · ')} · {occasionDateWords(p)}
                  </Text>
                ))}
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {items.filter((p) => list.some((x) => sameOccasion(x, p))).length} already on the
                  list will be skipped.
                </Text>
              </Stack>
            )}
            applyLabel="Add to the list"
            onApply={addAll}
            onClose={() => setImporting(null)}
          />
        )}
      </Card>
      {!list.length && editing === null && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          {copy.empty}
        </Text>
      )}
      {list.length > 0 && (
        <Card gap="sm">
          {list.map((o) => {
            const coming = next(o)
            return editing === o.id ? (
              <OccasionForm
                key={o.id}
                kind={kind}
                initial={o}
                onDone={(changed) => {
                  if (changed) upsert(changed)
                  setEditing(null)
                }}
              />
            ) : (
              <Stack key={o.id} direction="row" align="center" gap="sm" wrap>
                <Stack grow width={0} gap="none">
                  <Stack direction="row" gap="sm" wrap>
                    {t.yahrzeitNames(o).map((n) => (
                      <Text key={n} variant="item" rtl={/[֐-׿]/.test(n)}>
                        {n}
                      </Text>
                    ))}
                  </Stack>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    {occasionDateWords(o)}
                    {coming ? ` · Next: ${t.occasionDate(coming.date, coming.by)}` : ''}
                  </Text>
                </Stack>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="edit"
                  title="Edit"
                  onPress={() => setEditing(o.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon="delete"
                  title="Remove"
                  onPress={() => save(list.filter((x) => x.id !== o.id))}
                />
              </Stack>
            )
          })}
        </Card>
      )}
    </SectionPage>
  )
}
