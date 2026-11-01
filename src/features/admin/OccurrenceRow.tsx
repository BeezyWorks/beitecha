import { Badge, Button, SemanticColor, Stack, Text, Touchable } from '@beezyworks/design'
import type { DateString, Exception, Occurrence, Schedule, TimeExpr } from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { makeT } from '@/features/luach/language'
import { adminLabel } from './forms'
import { newId, useAdmin } from './store'
import { ClockField, TimeEditor } from './TimeEditor'
import { formatClockHHMM } from './time'

/** The saved exception that changes this event on this day, if any. */
export function exceptionFor(
  schedule: Schedule,
  date: DateString,
  eventId: string,
): Exception | undefined {
  return schedule.exceptions.find(
    (x) => x.date === date && (x.type === 'add' ? x.event.id === eventId : x.eventId === eventId),
  )
}

type Draft =
  { mode: 'cancel' | 'note'; note: string } | { mode: 'retime'; note: string; time: TimeExpr }

/**
 * One occurrence on one day, with Cancel it / Move / Note for that day only (saved at once) and Undo
 * when changed. `compact` is for narrow panes: the actions wait until the row is tapped.
 */
export function OccurrenceRow({
  date,
  o,
  exception,
  compact,
  defaultOpen,
}: {
  date: DateString
  o: Occurrence
  exception?: Exception
  compact?: boolean
  /** Compact only: start with the actions showing. */
  defaultOpen?: boolean
}) {
  const { upsertException, removeException, schedule } = useAdmin()
  const { clock } = makeT('en', schedule?.settings.timeFormat)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [open, setOpen] = useState(!!defaultOpen)
  const showActions = !compact || open
  const events = schedule?.events ?? []
  const event = events.find((e) => e.id === o.eventId)

  const apply = () => {
    if (!draft) return
    const note = draft.note.trim() ? { en: draft.note.trim() } : undefined
    const id = exception?.id ?? newId()
    if (draft.mode === 'cancel')
      upsertException({ id, date, type: 'cancel', eventId: o.eventId, note })
    if (draft.mode === 'note' && note)
      upsertException({ id, date, type: 'note', eventId: o.eventId, note })
    if (draft.mode === 'retime')
      upsertException({ id, date, type: 'retime', eventId: o.eventId, time: draft.time, note })
    setDraft(null)
  }

  return (
    <Stack gap={compact ? 'xs' : 'sm'} paddingVertical={compact ? undefined : 'xs'}>
      <Touchable
        disabled={!compact}
        onPress={() => setOpen((v) => !v)}
        accessibilityLabel={`Changes for ${event ? adminLabel(event) : o.name.en}`}
      >
        <Stack direction="row" align="center" gap="sm" wrap>
          <Stack width={compact ? 72 : 88}>
            <Text variant="bodyStrong" color={o.cancelled ? SemanticColor.TextDanger : undefined}>
              {o.cancelled ? '—' : o.minutes === null ? '?' : clock(o.minutes)}
            </Text>
          </Stack>
          <Text variant="body">{event ? adminLabel(event) : o.name.en}</Text>
          {exception && (
            <Badge
              label={
                exception.type === 'cancel'
                  ? 'Cancelled'
                  : exception.type === 'retime'
                    ? 'Moved'
                    : exception.type === 'add'
                      ? 'One-off'
                      : 'Note'
              }
              tone="accent"
            />
          )}
          {!!o.note && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {o.note.en}
            </Text>
          )}
          {!!o.error && (
            <Text variant="caption" color={SemanticColor.TextDanger}>
              {o.error}
            </Text>
          )}
          <Stack grow />
          {!showActions ? null : exception ? (
            <Button
              variant="ghost"
              size="sm"
              title="Undo"
              onPress={() => removeException(exception.id)}
            />
          ) : (
            !draft && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Cancel it"
                  onPress={() => setDraft({ mode: 'cancel', note: '' })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  title="Move"
                  onPress={() =>
                    setDraft({
                      mode: 'retime',
                      note: '',
                      time: { clock: o.minutes !== null ? formatClockHHMM(o.minutes) : '07:00' },
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  title="Note"
                  onPress={() => setDraft({ mode: 'note', note: '' })}
                />
              </>
            )
          )}
        </Stack>
      </Touchable>
      {draft && showActions && (
        <Stack gap="sm" padding="md" radius="md" background={SemanticColor.SurfaceBackground}>
          <Segments
            options={[
              { key: 'cancel', label: 'Cancel it' },
              { key: 'retime', label: 'Move' },
              { key: 'note', label: 'Just a note' },
            ]}
            value={draft.mode}
            onChange={(mode) =>
              setDraft(
                mode === 'retime'
                  ? {
                      mode,
                      note: draft.note,
                      time: 'time' in draft ? draft.time : { clock: '07:00' },
                    }
                  : { mode, note: draft.note },
              )
            }
          />
          {draft.mode === 'retime' && (
            <TimeEditor
              value={draft.time}
              events={events.filter((e) => e.id !== o.eventId)}
              onChange={(time) => setDraft({ ...draft, time })}
            />
          )}
          <Field
            label={draft.mode === 'note' ? 'Note' : 'Note (optional)'}
            placeholder={draft.mode === 'cancel' ? 'The Rav is away this week' : ''}
            value={draft.note}
            onChangeText={(note) => setDraft({ ...draft, note })}
          />
          <Stack direction="row" gap="sm">
            <Button
              size="sm"
              title="Save"
              disabled={draft.mode === 'note' && !draft.note.trim()}
              onPress={apply}
            />
            <Button variant="ghost" size="sm" title="Cancel" onPress={() => setDraft(null)} />
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}

/** A one-time event on a day, on top of the rules. */
export function AddOneOff({ date }: { date: DateString }) {
  const upsertException = useAdmin((s) => s.upsertException)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [time, setTime] = useState<string | undefined>()
  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        icon="add"
        title="Add a one-time event"
        onPress={() => setOpen(true)}
      />
    )
  return (
    <Stack direction="row" gap="sm" align="end" wrap>
      <Stack grow>
        <Field
          label="What"
          placeholder="Siyum, guest speaker…"
          value={name}
          onChangeText={setName}
        />
      </Stack>
      <ClockField value={time} onChange={setTime} placeholder="8:00 PM" />
      <Button
        size="sm"
        title="Add"
        disabled={!name.trim() || !time}
        onPress={() => {
          const id = newId()
          upsertException({
            id,
            date,
            type: 'add',
            event: { id: `oneoff-${id}`, name: { en: name.trim() }, kind: 'other' },
            time: { clock: time! },
          })
          setOpen(false)
          setName('')
          setTime(undefined)
        }}
      />
      <Button variant="ghost" size="sm" title="Never mind" onPress={() => setOpen(false)} />
    </Stack>
  )
}
