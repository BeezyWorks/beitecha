import { Chip, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  CALENDAR_GROUPS,
  CALENDAR_GROUP_LABELS,
  Calendar,
  DEFAULT_HIDDEN_HOLIDAYS,
  type CalendarGroup,
  type Schedule,
  type ShulSettings,
  yearHolidayChoices,
} from '@beitecha/engine'
import React from 'react'

import { CollapsibleCard } from './CollapsibleCard'

/** Which holidays the bulletin names above its weekday columns, by kind and one by one, like the wall calendar. */
export function BulletinDaysCard({
  schedule,
  today,
  onChange,
}: {
  schedule: Schedule
  today: string
  onChange: (settings: ShulSettings) => void
}) {
  const { settings } = schedule
  const print = settings.print ?? {}
  const hiddenGroups = print.hideGroups ?? []
  const hidden = print.hideHolidays ?? DEFAULT_HIDDEN_HOLIDAYS
  const choices = React.useMemo(
    () => yearHolidayChoices(new Calendar(schedule), today),
    // The holidays follow from the date and the shul's place, not from its minyanim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, settings.location, settings.localHolidays],
  )
  const set = (patch: Partial<NonNullable<ShulSettings['print']>>) =>
    onChange({ ...settings, print: { ...print, ...patch } })
  const toggle = (list: string[], item: string) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

  return (
    <CollapsibleCard id="bulletin-card-days" title="Days Marked in Bulletin">
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        The holidays named above the weekday columns. The days still print.
      </Text>
      {CALENDAR_GROUPS.map((group: CalendarGroup) => {
        const shown = !hiddenGroups.includes(group)
        const list = choices.filter((c) => c.group === group)
        if (!list.length) return null
        return (
          <Stack key={group} gap="sm">
            <Stack direction="row" align="center" gap="md">
              <Stack grow>
                <Text variant="body">{CALENDAR_GROUP_LABELS[group]}</Text>
              </Stack>
              <ToggleSwitch
                value={shown}
                onValueChange={() => {
                  const next = toggle(hiddenGroups, group) as CalendarGroup[]
                  set({ hideGroups: next.length ? next : undefined })
                }}
                accessibilityLabel={CALENDAR_GROUP_LABELS[group]}
              />
            </Stack>
            {shown && (
              <Stack direction="row" gap="sm" wrap>
                {list.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.count > 1 ? `${c.name} (${c.count} days)` : c.name}
                    selected={!hidden.includes(c.id)}
                    onPress={() => set({ hideHolidays: toggle(hidden, c.id) })}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        )
      })}
    </CollapsibleCard>
  )
}
