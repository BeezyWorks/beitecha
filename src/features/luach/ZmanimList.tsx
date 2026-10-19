import { SemanticColor, Stack, Text } from '@beezyworks/design'
import type { DaySchedule } from '@beitecha/engine'
import React from 'react'

import { clock } from './format'
import { ZMAN_LABELS, zmanimForDay } from './labels'

export function ZmanimList({ day, size = 'page' }: { day: DaySchedule; size?: 'page' | 'display' }) {
  const big = size === 'display'
  return (
    <Stack gap={big ? 'xs' : 'none'}>
      {zmanimForDay(day.tags).map((id) => {
        const m = day.zmanim[id]
        if (m === undefined) return null
        return (
          <Stack key={id} direction="row" align="center" gap="sm" paddingVertical="xs">
            <Text variant={big ? 'titleLarge' : 'body'} color={SemanticColor.TextSecondary}>
              {ZMAN_LABELS[id].en}
            </Text>
            <Stack grow />
            <Text variant={big ? 'titleLarge' : 'bodyStrong'}>{clock(m)}</Text>
          </Stack>
        )
      })}
    </Stack>
  )
}
