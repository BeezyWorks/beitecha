import { SemanticColor, Stack, Text } from '@beezyworks/design'
import { type DaySchedule, zmanimForDay } from '@beitecha/engine'
import React from 'react'

import { useT } from './language'

export function ZmanimList({
  day,
  size = 'page',
}: {
  day: DaySchedule
  size?: 'page' | 'display'
}) {
  const big = size === 'display'
  const t = useT()
  return (
    <Stack gap={big ? 'xs' : 'none'}>
      {zmanimForDay(day.tags).map((id) => {
        const m = day.zmanim[id]
        if (m === undefined) return null
        return (
          <Stack key={id} direction="row" align="center" gap="sm" paddingVertical="xs">
            <Text variant={big ? 'titleLarge' : 'body'} color={SemanticColor.TextSecondary}>
              {t.zman(id)}
            </Text>
            <Stack grow />
            <Text variant={big ? 'titleLarge' : 'bodyStrong'}>{t.clock(m)}</Text>
          </Stack>
        )
      })}
    </Stack>
  )
}
