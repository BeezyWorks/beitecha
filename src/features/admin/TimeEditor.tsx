import {
  Button,
  Chip,
  IconButton,
  SegmentedControl,
  SemanticColor,
  Stack,
  Text,
  TextField,
} from '@beezyworks/design'
import {
  type EventDef,
  type RoundMode,
  type TimeExpr,
  type Weekday,
  WEEKDAY_SHORT,
  ZMAN_IDS,
  ZMAN_LABELS,
  type ZmanId,
} from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import { Select } from '@/components/Select'
import {
  clockLabel,
  formToTime,
  parseClockInput,
  timeToForm,
  type Source,
  type TimeForm,
} from './forms'
import { JsonEditor } from './JsonEditor'

/** A clock time typed loosely ("6:30pm") and stored as `HH:MM`. */
export function ClockField({
  value,
  onChange,
  placeholder,
}: {
  value?: string
  onChange: (hhmm: string | undefined) => void
  placeholder?: string
}) {
  const [text, setText] = useState(value ? clockLabel(value) : '')
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setText(value ? clockLabel(value) : '')
  }, [value])
  const commit = () => {
    if (!text.trim()) return onChange(undefined)
    const parsed = parseClockInput(text)
    setBad(!parsed)
    if (parsed) {
      setText(clockLabel(parsed))
      onChange(parsed)
    }
  }
  return (
    <Stack width={120} gap="xs">
      <TextField
        variant="boxed"
        value={text}
        placeholder={placeholder ?? '6:30 AM'}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
      />
      {bad && (
        <Text variant="caption" color={SemanticColor.TextDanger}>
          e.g. 6:30 PM
        </Text>
      )}
    </Stack>
  )
}

function OffsetField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(Math.abs(value)))
  useEffect(() => setText(String(Math.abs(value))), [value])
  const sign = value < 0 ? -1 : 1
  return (
    <Stack direction="row" align="center" gap="xs" wrap>
      <Stack width={64}>
        <TextField
          variant="boxed"
          keyboardType="numeric"
          value={text}
          onChangeText={(t) => {
            setText(t)
            const n = parseInt(t || '0', 10)
            if (Number.isFinite(n)) onChange(sign * Math.abs(n))
          }}
        />
      </Stack>
      <Text variant="body">min</Text>
      <SegmentedControl
        options={[
          { key: 'before', label: 'before' },
          { key: 'after', label: 'after' },
        ]}
        value={sign < 0 ? 'before' : 'after'}
        onChange={(k) =>
          onChange((k === 'before' ? -1 : 1) * Math.abs(value || parseInt(text || '0', 10)))
        }
      />
    </Stack>
  )
}

const zmanOptions = ZMAN_IDS.map((id) => ({ value: id, label: ZMAN_LABELS[id].en }))

function SourceRow({
  source,
  events,
  onChange,
  onRemove,
}: {
  source: Source
  events: EventDef[]
  onChange: (s: Source) => void
  onRemove?: () => void
}) {
  const setType = (type: Source['type']) => {
    if (type === source.type) return
    if (type === 'clock') onChange({ type, clock: '06:30' })
    if (type === 'zman') onChange({ type, zman: 'sunset', offset: 0 })
    if (type === 'event') onChange({ type, event: events[0]?.id ?? '', offset: -30 })
  }
  return (
    <Stack
      gap="sm"
      padding="sm"
      radius="md"
      borderWidth={1}
      borderColor={SemanticColor.BorderDefault}
    >
      <Stack direction="row" align="center" gap="sm" wrap>
        <SegmentedControl
          options={[
            { key: 'clock', label: 'Fixed time' },
            { key: 'zman', label: 'Zman' },
            { key: 'event', label: 'Another event' },
          ]}
          value={source.type}
          onChange={setType}
        />
        <Stack grow />
        {onRemove && (
          <IconButton name="close" onPress={onRemove} accessibilityLabel="Remove this time" />
        )}
      </Stack>
      <Stack direction="row" align="center" gap="sm" wrap>
        {source.type === 'clock' && (
          <ClockField
            value={source.clock}
            onChange={(clock) => clock && onChange({ ...source, clock })}
          />
        )}
        {source.type !== 'clock' && (
          <OffsetField
            value={source.offset}
            onChange={(offset) => onChange({ ...source, offset })}
          />
        )}
        {source.type === 'zman' && (
          <Select<ZmanId>
            value={source.zman}
            options={zmanOptions}
            onChange={(zman) => onChange({ ...source, zman })}
          />
        )}
        {source.type === 'event' && (
          <Select<string>
            value={source.event}
            options={events.map((e) => ({ value: e.id, label: e.name.en }))}
            onChange={(event) => onChange({ ...source, event })}
          />
        )}
      </Stack>
    </Stack>
  )
}

const ROUND_MODES: { key: RoundMode; label: string }[] = [
  { key: 'down', label: 'down' },
  { key: 'nearest', label: 'nearest' },
  { key: 'up', label: 'up' },
  { key: 'withTrend', label: 'with trend' },
  { key: 'againstTrend', label: 'against trend' },
]

const TREND_HINTS: Partial<Record<RoundMode, string>> = {
  withTrend:
    'Down while the time gets earlier week to week (e.g. plag in the autumn), up while it gets later.',
  againstTrend: 'Up while the time gets earlier week to week, down while it gets later.',
}

const roundLabel = ({ mode, to }: { mode: RoundMode; to: number }) =>
  mode === 'withTrend'
    ? `rounded to ${to} with the trend (down while getting earlier, up while later)`
    : mode === 'againstTrend'
      ? `rounded to ${to} against the trend (up while getting earlier, down while later)`
      : `rounded ${mode} to ${to}`

/** One rule's time: a fixed time, a zman or another event (± minutes), or the earliest/latest of several, with options. */
export function TimeEditor({
  value,
  events,
  onChange,
}: {
  value: TimeExpr
  /** Events this one may be anchored to. */
  events: EventDef[]
  onChange: (t: TimeExpr) => void
}) {
  const form = timeToForm(value)
  if (!form) {
    return (
      <Stack gap="xs">
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          This time is too intricate for the form; edit it directly.
        </Text>
        <JsonEditor value={value} onChange={(v) => v && onChange(v as TimeExpr)} />
      </Stack>
    )
  }
  const update = (f: Partial<TimeForm>) => onChange(formToTime({ ...form, ...f }))
  const setSource = (i: number, s: Source) =>
    update({ sources: form.sources.map((x, j) => (j === i ? s : x)) })

  return (
    <Stack gap="sm">
      {form.sources.length > 1 && (
        <Stack direction="row" align="center" gap="sm" wrap>
          <Text variant="body">Whichever is</Text>
          <SegmentedControl
            options={[
              { key: 'earliest', label: 'earliest' },
              { key: 'latest', label: 'latest' },
            ]}
            value={form.combine}
            onChange={(combine) => update({ combine })}
          />
          <Text variant="body">of:</Text>
        </Stack>
      )}
      {form.sources.map((s, i) => (
        <SourceRow
          key={i}
          source={s}
          events={events}
          onChange={(next) => setSource(i, next)}
          onRemove={
            form.sources.length > 1
              ? () => update({ sources: form.sources.filter((_, j) => j !== i) })
              : undefined
          }
        />
      ))}
      <Stack direction="row" wrap gap="xs">
        <Button
          variant="ghost"
          size="sm"
          icon="add"
          title="Or another time (earliest/latest)"
          onPress={() => update({ sources: [...form.sources, { type: 'clock', clock: '19:15' }] })}
        />
      </Stack>

      <Stack gap="sm">
        <Stack direction="row" align="center" gap="sm" wrap>
          <Chip
            label="Same time all week"
            selected={!!form.weekly}
            onPress={() =>
              update({
                weekly: form.weekly ? undefined : { pick: 'earliest', days: [0, 1, 2, 3, 4, 5] },
              })
            }
          />
          {form.weekly && (
            <>
              <Text variant="body">using the</Text>
              <SegmentedControl
                options={[
                  { key: 'earliest', label: 'earliest' },
                  { key: 'latest', label: 'latest' },
                ]}
                value={form.weekly.pick}
                onChange={(pick) => update({ weekly: { ...form.weekly!, pick } })}
              />
              <Text variant="body">day of</Text>
              {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => (
                <Chip
                  key={d}
                  label={WEEKDAY_SHORT[d]}
                  selected={form.weekly!.days.includes(d)}
                  onPress={() => {
                    const days = form.weekly!.days.includes(d)
                      ? form.weekly!.days.filter((x) => x !== d)
                      : [...form.weekly!.days, d].sort()
                    if (days.length)
                      update({ weekly: { ...form.weekly!, days: days as Weekday[] } })
                  }}
                />
              ))}
            </>
          )}
        </Stack>
        <Stack direction="row" align="center" gap="sm" wrap>
          <Chip
            label="No earlier than"
            selected={!!form.notBefore}
            onPress={() => update({ notBefore: form.notBefore ? undefined : '06:00' })}
          />
          {!!form.notBefore && (
            <ClockField value={form.notBefore} onChange={(notBefore) => update({ notBefore })} />
          )}
          <Chip
            label="No later than"
            selected={!!form.notAfter}
            onPress={() => update({ notAfter: form.notAfter ? undefined : '19:15' })}
          />
          {!!form.notAfter && (
            <ClockField value={form.notAfter} onChange={(notAfter) => update({ notAfter })} />
          )}
        </Stack>
        <Stack direction="row" align="center" gap="sm" wrap>
          <Chip
            label="Round"
            selected={!!form.round}
            onPress={() => update({ round: form.round ? undefined : { to: 5, mode: 'down' } })}
          />
          {form.round && (
            <>
              <SegmentedControl
                options={ROUND_MODES}
                value={form.round.mode}
                onChange={(mode) => update({ round: { ...form.round!, mode } })}
              />
              <Text variant="body">to</Text>
              <SegmentedControl
                options={[
                  { key: '5', label: '5' },
                  { key: '10', label: '10' },
                  { key: '15', label: '15' },
                ]}
                value={String(form.round.to) as '5' | '10' | '15'}
                onChange={(to) => update({ round: { ...form.round!, to: Number(to) } })}
              />
              <Text variant="body">minutes</Text>
            </>
          )}
        </Stack>
        {form.round && TREND_HINTS[form.round.mode] && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {TREND_HINTS[form.round.mode]}
          </Text>
        )}
      </Stack>
    </Stack>
  )
}

/** "Sunset − 15 min, earliest of week, rounded down to 5" — a rule's time in a line. */
export function describeTime(t: TimeExpr | null, events: EventDef[]): string {
  if (t === null) return 'Not on these days'
  const form = timeToForm(t)
  if (!form) return 'Custom time'
  const src = (s: Source) => {
    if (s.type === 'clock') return clockLabel(s.clock)
    const name =
      s.type === 'zman'
        ? ZMAN_LABELS[s.zman].en
        : (events.find((e) => e.id === s.event)?.name.en ?? s.event)
    if (!s.offset) return name
    return `${Math.abs(s.offset)} min ${s.offset < 0 ? 'before' : 'after'} ${name}`
  }
  const parts = [
    form.sources.length > 1
      ? `${form.combine} of ${form.sources.map(src).join(' / ')}`
      : src(form.sources[0]),
  ]
  if (form.weekly) parts.push(`same all week (${form.weekly.pick})`)
  if (form.notBefore) parts.push(`not before ${clockLabel(form.notBefore)}`)
  if (form.notAfter) parts.push(`not after ${clockLabel(form.notAfter)}`)
  if (form.round) parts.push(roundLabel(form.round))
  return parts.join(', ')
}
