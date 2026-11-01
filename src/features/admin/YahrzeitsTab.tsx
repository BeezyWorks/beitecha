import { Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
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
  type YahrzeitNames,
  type YahrzeitSettings,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { AiAssist } from './AiAssist'
import { download, pickTextFile } from './aiClipboard'
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
import { SectionPage } from './SectionPage'
import { newId, useAdmin } from './store'

const NAMES: { key: YahrzeitNames; label: string }[] = [
  { key: 'both', label: 'Both names' },
  { key: 'hebrew', label: 'Hebrew name only' },
  { key: 'display', label: 'Display name only' },
]
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

function blank(today: DateString): Yahrzeit {
  return { id: newId(), hebrew: gregorianToHebrew(today), gregorian: today }
}

function PersonForm({ initial, onDone }: { initial: Yahrzeit; onDone: (y?: Yahrzeit) => void }) {
  const [y, setY] = useState(initial)
  const set = (patch: Partial<Yahrzeit>) => setY({ ...y, ...patch })
  const setDisplay = (patch: { en?: string; he?: string }) => {
    const d = {
      en: y.displayName?.en ?? '',
      ...(y.displayName?.he && { he: y.displayName.he }),
      ...patch,
    }
    set({ displayName: d.en || d.he ? { en: d.en, ...(d.he && { he: d.he }) } : undefined })
  }
  const named = !!(y.hebrewName?.trim() || y.displayName?.en.trim() || y.displayName?.he?.trim())
  return (
    <Card gap="md">
      <Field
        label="Hebrew name"
        placeholder="מנחם בן מימון"
        help="With the father’s name, as said at the yahrzeit."
        value={y.hebrewName ?? ''}
        onChangeText={(hebrewName) => set({ hebrewName: hebrewName || undefined })}
      />
      <Field
        label="Display name"
        placeholder="Menachem Kohen"
        help="The name people know them by."
        value={y.displayName?.en ?? ''}
        onChangeText={(en) => setDisplay({ en })}
      />
      <Field
        label="Display name in Hebrew"
        placeholder="מנחם כהן"
        value={y.displayName?.he ?? ''}
        onChangeText={(he) => setDisplay({ he })}
      />
      <DateEditor hebrew={y.hebrew} gregorian={y.gregorian} onChange={(d) => set(d)} />
      <Stack direction="row" gap="sm">
        <Button
          title="Save"
          disabled={!named || !isRealHebrewDate(y.hebrew)}
          onPress={() => onDone(y)}
        />
        <Button variant="ghost" title="Cancel" onPress={() => onDone()} />
      </Stack>
    </Card>
  )
}

/** The yahrzeits the shul keeps: each shows in the announcements in the days before it, every year. */
export function YahrzeitsTab({ today }: { today: DateString }) {
  const list = useAdmin((s) => s.schedule?.yahrzeits) ?? []
  const settings = useAdmin((s) => s.schedule?.settings.yahrzeits) ?? {}
  const setYahrzeits = useAdmin((s) => s.setYahrzeits)
  const [editing, setEditing] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ answer: string; n: number } | null>(null)
  const profile = useAdmin((s) => s.profile)
  const t = makeT('en')

  const setSettings = (patch: Partial<YahrzeitSettings>) =>
    setYahrzeits(list, { ...settings, ...patch })
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
  const upsert = (y: Yahrzeit) =>
    setYahrzeits(
      list.some((x) => x.id === y.id) ? list.map((x) => (x.id === y.id ? y : x)) : [...list, y],
    )
  const addAll = (people: Yahrzeit[]) =>
    setYahrzeits([
      ...list,
      ...people
        .filter((p) => !list.some((x) => sameYahrzeit(x, p)))
        .map((p) => ({ ...p, id: newId() })),
    ])
  const next = (y: Yahrzeit) => yahrzeitsBetween([y], today, addDays(today, 400))[0]?.date

  return (
    <SectionPage
      title="Yahrzeits"
      intro="Shown under “Upcoming yahrzeits” in the announcements on the display, the printed week and the Siddur, in the days before each one."
      actions={
        editing === null && (
          <Button icon="add" title="Add a yahrzeit" onPress={() => setEditing('new')} />
        )
      }
    >
      {editing === 'new' && (
        <PersonForm
          initial={blank(today)}
          onDone={(y) => {
            if (y) upsert(y)
            setEditing(null)
          }}
        />
      )}
      <Card gap="md">
        <Text variant="sectionHeader">How they show</Text>
        <Field
          label="Title"
          placeholder="Upcoming yahrzeits"
          value={settings.title?.en ?? ''}
          onChangeText={(en) => setTitle({ en })}
        />
        <Field
          label="Title in Hebrew"
          placeholder="יארצייט בקרוב"
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
        <Stack gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Dates
          </Text>
          <Segments
            accessibilityLabel="Dates shown"
            options={DATES}
            value={settings.dates ?? 'both'}
            onChange={(dates) => setSettings({ dates })}
          />
        </Stack>
        <Field
          label="Days ahead"
          help="How many days before a yahrzeit it appears on the display and in the Siddur. The printed week lists its own days."
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
          this tab’s own export, can also be loaded as is. Anyone already on the list is skipped.
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
            onPress={() => download('yahrzeits.csv', yahrzeitsToCsv(list), 'text/csv')}
          />
          <Button
            variant="secondary"
            size="sm"
            title="Export JSON"
            disabled={!list.length}
            onPress={() => download('yahrzeits.json', yahrzeitsToJson(list), 'application/json')}
          />
        </Stack>
        {importing && profile && (
          <AiAssist<Yahrzeit[]>
            key={importing.n}
            title="Import yahrzeits"
            example={
              'Paste your spreadsheet’s rows here (names and dates), or say “my spreadsheet is attached”.'
            }
            answerHint="Paste the CSV (or JSON) the AI gave you, or a CSV straight from a spreadsheet."
            initialAnswer={importing.answer}
            prompt={(request) => yahrzeitPrompt(profile, request)}
            parse={parseYahrzeits}
            preview={(people) => (
              <Stack gap="xs">
                {people.map((p, i) => (
                  <Text key={i} variant="body">
                    {t.yahrzeitNames(p).join(' · ')} · {hebrewDateWords(p.hebrew)} · {p.gregorian}
                  </Text>
                ))}
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {people.filter((p) => list.some((x) => sameYahrzeit(x, p))).length} already on the
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
          No yahrzeits yet. Add one and it shows up on its own every year.
        </Text>
      )}
      {list.length > 0 && (
        <Card gap="sm">
          {list.map((y) => {
            const coming = next(y)
            return editing === y.id ? (
              <PersonForm
                key={y.id}
                initial={y}
                onDone={(changed) => {
                  if (changed) upsert(changed)
                  setEditing(null)
                }}
              />
            ) : (
              <Stack key={y.id} direction="row" align="center" gap="sm" wrap>
                <Stack grow width={0} gap="none">
                  <Stack direction="row" gap="sm" wrap>
                    {t.yahrzeitNames(y).map((n) => (
                      <Text key={n} variant="item" rtl={/[֐-׿]/.test(n)}>
                        {n}
                      </Text>
                    ))}
                  </Stack>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    {coming ? `Next: ${t.yahrzeitDate(coming)}` : 'Date doesn’t recur yet'}
                  </Text>
                </Stack>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="edit"
                  title="Edit"
                  onPress={() => setEditing(y.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon="delete"
                  title="Remove"
                  onPress={() => setYahrzeits(list.filter((x) => x.id !== y.id))}
                />
              </Stack>
            )
          })}
        </Card>
      )}
    </SectionPage>
  )
}
