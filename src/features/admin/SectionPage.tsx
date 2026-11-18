import { ScrollStack, SemanticColor, Stack, Text } from '@beezyworks/design'
import React from 'react'

import { useIsCompact } from '@/lib/useIsCompact'

/** A section's title, a line on what it's for, and its buttons: beside it, or under it on a phone. */
export function SectionHeader({
  title,
  intro,
  actions,
}: {
  title: string
  intro?: string
  /** Buttons beside the title (Add…). */
  actions?: React.ReactNode
}) {
  const compact = useIsCompact()
  return (
    <Stack direction={compact ? 'column' : 'row'} align={compact ? undefined : 'center'} gap="md">
      <Stack grow={!compact} width={compact ? undefined : 0} gap="xs">
        <Text variant={compact ? 'title' : 'largeTitle'}>{title}</Text>
        {!!intro && (
          <Text variant="body" color={SemanticColor.TextSecondary}>
            {intro}
          </Text>
        )}
      </Stack>
      {!!actions && (
        <Stack direction="row" align="center" gap="sm" wrap>
          {actions}
        </Stack>
      )}
    </Stack>
  )
}

/** A one-column admin section: its header and its content in a readable width. */
export function SectionPage({
  title,
  intro,
  actions,
  children,
}: {
  title: string
  intro?: string
  /** Buttons beside the title (Add…). */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const compact = useIsCompact()
  return (
    <ScrollStack padding={compact ? 'md' : 'xl'} gap="lg">
      <Stack maxWidth={880} gap="lg">
        <SectionHeader title={title} intro={intro} actions={actions} />
        {children}
      </Stack>
    </ScrollStack>
  )
}
