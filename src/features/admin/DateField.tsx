import { Button, GregorianDateField, SemanticColor, Stack, Text } from '@beezyworks/design'
import { type DateString } from '@beitecha/engine'
import React from 'react'

const toDate = (d: DateString) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}
const fromDate = (d: Date): DateString =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * A date picked from the browser's calendar, stored as `YYYY-MM-DD`. An optional one starts as a button
 * (`unsetLabel`) and can be cleared.
 */
export function DateField({
  label,
  value,
  onChange,
  help,
  unsetLabel,
  initial,
}: {
  label: string
  value?: DateString
  onChange: (d: DateString | undefined) => void
  help?: string
  /** Makes the date optional: shown as this button until it's set. */
  unsetLabel?: string
  /** The date an optional field starts at when set. */
  initial?: DateString
}) {
  return (
    <Stack gap="xs">
      <Text variant="label" color={SemanticColor.TextSecondary}>
        {label}
      </Text>
      {value ? (
        <Stack direction="row" gap="sm" align="center">
          <Stack grow>
            <GregorianDateField value={toDate(value)} onChange={(d) => onChange(fromDate(d))} />
          </Stack>
          {unsetLabel && (
            <Button variant="ghost" size="sm" title="Clear" onPress={() => onChange(undefined)} />
          )}
        </Stack>
      ) : (
        <Stack direction="row">
          <Button
            variant="secondary"
            size="sm"
            icon="calendar-today"
            title={unsetLabel ?? 'Pick a date'}
            onPress={() => onChange(initial ?? fromDate(new Date()))}
          />
        </Stack>
      )}
      {!!help && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {help}
        </Text>
      )}
    </Stack>
  )
}
