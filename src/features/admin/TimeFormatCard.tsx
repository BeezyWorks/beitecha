import { Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  DEFAULT_TIME_FORMAT,
  TIME_FORMAT_PRESETS,
  formatTime,
  timeFormatProblem,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { Select } from '@/components/Select'

const CUSTOM = 'custom'
const SAMPLES = [5 * 60 + 5, 12 * 60, 15 * 60 + 5, 23 * 60 + 45]

/** How times are written: a preset, or moment-style tokens, with a preview of the result. */
export function TimeFormatCard({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (format: string | undefined) => void
}) {
  const format = value ?? DEFAULT_TIME_FORMAT
  const isPreset = TIME_FORMAT_PRESETS.some((p) => p.format === format)
  const [custom, setCustom] = useState(!isPreset)
  const problem = timeFormatProblem(format)
  const shown = problem ? DEFAULT_TIME_FORMAT : format

  return (
    <Card gap="md">
      <Text variant="sectionHeader">Time format</Text>
      <Select
        accessibilityLabel="Time format"
        value={custom ? CUSTOM : format}
        options={[
          ...TIME_FORMAT_PRESETS.map((p) => ({ value: p.format, label: p.label })),
          { value: CUSTOM, label: 'Custom…' },
        ]}
        onChange={(v) => {
          setCustom(v === CUSTOM)
          if (v !== CUSTOM) onChange(v === DEFAULT_TIME_FORMAT ? undefined : v)
        }}
      />
      {custom && (
        <Field
          label="Format"
          value={format}
          autoCapitalize="none"
          autoCorrect={false}
          error={problem}
          help="h hour (1–12), HH hour (00–23), mm minutes, A AM/PM, a am/pm, AA A/P, aa a/p. Put words in [brackets]."
          onChangeText={(f) => onChange(f === DEFAULT_TIME_FORMAT ? undefined : f)}
        />
      )}
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Preview
        </Text>
        <Stack direction="row" gap="lg">
          {SAMPLES.map((m) => (
            <Text key={m} variant="bodyStrong">
              {formatTime(m, shown)}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}
