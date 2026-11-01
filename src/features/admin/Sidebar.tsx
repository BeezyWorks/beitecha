import { Icon, ScrollStack, SemanticColor, Stack, Text, Touchable } from '@beezyworks/design'
import React from 'react'

import { Segments } from '@/components/Segments'
import { useAppearance, type Appearance } from '@/lib/appearance'
import { PRINT_SECTION, SECTION_GROUPS, type SectionKey } from './sections'

const APPEARANCES: { key: Appearance; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'auto', label: 'Auto' },
  { key: 'dark', label: 'Dark' },
]

function NavRow({
  label,
  selected,
  icon,
  onPress,
}: {
  label: string
  selected?: boolean
  icon?: 'external-link' | 'print'
  onPress: () => void
}) {
  return (
    <Touchable onPress={onPress} accessibilityLabel={label} accessibilityState={{ selected }}>
      <Stack
        direction="row"
        align="center"
        gap="sm"
        paddingHorizontal="md"
        paddingVertical="sm"
        radius="md"
        background={selected ? SemanticColor.AccentTint : undefined}
      >
        <Stack grow>
          <Text
            variant={selected ? 'bodyStrong' : 'body'}
            color={selected ? SemanticColor.TextAccent : undefined}
          >
            {label}
          </Text>
        </Stack>
        {icon && <Icon name={icon} size={16} color={SemanticColor.TextSecondary} />}
      </Stack>
    </Touchable>
  )
}

/** The admin's left column: the shul, its sections, where it shows, and light or dark. */
export function Sidebar({
  shulName,
  status,
  section,
  onSection,
  onSiddur,
}: {
  shulName: string
  /** "Saved", "Saving…", "Couldn't save". */
  status: string
  section: SectionKey
  onSection: (s: SectionKey) => void
  onSiddur: () => void
}) {
  const { appearance, setAppearance } = useAppearance()
  return (
    <Stack
      width={240}
      background={SemanticColor.SurfaceSelected}
      borderColor={SemanticColor.BorderDefault}
    >
      <ScrollStack padding="md" gap="xs">
        <Stack gap="none" paddingHorizontal="md" paddingVertical="sm">
          <Text variant="title" numberOfLines={2}>
            {shulName}
          </Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {status}
          </Text>
        </Stack>
        {SECTION_GROUPS.map((g, i) => (
          <Stack key={i} gap="none" paddingTop={g.title ? 'md' : 'xs'}>
            {!!g.title && (
              <Stack paddingHorizontal="md" paddingBottom="xs">
                <Text variant="label" color={SemanticColor.TextSecondary}>
                  {g.title}
                </Text>
              </Stack>
            )}
            {g.sections.map((s) => (
              <NavRow
                key={s.key}
                label={s.label}
                selected={s.key === section}
                onPress={() => onSection(s.key)}
              />
            ))}
          </Stack>
        ))}
        <Stack gap="none" paddingTop="md">
          <Stack paddingHorizontal="md" paddingBottom="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              See it
            </Text>
          </Stack>
          <NavRow
            label={PRINT_SECTION.label}
            icon="print"
            selected={section === PRINT_SECTION.key}
            onPress={() => onSection(PRINT_SECTION.key)}
          />
          <NavRow label="Siddur page" icon="external-link" onPress={onSiddur} />
        </Stack>
        <Stack paddingHorizontal="sm" paddingTop="lg">
          <Segments
            options={APPEARANCES}
            value={appearance}
            onChange={setAppearance}
            accessibilityLabel="Appearance"
          />
        </Stack>
      </ScrollStack>
    </Stack>
  )
}
