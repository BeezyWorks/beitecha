import { SemanticColor, Stack, Text } from '@beezyworks/design'
import type { Minutes, Occurrence } from '@beitecha/engine'
import React from 'react'

import { clock } from './format'

export interface TimesListProps {
  events: Occurrence[]
  /** Highlights the next one when given (shul-local minutes now). */
  now?: Minutes
  /** `display` = sized for a monitor across the room. */
  size?: 'page' | 'display'
}

/** One day's minyanim and shiurim: name (English + Hebrew) and time, cancellations noted. */
export function TimesList({ events, now, size = 'page' }: TimesListProps) {
  const next = now === undefined ? undefined : events.find((e) => !e.cancelled && e.minutes !== null && e.minutes >= now)
  const big = size === 'display'
  return (
    <Stack gap={big ? 'sm' : 'xs'}>
      {events.map((e) => {
        const isNext = e === next
        const past = now !== undefined && e.minutes !== null && e.minutes < now
        return (
          <Stack
            key={e.eventId}
            direction="row"
            align="center"
            gap="md"
            paddingVertical={big ? 'sm' : 'xs'}
            paddingHorizontal="sm"
            radius="md"
            background={isNext ? SemanticColor.AccentTint : undefined}
            opacity={past || e.cancelled ? 0.5 : 1}
          >
            <Stack grow gap="none">
              <Text variant={big ? 'displayMedium' : 'headline'} color={isNext ? SemanticColor.TextAccent : undefined}>
                {e.name.en}
              </Text>
              {!!e.note && (
                <Text variant={big ? 'title' : 'caption'} color={e.cancelled ? SemanticColor.TextDanger : SemanticColor.TextSecondary}>
                  {e.cancelled ? `Cancelled — ${e.note.en}` : e.note.en}
                </Text>
              )}
              {!e.note && e.cancelled && (
                <Text variant={big ? 'title' : 'caption'} color={SemanticColor.TextDanger}>
                  Cancelled
                </Text>
              )}
            </Stack>
            {!!e.name.he && (
              <Text variant={big ? 'displayMedium' : 'headline'} rtl color={SemanticColor.TextSecondary}>
                {e.name.he}
              </Text>
            )}
            <Stack width={big ? 150 : 64} align="end">
              <Text variant={big ? 'displayMedium' : 'headline'} color={isNext ? SemanticColor.TextAccent : undefined}>
                {e.minutes === null ? '—' : clock(e.minutes)}
              </Text>
            </Stack>
          </Stack>
        )
      })}
    </Stack>
  )
}
