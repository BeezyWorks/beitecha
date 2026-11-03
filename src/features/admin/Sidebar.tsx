import {
  Badge,
  Button,
  Icon,
  ScrollStack,
  SemanticColor,
  Stack,
  Text,
  Touchable,
} from '@beezyworks/design'
import React from 'react'

import { Segments } from '@/components/Segments'
import { useCollapsed } from '@/lib/useCollapsed'
import { useAppearance, type Appearance } from '@/lib/appearance'
import { useConnect, pendingCountOf } from './connectStore'
import {
  CONNECT_SECTIONS,
  SECTION_GROUPS,
  SEE_IT_SECTIONS,
  SETTINGS_SECTIONS,
  type SectionKey,
} from './sections'

const APPEARANCES: { key: Appearance; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'auto', label: 'Auto' },
  { key: 'dark', label: 'Dark' },
]

function NavRow({
  label,
  selected,
  icon,
  badge,
  onPress,
}: {
  label: string
  selected?: boolean
  /** A count after the label; nothing when 0. */
  badge?: number
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
        {!!badge && <Badge label={String(badge)} tone="accent" />}
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
  const pending = useConnect((s) => pendingCountOf(s.changes))
  const [folded, toggle] = useCollapsed('admin-sidebar')
  if (folded)
    return (
      <Stack
        width={48}
        align="center"
        padding="xs"
        background={SemanticColor.SurfaceSelected}
        borderColor={SemanticColor.BorderDefault}
      >
        <Button variant="ghost" size="sm" title="Show menu" icon="chevron-right" onPress={toggle} />
      </Stack>
    )
  return (
    <Stack
      width={240}
      background={SemanticColor.SurfaceSelected}
      borderColor={SemanticColor.BorderDefault}
    >
      <ScrollStack padding="md" gap="xs">
        <Stack direction="row" align="center" gap="xs">
          <Stack grow gap="none" paddingHorizontal="md" paddingVertical="sm">
            <Text variant="title" numberOfLines={2}>
              {shulName}
            </Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {status}
            </Text>
          </Stack>
          <Button
            variant="ghost"
            size="sm"
            title="Hide menu"
            icon="chevron-left"
            onPress={toggle}
          />
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
          {SEE_IT_SECTIONS.map((s) => (
            <NavRow
              key={s.key}
              label={s.label}
              icon={s.key === 'bulletin' ? 'print' : undefined}
              selected={s.key === section}
              onPress={() => onSection(s.key)}
            />
          ))}
          <NavRow label="Siddur page" icon="external-link" onPress={onSiddur} />
        </Stack>
        <Stack gap="none" paddingTop="md">
          <Stack paddingHorizontal="md" paddingBottom="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Connect
            </Text>
          </Stack>
          {CONNECT_SECTIONS.map((s) => (
            <NavRow
              key={s.key}
              label={s.label}
              badge={s.key === 'pending' ? pending : undefined}
              selected={s.key === section}
              onPress={() => onSection(s.key)}
            />
          ))}
        </Stack>
        <Stack gap="none" paddingTop="md">
          <Stack paddingHorizontal="md" paddingBottom="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Settings
            </Text>
          </Stack>
          {SETTINGS_SECTIONS.map((s) => (
            <NavRow
              key={s.key}
              label={s.label}
              selected={s.key === section}
              onPress={() => onSection(s.key)}
            />
          ))}
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
