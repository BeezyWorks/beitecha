import { Button, Chip, SemanticColor, Stack, Text, TextField } from '@beezyworks/design'
import { PUBLIC_HOLIDAY, effectiveHolidays, type Condition, type DayTag, type Weekday } from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

import { TAG_LABELS, WEEKDAY_SHORT } from '@/features/luach/labels'
import { conditionToForm, formToCondition, sameAtom, type Atom, type ConditionForm } from './forms'
import { JsonEditor } from './JsonEditor'
import { useAdmin } from './store'

/** The day kinds a gabbai reaches for, in the order they're offered. */
const TAGS: DayTag[] = [
  'roshChodesh',
  'fast',
  'erevShabbos',
  'shabbos',
  'motzeiShabbos',
  'erevYomTov',
  'yomTov',
  'motzeiYomTov',
  'cholHamoed',
  'chanukah',
  'purim',
  'selichos',
  'aseresYemeiTeshuva',
  'noTachanun',
  'omer',
  'dst',
  'legalHoliday',
]

export function atomLabel(a: Atom): string {
  if (a.kind === 'weekday') return WEEKDAY_SHORT[a.day]
  if (a.kind === 'tag') return TAG_LABELS[a.tag].en
  if (a.kind === 'holiday') return a.name
  if (a.kind === 'localHoliday') {
    const settings = useAdmin.getState().schedule?.settings
    const known = settings && effectiveHolidays(settings).find((h) => h.id === a.id)
    return known?.name.en ?? a.id
  }
  return `${a.from} – ${a.to}`
}

export function describeCondition(c: Condition | undefined): string {
  const form = conditionToForm(c)
  if (!form) return 'Custom days'
  const on = form.include.length ? form.include.map(atomLabel).join(', ') : 'Every day'
  return form.exclude.length ? `${on}, except ${form.exclude.map(atomLabel).join(', ')}` : on
}

function AtomPicker({ atoms, onChange }: { atoms: Atom[]; onChange: (atoms: Atom[]) => void }) {
  const [holiday, setHoliday] = useState('')
  const has = (a: Atom) => atoms.some((x) => sameAtom(x, a))
  const toggle = (a: Atom) => onChange(has(a) ? atoms.filter((x) => !sameAtom(x, a)) : [...atoms, a])
  const settings = useAdmin((s) => s.schedule?.settings)
  const local = useMemo(() => (settings ? effectiveHolidays(settings) : []), [settings])
  // A local holiday that's since been deleted still shows, so it can be cleared.
  const extras = atoms.filter(
    (a) => a.kind === 'holiday' || a.kind === 'dates' || (a.kind === 'localHoliday' && !local.some((h) => h.id === a.id)),
  )
  return (
    <Stack gap="sm">
      <Stack direction="row" wrap gap="xs">
        {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((day) => (
          <Chip key={day} label={WEEKDAY_SHORT[day]} selected={has({ kind: 'weekday', day })} onPress={() => toggle({ kind: 'weekday', day })} />
        ))}
      </Stack>
      <Stack direction="row" wrap gap="xs">
        {TAGS.map((tag) => (
          <Chip key={tag} label={TAG_LABELS[tag].en} selected={has({ kind: 'tag', tag })} onPress={() => toggle({ kind: 'tag', tag })} />
        ))}
        {/* The plain “Public holiday” days are reached through the “Federal / bank holidays” chip. */}
        {local.filter((h) => h.name.en !== PUBLIC_HOLIDAY).map((h) => (
          <Chip key={h.id} label={h.name.en} selected={has({ kind: 'localHoliday', id: h.id })} onPress={() => toggle({ kind: 'localHoliday', id: h.id })} />
        ))}
        {extras.map((a) => (
          <Chip key={atomLabel(a)} label={`${atomLabel(a)} ✕`} selected onPress={() => toggle(a)} />
        ))}
      </Stack>
      <Stack direction="row" gap="sm" align="center">
        <Stack grow>
          <TextField
            variant="boxed"
            placeholder="A holiday by name, e.g. Tish'a B'Av, Erev Pesach, Lag BaOmer"
            value={holiday}
            onChangeText={setHoliday}
            onSubmitEditing={() => {
              if (holiday.trim()) toggle({ kind: 'holiday', name: holiday.trim() })
              setHoliday('')
            }}
          />
        </Stack>
        <Button
          variant="secondary"
          size="sm"
          title="Add"
          disabled={!holiday.trim()}
          onPress={() => {
            toggle({ kind: 'holiday', name: holiday.trim() })
            setHoliday('')
          }}
        />
      </Stack>
    </Stack>
  )
}

/** "On [days], except [days]" — or JSON for anything more intricate. */
export function ConditionEditor({ value, onChange }: { value: Condition | undefined; onChange: (c: Condition | undefined) => void }) {
  const form = conditionToForm(value)
  const [showExcept, setShowExcept] = useState(!!form?.exclude.length)
  if (!form) {
    return (
      <Stack gap="xs">
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          These days are too intricate for the form; edit them directly.
        </Text>
        <JsonEditor value={value} onChange={(v) => onChange(v as Condition | undefined)} />
      </Stack>
    )
  }
  const update = (f: ConditionForm) => onChange(formToCondition(f))
  return (
    <Stack gap="sm">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        {form.include.length ? 'On any of these days' : 'Every day — or pick days'}
      </Text>
      <AtomPicker atoms={form.include} onChange={(include) => update({ ...form, include })} />
      {showExcept ? (
        <>
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Except on
          </Text>
          <AtomPicker atoms={form.exclude} onChange={(exclude) => update({ ...form, exclude })} />
        </>
      ) : (
        <Stack direction="row">
          <Button variant="ghost" size="sm" title="Add an exception (“except on…”)" onPress={() => setShowExcept(true)} />
        </Stack>
      )}
    </Stack>
  )
}
