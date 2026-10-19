import { SemanticColor, Stack, Text, TextField, type TextFieldProps } from '@beezyworks/design'
import React from 'react'

/** A labeled text field with optional help or error text. */
export function Field({ label, help, error, ...props }: TextFieldProps & { label: string; help?: string; error?: string | null }) {
  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        {label}
      </Text>
      <TextField variant="boxed" {...props} />
      {!!(error || help) && (
        <Text variant="caption" color={error ? SemanticColor.TextDanger : SemanticColor.TextSecondary}>
          {error || help}
        </Text>
      )}
    </Stack>
  )
}
