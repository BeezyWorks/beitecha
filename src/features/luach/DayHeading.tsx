import { SemanticColor, Stack, Text } from '@beezyworks/design'
import type { DaySchedule } from '@beitecha/engine'
import React from 'react'

import { civilDate } from './format'
import { WEEKDAYS } from './labels'

/** "Monday, October 19 · ח׳ חשון תשפ״ז" with holidays and parsha beneath. */
export function DayHeading({ day, size = 'page' }: { day: DaySchedule; size?: 'page' | 'display' }) {
  const big = size === 'display'
  const extras = [...day.holidays.map((h) => h.en), ...(day.weekday === 6 && day.parsha ? [`Parshas ${day.parsha.en}`] : [])]
  return (
    <Stack gap="xs">
      <Stack direction="row" align="center" gap="md" wrap>
        <Text variant={big ? 'displayMedium' : 'title'}>
          {WEEKDAYS[day.weekday].en}, {civilDate(day.date)}
        </Text>
        <Stack grow />
        <Text variant={big ? 'displayMedium' : 'title'} rtl color={SemanticColor.TextAccent}>
          {day.hebrew.he}
        </Text>
      </Stack>
      {extras.length > 0 && (
        <Text variant={big ? 'titleLarge' : 'body'} color={SemanticColor.TextAccent}>
          {extras.join(' · ')}
        </Text>
      )}
    </Stack>
  )
}
