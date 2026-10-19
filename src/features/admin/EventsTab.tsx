import { Button, Card, IconButton, SegmentedControl, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import type { EventDef, EventKind, Rule } from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { ConditionEditor, describeCondition } from './ConditionEditor'
import { newId, useAdmin } from './store'
import { describeTime, TimeEditor } from './TimeEditor'

const NO_EVENTS: EventDef[] = []

const KINDS: { key: EventKind; label: string }[] = [
  { key: 'tefila', label: 'Tefila' },
  { key: 'shiur', label: 'Shiur' },
  { key: 'other', label: 'Other' },
]

function RuleCard({
  rule,
  index,
  count,
  events,
  onChange,
  onMove,
  onRemove,
}: {
  rule: Rule
  index: number
  count: number
  events: EventDef[]
  onChange: (r: Rule) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Stack gap="sm" padding="md" radius="md" background={SemanticColor.SurfaceBackground} borderWidth={1} borderColor={SemanticColor.BorderDefault}>
      <Stack direction="row" align="center" gap="sm">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          {index + 1}.
        </Text>
        <Stack grow gap="none">
          <Text variant="bodyStrong">{!rule.when && index > 0 ? 'Any other day' : describeCondition(rule.when)}</Text>
          <Text variant="body" color={rule.time === null ? SemanticColor.TextSecondary : SemanticColor.TextAccent}>
            {describeTime(rule.time, events)}
          </Text>
        </Stack>
        <IconButton name="chevron-left" size={16} disabled={index === 0} onPress={() => onMove(-1)} accessibilityLabel="Check this rule earlier" />
        <IconButton name="chevron-right" size={16} disabled={index === count - 1} onPress={() => onMove(1)} accessibilityLabel="Check this rule later" />
        <Button variant="ghost" size="sm" title={open ? 'Done' : 'Edit'} onPress={() => setOpen((o) => !o)} />
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
          <Field
            label="Note shown with the time (optional)"
            placeholder="e.g. Selichos first"
            value={rule.note?.en ?? ''}
            onChangeText={(en) => onChange({ ...rule, note: en ? { ...rule.note, en } : undefined })}
          />
          <Stack direction="row">
            <Button variant="ghost" size="sm" icon="delete" title="Delete rule" onPress={onRemove} />
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}

function EventCard({ event, index, all }: { event: EventDef; index: number; all: EventDef[] }) {
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
            {KINDS.find((k) => k.key === event.kind)?.label}
            {event.room ? ` · ${event.room}` : ''}
            {event.visibility === 'internal' ? ' · hidden' : ''} · {event.rules.length} rule{event.rules.length === 1 ? '' : 's'}
          </Text>
        </Stack>
        <IconButton name="chevron-left" size={16} disabled={index === 0} onPress={() => moveEvent(event.id, -1)} accessibilityLabel="Move up" />
        <IconButton name="chevron-right" size={16} disabled={index === all.length - 1} onPress={() => moveEvent(event.id, 1)} accessibilityLabel="Move down" />
      </Stack>

      <Stack gap="sm">
        {event.rules.map((rule, i) => (
          <RuleCard
            key={i}
            rule={rule}
            index={i}
            count={event.rules.length}
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
          <Stack direction="row" gap="md" align="center" wrap>
            <SegmentedControl options={KINDS} value={event.kind} onChange={(kind) => set({ kind })} />
            <Stack grow>
              <Field label="Room (optional)" placeholder="Beis Medrash" value={event.room ?? ''} onChangeText={(room) => set({ room: room || undefined })} />
            </Stack>
          </Stack>
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
      {events.map((e, i) => (
        <EventCard key={e.id} event={e} index={i} all={events} />
      ))}
      <Stack direction="row" gap="sm" wrap>
        <Button
          icon="add"
          title="Add a minyan or shiur"
          onPress={() => addEvent({ id: newId(), name: { en: 'New event' }, kind: 'tefila', rules: [{ time: { clock: '07:00' } }] })}
        />
      </Stack>
    </Stack>
  )
}
