import {
  Button,
  Card,
  Icon,
  SemanticColor,
  Stack,
  Text,
  ToggleSwitch,
  Touchable,
} from '@beezyworks/design'
import { makeT, type DateString, type Localized, type YahrzeitNames } from '@beitecha/engine'
import React, { useState } from 'react'

import { AiAssist } from './AiAssist'
import { download, pickTextFile } from './aiClipboard'
import type { Parsed } from './aiItems'
import { SectionPage } from './SectionPage'
import { newId, useAdmin } from './store'
import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'

/** What yahrzeits, birthdays and anniversaries share: someone's names, kept once and shown every year. */
export interface Remembered {
  id: string
  hebrewName?: string
  displayName?: Localized
  hideFromBulletin?: boolean
}

/** What the shul sets about how a list shows; the same for all three. */
export interface RememberedSettings {
  title?: Localized
  names?: YahrzeitNames
  days?: number
}

const NAMES: { key: YahrzeitNames; label: string }[] = [
  { key: 'both', label: 'Both names' },
  { key: 'hebrew', label: 'Hebrew name only' },
  { key: 'display', label: 'Display name only' },
]

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** The three name fields of a person, with an example of each. */
export function NameFields<T extends Remembered>({
  value,
  onChange,
  placeholder,
  nameHelp,
}: {
  value: T
  onChange: (next: T) => void
  placeholder: { hebrew: string; display: string; displayHe: string }
  nameHelp: string
}) {
  const setDisplay = (patch: { en?: string; he?: string }) => {
    const d = {
      en: value.displayName?.en ?? '',
      ...(value.displayName?.he && { he: value.displayName.he }),
      ...patch,
    }
    onChange({
      ...value,
      displayName: d.en || d.he ? { en: d.en, ...(d.he && { he: d.he }) } : undefined,
    })
  }
  return (
    <>
      <Field
        label="Hebrew name"
        placeholder={placeholder.hebrew}
        help={nameHelp}
        value={value.hebrewName ?? ''}
        onChangeText={(hebrewName) => onChange({ ...value, hebrewName: hebrewName || undefined })}
      />
      <Field
        label="Display name"
        placeholder={placeholder.display}
        help="The name people know them by."
        value={value.displayName?.en ?? ''}
        onChangeText={(en) => setDisplay({ en })}
      />
      <Field
        label="Display name in Hebrew"
        placeholder={placeholder.displayHe}
        value={value.displayName?.he ?? ''}
        onChangeText={(he) => setDisplay({ he })}
      />
    </>
  )
}

/** Whether this one is left off the printed bulletin. */
export function BulletinToggle<T extends Remembered>({
  value,
  onChange,
}: {
  value: T
  onChange: (next: T) => void
}) {
  return (
    <Stack direction="row" align="center" gap="md">
      <Stack grow>
        <Text variant="body">Show on the bulletin</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Turn off to leave this one off the printed bulletin. It still shows on the display and in
          the Siddur.
        </Text>
      </Stack>
      <ToggleSwitch
        value={!value.hideFromBulletin}
        onValueChange={(on) => onChange({ ...value, hideFromBulletin: on ? undefined : true })}
        accessibilityLabel="Show on the bulletin"
      />
    </Stack>
  )
}

/** Whether someone has a name to show. */
export const isNamed = (p: Remembered) =>
  !!(p.hebrewName?.trim() || p.displayName?.en.trim() || p.displayName?.he?.trim())

/** Save and Cancel under a person's form. */
export function FormButtons({
  canSave,
  onSave,
  onCancel,
}: {
  canSave: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <Stack direction="row" gap="sm">
      <Button title="Save" disabled={!canSave} onPress={onSave} />
      <Button variant="ghost" title="Cancel" onPress={onCancel} />
    </Stack>
  )
}

export interface RememberedConfig<T extends Remembered, S extends RememberedSettings> {
  title: string
  intro: string
  add: string
  empty: string
  /** Plural in lower case, for the import card and file names: "birthdays". */
  many: string
  titlePlaceholder: { en: string; he: string }
  items: T[]
  settings: S
  save: (items: T[], settings: S) => void
  today: DateString
  /** A form for one person (new or being edited). */
  form: (props: { initial: T; onDone: (p?: T) => void }) => React.ReactNode
  blank: () => T
  /** The next civil day it comes up: which month it is filed under. */
  next: (p: T) => DateString | undefined
  /** The line under their names. */
  detail: (p: T, next: DateString | undefined) => string
  /** More ways this kind of list is shown (yahrzeits choose which dates). */
  settingsExtra?: React.ReactNode
  daysHelp: string
  importHelp: string
  io: {
    prompt: (
      profile: NonNullable<ReturnType<typeof useAdmin.getState>['profile']>,
      ask: string,
    ) => string
    parse: (text: string) => Parsed<T[]>
    same: (a: T, b: T) => boolean
    preview: (p: T) => string
    csv: (items: T[]) => string
    json: (items: T[]) => string
  }
}

/** The one admin tab all three lists use: add, how they show, import and export, and the people by month. */
export function RememberedTab<T extends Remembered, S extends RememberedSettings>(
  c: RememberedConfig<T, S>,
) {
  const { items, settings, io } = c
  const [editing, setEditing] = useState<string | null>(null)
  const [importing, setImporting] = useState<{ answer: string; n: number } | null>(null)
  const profile = useAdmin((s) => s.profile)
  const t = makeT('en')
  const save = (next: T[], s: S = settings) => c.save(next, s)

  const setSettings = (patch: Partial<S>) => save(items, { ...settings, ...patch })
  const setTitle = (patch: { en?: string; he?: string }) => {
    const title = {
      en: settings.title?.en ?? '',
      ...(settings.title?.he && { he: settings.title.he }),
      ...patch,
    }
    setSettings({
      title: title.en || title.he ? { en: title.en, ...(title.he && { he: title.he }) } : undefined,
    } as Partial<S>)
  }
  const upsert = (p: T) =>
    save(
      items.some((x) => x.id === p.id) ? items.map((x) => (x.id === p.id ? p : x)) : [...items, p],
    )
  const addAll = (people: T[]) =>
    save([
      ...items,
      ...people
        .filter((p) => !items.some((x) => io.same(x, p)))
        .map((p) => ({ ...p, id: newId() })),
    ])

  // Filed under the civil month of the next time it comes up, soonest first within the month.
  const dated = items.map((p) => ({ p, next: c.next(p) }))
  const groups = [
    ...MONTHS.map((name, month) => ({ name, month })),
    { name: 'No date to come', month: -1 },
  ]
    .map((g) => ({
      ...g,
      people: dated
        .filter((d) => (d.next ? +d.next.slice(5, 7) - 1 : -1) === g.month)
        .sort((a, b) => (a.next ?? '').localeCompare(b.next ?? '')),
    }))
    .filter((g) => g.people.length > 0)
  const thisMonth = +c.today.slice(5, 7) - 1
  const [open, setOpen] = useState<Set<number>>(new Set([thisMonth]))
  const toggle = (month: number) =>
    setOpen((o) => {
      const next = new Set(o)
      if (!next.delete(month)) next.add(month)
      return next
    })

  return (
    <SectionPage
      title={c.title}
      intro={c.intro}
      actions={
        editing === null && <Button icon="add" title={c.add} onPress={() => setEditing('new')} />
      }
    >
      {editing === 'new' && (
        <c.form
          initial={c.blank()}
          onDone={(p) => {
            if (p) upsert(p)
            setEditing(null)
          }}
        />
      )}
      <Card gap="md">
        <Text variant="sectionHeader">How they show</Text>
        <Field
          label="Title"
          placeholder={c.titlePlaceholder.en}
          value={settings.title?.en ?? ''}
          onChangeText={(en) => setTitle({ en })}
        />
        <Field
          label="Title in Hebrew"
          placeholder={c.titlePlaceholder.he}
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
            onChange={(names) => setSettings({ names } as Partial<S>)}
          />
        </Stack>
        {c.settingsExtra}
        <Field
          label="Days ahead"
          help={c.daysHelp}
          value={String(settings.days ?? 7)}
          keyboardType="number-pad"
          onChangeText={(d) => {
            const n = Math.min(60, Math.max(1, parseInt(d, 10) || 0))
            if (n) setSettings({ days: n === 7 ? undefined : n } as Partial<S>)
          }}
        />
      </Card>
      <Card gap="md">
        <Text variant="sectionHeader">Import & export</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {c.importHelp}
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
            disabled={!items.length}
            onPress={() => download(`${c.many}.csv`, io.csv(items), 'text/csv')}
          />
          <Button
            variant="secondary"
            size="sm"
            title="Export JSON"
            disabled={!items.length}
            onPress={() => download(`${c.many}.json`, io.json(items), 'application/json')}
          />
          <Button
            variant="secondary"
            size="sm"
            icon="delete"
            title="Delete all"
            disabled={!items.length}
            onPress={() => {
              if (
                window.confirm(
                  `Delete all ${items.length} ${c.many}?\n\nThis removes every one from the display, the bulletin and the Siddur once you save. It can’t be undone, so export them first if you might want them back.`,
                )
              )
                save([])
            }}
          />
        </Stack>
        {importing && profile && (
          <AiAssist<T[]>
            key={importing.n}
            title={`Import ${c.many}`}
            example="Paste your spreadsheet’s rows here (names and dates), or say “my spreadsheet is attached”."
            answerHint="Paste the CSV (or JSON) the AI gave you, or a CSV straight from a spreadsheet."
            initialAnswer={importing.answer}
            prompt={(request) => io.prompt(profile, request)}
            parse={io.parse}
            preview={(people) => (
              <Stack gap="xs">
                {people.map((p, i) => (
                  <Text key={i} variant="body">
                    {io.preview(p)}
                  </Text>
                ))}
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {people.filter((p) => items.some((x) => io.same(x, p))).length} already on the
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
      {!items.length && editing === null && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          {c.empty}
        </Text>
      )}
      {groups.map((g) => {
        const isOpen = open.has(g.month) || g.people.some((d) => d.p.id === editing)
        return (
          <Card key={g.month} gap="sm">
            <Touchable
              onPress={() => toggle(g.month)}
              accessibilityLabel={`${g.name}, ${g.people.length}`}
            >
              <Stack direction="row" align="center" gap="sm">
                <Stack grow gap="none">
                  <Text variant="headline">{g.name}</Text>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    {g.people.length}
                  </Text>
                </Stack>
                <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} />
              </Stack>
            </Touchable>
            {isOpen &&
              g.people.map(({ p, next }) =>
                editing === p.id ? (
                  <c.form
                    key={p.id}
                    initial={p}
                    onDone={(changed) => {
                      if (changed) upsert(changed)
                      setEditing(null)
                    }}
                  />
                ) : (
                  <Stack key={p.id} direction="row" align="center" gap="sm" wrap>
                    <Stack grow width={0} gap="none">
                      <Stack direction="row" gap="sm" wrap>
                        {t.yahrzeitNames(p).map((n) => (
                          <Text key={n} variant="item" rtl={/[֐-׿]/.test(n)}>
                            {n}
                          </Text>
                        ))}
                      </Stack>
                      <Text variant="caption" color={SemanticColor.TextSecondary}>
                        {c.detail(p, next)}
                        {p.hideFromBulletin ? ' · Not on the bulletin' : ''}
                      </Text>
                    </Stack>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="edit"
                      title="Edit"
                      onPress={() => setEditing(p.id)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="delete"
                      title="Remove"
                      onPress={() => save(items.filter((x) => x.id !== p.id))}
                    />
                  </Stack>
                ),
              )}
          </Card>
        )
      })}
    </SectionPage>
  )
}
