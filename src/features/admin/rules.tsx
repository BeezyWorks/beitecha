import { Button, Chip, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  civilDateShort,
  type DateString,
  derivedRelative,
  STANDARD_TEFILOS,
  TEFILA_LABELS,
  TEFILA_TYPES,
  type EventDef,
  type EventKind,
  type Rule,
  type TefilaType,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { ConditionEditor, describeCondition } from './ConditionEditor'
import { DateField } from './DateField'
import { adminLabel, formToSaid, saidToForm, type SaidForm } from './forms'
import { newId } from './store'
import { ClockField, describeTime, TimeEditor } from './TimeEditor'

const NEW_MINYAN_TIME: Record<TefilaType, string> = {
  shacharis: '07:00',
  mincha: '13:30',
  maariv: '21:00',
  minchaMaariv: '18:00',
}

export function newEvent(kind: EventKind, tefila?: TefilaType): EventDef {
  const id = newId()
  if (kind === 'tefila' && tefila) {
    const { name } = STANDARD_TEFILOS[tefila]
    return {
      id,
      name: { ...name },
      kind,
      tefila,
      rules: [{ time: { clock: NEW_MINYAN_TIME[tefila] } }],
    }
  }
  return kind === 'shiur'
    ? { id, name: { en: 'New shiur' }, kind, rules: [{ time: { clock: '20:00' } }] }
    : { id, name: { en: 'New event' }, kind, rules: [{ time: { clock: '12:00' } }] }
}

/** A minyan still named after its tefila is renamed with it; one with its own name keeps it. */
export function retype(event: EventDef, tefila: TefilaType): EventDef {
  const was = event.tefila && STANDARD_TEFILOS[event.tefila].name
  const named = !event.name.en.trim() || (was && event.name.en === was.en)
  return named
    ? { ...event, tefila, name: { ...STANDARD_TEFILOS[tefila].name } }
    : { ...event, tefila }
}

export function TefilaPicker({
  value,
  onChange,
}: {
  value?: TefilaType
  onChange: (t: TefilaType) => void
}) {
  return (
    <Stack gap="xs">
      <Text
        variant="caption"
        color={value ? SemanticColor.TextSecondary : SemanticColor.TextDanger}
      >
        {value ? 'Tefila' : 'Which tefila is this minyan?'}
      </Text>
      <Stack direction="row" wrap gap="xs">
        {TEFILA_TYPES.map((t) => (
          <Chip
            key={t}
            label={TEFILA_LABELS[t]}
            selected={value === t}
            onPress={() => onChange(t)}
          />
        ))}
      </Stack>
    </Stack>
  )
}

/** When a rule's time ends: a clock time here, anything else (shkia) as the rule's JSON says. */
export function EndEditor({
  rule,
  events,
  onChange,
}: {
  rule: Rule
  events: EventDef[]
  onChange: (r: Rule) => void
}) {
  const set = (end: Rule['end']) => {
    const { end: _, ...rest } = rule
    onChange(end ? { ...rest, end } : rest)
  }
  if (rule.end && !('clock' in rule.end)) {
    return (
      <Stack direction="row" align="center" gap="sm" wrap>
        <Text variant="body">Ends: {describeTime(rule.end, events)}</Text>
        <Button variant="ghost" size="sm" title="Clear" onPress={() => set(undefined)} />
      </Stack>
    )
  }
  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        Ends (optional)
      </Text>
      <ClockField
        value={rule.end && 'clock' in rule.end ? rule.end.clock : undefined}
        onChange={(clock) => set(clock ? { clock } : undefined)}
        placeholder="11:30 AM"
      />
    </Stack>
  )
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** "from Nov 1 until Mar 15", or '' when the rule has no start or end. */
function describeRange(rule: Rule): string {
  const day = (d: string) => (DATE_RE.test(d) ? civilDateShort(d) : d)
  if (rule.from && rule.to) return `${day(rule.from)} – ${day(rule.to)}`
  if (rule.from) return `from ${day(rule.from)}`
  if (rule.to) return `until ${day(rule.to)}`
  return ''
}

/** The dates a rule is in force between, either end optional (winter hours, a summer schedule). */
export function RangeEditor({
  rule,
  today,
  onChange,
}: {
  rule: Rule
  today: DateString
  onChange: (r: Rule) => void
}) {
  const set = (key: 'from' | 'to', value: string | undefined) => {
    const { [key]: _, ...rest } = rule
    onChange(value ? { ...rest, [key]: value } : rest)
  }
  return (
    <Stack direction="row" gap="md" wrap>
      <Stack grow>
        <DateField
          label="Starts"
          value={rule.from}
          unsetLabel="Pick a first day"
          initial={today}
          onChange={(d) => set('from', d)}
        />
      </Stack>
      <Stack grow>
        <DateField
          label="Ends"
          value={rule.to}
          unsetLabel="Pick a last day"
          initial={rule.from ?? today}
          onChange={(d) => set('to', d)}
        />
      </Stack>
    </Stack>
  )
}

/** "after Maariv", "between Mincha and Maariv", or just the time. */
export function SaidEditor({
  rule,
  events,
  onChange,
}: {
  rule: Rule
  events: EventDef[]
  onChange: (r: Rule) => void
}) {
  const form = saidToForm(rule.relative)
  const set = (f: SaidForm) => {
    const relative = formToSaid(f)
    const { relative: _, untimed: __, ...rest } = rule
    onChange(relative === undefined ? rest : { ...rest, relative })
  }
  const minyanim = events.filter((e) => e.kind === 'tefila')
  /** No time at all: it's listed right below this minyan and just says "after" it. */
  const followAfter = (id: string) =>
    onChange({ ...rule, time: { event: id }, relative: { after: id }, untimed: true })
  const followed =
    rule.untimed && rule.relative && 'after' in rule.relative ? rule.relative.after : undefined
  const nameOf = (id: string) => {
    const e = events.find((x) => x.id === id)
    return e ? adminLabel(e) : id
  }
  const auto = rule.time ? derivedRelative(rule.time) : undefined
  const anchor = auto && ('after' in auto ? auto.after : 'before' in auto ? auto.before : undefined)
  const autoText = anchor && `${auto && 'after' in auto ? 'after' : 'before'} ${nameOf(anchor)}`
  const options = minyanim.map((e) => ({ value: e.id, label: adminLabel(e) }))
  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        How the time is said
      </Text>
      {followed ? (
        <Segments
          options={[
            { key: 'untimed', label: 'No time, just “after”' },
            { key: 'none', label: 'Back to a time' },
          ]}
          value="untimed"
          onChange={() => set({ mode: 'none' })}
        />
      ) : form.mode === 'other' ? (
        <Text variant="body">As written in the rule’s JSON</Text>
      ) : (
        <Segments
          options={[
            { key: 'auto', label: autoText ? `“${autoText}”` : 'Just the time' },
            ...(autoText ? [{ key: 'none', label: 'Just the time' }] : []),
            ...(minyanim.length > 1 ? [{ key: 'between', label: 'Between two minyanim' }] : []),
            ...(minyanim.length ? [{ key: 'untimed', label: 'No time, just “after”' }] : []),
          ]}
          value={form.mode === 'none' && !autoText ? 'auto' : form.mode}
          onChange={(k) =>
            k === 'untimed'
              ? followAfter(minyanim[0].id)
              : set(
                  k === 'between'
                    ? { mode: 'between', between: [minyanim[0].id, minyanim[1].id] }
                    : k === 'none'
                      ? { mode: 'none' }
                      : { mode: 'auto' },
                )
          }
        />
      )}
      {followed && (
        <Stack direction="row" gap="sm" align="center" wrap>
          <Text variant="body">After</Text>
          <Select value={followed} options={options} onChange={followAfter} />
        </Stack>
      )}
      {form.mode === 'between' && (
        <Stack direction="row" gap="sm" align="center" wrap>
          <Text variant="body">Between</Text>
          <Select
            value={form.between[0]}
            options={options}
            onChange={(a) => set({ mode: 'between', between: [a, form.between[1]] })}
          />
          <Text variant="body">and</Text>
          <Select
            value={form.between[1]}
            options={options}
            onChange={(b) => set({ mode: 'between', between: [form.between[0], b] })}
          />
        </Stack>
      )}
      {anchor && form.mode === 'auto' && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          It’s timed from {nameOf(anchor)}, so the Siddur says it that way.
        </Text>
      )}
    </Stack>
  )
}

/** A rule that covers every day, so the ones after it never apply. */
export const coversAll = (r: Rule) => !r.when && !r.from && !r.to

/** Which days a rule is for, as the gabbai would say it. The last catch-all is "every other day". */
export function ruleDays(rule: Rule, index: number, count: number): string {
  const days = rule.when
    ? describeCondition(rule.when)
    : index > 0 && index === count - 1
      ? 'Every other day'
      : 'Every day'
  const range = describeRange(rule)
  return range ? `${days} · ${range}` : days
}

export function ruleTime(rule: Rule, event: EventDef, events: EventDef[]): string {
  if (rule.time === null) return `No ${adminLabel(event) || 'event'}`
  if (rule.untimed) return 'No time, just “after” a minyan'
  return describeTime(rule.time, events)
}

/** An event's rules in a few lines: "Shabbos, Yom Tov — 9:00 AM". */
export function RulesSummary({
  event,
  events,
  limit,
}: {
  event: EventDef
  events: EventDef[]
  limit?: number
}) {
  const rules = limit ? event.rules.slice(0, limit) : event.rules
  if (!event.rules.length)
    return (
      <Text variant="body" color={SemanticColor.TextDanger}>
        No times yet
      </Text>
    )
  return (
    <Stack gap="none">
      {rules.map((r, i) => (
        <Text key={i} variant="body" numberOfLines={2}>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            {ruleDays(r, i, event.rules.length)}:{' '}
          </Text>
          {ruleTime(r, event, events)}
        </Text>
      ))}
      {limit && event.rules.length > limit && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          and {event.rules.length - limit} more
        </Text>
      )}
    </Stack>
  )
}

/** One rule opened up: its days, its time, and how it's said. */
export function RuleEditor({
  rule,
  event,
  events,
  today,
  onChange,
  onAi,
  onDone,
}: {
  rule: Rule
  event: EventDef
  events: EventDef[]
  today: DateString
  onChange: (r: Rule) => void
  onAi: () => void
  onDone: () => void
}) {
  const [dates, setDates] = useState(!!(rule.from || rule.to))
  return (
    <Stack
      gap="lg"
      padding="md"
      radius="md"
      background={SemanticColor.SurfaceBackground}
      borderWidth={1}
      borderColor={SemanticColor.BorderDefault}
    >
      <Stack gap="sm">
        <Text variant="bodyStrong">Which days</Text>
        <ConditionEditor value={rule.when} onChange={(when) => onChange({ ...rule, when })} />
        {dates ? (
          <RangeEditor rule={rule} today={today} onChange={onChange} />
        ) : (
          <Stack direction="row">
            <Button
              variant="ghost"
              size="sm"
              icon="calendar-today"
              title="Only between certain dates (winter hours, summer…)"
              onPress={() => setDates(true)}
            />
          </Stack>
        )}
      </Stack>
      <Stack gap="sm">
        <Text variant="bodyStrong">On those days</Text>
        <Segments
          options={[
            { key: 'at', label: 'It’s at…' },
            { key: 'none', label: `No ${adminLabel(event) || 'event'}` },
          ]}
          value={rule.time === null ? 'none' : 'at'}
          onChange={(k) => onChange({ ...rule, time: k === 'none' ? null : { clock: '06:30' } })}
        />
        {rule.time !== null && !rule.untimed && (
          <TimeEditor
            value={rule.time}
            events={events}
            onChange={(time) => onChange({ ...rule, time })}
          />
        )}
        {rule.time !== null && event.kind !== 'tefila' && (
          <>
            <EndEditor rule={rule} events={events} onChange={onChange} />
            <SaidEditor rule={rule} events={events} onChange={onChange} />
          </>
        )}
      </Stack>
      <Field
        label="Note shown with the time (optional)"
        placeholder="e.g. Selichos first"
        value={rule.note?.en ?? ''}
        onChangeText={(en) => onChange({ ...rule, note: en ? { ...rule.note, en } : undefined })}
      />
      <Stack direction="row" gap="sm" wrap>
        <Button size="sm" icon="check" title="Done" onPress={onDone} />
        <Button variant="ghost" size="sm" title="Rewrite this line with AI" onPress={onAi} />
      </Stack>
    </Stack>
  )
}

/** A new event's id: its own, or with a number when that's taken. */
export function freeId(id: string, taken: string[]): string {
  const base = id || 'event'
  let out = base
  for (let n = 2; taken.includes(out); n++) out = `${base}-${n}`
  return out
}
