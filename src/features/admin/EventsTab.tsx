import { Button, Card, Chip, IconButton, SegmentedControl, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  derivedRelative,
  KIND_LABELS,
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
import { Select } from '@/components/Select'
import { AiSetupCard } from './AiSetupCard'
import { ConditionEditor, describeCondition } from './ConditionEditor'
import { DetailsEditor, describeDetails } from './DetailsEditor'
import { formToSaid, saidToForm, type SaidForm } from './forms'
import { newId, useAdmin } from './store'
import { ClockField, describeTime, TimeEditor } from './TimeEditor'

const NO_EVENTS: EventDef[] = []

const KINDS: { key: EventKind; label: string }[] = (['tefila', 'shiur', 'other'] as const).map((key) => ({
  key,
  label: KIND_LABELS[key],
}))

/** Each kind's own list, in this order, with what a new one starts as. */
const SECTIONS: { kind: EventKind; title: string; add: string; empty: string }[] = [
  { kind: 'tefila', title: 'Minyanim', add: 'Add a minyan', empty: 'No minyanim yet.' },
  { kind: 'shiur', title: 'Shiurim', add: 'Add a shiur', empty: 'No shiurim yet.' },
  { kind: 'other', title: 'Other regular times', add: 'Add a regular time', empty: 'Weekly things like Kiddush. A one-time event (a dinner, a Chanukah party) goes in the Events tab.' },
]

const NEW_MINYAN_TIME: Record<TefilaType, string> = { shacharis: '07:00', mincha: '13:30', maariv: '21:00', minchaMaariv: '18:00' }

function newEvent(kind: EventKind, tefila?: TefilaType): EventDef {
  const id = newId()
  if (kind === 'tefila' && tefila) {
    const { name } = STANDARD_TEFILOS[tefila]
    return { id, name: { ...name }, kind, tefila, rules: [{ time: { clock: NEW_MINYAN_TIME[tefila] } }] }
  }
  return kind === 'shiur'
    ? { id, name: { en: 'New shiur' }, kind, rules: [{ time: { clock: '20:00' } }] }
    : { id, name: { en: 'New event' }, kind, rules: [{ time: { clock: '12:00' } }] }
}

/** A minyan still named after its tefila is renamed with it; one with its own name keeps it. */
function retype(event: EventDef, tefila: TefilaType): EventDef {
  const was = event.tefila && STANDARD_TEFILOS[event.tefila].name
  const named = !event.name.en.trim() || (was && event.name.en === was.en)
  return named ? { ...event, tefila, name: { ...STANDARD_TEFILOS[tefila].name } } : { ...event, tefila }
}

function TefilaPicker({ value, onChange }: { value?: TefilaType; onChange: (t: TefilaType) => void }) {
  return (
    <Stack gap="xs">
      <Text variant="caption" color={value ? SemanticColor.TextSecondary : SemanticColor.TextDanger}>
        {value ? 'Tefila' : 'Which tefila is this minyan?'}
      </Text>
      <Stack direction="row" wrap gap="xs">
        {TEFILA_TYPES.map((t) => (
          <Chip key={t} label={TEFILA_LABELS[t]} selected={value === t} onPress={() => onChange(t)} />
        ))}
      </Stack>
    </Stack>
  )
}

/** When a rule's time ends: a clock time here, anything else (shkia) as the rule's JSON says. */
function EndEditor({ rule, events, onChange }: { rule: Rule; events: EventDef[]; onChange: (r: Rule) => void }) {
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

/** "after Maariv", "between Mincha and Maariv", or just the time. */
function SaidEditor({ rule, events, onChange }: { rule: Rule; events: EventDef[]; onChange: (r: Rule) => void }) {
  const form = saidToForm(rule.relative)
  const set = (f: SaidForm) => {
    const relative = formToSaid(f)
    const { relative: _, ...rest } = rule
    onChange(relative === undefined ? rest : { ...rest, relative })
  }
  const minyanim = events.filter((e) => e.kind === 'tefila')
  const nameOf = (id: string) => events.find((e) => e.id === id)?.name.en ?? id
  const auto = rule.time ? derivedRelative(rule.time) : undefined
  const anchor = auto && ('after' in auto ? auto.after : 'before' in auto ? auto.before : undefined)
  const autoText = anchor && `${auto && 'after' in auto ? 'after' : 'before'} ${nameOf(anchor)}`
  const options = minyanim.map((e) => ({ value: e.id, label: e.name.en }))
  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        How the time is said
      </Text>
      {form.mode === 'other' ? (
        <Text variant="body">As written in the rule’s JSON</Text>
      ) : (
        <SegmentedControl
          options={[
            { key: 'auto', label: autoText ? `“${autoText}”` : 'Just the time' },
            ...(autoText ? [{ key: 'none', label: 'Just the time' }] : []),
            ...(minyanim.length > 1 ? [{ key: 'between', label: 'Between two minyanim' }] : []),
          ]}
          value={form.mode === 'none' && !autoText ? 'auto' : form.mode}
          onChange={(k) =>
            set(
              k === 'between'
                ? { mode: 'between', between: [minyanim[0].id, minyanim[1].id] }
                : k === 'none'
                  ? { mode: 'none' }
                  : { mode: 'auto' },
            )
          }
        />
      )}
      {form.mode === 'between' && (
        <Stack direction="row" gap="sm" align="center" wrap>
          <Text variant="body">Between</Text>
          <Select value={form.between[0]} options={options} onChange={(a) => set({ mode: 'between', between: [a, form.between[1]] })} />
          <Text variant="body">and</Text>
          <Select value={form.between[1]} options={options} onChange={(b) => set({ mode: 'between', between: [form.between[0], b] })} />
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

function RuleCard({
  rule,
  index,
  count,
  kind,
  events,
  onChange,
  onMove,
  onRemove,
}: {
  rule: Rule
  index: number
  count: number
  kind: EventKind
  events: EventDef[]
  onChange: (r: Rule) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Stack gap="sm" padding="md" radius="md" background={SemanticColor.SurfaceBackground} borderWidth={1} borderColor={SemanticColor.BorderDefault}>
      {/* Text in a column, not beside the buttons: a row child doesn't shrink, so a long description would push them off screen. */}
      <Stack gap="none">
        <Text variant="bodyStrong">
          {index + 1}. {!rule.when && index > 0 ? 'Any other day' : describeCondition(rule.when)}
        </Text>
        <Text variant="body" color={rule.time === null ? SemanticColor.TextSecondary : SemanticColor.TextAccent}>
          {describeTime(rule.time, events)}
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap="xs" wrap>
        <Button variant={open ? 'secondary' : 'ghost'} size="sm" icon={open ? 'check' : 'edit'} title={open ? 'Done' : 'Edit'} onPress={() => setOpen((o) => !o)} />
        <Button variant="ghost" size="sm" icon="delete" title="Remove" onPress={onRemove} />
        <Stack grow />
        {count > 1 && (
          <>
            <Button variant="ghost" size="sm" title="Move up" disabled={index === 0} onPress={() => onMove(-1)} />
            <Button variant="ghost" size="sm" title="Move down" disabled={index === count - 1} onPress={() => onMove(1)} />
          </>
        )}
      </Stack>
      {open && (
        <Stack gap="md">
          <ConditionEditor value={rule.when} onChange={(when) => onChange({ ...rule, when })} />
          <SegmentedControl
            options={[
              { key: 'at', label: 'At a time' },
              { key: 'none', label: 'Not on these days' },
            ]}
            value={rule.time === null ? 'none' : 'at'}
            onChange={(k) => onChange({ ...rule, time: k === 'none' ? null : { clock: '06:30' } })}
          />
          {rule.time !== null && <TimeEditor value={rule.time} events={events} onChange={(time) => onChange({ ...rule, time })} />}
          {rule.time !== null && kind !== 'tefila' && (
            <>
              <EndEditor rule={rule} events={events} onChange={onChange} />
              <SaidEditor rule={rule} events={events} onChange={onChange} />
            </>
          )}
          <Field
            label="Note shown with the time (optional)"
            placeholder="e.g. Selichos first"
            value={rule.note?.en ?? ''}
            onChangeText={(en) => onChange({ ...rule, note: en ? { ...rule.note, en } : undefined })}
          />
        </Stack>
      )}
    </Stack>
  )
}

function EventCard({ event, index, count, all }: { event: EventDef; index: number; count: number; all: EventDef[] }) {
  const { updateEvent, removeEvent, moveEvent } = useAdmin()
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<EventDef>) => updateEvent(event.id, { ...event, ...patch })
  const setRules = (rules: Rule[]) => set({ rules })
  const others = all.filter((e) => e.id !== event.id)

  return (
    <Card gap="md">
      <Stack direction="row" align="center" gap="sm">
        <Stack grow gap="none">
          <Stack direction="row" gap="sm" align="center">
            <Text variant="title">{event.name.en || 'Untitled'}</Text>
            {!!event.name.he && (
              <Text variant="title" rtl color={SemanticColor.TextSecondary}>
                {event.name.he}
              </Text>
            )}
          </Stack>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {event.kind === 'tefila' ? (event.tefila ? TEFILA_LABELS[event.tefila] : 'Minyan') : KIND_LABELS[event.kind]}
            {describeDetails(event)}
            {event.room ? ` · ${event.room}` : ''}
            {event.visibility === 'internal' ? ' · hidden' : ''} · {event.rules.length} rule{event.rules.length === 1 ? '' : 's'}
          </Text>
        </Stack>
        <IconButton name="chevron-left" size={16} disabled={index === 0} onPress={() => moveEvent(event.id, -1)} accessibilityLabel="Move up" />
        <IconButton name="chevron-right" size={16} disabled={index === count - 1} onPress={() => moveEvent(event.id, 1)} accessibilityLabel="Move down" />
      </Stack>

      {event.kind === 'tefila' && !event.tefila && <TefilaPicker onChange={(t) => updateEvent(event.id, retype(event, t))} />}

      <Stack gap="sm">
        {event.rules.map((rule, i) => (
          <RuleCard
            // Adding or removing a rule shifts indexes; remount so an open editor doesn't jump to a neighbour.
            key={`${event.rules.length}:${i}`}
            rule={rule}
            index={i}
            count={event.rules.length}
            kind={event.kind}
            events={others}
            onChange={(r) => setRules(event.rules.map((x, j) => (j === i ? r : x)))}
            onMove={(by) => {
              const rules = [...event.rules]
              ;[rules[i], rules[i + by]] = [rules[i + by], rules[i]]
              setRules(rules)
            }}
            onRemove={() => setRules(event.rules.filter((_, j) => j !== i))}
          />
        ))}
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Rules are checked in order; the first that fits a day sets its time. A day no rule fits has no {event.name.en || 'event'}.
        </Text>
        <Stack direction="row" gap="sm" wrap>
          <Button
            variant="secondary"
            size="sm"
            icon="add"
            title="Add a rule"
            onPress={() => setRules([{ when: { weekday: [0] }, time: { clock: '07:00' } }, ...event.rules])}
          />
          <Button variant="ghost" size="sm" icon="edit" title={open ? 'Hide details' : 'Name & details'} onPress={() => setOpen((o) => !o)} />
        </Stack>
      </Stack>

      {open && (
        <Stack gap="md">
          <Stack direction="row" gap="md" wrap>
            <Stack grow>
              <Field label="Name" value={event.name.en} onChangeText={(en) => set({ name: { ...event.name, en } })} />
            </Stack>
            <Stack grow>
              <Field label="Hebrew name" value={event.name.he ?? ''} onChangeText={(he) => set({ name: { ...event.name, he: he || undefined } })} />
            </Stack>
          </Stack>
          <SegmentedControl
            options={KINDS}
            value={event.kind}
            onChange={(kind) =>
              updateEvent(event.id, {
                ...event,
                kind,
                ...(kind !== 'tefila' && { tefila: undefined }),
                ...(kind !== 'other' && { category: undefined }),
              })
            }
          />
          {event.kind === 'tefila' && event.tefila && (
            <TefilaPicker value={event.tefila} onChange={(t) => updateEvent(event.id, retype(event, t))} />
          )}
          <Stack direction="row" gap="md" align="center" wrap>
            <Stack grow>
              <Field label="Room (optional)" placeholder="Beis Medrash" value={event.room ?? ''} onChangeText={(room) => set({ room: room || undefined })} />
            </Stack>
          </Stack>
          <DetailsEditor event={event} onChange={set} />
          <Stack direction="row" align="center" gap="md">
            <Stack grow>
              <Text variant="body">Hidden</Text>
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                Not shown anywhere; other events can still be timed from it.
              </Text>
            </Stack>
            <ToggleSwitch
              value={event.visibility === 'internal'}
              onValueChange={(v) => set({ visibility: v ? 'internal' : undefined })}
              accessibilityLabel="Hidden"
            />
          </Stack>
          <Stack direction="row">
            <Button variant="ghost" size="sm" icon="delete" title={`Delete ${event.name.en || 'event'}`} onPress={() => removeEvent(event.id)} />
          </Stack>
        </Stack>
      )}
    </Card>
  )
}

export function EventsTab() {
  const events = useAdmin((s) => s.schedule?.events) ?? NO_EVENTS
  const addEvent = useAdmin((s) => s.addEvent)
  return (
    <Stack gap="md">
      <AiSetupCard />
      {SECTIONS.map(({ kind, title, add, empty }) => {
        const list = events.filter((e) => e.kind === kind)
        return (
          <Stack key={kind} gap="md">
            <Text variant="headline">{title}</Text>
            {list.map((e, i) => (
              <EventCard key={e.id} event={e} index={i} count={list.length} all={events} />
            ))}
            {!list.length && (
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {empty}
              </Text>
            )}
            <Stack direction="row" gap="sm" wrap align="center">
              {kind === 'tefila' ? (
                <>
                  <Text variant="bodyStrong">{add}:</Text>
                  {TEFILA_TYPES.map((t) => (
                    <Button key={t} variant="secondary" size="sm" icon="add" title={TEFILA_LABELS[t]} onPress={() => addEvent(newEvent(kind, t))} />
                  ))}
                </>
              ) : (
                <Button variant="secondary" size="sm" icon="add" title={add} onPress={() => addEvent(newEvent(kind))} />
              )}
            </Stack>
          </Stack>
        )
      })}
    </Stack>
  )
}
