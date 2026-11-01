import { SemanticColor, Stack, Text } from '@beezyworks/design'
import React from 'react'
import { Pressable } from 'react-native'

/**
 * Mutually exclusive options in one recessed track, the chosen one filled with the brand. Unlike the DL's
 * `SegmentedControl` (equal-width segments over a card-coloured thumb), long labels wrap onto a second line of the
 * track instead of running off the card, and the choice stays visible on a card.
 */
export function Segments<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
  accessibilityLabel?: string
}) {
  return (
    <Stack direction="row">
      <Stack
        direction="row"
        wrap
        gap="xs"
        padding="xs"
        radius="md"
        background={SemanticColor.SurfaceTrack}
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
      >
        {options.map((o) => {
          const selected = o.key === value
          return (
            <Pressable
              key={o.key}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              onPress={() => o.key !== value && onChange(o.key)}
            >
              {({ pressed }) => (
                <Stack
                  radius="sm"
                  paddingHorizontal="md"
                  paddingVertical="xs"
                  background={selected ? SemanticColor.AccentPrimary : undefined}
                  opacity={pressed ? 0.7 : undefined}
                >
                  <Text
                    variant="label"
                    color={selected ? SemanticColor.TextInverse : SemanticColor.TextPrimary}
                  >
                    {o.label}
                  </Text>
                </Stack>
              )}
            </Pressable>
          )
        })}
      </Stack>
    </Stack>
  )
}
