import { Badge, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  type EventDef,
  MAX_ANNOUNCE_WEEKS,
  startOfWeek,
  type DateString,
  WEEKDAYS,
  weekdayOf,
} from '@beitecha/engine'
import React, { useMemo } from 'react'

import { NumberField } from '@/components/NumberField'
import { adminLabel } from './forms'
import { useAdmin } from './store'

export const DEFAULT_ANNOUNCE_WEEKS = 2

type Starred = Pick<EventDef, 'announce' | 'announceWeeks'>

/** A whole number of weeks from 0 to the most the engine looks ahead, or the default. */
const weeksOf = (n: number | undefined) =>
  n === undefined ? undefined : Math.min(Math.max(0, Math.round(n)), MAX_ANNOUNCE_WEEKS)

/** "★ Announced 2 weeks ahead", for an event's caption. */
export function announceLabel(event: Starred, defaultWeeks: number) {
  if (!event.announce) return ''
  const weeks = event.announceWeeks ?? defaultWeeks
  return `★ Announced ${weeks === 0 ? 'its week' : `${weeks} week${weeks === 1 ? '' : 's'} ahead`}`
}

/** Star an event for "Coming up" on the printed announcements, and how far ahead. */
export function AnnounceEditor({
  event,
  onChange,
}: {
  event: Starred
  onChange: (patch: Starred) => void
}) {
  const defaultWeeks = useAdmin((s) => s.schedule?.settings.announceWeeks) ?? DEFAULT_ANNOUNCE_WEEKS
  return (
    <Stack gap="sm">
      <Stack direction="row" align="center" gap="md">
        <Stack grow>
          <Text variant="body">★ On the printed announcements</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Listed under “Coming up” from {event.announceWeeks ?? defaultWeeks} weeks before it
            {event.announceWeeks === undefined ? ' (the shul’s setting, under Sponsors)' : ''}.
          </Text>
        </Stack>
        <ToggleSwitch
          value={!!event.announce}
          onValueChange={(v) =>
            onChange(v ? { announce: true } : { announce: undefined, announceWeeks: undefined })
          }
          accessibilityLabel="On the printed announcements"
        />
      </Stack>
      {!!event.announce && (
        <Stack width={220}>
          <NumberField
            label="Weeks ahead (optional)"
            value={event.announceWeeks}
            help={`Blank: the shul’s ${defaultWeeks}`}
            onChange={(n) => onChange({ announce: true, announceWeeks: weeksOf(n) })}
          />
        </Stack>
      )}
    </Stack>
  )
}

/** The shul's lead time for starred events, and what this week's sheet will list. */
export function AnnouncedCard({ today }: { today: DateString }) {
  const schedule = useAdmin((s) => s.schedule)
  const setSchedule = useAdmin((s) => s.setSchedule)
  const sunday = startOfWeek(today)
  const thisWeek = useMemo(
    () => (schedule ? new Calendar(schedule).announced(sunday) : []),
    [schedule, sunday],
  )
  if (!schedule) return null
  const weeks = schedule.settings.announceWeeks ?? DEFAULT_ANNOUNCE_WEEKS
  const starred = [
    ...schedule.events.filter((e) => e.announce).map((e) => adminLabel(e)),
    ...schedule.exceptions.flatMap((x) =>
      x.type === 'add' && x.event.announce && x.date >= today
        ? [`${x.event.name.en} (${civilDateShort(x.date)})`]
        : [],
    ),
  ]
  return (
    <Card gap="md">
      <Stack gap="none">
        <Text variant="sectionHeader">Coming up</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Star an event (under Times or Events) to list it with the printed week’s announcements
          ahead of time: the dinner, a siyum, a monthly shiur.
        </Text>
      </Stack>
      <Stack width={260}>
        <NumberField
          label="Weeks ahead"
          value={schedule.settings.announceWeeks}
          help={`Blank: ${DEFAULT_ANNOUNCE_WEEKS}. An event can set its own.`}
          onChange={(n) =>
            setSchedule({
              ...schedule,
              settings: { ...schedule.settings, announceWeeks: weeksOf(n) },
            })
          }
        />
      </Stack>
      {starred.length > 0 ? (
        <Stack direction="row" gap="xs" wrap align="center">
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Starred:
          </Text>
          {starred.map((s) => (
            <Badge key={s} label={`★ ${s}`} tone="accent" />
          ))}
        </Stack>
      ) : (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Nothing starred yet. Events default to {weeks} weeks ahead once starred.
        </Text>
      )}
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
