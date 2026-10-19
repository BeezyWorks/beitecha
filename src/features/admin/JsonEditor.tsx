import { SemanticColor, Stack, Text, TextField } from '@beezyworks/design'
import React, { useEffect, useState } from 'react'

/** Raw JSON for rules the forms can't express. Applies on every valid edit. */
export function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Follow outside changes unless the text already says the same thing.
    try {
      if (JSON.stringify(JSON.parse(text)) === JSON.stringify(value ?? null)) return
    } catch {}
    setText(JSON.stringify(value ?? null, null, 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <Stack gap="xs">
      <TextField
        variant="boxed"
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        value={text}
        onChangeText={(t) => {
          setText(t)
          try {
            const parsed = JSON.parse(t)
            setError(null)
            onChange(parsed === null ? undefined : parsed)
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      />
      {!!error && (
        <Text variant="caption" color={SemanticColor.TextDanger}>
          {error}
        </Text>
      )}
    </Stack>
  )
}
