import {
  Badge,
  Button,
  Card,
  SegmentedControl,
  SemanticColor,
  Stack,
  Text,
} from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  type DateString,
  type Exception,
  type Occurrence,
  type TimeExpr,
  WEEKDAYS,
} from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

import { Field } from '@/components/Field'
import { makeT } from '@/features/luach/language'
import { formatClockHHMM } from './time'
import { newId, useAdmin } from './store'
import { ClockField, TimeEditor } from './TimeEditor'

const DAYS = 35

type Draft =
  { mode: 'cancel' | 'note'; note: string } | { mode: 'retime'; note: string; time: TimeExpr }

function OccurrenceRow({
  date,
  o,
  exception,
}: {
  date: DateString
  o: Occurrence
  exception?: Exception
}) {
  const { upsertException, removeException, schedule } = useAdmin()
  const { clock } = makeT('en', schedule?.settings.timeFormat)
  const [draft, setDraft] = useState<Draft | null>(null)
  const events = schedule?.events ?? []

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
    <Stack gap="sm" paddingVertical="xs">
      <Stack direction="row" align="center" gap="sm" wrap>
        <Stack width={88}>
          <Text variant="bodyStrong" color={o.cancelled ? SemanticColor.TextDanger : undefined}>
            {o.cancelled ? '—' : o.minutes === null ? '?' : clock(o.minutes)}
          </Text>
        </Stack>
        <Text variant="body">{o.name.en}</Text>
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
        {exception ? (
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
                title="Cancel"
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
      {draft && (
        <Stack gap="sm" padding="md" radius="md" background={SemanticColor.SurfaceBackground}>
          <SegmentedControl
            options={[
              { key: 'cancel', label: 'Cancel' },
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
              title="Apply"
              disabled={draft.mode === 'note' && !draft.note.trim()}
              onPress={apply}
            />
            <Button variant="ghost" size="sm" title="Never mind" onPress={() => setDraft(null)} />
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}

function AddOneOff({ date }: { date: DateString }) {
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

/** This week and the next few: tap a minyan to cancel it, move it, or add a note. */
export function ChangesTab({ today }: { today: DateString }) {
  const schedule = useAdmin((s) => s.schedule)
  const removeException = useAdmin((s) => s.removeException)
  const days = useMemo(
    () => (schedule ? new Calendar(schedule).range(today, DAYS, { includeInternal: true }) : []),
    [schedule, today],
  )
  if (!schedule) return null
  const end = addDays(today, DAYS - 1)
  const elsewhere = schedule.exceptions
    .filter((x) => x.date < today || x.date > end)
    .sort((a, b) => a.date.localeCompare(b.date))
  const exceptionFor = (date: DateString, eventId: string) =>
    schedule.exceptions.find(
      (x) => x.date === date && (x.type === 'add' ? x.event.id === eventId : x.eventId === eventId),
    )

  return (
    <Stack gap="md">
      <Text variant="body" color={SemanticColor.TextSecondary}>
        One-time changes sit on top of the rules: the rules stay as they are, and the change applies
        to that day only.
      </Text>
      {days.map((d) => (
        <Card key={d.date} gap="xs" paddingVertical={16}>
          <Stack direction="row" align="center" gap="sm" wrap>
            <Text variant="headline">
              {WEEKDAYS[d.weekday].en}, {civilDateShort(d.date)}
            </Text>
            <Text variant="body" rtl color={SemanticColor.TextAccent}>
              {d.hebrew.he}
            </Text>
            <Stack grow />
            <Text variant="caption" color={SemanticColor.TextAccent}>
              {d.holidays.map((h) => h.en).join(' · ')}
            </Text>
          </Stack>
          {d.events.map((o) => (
            <OccurrenceRow
              key={o.eventId}
              date={d.date}
              o={o}
              exception={exceptionFor(d.date, o.eventId)}
            />
          ))}
          <AddOneOff date={d.date} />
        </Card>
      ))}
      {elsewhere.length > 0 && (
        <Card gap="sm">
          <Text variant="sectionHeader">Other changes</Text>
          {elsewhere.map((x) => (
            <Stack key={x.id} direction="row" align="center" gap="sm">
              <Text variant="body">
                {x.date} · {x.type === 'add' ? x.event.name.en : x.eventId} · {x.type}
              </Text>
              <Stack grow />
              <Button
                variant="ghost"
                size="sm"
                title="Remove"
                onPress={() => removeException(x.id)}
              />
            </Stack>
          ))}
        </Card>
      )}
    </Stack>
  )
}
