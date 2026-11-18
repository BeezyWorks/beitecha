import { radius, SemanticColor, spacing, useColorResolver } from '@beezyworks/design'
import { Picker } from '@react-native-picker/picker'
import React from 'react'

import { useIsCompact } from '@/lib/useIsCompact'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

/** A drop-down, styled like the DL's own web pickers (see HebrewDatePicker). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  fill,
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  accessibilityLabel?: string
  /** Take the full width of the parent. */
  fill?: boolean
}) {
  const resolve = useColorResolver()
  const compact = useIsCompact()
  return (
    <Picker
      selectedValue={value}
      onValueChange={(v) => onChange(v as T)}
      accessibilityLabel={accessibilityLabel}
      style={{
        // iOS zooms the page when a control under 16px takes focus.
        fontSize: compact ? 16 : 15,
        width: fill ? '100%' : undefined,
        maxWidth: '100%',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: resolve(SemanticColor.BorderDefault),
        backgroundColor: resolve(SemanticColor.SurfaceCard),
        color: resolve(SemanticColor.TextPrimary),
      }}
    >
      {options.map((o) => (
        <Picker.Item key={o.value} label={o.label} value={o.value} />
      ))}
    </Picker>
  )
}
