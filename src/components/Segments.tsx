import { SemanticColor, Stack, Text } from '@beezyworks/design'
import React, { useState } from 'react'
import { Pressable, View } from 'react-native'

import { Select } from '@/components/Select'
import { useIsCompact } from '@/lib/useIsCompact'

interface Option<T extends string> {
  key: T
  label: string
}

/** Off-screen room for measuring the track at its natural width. */
const MEASURING_WIDTH = 4000

function Segment({ label, selected, fill }: { label: string; selected: boolean; fill: boolean }) {
  return (
    <Stack
      radius="sm"
      align={fill ? 'center' : undefined}
      paddingHorizontal="md"
      paddingVertical="xs"
      background={selected ? SemanticColor.AccentPrimary : undefined}
    >
      <Text
        variant="label"
        numberOfLines={1}
        color={selected ? SemanticColor.TextInverse : SemanticColor.TextPrimary}
      >
        {label}
      </Text>
    </Stack>
  )
}

/**
 * Mutually exclusive options in one recessed track, the chosen one filled with the brand. The track
 * stays on one line: on a phone it spans the width, and when the labels can't fit in the room it has
 * it becomes a drop-down.
 */
export function Segments<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: Option<T>[]
  value: T
  onChange: (key: T) => void
  accessibilityLabel?: string
}) {
  const compact = useIsCompact()
  const [room, setRoom] = useState(0)
  const [needed, setNeeded] = useState(0)
  const fits = !room || !needed || needed <= room

  return (
    <Stack
      // In a row a phone gives it the whole line, so it measures the room there is, not its own width.
      width={compact ? '100%' : undefined}
      onLayout={(e) => setRoom(Math.floor(e.nativeEvent.layout.width))}
    >
      {fits ? (
        <Stack
          direction="row"
          gap="xs"
          padding="xs"
          radius="md"
          alignSelf={compact ? 'stretch' : 'start'}
          background={SemanticColor.SurfaceTrack}
          accessibilityRole="radiogroup"
          accessibilityLabel={accessibilityLabel}
        >
          {options.map((o) => {
            const selected = o.key === value
            return (
              <Stack key={o.key} grow={compact}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={o.label}
                  onPress={() => o.key !== value && onChange(o.key)}
                >
                  {({ pressed }) => (
                    <Stack opacity={pressed ? 0.7 : undefined}>
                      <Segment label={o.label} selected={selected} fill={compact} />
                    </Stack>
                  )}
                </Pressable>
              </Stack>
            )
          })}
        </Stack>
      ) : (
        <Select
          fill
          accessibilityLabel={accessibilityLabel}
          value={value}
          options={options.map((o) => ({ value: o.key, label: o.label }))}
          onChange={onChange}
        />
      )}
      <Stack position="absolute" width={0} height={0} overflow="hidden" pointerEvents="none">
        <View aria-hidden>
          <Stack width={MEASURING_WIDTH}>
            <Stack
              direction="row"
              gap="xs"
              padding="xs"
              alignSelf="start"
              onLayout={(e) => setNeeded(Math.ceil(e.nativeEvent.layout.width))}
            >
              {options.map((o) => (
                <Segment key={o.key} label={o.label} selected={false} fill={false} />
              ))}
            </Stack>
          </Stack>
        </View>
      </Stack>
    </Stack>
  )
}
