import { Card, Icon, SemanticColor, Stack, Text, Touchable } from '@beezyworks/design'
import React from 'react'

import { useCollapsed } from '@/lib/useCollapsed'

/** A card whose title folds its body away; this browser remembers which are folded, per `id`. */
export function CollapsibleCard({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  const [folded, toggle] = useCollapsed(id)
  return (
    <Card gap="md">
      <Touchable onPress={toggle} accessibilityRole="button" accessibilityLabel={title}>
        <Stack direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="sectionHeader">{title}</Text>
          </Stack>
          <Icon
            name={folded ? 'chevron-right' : 'chevron-down'}
            size={18}
            color={SemanticColor.TextSecondary}
          />
        </Stack>
      </Touchable>
      {!folded && children}
    </Card>
  )
}
