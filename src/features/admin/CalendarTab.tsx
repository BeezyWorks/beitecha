import { Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import { civilDateShort, type DateString, type Exception, WEEKDAYS, weekdayOf } from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { makeT } from '@/features/luach/language'
import { DetailsEditor } from './DetailsEditor'
import { linkProblem } from './forms'
import { newId, useAdmin } from './store'
import { ClockField } from './TimeEditor'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** A one-time event: an `add` exception of kind `other`, like the "This week" tab's one-offs. */
type DatedEvent = Extract<Exception, { type: 'add' }>

const isDatedEvent = (x: Exception): x is DatedEvent => x.type === 'add' && x.event.kind === 'other'

const clockOf = (x: DatedEvent) => ('clock' in x.time ? x.time.clock : undefined)
const endOf = (x: DatedEvent) => (x.end && 'clock' in x.end ? x.end.clock : undefined)

function EventForm({ initial, onDone }: { initial: DatedEvent; onDone: () => void }) {
  const upsertException = useAdmin((s) => s.upsertException)
  const [x, setX] = useState(initial)
  const [time, setTime] = useState(clockOf(initial))
  const [end, setEnd] = useState(endOf(initial))
  const setEvent = (patch: Partial<DatedEvent['event']>) => setX({ ...x, event: { ...x.event, ...patch } })
  const valid =
    x.event.name.en.trim() && DATE_RE.test(x.date) && time && (!end || end > time) && !linkProblem(x.event.link ?? '')
  return (
    <Card gap="md">
      <Stack direction="row" gap="md" wrap>
        <Stack grow>
          <Field
            label="What"
            placeholder="Annual Dinner, Chanukah party…"
            value={x.event.name.en}
            onChangeText={(en) => setEvent({ name: { ...x.event.name, en } })}
          />
        </Stack>
        <Stack grow>
          <Field
            label="Hebrew name (optional)"
            value={x.event.name.he ?? ''}
            onChangeText={(he) => setEvent({ name: { ...x.event.name, he: he || undefined } })}
          />
        </Stack>
      </Stack>
      <Stack direction="row" gap="md" align="end" wrap>
        <Stack width={160}>
          <Field label="Date" value={x.date} onChangeText={(date) => setX({ ...x, date })} help="YYYY-MM-DD" />
        </Stack>
        <ClockField value={time} onChange={setTime} placeholder="7:00 PM" />
        <ClockField value={end} onChange={setEnd} placeholder="Ends" />
        <Stack grow>
          <Field
            label="Room (optional)"
            placeholder="Social hall"
            value={x.event.room ?? ''}
            onChangeText={(room) => setEvent({ room: room || undefined })}
          />
        </Stack>
      </Stack>
      <DetailsEditor event={x.event} onChange={setEvent} oneTime />
      <Field
        label="Note (optional)"
        placeholder="RSVP by Thursday"
        value={x.note?.en ?? ''}
        onChangeText={(en) => setX({ ...x, note: en ? { ...x.note, en } : undefined })}
      />
      <Stack direction="row" gap="sm">
        <Button
          title="Done"
          disabled={!valid}
          onPress={() => {
            const { end: _, ...rest } = x
            upsertException({
              ...rest,
              time: { clock: time! },
              ...(end && { end: { clock: end } }),
              event: { ...x.event, name: { ...x.event.name, en: x.event.name.en.trim() } },
            })
            onDone()
          }}
        />
        <Button variant="ghost" title="Never mind" onPress={onDone} />
      </Stack>
    </Card>
  )
}

/** Events on a date, for the calendar: the shul dinner, a Chanukah party, a guest speaker. */
export function CalendarTab({ today }: { today: DateString }) {
  const exceptions = useAdmin((s) => s.schedule?.exceptions)
  const timeFormat = useAdmin((s) => s.schedule?.settings.timeFormat)
  const removeException = useAdmin((s) => s.removeException)
  const [editing, setEditing] = useState<DatedEvent | null>(null)
  if (!exceptions) return null

  const { clock } = makeT('en', timeFormat)
  const when = (x: DatedEvent) => `${x.date} ${clockOf(x) ?? ''}`
  const events = exceptions.filter(isDatedEvent)
  const upcoming = events.filter((x) => x.date >= today).sort((a, b) => when(a).localeCompare(when(b)))
  const past = events.filter((x) => x.date < today).sort((a, b) => when(b).localeCompare(when(a)))
  const timeLabel = (x: DatedEvent) => {
    const hhmm = clockOf(x)
    if (!hhmm) return ''
    const [h, m] = hhmm.split(':').map(Number)
    return clock(h * 60 + m)
  }

  return (
    <Stack gap="md">
      {editing ? (
        <EventForm initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <Stack direction="row" gap="sm" wrap>
          <Button
            icon="add"
            title="Add an event"
            onPress={() => {
              const id = newId()
              setEditing({ id, date: today, type: 'add', event: { id: `event-${id}`, name: { en: '' }, kind: 'other' }, time: { clock: '19:00' } })
            }}
          />
        </Stack>
      )}
      {!upcoming.length && !editing && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing coming up. Events show on their day on the display, the printed week, the calendar feed and in the Siddur.
        </Text>
      )}
      {upcoming.map((x) => (
        <Card key={x.id} gap="xs">
          <Stack direction="row" align="center" gap="sm" wrap>
            <Text variant="title">{x.event.name.en}</Text>
            {!!x.event.name.he && (
              <Text variant="title" rtl color={SemanticColor.TextSecondary}>
                {x.event.name.he}
              </Text>
            )}
          </Stack>
          <Text variant="body" color={SemanticColor.TextAccent}>
            {WEEKDAYS[weekdayOf(x.date)].en}, {civilDateShort(x.date)} · {timeLabel(x)}
            {endOf(x) ? `–${timeLabel({ ...x, time: { clock: endOf(x)! } })}` : ''}
            {x.event.room ? ` · ${x.event.room}` : ''}
            {x.event.location ? ` · ${x.event.location}` : ''}
          </Text>
          {!!x.note && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {x.note.en}
            </Text>
          )}
          <Stack direction="row" gap="sm">
            <Button variant="ghost" size="sm" icon="edit" title="Edit" onPress={() => setEditing(x)} />
            <Button variant="ghost" size="sm" icon="delete" title="Delete" onPress={() => removeException(x.id)} />
          </Stack>
        </Card>
      ))}
      {past.length > 0 && (
        <Card gap="sm">
          <Text variant="sectionHeader">Past</Text>
          {past.slice(0, 20).map((x) => (
            <Stack key={x.id} direction="row" align="center" gap="sm">
              <Text variant="body" numberOfLines={1}>
                {x.date} · {x.event.name.en}
              </Text>
              <Stack grow />
              <Button variant="ghost" size="sm" title="Remove" onPress={() => removeException(x.id)} />
            </Stack>
          ))}
        </Card>
      )}
    </Stack>
  )
}
