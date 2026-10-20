import { SemanticColor, Stack, Text, type TypeVariant } from '@beezyworks/design'
import React from 'react'

/** A holiday or parsha tag laid over the brand gradient. */
export function Pill({ label, variant = 'headline' }: { label: string; variant?: TypeVariant }) {
  return (
    <Stack
      radius="full"
      paddingHorizontal="sm"
      paddingVertical="xs"
      background={SemanticColor.SurfaceOnAccent}
    >
      <Text variant={variant} color={SemanticColor.TextOnAccent}>
        {label}
      </Text>
    </Stack>
  )
}
