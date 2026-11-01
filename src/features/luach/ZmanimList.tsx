import { SemanticColor, Stack, Text } from '@beezyworks/design'
import { type DaySchedule, zmanimList } from '@beitecha/engine'
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
      {zmanimList(day).map(({ id, name, minutes: m }) => (
        <Stack key={id} direction="row" align="center" gap="sm" paddingVertical="xs">
          <Text variant={big ? 'titleLarge' : 'body'} color={SemanticColor.TextSecondary}>
            {t.text(name)}
          </Text>
          <Stack grow />
          <Text variant={big ? 'titleLarge' : 'bodyStrong'}>{t.clock(m)}</Text>
        </Stack>
      ))}
    </Stack>
  )
}
