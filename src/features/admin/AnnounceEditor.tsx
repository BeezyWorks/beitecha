import { Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  DEFAULT_ANNOUNCE_WEEKS,
  type EventDef,
  MAX_ANNOUNCE_WEEKS,
  startOfWeek,
  type DateString,
  WEEKDAYS,
  weekdayOf,
} from '@beitecha/engine'
import React, { useMemo } from 'react'

import { NumberField } from '@/components/NumberField'
import { Segments } from '@/components/Segments'
import { useAdmin } from './store'

type Announce = Pick<EventDef, 'announce'>
type Choice = 'default' | 'always' | 'never'

const choiceOf = (event: Announce): Choice =>
  event.announce === undefined ? 'default' : event.announce ? 'always' : 'never'

/** A whole number of weeks from 0 to the most the engine looks ahead, or the default. */
const weeksOf = (n: number | undefined) =>
  n === undefined ? undefined : Math.min(Math.max(0, Math.round(n)), MAX_ANNOUNCE_WEEKS)

const weeksText = (weeks: number) =>
  weeks === 0 ? 'its week' : `${weeks} week${weeks === 1 ? '' : 's'} ahead`

/** "Announced 3 weeks ahead" for a dated event's caption, or '' when it isn't listed early. */
export function announceLabel(event: Announce, defaultWeeks: number) {
  if (event.announce === false) return 'Not in the announcements'
  return event.announce ? 'Always in the announcements' : `Announced ${weeksText(defaultWeeks)}`
}

/** Whether an event is listed under "Coming up": by the shul's lead time (default), always, or never. */
export function AnnounceEditor({
  event,
  onChange,
  oneTime,
}: {
  event: Announce
  onChange: (patch: Announce) => void
  /** A dated event follows the shul's lead time by default; a recurring one isn't listed unless asked. */
  oneTime?: boolean
}) {
  const defaultWeeks = useAdmin((s) => s.schedule?.settings.announceWeeks) ?? DEFAULT_ANNOUNCE_WEEKS
  const choice = choiceOf(event)
  return (
    <Stack gap="sm">
      <Text variant="body">In the announcements</Text>
      <Segments<Choice>
        accessibilityLabel="In the announcements"
        value={choice}
        options={[
          { key: 'default', label: 'Default' },
          { key: 'always', label: 'Always' },
          { key: 'never', label: 'Never' },
        ]}
        onChange={(c) => onChange({ announce: c === 'default' ? undefined : c === 'always' })}
      />
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {choice === 'always'
          ? 'Listed under “Coming up” however far ahead, until it has passed.'
          : choice === 'never'
            ? 'Never listed under “Coming up”.'
            : oneTime
              ? `Listed under “Coming up” from ${weeksText(defaultWeeks)} (set under Dates & events).`
              : 'A recurring event isn’t listed under “Coming up” unless set to Always.'}
      </Text>
    </Stack>
  )
}

/** The shul's lead time for dated events, and what this week's sheet will list. */
export function AnnouncedCard({ today }: { today: DateString }) {
  const schedule = useAdmin((s) => s.schedule)
  const commitSchedule = useAdmin((s) => s.commitSchedule)
  const sunday = startOfWeek(today)
  const thisWeek = useMemo(
    () => (schedule ? new Calendar(schedule).announced(sunday) : []),
    [schedule, sunday],
  )
  if (!schedule) return null
  return (
    <Card gap="md">
      <Stack gap="none">
        <Text variant="sectionHeader">Coming up</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Dated events are listed with the announcements this many weeks ahead. An event can be set
          to always or never be listed.
        </Text>
      </Stack>
      <Stack width={260}>
        <NumberField
          label="Weeks ahead"
          value={schedule.settings.announceWeeks}
          help={`Blank: ${DEFAULT_ANNOUNCE_WEEKS}.`}
          onChange={(n) =>
            commitSchedule({
              ...schedule,
              settings: { ...schedule.settings, announceWeeks: weeksOf(n) },
            })
          }
        />
      </Stack>
      {thisWeek.length > 0 && (
        <Stack gap="xs">
          <Text variant="bodyStrong">
            On the sheet for {civilDateShort(sunday)} – {civilDateShort(addDays(sunday, 6))}
          </Text>
          {thisWeek.map(({ date, event }) => (
            <Text key={`${date}|${event.eventId}`} variant="body">
              {WEEKDAYS[weekdayOf(date)].en}, {civilDateShort(date)} · {event.name.en}
            </Text>
          ))}
        </Stack>
      )}
    </Card>
  )
}
