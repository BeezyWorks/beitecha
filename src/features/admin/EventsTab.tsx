import { Button, Card, Chip, Icon, IconButton, SemanticColor, Stack, Text, ToggleSwitch, Touchable, useIsWideLayout } from '@beezyworks/design'
import {
  Calendar,
  civilDateShort,
  type DateString,
  derivedRelative,
  KIND_LABELS,
  STANDARD_TEFILOS,
  TEFILA_LABELS,
  TEFILA_TYPES,
  validate,
  type Weekday,
  WEEKDAY_SHORT,
  type EventDef,
  type EventKind,
  type Rule,
  type TefilaType,
} from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

import { Segments } from '@/components/Segments'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { makeT } from '@/features/luach/language'
import { AiAssist } from './AiAssist'
import { eventPrompt, parseEvents, parseRule, rulePrompt } from './aiItems'
import { zmanIds } from './aiSetup'
import { AiSetupCard } from './AiSetupCard'
import { ConditionEditor, describeCondition } from './ConditionEditor'
import { DateField } from './DateField'
import { DetailsEditor, describeDetails } from './DetailsEditor'
import { adminLabel, formToSaid, saidToForm, type SaidForm } from './forms'
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
function RangeEditor({ rule, today, onChange }: { rule: Rule; today: DateString; onChange: (r: Rule) => void }) {
  const set = (key: 'from' | 'to', value: string | undefined) => {
    const { [key]: _, ...rest } = rule
    onChange(value ? { ...rest, [key]: value } : rest)
  }
  return (
    <Stack direction="row" gap="md" wrap>
      <Stack grow>
        <DateField label="Starts" value={rule.from} unsetLabel="Pick a first day" initial={today} onChange={(d) => set('from', d)} />
      </Stack>
      <Stack grow>
        <DateField label="Ends" value={rule.to} unsetLabel="Pick a last day" initial={rule.from ?? today} onChange={(d) => set('to', d)} />
      </Stack>
    </Stack>
  )
}

/** "after Maariv", "between Mincha and Maariv", or just the time. */
function SaidEditor({ rule, events, onChange }: { rule: Rule; events: EventDef[]; onChange: (r: Rule) => void }) {
  const form = saidToForm(rule.relative)
  const set = (f: SaidForm) => {
    const relative = formToSaid(f)
    const { relative: _, untimed: __, ...rest } = rule
    onChange(relative === undefined ? rest : { ...rest, relative })
  }
  const minyanim = events.filter((e) => e.kind === 'tefila')
  /** No time at all: it's listed right below this minyan and just says "after" it. */
  const followAfter = (id: string) => onChange({ ...rule, time: { event: id }, relative: { after: id }, untimed: true })
  const followed = rule.untimed && rule.relative && 'after' in rule.relative ? rule.relative.after : undefined
  const nameOf = (id: string) => { const e = events.find((x) => x.id === id); return e ? adminLabel(e) : id }
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

/** A rule that covers every day, so the ones after it never apply. */
const coversAll = (r: Rule) => !r.when && !r.from && !r.to

/** Which days a rule is for, as the gabbai would say it. The last catch-all is "every other day". */
function ruleDays(rule: Rule, index: number, count: number): string {
  const days = rule.when ? describeCondition(rule.when) : index > 0 && index === count - 1 ? 'Every other day' : 'Every day'
  const range = describeRange(rule)
  return range ? `${days} · ${range}` : days
}

function ruleTime(rule: Rule, event: EventDef, events: EventDef[]): string {
  if (rule.time === null) return `No ${adminLabel(event) || 'event'}`
  if (rule.untimed) return 'No time, just “after” a minyan'
  return describeTime(rule.time, events)
}

type Slot = { date: DateString; weekday: Weekday; text: string; ruleIndex?: number; error?: string }

/** Every event's times over the coming days, worked out from the draft. */
function useComing(days: number, today: DateString): Map<string, Slot[]> {
  const schedule = useAdmin((s) => s.schedule)
  return useMemo(() => {
    const out = new Map<string, Slot[]>()
    if (!schedule) return out
    const { clock } = makeT('en', schedule.settings.timeFormat)
    for (const d of new Calendar(schedule).range(today, days, { includeInternal: true })) {
      for (const o of d.events) {
        const text = o.cancelled ? 'cancelled' : o.error ? 'problem' : o.untimed ? 'after' : o.minutes === null ? '—' : clock(o.minutes)
        const slots = out.get(o.eventId) ?? []
        slots.push({ date: d.date, weekday: d.weekday, text, ruleIndex: o.ruleIndex, error: o.error })
        out.set(o.eventId, slots)
      }
    }
    return out
  }, [schedule, today, days])
}

/** An event's rules in a few lines: "Shabbos, Yom Tov — 9:00 AM". */
function RulesSummary({ event, events, limit }: { event: EventDef; events: EventDef[]; limit?: number }) {
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

/** "Sun 8:00 AM · Mon 6:15 AM …" — the next days at a glance. */
function WeekStrip({ slots }: { slots: Slot[] }) {
  return (
    <Stack direction="row" wrap gap="sm">
      {slots.map((s) => (
        <Stack key={s.date} gap="none" width={72}>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {WEEKDAY_SHORT[s.weekday]} {civilDateShort(s.date).replace(/^\w+ /, '')}
          </Text>
          <Text variant="bodyStrong" color={s.error ? SemanticColor.TextDanger : SemanticColor.TextAccent}>
            {s.text}
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

/** One rule opened up: its days, its time, and how it's said. */
function RuleEditor({
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
    <Stack gap="lg" padding="md" radius="md" background={SemanticColor.SurfaceBackground} borderWidth={1} borderColor={SemanticColor.BorderDefault}>
      <Stack gap="sm">
        <Text variant="bodyStrong">Which days</Text>
        <ConditionEditor value={rule.when} onChange={(when) => onChange({ ...rule, when })} />
        {dates ? (
          <RangeEditor rule={rule} today={today} onChange={onChange} />
        ) : (
          <Stack direction="row">
            <Button variant="ghost" size="sm" icon="calendar-today" title="Only between certain dates (winter hours, summer…)" onPress={() => setDates(true)} />
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
        {rule.time !== null && !rule.untimed && <TimeEditor value={rule.time} events={events} onChange={(time) => onChange({ ...rule, time })} />}
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

/** One minyan, shiur or regular event on its own page: its name, its times line by line, and what they come to. */
function EventEditor({ event, all, today, onBack }: { event: EventDef; all: EventDef[]; today: DateString; onBack: () => void }) {
  const { updateEvent, removeEvent, moveEvent } = useAdmin()
  const schedule = useAdmin((s) => s.schedule)!
  const profile = useAdmin((s) => s.profile)!
  const [openRule, setOpenRule] = useState<number | null>(event.rules.length === 1 ? 0 : null)
  /** The AI helper that's open: for the whole event, a new line, or rewriting line n. */
  const [ai, setAi] = useState<'event' | 'newRule' | number | null>(null)
  const [more, setMore] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const wide = useIsWideLayout()
  const coming = useComing(14, today).get(event.id) ?? []
  const set = (patch: Partial<EventDef>) => updateEvent(event.id, { ...event, ...patch })
  const setRules = (rules: Rule[]) => set({ rules })
  const others = all.filter((e) => e.id !== event.id)
  const siblings = all.filter((e) => e.kind === event.kind)
  const at = siblings.findIndex((e) => e.id === event.id)
  const firstCatchAll = event.rules.findIndex(coversAll)
  const name = adminLabel(event) || 'this'

  /** A new line goes above the "every other day" one, so it only has to say its own days. */
  const addRule = (rule: Rule) => {
    const i = firstCatchAll >= 0 ? firstCatchAll : event.rules.length
    setRules([...event.rules.slice(0, i), rule, ...event.rules.slice(i)])
    setOpenRule(i)
  }
  const move = (i: number, by: -1 | 1) => {
    const rules = [...event.rules]
    ;[rules[i], rules[i + by]] = [rules[i + by], rules[i]]
    setRules(rules)
    setOpenRule(openRule === i ? i + by : openRule)
  }
  const remove = (i: number) => {
    setRules(event.rules.filter((_, j) => j !== i))
    setOpenRule(null)
  }
  const issuesWith = (draft: EventDef) =>
    validate({ ...schedule, events: schedule.events.map((e) => (e.id === event.id ? draft : e)) }, today, 370)
      .filter((i) => i.level === 'error' && (!i.eventId || i.eventId === event.id))
      .map((i) => (i.date ? `${civilDateShort(i.date)}: ${i.message}` : i.message))

  return (
    <Stack gap="lg">
      <Stack direction="row" align="center" gap="sm" wrap>
        <Button variant="ghost" size="sm" icon="arrow-back" title="All times" onPress={onBack} />
        <Stack grow />
        {siblings.length > 1 && (
          <>
            <Button variant="ghost" size="sm" title="Move up" disabled={at === 0} onPress={() => moveEvent(event.id, -1)} />
            <Button variant="ghost" size="sm" title="Move down" disabled={at === siblings.length - 1} onPress={() => moveEvent(event.id, 1)} />
          </>
        )}
        <Button variant="secondary" size="sm" title="Change with AI" onPress={() => setAi(ai === 'event' ? null : 'event')} />
      </Stack>
      <Stack gap="none">
        <Text variant="largeTitle">{adminLabel(event) || 'Untitled'}</Text>
        {!!event.adminName?.trim() && (
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Shown as {event.name.en}
            {event.name.he ? ` · ${event.name.he}` : ''}
          </Text>
        )}
      </Stack>

      {ai === 'event' && (
        <AiAssist<EventDef[]>
          title={`Change ${name} with AI`}
          example={`e.g. “6:15 on Rosh Chodesh and fasts too, and no ${event.name.en || 'minyan'} on Tish’a B’Av”`}
          prompt={(r) => eventPrompt(schedule, profile, event, r)}
          parse={(text) => parseEvents(text, zmanIds(schedule))}
          check={(list) => (list.length === 1 ? issuesWith({ ...list[0], id: event.id }) : [`Expected one event, got ${list.length}.`])}
          preview={([e]) => <RulesSummary event={e} events={others} />}
          applyLabel={`Use these times for ${name}`}
          onApply={([e]) => {
            updateEvent(event.id, { ...e, id: event.id })
            setOpenRule(null)
          }}
          onClose={() => setAi(null)}
        />
      )}

      <Card gap="md">
        <Stack direction="row" gap="md" wrap>
          <Stack grow>
            <Field
              label="Name everyone sees"
              help="On the display, the printed week and in the Siddur"
              value={event.name.en}
              onChangeText={(en) => set({ name: { ...event.name, en } })}
            />
          </Stack>
          <Stack grow>
            <Field label="In Hebrew (optional)" value={event.name.he ?? ''} onChangeText={(he) => set({ name: { ...event.name, he: he || undefined } })} />
          </Stack>
        </Stack>
        <Field
          label="Your name for it (optional)"
          placeholder={`e.g. Shabbos ${event.name.en || 'Mincha'}`}
          help="Only gabbaim see it, here. Handy when two minyanim show the same name."
          value={event.adminName ?? ''}
          onChangeText={(v) => set({ adminName: v || undefined })}
        />
        {event.kind === 'tefila' ? (
          <TefilaPicker value={event.tefila} onChange={(t) => updateEvent(event.id, retype(event, t))} />
        ) : (
          <Segments
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
        )}
      </Card>

      <Card gap="md">
        <Stack gap="xs">
          <Text variant="headline">When it’s on</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Each line covers some days. When a day fits more than one line, the higher line wins, so special days go above the
            everyday time. A day no line covers has no {adminLabel(event) || 'event'}.
          </Text>
        </Stack>
        <Stack gap="xs">
          {event.rules.map((rule, i) => {
            const open = openRule === i
            const unused = firstCatchAll >= 0 && i > firstCatchAll
            return (
              <Stack key={`${event.rules.length}:${i}`} gap="xs">
                {/* On a phone the buttons go under the text: a row child doesn't shrink, so long text would push them off screen. */}
                <Stack
                  direction={wide ? 'row' : 'column'}
                  align={wide ? 'center' : 'stretch'}
                  gap="xs"
                  padding="sm"
                  radius="md"
                  background={open ? SemanticColor.SurfaceBackground : undefined}
                  borderWidth={1}
                  borderColor={SemanticColor.BorderDefault}
                >
                  <Stack grow>
                    <Touchable onPress={() => setOpenRule(open ? null : i)} accessibilityLabel={`Edit line ${i + 1}`}>
                      <Stack gap="none" paddingHorizontal="xs">
                        <Text variant="bodyStrong" color={unused ? SemanticColor.TextSecondary : undefined}>
                          {ruleDays(rule, i, event.rules.length)}
                        </Text>
                        <Text variant="body" color={rule.time === null || unused ? SemanticColor.TextSecondary : SemanticColor.TextAccent}>
                          {ruleTime(rule, event, others)}
                        </Text>
                        {unused && (
                          <Text variant="caption" color={SemanticColor.TextDanger}>
                            Never used: the “{ruleDays(event.rules[firstCatchAll], firstCatchAll, event.rules.length)}” line above covers every day. Move this up.
                          </Text>
                        )}
                      </Stack>
                    </Touchable>
                  </Stack>
                  <Stack direction="row" align="center" gap="xs" justify={wide ? undefined : 'end'}>
                    {event.rules.length > 1 && (
                      <>
                        <Button variant="ghost" size="sm" title="↑" disabled={i === 0} onPress={() => move(i, -1)} />
                        <Button variant="ghost" size="sm" title="↓" disabled={i === event.rules.length - 1} onPress={() => move(i, 1)} />
                      </>
                    )}
                    <IconButton name={open ? 'chevron-down' : 'edit'} size={18} onPress={() => setOpenRule(open ? null : i)} accessibilityLabel={`Edit line ${i + 1}`} />
                    <IconButton name="delete" size={18} onPress={() => remove(i)} accessibilityLabel={`Remove line ${i + 1}`} />
                  </Stack>
                </Stack>
                {ai === i && (
                  <AiAssist<Rule>
                    title="Rewrite this line with AI"
                    example="e.g. “On fast days and Rosh Chodesh, 10 minutes earlier than usual”"
                    prompt={(r) => rulePrompt(schedule, profile, event, i, r)}
                    parse={(text) => parseRule(text, zmanIds(schedule))}
                    check={(r) => issuesWith({ ...event, rules: event.rules.map((x, j) => (j === i ? r : x)) })}
                    preview={(r) => <RulesSummary event={{ ...event, rules: [r] }} events={others} />}
                    applyLabel="Use this line"
                    onApply={(r) => setRules(event.rules.map((x, j) => (j === i ? r : x)))}
                    onClose={() => setAi(null)}
                  />
                )}
                {open && ai !== i && (
                  <RuleEditor
                    rule={rule}
                    event={event}
                    events={others}
                    today={today}
                    onChange={(r) => setRules(event.rules.map((x, j) => (j === i ? r : x)))}
                    onAi={() => setAi(i)}
                    onDone={() => setOpenRule(null)}
                  />
                )}
              </Stack>
            )
          })}
        </Stack>
        {ai === 'newRule' && (
          <AiAssist<Rule>
            title="Add a line with AI"
            example="e.g. “8:00 on Sundays and legal holidays”"
            prompt={(r) => rulePrompt(schedule, profile, event, null, r)}
            parse={(text) => parseRule(text, zmanIds(schedule))}
            check={(r) => {
              const i = firstCatchAll >= 0 ? firstCatchAll : event.rules.length
              return issuesWith({ ...event, rules: [...event.rules.slice(0, i), r, ...event.rules.slice(i)] })
            }}
            preview={(r) => <RulesSummary event={{ ...event, rules: [r] }} events={others} />}
            applyLabel="Add this line"
            onApply={addRule}
            onClose={() => setAi(null)}
          />
        )}
        <Stack direction="row" gap="sm" wrap>
          <Button
            variant="secondary"
            size="sm"
            icon="add"
            title={firstCatchAll >= 0 ? 'Add special days' : 'Add days'}
            onPress={() => addRule({ when: { weekday: [0] }, time: event.rules[firstCatchAll]?.time ?? { clock: '07:00' } })}
          />
          {firstCatchAll < 0 && event.rules.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              icon="add"
              title="Add a time for every other day"
              onPress={() => {
                setRules([...event.rules, { time: { clock: '07:00' } }])
                setOpenRule(event.rules.length)
              }}
            />
          )}
          <Button variant="ghost" size="sm" title="Add a line with AI" onPress={() => setAi(ai === 'newRule' ? null : 'newRule')} />
        </Stack>
      </Card>

      <Card gap="sm">
        <Text variant="headline">The next two weeks</Text>
        {coming.length ? (
          <WeekStrip slots={coming} />
        ) : (
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Not on any of the next 14 days.
          </Text>
        )}
        {coming
          .filter((s) => s.error)
          .slice(0, 3)
          .map((s) => (
            <Text key={s.date} variant="caption" color={SemanticColor.TextDanger}>
              {civilDateShort(s.date)}: {s.error}
            </Text>
          ))}
      </Card>

      <Card gap="md">
        <Touchable onPress={() => setMore((m) => !m)} accessibilityLabel="More about it">
          <Stack direction="row" align="center" gap="sm">
            <Stack grow gap="none">
              <Text variant="headline">More about it</Text>
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {[event.room, event.kind !== 'tefila' && 'who it’s for, who gives it', event.visibility === 'internal' ? 'hidden' : 'room, hiding it']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Stack>
            <Icon name={more ? 'chevron-down' : 'chevron-right'} size={18} />
          </Stack>
        </Touchable>
        {more && (
          <Stack gap="md">
            <Field label="Room (optional)" placeholder="Beis Medrash" value={event.room ?? ''} onChangeText={(room) => set({ room: room || undefined })} />
            <DetailsEditor event={event} onChange={set} />
            <Stack direction="row" align="center" gap="md">
              <Stack grow>
                <Text variant="body">Hidden</Text>
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  Not shown anywhere; other events can still be timed from it.
                </Text>
              </Stack>
              <ToggleSwitch value={event.visibility === 'internal'} onValueChange={(v) => set({ visibility: v ? 'internal' : undefined })} accessibilityLabel="Hidden" />
            </Stack>
          </Stack>
        )}
      </Card>

      <Stack direction="row" gap="sm" align="center" wrap>
        {deleting ? (
          <>
            <Text variant="body">Delete {name} and all its times?</Text>
            <Button
              size="sm"
              title="Delete"
              onPress={() => {
                removeEvent(event.id)
                onBack()
              }}
            />
            <Button variant="ghost" size="sm" title="Keep it" onPress={() => setDeleting(false)} />
          </>
        ) : (
          <Button variant="ghost" size="sm" icon="delete" title={`Delete ${name}`} onPress={() => setDeleting(true)} />
        )}
      </Stack>
    </Stack>
  )
}

/** An event in the list: its lines in short and the coming week. Tap to open it. */
function EventRow({ event, all, slots, onOpen }: { event: EventDef; all: EventDef[]; slots: Slot[]; onOpen: () => void }) {
  const others = all.filter((e) => e.id !== event.id)
  return (
    <Card gap="sm" onPress={onOpen} accessibilityLabel={`Edit ${adminLabel(event)}`}>
      <Stack direction="row" align="center" gap="sm">
        <Stack grow gap="none">
          <Stack direction="row" gap="sm" align="center" wrap>
            <Text variant="title">{adminLabel(event) || 'Untitled'}</Text>
            {!!event.name.he && (
              <Text variant="title" rtl color={SemanticColor.TextSecondary}>
                {event.name.he}
              </Text>
            )}
          </Stack>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {event.adminName?.trim() ? `Shown as ${event.name.en} · ` : ''}
            {event.kind === 'tefila'
              ? !event.tefila
                ? 'Which tefila? Tap to choose'
                : event.name.en === STANDARD_TEFILOS[event.tefila].name.en
                  ? 'Minyan'
                  : TEFILA_LABELS[event.tefila]
              : KIND_LABELS[event.kind]}
            {describeDetails(event)}
            {event.room ? ` · ${event.room}` : ''}
            {event.visibility === 'internal' ? ' · hidden' : ''}
          </Text>
        </Stack>
        <Icon name="chevron-right" size={18} />
      </Stack>
      <RulesSummary event={event} events={others} limit={4} />
      {slots.length > 0 && <WeekStrip slots={slots} />}
    </Card>
  )
}

/** A new event's id: its own, or with a number when that's taken. */
function freeId(id: string, taken: string[]): string {
  const base = id || 'event'
  let out = base
  for (let n = 2; taken.includes(out); n++) out = `${base}-${n}`
  return out
}

/** Minyanim, shiurim and other regular times, each opened on its own to edit. */
export function EventsTab({ today }: { today: DateString }) {
  const events = useAdmin((s) => s.schedule?.events) ?? NO_EVENTS
  const schedule = useAdmin((s) => s.schedule)
  const profile = useAdmin((s) => s.profile)
  const addEvent = useAdmin((s) => s.addEvent)
  const [openId, setOpenId] = useState<string | null>(null)
  const [ai, setAi] = useState<EventKind | 'setup' | null>(events.length ? null : 'setup')
  const week = useComing(7, today)
  const open = events.find((e) => e.id === openId)
  if (!schedule || !profile) return null
  if (open) return <EventEditor key={open.id} event={open} all={events} today={today} onBack={() => setOpenId(null)} />

  const add = (e: EventDef) => {
    addEvent(e)
    setOpenId(e.id)
  }
  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Set each one up once and Beitecha works out every day’s time. Tap one to change it.
        </Text>
        <Stack direction="row">
          <Button variant="ghost" size="sm" title={ai === 'setup' ? 'Hide AI setup' : 'Set up everything with AI'} onPress={() => setAi(ai === 'setup' ? null : 'setup')} />
        </Stack>
      </Stack>
      {ai === 'setup' && <AiSetupCard />}
      {SECTIONS.map(({ kind, title, add: addLabel, empty }) => {
        const list = events.filter((e) => e.kind === kind)
        return (
          <Stack key={kind} gap="md">
            <Stack direction="row" align="center" gap="sm" wrap>
              <Text variant="headline">{title}</Text>
              <Stack grow />
              <Button variant="ghost" size="sm" title="Add with AI" onPress={() => setAi(ai === kind ? null : kind)} />
              {kind !== 'tefila' && <Button variant="secondary" size="sm" icon="add" title={addLabel} onPress={() => add(newEvent(kind))} />}
            </Stack>
            {kind === 'tefila' && (
              <Stack direction="row" gap="xs" wrap align="center">
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {addLabel}:
                </Text>
                {TEFILA_TYPES.map((t) => (
                  <Button key={t} variant="secondary" size="sm" icon="add" title={TEFILA_LABELS[t]} onPress={() => add(newEvent(kind, t))} />
                ))}
              </Stack>
            )}
            {ai === kind && (
              <AiAssist<EventDef[]>
                title={`${addLabel} with AI`}
                example={
                  kind === 'tefila'
                    ? 'e.g. “A vasikin minyan at netz, except Shabbos and Yom Tov”'
                    : kind === 'shiur'
                      ? 'e.g. “Daf Yomi with R’ Stern, 45 minutes before Shacharis every day, 8:00 on Shabbos”'
                      : 'e.g. “Kiddush after Shacharis every Shabbos”'
                }
                prompt={(r) => eventPrompt(schedule, profile, null, `(${title.toLowerCase()}) ${r}`)}
                parse={(text) => parseEvents(text, zmanIds(schedule))}
                check={(list) =>
                  validate({ ...schedule, events: [...events, ...list] }, today, 370)
                    .filter((i) => i.level === 'error' && list.some((e) => e.id === i.eventId))
                    .map((i) => i.message)
                }
                preview={(list) => (
                  <Stack gap="sm">
                    {list.map((e) => (
                      <Stack key={e.id} gap="none">
                        <Text variant="bodyStrong">{adminLabel(e)}</Text>
                        <RulesSummary event={e} events={events} />
                      </Stack>
                    ))}
                  </Stack>
                )}
                applyLabel="Add these"
                onApply={(list) => {
                  const taken = events.map((e) => e.id)
                  for (const e of list) {
                    const id = freeId(e.id, taken)
                    taken.push(id)
                    addEvent({ ...e, id })
                  }
                }}
                onClose={() => setAi(null)}
              />
            )}
            {list.map((e) => (
              <EventRow key={e.id} event={e} all={events} slots={week.get(e.id) ?? []} onOpen={() => setOpenId(e.id)} />
            ))}
            {!list.length && (
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {empty}
              </Text>
            )}
          </Stack>
        )
      })}
    </Stack>
  )
}
