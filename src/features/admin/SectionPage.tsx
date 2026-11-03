import { ScrollStack, SemanticColor, Stack, Text } from '@beezyworks/design'
import React from 'react'

/** A one-column admin section: its title, a line on what it's for, and its content in a readable width. */
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
  return (
    <ScrollStack padding="xl" gap="lg">
      <Stack maxWidth={880} gap="lg">
        <Stack direction="row" align="center" gap="md" wrap>
          <Stack grow width={0} gap="xs">
            <Text variant="largeTitle">{title}</Text>
            {!!intro && (
              <Text variant="body" color={SemanticColor.TextSecondary}>
                {intro}
              </Text>
            )}
          </Stack>
          {actions}
        </Stack>
        {children}
      </Stack>
    </ScrollStack>
  )
}
