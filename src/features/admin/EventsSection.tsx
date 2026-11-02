import {
  Button,
  Card,
  Icon,
  IconButton,
  ScrollStack,
  SemanticColor,
  Stack,
  Text,
  ToggleSwitch,
  Touchable,
  useIsWideLayout,
} from '@beezyworks/design'
import {
  Calendar,
  civilDateShort,
  type DateString,
  KIND_LABELS,
  TEFILA_LABELS,
  TEFILA_TYPES,
  validate,
  type EventDef,
  type EventKind,
  type Rule,
  type TefilaType,
} from '@beitecha/engine'
import React, { useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'

import { Field } from '@/components/Field'
import { AiAssist } from './AiAssist'
import { eventPrompt, parseEvents, parseRule, rulePrompt } from './aiItems'
import { zmanIds } from './aiSetup'
import { AiSetupCard } from './AiSetupCard'
import { AnnounceEditor } from './AnnounceEditor'
import { DetailsEditor } from './DetailsEditor'
import { adminLabel } from './forms'
import { exceptionFor, OccurrenceRow } from './OccurrenceRow'
import { Preview } from './Preview'
import {
  coversAll,
  freeId,
  newEvent,
  RuleEditor,
  renusach,
  retype,
  RulesSummary,
  ruleDays,
  ruleTime,
  TefilaPicker,
} from './rules'
import { previewSchedule, useAdmin } from './store'

const NO_EVENTS: EventDef[] = []

const TITLES: Record<
  EventKind,
  { title: string; empty: string; add: string; ai: string; example: string }
> = {
  tefila: {
    title: 'Minyanim',
    empty: 'No minyanim yet.',
    add: 'Add a minyan',
    ai: 'minyanim',
    example: 'e.g. “A vasikin minyan at netz, except Shabbos and Yom Tov”',
  },
  shiur: {
    title: 'Shiurim',
    empty: 'No shiurim yet.',
    add: 'Add a shiur',
    ai: 'shiurim',
    example:
      'e.g. “Daf Yomi with R’ Stern, 45 minutes before Shacharis every day, 8:00 on Shabbos”',
  },
  other: {
    title: 'Kiddush & programs',
    empty:
      'Weekly things like Kiddush. A one-time event (a dinner, a Chanukah party) goes in the Events section.',
    add: 'Add a program',
    ai: 'programs',
    example: 'e.g. “Kiddush after Shacharis every Shabbos”',
  },
}

/** A localized field's English, or the field cleared. */
const loc = (value: string, was?: { en: string; he?: string }) =>
  value ? { ...was, en: value } : undefined

/** Asks before unsaved changes to the open event are dropped (on the web; elsewhere they just go). */
function dropOk(): boolean {
  const { editing } = useAdmin.getState()
  if (!editing?.changed) return true
  return (
    Platform.OS !== 'web' ||
    window.confirm(`Drop your changes to ${editing.event.name.en || 'this'}?`)
  )
}

/** Adds a minyan of a chosen tefila, or (for the other kinds) one new event. */
function AddButtons({ kind, onAdd }: { kind: EventKind; onAdd: (e: EventDef) => void }) {
  if (kind !== 'tefila')
    return (
      <Button
        variant="secondary"
        size="sm"
        icon="add"
        title={TITLES[kind].add}
        onPress={() => onAdd(newEvent(kind))}
      />
    )
  return (
    <Stack direction="row" gap="xs" wrap align="center">
      {TEFILA_TYPES.map((t: TefilaType) => (
        <Button
          key={t}
          variant="secondary"
          size="sm"
          icon="add"
          title={TEFILA_LABELS[t]}
          onPress={() => onAdd(newEvent(kind, t))}
        />
      ))}
    </Stack>
  )
}

/** What a list row says under the name. */
function rowCaption(event: EventDef, isNew: boolean): string {
  const lines = event.rules.length
  return [
    isNew && 'New, not saved yet',
    event.kind === 'shiur' && event.speaker?.en,
    event.adminName?.trim() && `Shown as ${event.name.en}`,
    `${lines} line${lines === 1 ? '' : 's'}`,
    event.visibility === 'internal' && 'hidden',
  ]
    .filter(Boolean)
    .join(' · ')
}

function ListPane({
  kind,
  events,
  newOne,
  openId,
  onOpen,
  onAdd,
  onAi,
}: {
  kind: EventKind
  events: EventDef[]
  newOne?: EventDef
  openId?: string
  onOpen: (e: EventDef) => void
  onAdd: (e: EventDef) => void
  onAi: () => void
}) {
  const [adding, setAdding] = useState(false)
  const rows = newOne ? [...events, newOne] : events
  return (
    <ScrollStack padding="md" gap="sm">
      <Text variant="title">{TITLES[kind].title}</Text>
      <Stack direction="row" align="center" gap="sm">
        <Button
          variant="primary"
          size="sm"
          icon="add"
          title="Add"
          onPress={() => (kind === 'tefila' ? setAdding((a) => !a) : onAdd(newEvent(kind)))}
        />
        <Button variant="secondary" size="sm" title="Use AI" onPress={onAi} />
      </Stack>
      {kind === 'tefila' && adding && (
        <AddButtons
          kind={kind}
          onAdd={(e) => {
            setAdding(false)
            onAdd(e)
          }}
        />
      )}
      <Stack gap="xs">
        {rows.map((e) => {
          const selected = e.id === openId
          return (
            <Touchable
              key={e.id}
              onPress={() => onOpen(e)}
              accessibilityLabel={`Edit ${adminLabel(e)}`}
            >
              <Stack
                gap="none"
                padding="sm"
                radius="md"
                background={selected ? SemanticColor.SurfaceSelected : undefined}
                borderWidth={selected ? 1 : undefined}
                borderColor={selected ? SemanticColor.BorderDefault : undefined}
              >
                <Text variant="bodyStrong" numberOfLines={1}>
                  {adminLabel(e) || 'Untitled'}
                </Text>
                <Text variant="caption" color={SemanticColor.TextSecondary} numberOfLines={1}>
                  {rowCaption(e, e === newOne)}
                </Text>
              </Stack>
            </Touchable>
          )
        })}
        {!rows.length && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {TITLES[kind].empty}
          </Text>
        )}
      </Stack>
    </ScrollStack>
  )
}

/** A shiur's next dates, each changeable for that one day. */
function ComingUp({ event, today }: { event: EventDef; today: DateString }) {
  const saved = useAdmin((s) => s.schedule)
  const editing = useAdmin((s) => s.editing)
  const preview = useMemo(() => previewSchedule({ schedule: saved, editing }), [saved, editing])
  const days = useMemo(() => {
    if (!preview) return []
    return new Calendar(preview)
      .range(today, 60, { includeInternal: true })
      .flatMap((d) =>
        d.events.filter((o) => o.eventId === event.id).map((o) => ({ date: d.date, o })),
      )
      .slice(0, 8)
  }, [preview, today, event.id])
  const isNew = !!editing?.isNew
  return (
    <Card gap="md">
      <Stack gap="xs">
        <Text variant="headline">Coming up</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {isNew
            ? 'Save the shiur first, then you can cancel or move a single day.'
            : 'Cancel, move or add a note for one day. These save right away.'}
        </Text>
      </Stack>
      {days.length ? (
        <Stack gap="xs">
          {days.map(({ date, o }) => (
            <OccurrenceRow
              key={date}
              date={date}
              o={o}
              exception={saved ? exceptionFor(saved, date, event.id) : undefined}
            />
          ))}
        </Stack>
      ) : (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Not on any of the next 60 days.
        </Text>
      )}
    </Card>
  )
}

/** The open event: names, times line by line, announcements and details. */
function EventEditor({ event, today }: { event: EventDef; today: DateString }) {
  const changeEditing = useAdmin((s) => s.changeEditing)
  const cancelEditing = useAdmin((s) => s.cancelEditing)
  const removeEvent = useAdmin((s) => s.removeEvent)
  const moveEvent = useAdmin((s) => s.moveEvent)
  const schedule = useAdmin((s) => s.schedule)!
  const profile = useAdmin((s) => s.profile)!
  const isNew = useAdmin((s) => !!s.editing?.isNew)
  const [openRule, setOpenRule] = useState<number | null>(event.rules.length === 1 ? 0 : null)
  /** The AI helper that's open: for the whole event, a new line, or rewriting line n. */
  const [ai, setAi] = useState<'event' | 'newRule' | number | null>(null)
  const [more, setMore] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const wide = useIsWideLayout()
  const shiur = event.kind === 'shiur'
  const set = (patch: Partial<EventDef>) => changeEditing({ ...event, ...patch })
  const setRules = (rules: Rule[]) => set({ rules })
  const others = schedule.events.filter((e) => e.id !== event.id)
  const siblings = schedule.events.filter((e) => e.kind === event.kind)
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
    validate({ ...schedule, events: [...others, draft] }, today, 370)
      .filter((i) => i.level === 'error' && (!i.eventId || i.eventId === event.id))
      .map((i) => (i.date ? `${civilDateShort(i.date)}: ${i.message}` : i.message))

  const room = (
    <Field
      label={shiur ? 'Where (optional)' : 'Room (optional)'}
      placeholder="Beis Medrash"
      value={event.room ?? ''}
      onChangeText={(room) => set({ room: room || undefined })}
    />
  )
  const hidden = (
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
  )

  return (
    <Stack gap="lg" maxWidth={720}>
      <Stack direction="row" align="center" gap="sm" wrap>
        <Stack grow gap="none">
          <Text variant="title">{adminLabel(event) || 'Untitled'}</Text>
          {!!event.adminName?.trim() && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Shown as {event.name.en}
              {event.name.he ? ` · ${event.name.he}` : ''}
            </Text>
          )}
        </Stack>
        {!isNew && siblings.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              title="Move up"
              disabled={at === 0}
              onPress={() => moveEvent(event.id, -1)}
            />
            <Button
              variant="ghost"
              size="sm"
              title="Move down"
              disabled={at === siblings.length - 1}
              onPress={() => moveEvent(event.id, 1)}
            />
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          title="Change with AI"
          onPress={() => setAi(ai === 'event' ? null : 'event')}
        />
      </Stack>

      {ai === 'event' && (
        <AiAssist<EventDef[]>
          title={`Change ${name} with AI`}
          example={`e.g. “6:15 on Rosh Chodesh and fasts too, and no ${event.name.en || 'minyan'} on Tish’a B’Av”`}
          prompt={(r) => eventPrompt(schedule, profile, event, r)}
          parse={(text) => parseEvents(text, zmanIds(schedule))}
          check={(list) =>
            list.length === 1
              ? issuesWith({ ...list[0], id: event.id })
              : [`Expected one event, got ${list.length}.`]
          }
          preview={([e]) => <RulesSummary event={e} events={others} />}
          applyLabel={`Use these times for ${name}`}
          onApply={([e]) => {
            changeEditing({ ...e, id: event.id })
            setOpenRule(null)
          }}
          onClose={() => setAi(null)}
        />
      )}

      <Card gap="md">
        <Stack direction="row" gap="md" wrap>
          <Stack grow>
            <Field
              label={shiur ? 'Headline' : 'Name everyone sees'}
              help={
                shiur
                  ? 'On the display, the bulletin and in the Siddur'
                  : 'On the display, the bulletin and in the Siddur'
              }
              value={event.name.en}
              onChangeText={(en) => set({ name: { ...event.name, en } })}
            />
          </Stack>
          <Stack grow>
            <Field
              label="In Hebrew (optional)"
              value={event.name.he ?? ''}
              onChangeText={(he) => set({ name: { ...event.name, he: he || undefined } })}
            />
          </Stack>
        </Stack>
        {shiur && (
          <>
            <Field
              label="Given by (optional)"
              placeholder="R’ Stern"
              value={event.speaker?.en ?? ''}
              onChangeText={(v) => set({ speaker: loc(v, event.speaker) })}
            />
            <Field
              label="Description (optional)"
              placeholder="Exploring the parsha through the lens of the Maharal…"
              multiline
              value={event.description?.en ?? ''}
              onChangeText={(v) => set({ description: loc(v, event.description) })}
            />
          </>
        )}
        <Field
          label="Your name for it (optional)"
          placeholder={`e.g. Shabbos ${event.name.en || 'Mincha'}`}
          help="Only gabbaim see it, here. Handy when two events show the same name."
          value={event.adminName ?? ''}
          onChangeText={(v) => set({ adminName: v || undefined })}
        />
        {event.kind === 'tefila' && (
          <TefilaPicker
            value={event.tefila}
            nusach={event.nusach}
            onChange={(t) => changeEditing(retype(event, t))}
            onNusach={(n) => changeEditing(renusach(event, n))}
          />
        )}
      </Card>

      <Card gap="md">
        <Stack gap="xs">
          <Text variant="headline">When it’s on</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Each line covers some days. When a day fits more than one line, the higher line wins, so
            special days go above the everyday time. A day no line covers has no{' '}
            {adminLabel(event) || 'event'}.
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
                  <Stack grow width={wide ? 0 : undefined}>
                    <Touchable
                      onPress={() => setOpenRule(open ? null : i)}
                      accessibilityLabel={`Edit line ${i + 1}`}
                    >
                      <Stack gap="none" paddingHorizontal="xs">
                        <Text
                          variant="bodyStrong"
                          color={unused ? SemanticColor.TextSecondary : undefined}
                        >
                          {ruleDays(rule, i, event.rules.length)}
                        </Text>
                        <Text
                          variant="body"
                          color={
                            rule.time === null || unused
                              ? SemanticColor.TextSecondary
                              : SemanticColor.TextAccent
                          }
                        >
                          {ruleTime(rule, event, others)}
                        </Text>
                        {unused && (
                          <Text variant="caption" color={SemanticColor.TextDanger}>
                            Never used: the “
                            {ruleDays(
                              event.rules[firstCatchAll],
                              firstCatchAll,
                              event.rules.length,
                            )}
                            ” line above covers every day. Move this up.
                          </Text>
                        )}
                      </Stack>
                    </Touchable>
                  </Stack>
                  <Stack direction="row" align="center" gap="xs" justify={wide ? undefined : 'end'}>
                    {event.rules.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="↑"
                          disabled={i === 0}
                          onPress={() => move(i, -1)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          title="↓"
                          disabled={i === event.rules.length - 1}
                          onPress={() => move(i, 1)}
                        />
                      </>
                    )}
                    <IconButton
                      name={open ? 'chevron-down' : 'edit'}
                      size={18}
                      onPress={() => setOpenRule(open ? null : i)}
                      accessibilityLabel={`Edit line ${i + 1}`}
                    />
                    <IconButton
                      name="delete"
                      size={18}
                      onPress={() => remove(i)}
                      accessibilityLabel={`Remove line ${i + 1}`}
                    />
                  </Stack>
                </Stack>
                {ai === i && (
                  <AiAssist<Rule>
                    title="Rewrite this line with AI"
                    example="e.g. “On fast days and Rosh Chodesh, 10 minutes earlier than usual”"
                    prompt={(r) => rulePrompt(schedule, profile, event, i, r)}
                    parse={(text) => parseRule(text, zmanIds(schedule))}
                    check={(r) =>
                      issuesWith({ ...event, rules: event.rules.map((x, j) => (j === i ? r : x)) })
                    }
                    preview={(r) => (
                      <RulesSummary event={{ ...event, rules: [r] }} events={others} />
                    )}
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
              return issuesWith({
                ...event,
                rules: [...event.rules.slice(0, i), r, ...event.rules.slice(i)],
              })
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
            onPress={() =>
              addRule({
                when: { weekday: [0] },
                time: event.rules[firstCatchAll]?.time ?? { clock: '07:00' },
              })
            }
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
          <Button
            variant="ghost"
            size="sm"
            title="Add a line with AI"
            onPress={() => setAi(ai === 'newRule' ? null : 'newRule')}
          />
        </Stack>
      </Card>

      {shiur && <ComingUp event={event} today={today} />}

      <Card gap="md">
        <AnnounceEditor event={event} onChange={set} />
      </Card>

      {shiur ? (
        <Card gap="md">
          <Text variant="headline">Where and who it’s for</Text>
          {room}
          <DetailsEditor event={event} onChange={set} />
          {hidden}
        </Card>
      ) : (
        <Card gap="md">
          <Touchable onPress={() => setMore((m) => !m)} accessibilityLabel="More about it">
            <Stack direction="row" align="center" gap="sm">
              <Stack grow gap="none">
                <Text variant="headline">More about it</Text>
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {[
                    event.room,
                    event.kind !== 'tefila' && 'who it’s for, who gives it',
                    event.visibility === 'internal' ? 'hidden' : 'room, hiding it',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Stack>
              <Icon name={more ? 'chevron-down' : 'chevron-right'} size={18} />
            </Stack>
          </Touchable>
          {more && (
            <Stack gap="md">
              {room}
              <DetailsEditor event={event} onChange={set} />
              {hidden}
            </Stack>
          )}
        </Card>
      )}

      <Stack direction="row" gap="sm" align="center" wrap>
        {isNew ? (
          <Button
            variant="ghost"
            size="sm"
            icon="delete"
            title="Discard this new one"
            onPress={cancelEditing}
          />
        ) : deleting ? (
          <>
            <Text variant="body">Delete {name} and all its times?</Text>
            <Button size="sm" title="Delete" onPress={() => removeEvent(event.id)} />
            <Button variant="ghost" size="sm" title="Keep it" onPress={() => setDeleting(false)} />
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon="delete"
            title={`Delete ${name}`}
            onPress={() => setDeleting(true)}
          />
        )}
      </Stack>
    </Stack>
  )
}

/** Under the editor: whether there's anything to save, Cancel and Save. */
function Footer({ name }: { name: string }) {
  const editing = useAdmin((s) => s.editing)!
  const save = useAdmin((s) => s.save)
  const cancelEditing = useAdmin((s) => s.cancelEditing)
  const saveEditing = useAdmin((s) => s.saveEditing)
  const { changed, isNew } = editing
  const status = save === 'saving' ? 'Saving…' : changed ? 'Unsaved changes' : 'No changes'
  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      paddingHorizontal="lg"
      paddingVertical="md"
      borderTopWidth="hairline"
      borderColor={SemanticColor.BorderDefault}
      background={SemanticColor.SurfaceCard}
      wrap
    >
      <Stack grow>
        <Text variant="body" color={changed ? undefined : SemanticColor.TextSecondary}>
          {status}
        </Text>
      </Stack>
      <Button
        variant="secondary"
        title="Cancel"
        disabled={!changed && !isNew}
        onPress={cancelEditing}
      />
      <Button
        title={`Save ${name}`}
        disabled={!changed || save === 'saving'}
        onPress={() => void saveEditing()}
      />
    </Stack>
  )
}

/** Escape cancels and Cmd/Ctrl+Enter saves, while an event is open (web). */
function useEditorKeys(active: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return
    const onKey = (e: KeyboardEvent) => {
      const { editing, cancelEditing, saveEditing } = useAdmin.getState()
      if (!editing) return
      if (e.key === 'Escape' && (editing.changed || editing.isNew)) {
        e.preventDefault()
        cancelEditing()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editing.changed) {
        e.preventDefault()
        void saveEditing()
      }
    }
    // Capture, since a focused text field keeps its keys to itself.
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active])
}

/** Minyanim, shiurim or programs: the list, the one open to edit, and what it comes to on the display. */
export function EventsSection({ kind, today }: { kind: EventKind; today: DateString }) {
  const schedule = useAdmin((s) => s.schedule)
  const profile = useAdmin((s) => s.profile)
  const editing = useAdmin((s) => s.editing)
  const commitSchedule = useAdmin((s) => s.commitSchedule)
  const wide = useIsWideLayout()
  const events = schedule?.events ?? NO_EVENTS
  const list = useMemo(() => events.filter((e) => e.kind === kind), [events, kind])
  const [ai, setAi] = useState(false)
  const open = editing?.event
  useEditorKeys(!!open)

  // Wide: something is always open, the first one until another is picked.
  useEffect(() => {
    if (wide && !editing && list.length) useAdmin.getState().startEditing(list[0])
  }, [wide, editing, list])

  if (!schedule || !profile) return null

  const openEvent = (e: EventDef) => {
    if (e.id === open?.id || !dropOk()) return
    useAdmin.getState().startEditing(e)
  }
  const add = (e: EventDef) => {
    if (!dropOk()) return
    setAi(false)
    useAdmin.getState().startEditing(e, true)
  }
  /** Back to the list (narrow). */
  const close = () => {
    if (dropOk()) useAdmin.setState({ editing: null })
  }

  const aiPanel = ai && (
    <AiAssist<EventDef[]>
      title={`${TITLES[kind].add} with AI`}
      example={TITLES[kind].example}
      prompt={(r) => eventPrompt(schedule, profile, null, `(${TITLES[kind].ai}) ${r}`)}
      parse={(text) => parseEvents(text, zmanIds(schedule))}
      check={(added) =>
        validate({ ...schedule, events: [...events, ...added] }, today, 370)
          .filter((i) => i.level === 'error' && added.some((e) => e.id === i.eventId))
          .map((i) => i.message)
      }
      preview={(added) => (
        <Stack gap="sm">
          {added.map((e) => (
            <Stack key={e.id} gap="none">
              <Text variant="bodyStrong">{adminLabel(e)}</Text>
              <RulesSummary event={e} events={events} />
            </Stack>
          ))}
        </Stack>
      )}
      applyLabel="Add these"
      onApply={(added) => {
        const taken = events.map((e) => e.id)
        const fresh = added.map((e) => {
          const id = freeId(e.id, taken)
          taken.push(id)
          return { ...e, id }
        })
        commitSchedule({ ...schedule, events: [...events, ...fresh] })
      }}
      onClose={() => setAi(false)}
    />
  )

  const listPane = (
    <ListPane
      kind={kind}
      events={list}
      newOne={editing?.isNew ? editing.event : undefined}
      openId={open?.id}
      onOpen={openEvent}
      onAdd={add}
      onAi={() => setAi((a) => !a)}
    />
  )

  const empty = (
    <Stack gap="lg" maxWidth={720}>
      <Stack gap="xs">
        <Text variant="title">{TITLES[kind].empty}</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Set each one up once and Beitecha works out every day’s time.
        </Text>
      </Stack>
      <AddButtons kind={kind} onAdd={add} />
      {kind === 'tefila' && !list.length && <AiSetupCard />}
    </Stack>
  )

  const preview = (
    <Preview
      schedule={previewSchedule({ schedule, editing })!}
      today={today}
      highlight={open?.id}
    />
  )

  if (!wide) {
    if (!open)
      return (
        <ScrollStack padding="md" gap="md">
          {aiPanel}
          {listPane}
          {!list.length && empty}
        </ScrollStack>
      )
    return (
      <Stack grow height={0}>
        <ScrollStack padding="md" gap="lg">
          <Stack direction="row">
            <Button
              variant="ghost"
              size="sm"
              icon="arrow-back"
              title={TITLES[kind].title}
              onPress={close}
            />
          </Stack>
          <EventEditor key={open.id} event={open} today={today} />
          {preview}
        </ScrollStack>
        <Footer name={adminLabel(open) || 'this'} />
      </Stack>
    )
  }

  return (
    <Stack direction="row" grow height={0}>
      <Stack width={260}>{listPane}</Stack>
      <Stack width={1} background={SemanticColor.BorderDefault} />
      <Stack grow width={0}>
        {open ? (
          <>
            <ScrollStack padding="xl" gap="lg">
              {aiPanel}
              <EventEditor key={open.id} event={open} today={today} />
            </ScrollStack>
            <Footer name={adminLabel(open) || 'this'} />
          </>
        ) : (
          <ScrollStack padding="xl" gap="lg">
            {aiPanel}
            {empty}
          </ScrollStack>
        )}
      </Stack>
      <Stack width={400} background={SemanticColor.SurfaceCard}>
        {preview}
      </Stack>
    </Stack>
  )
}
