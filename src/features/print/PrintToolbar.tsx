import { Button, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays, civilDateShort, type DateString } from '@beitecha/engine'
import React from 'react'

import type { Paper } from '@/components/Print'
import { Segments } from '@/components/Segments'

/** Over the sheets: which week, which paper, and the print button. `leading` is the way out. */
export function PrintToolbar({
  sunday,
  onSunday,
  paper,
  onPaper,
  leading,
  note,
}: {
  sunday: DateString
  onSunday: (sunday: DateString) => void
  paper: Paper
  onPaper: (paper: Paper) => void
  leading: React.ReactNode
  note?: string
}) {
  return (
    <Stack
      direction="row"
      align="center"
      gap="md"
      paddingHorizontal="lg"
      paddingVertical="md"
      wrap
      borderBottomWidth="hairline"
      borderColor={SemanticColor.BorderDefault}
      background={SemanticColor.SurfaceCard}
    >
      {leading}
      <Stack direction="row" align="center" gap="xs">
        <Button
          variant="ghost"
          size="sm"
          title=""
          icon="chevron-left"
          onPress={() => onSunday(addDays(sunday, -7))}
        />
        <Text variant="bodyStrong">
          {civilDateShort(sunday)} – {civilDateShort(addDays(sunday, 6))}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          title=""
          icon="chevron-right"
          onPress={() => onSunday(addDays(sunday, 7))}
        />
      </Stack>
      <Segments<Paper>
        options={[
          { key: 'letter', label: 'Letter' },
          { key: 'a4', label: 'A4' },
        ]}
        value={paper}
        onChange={onPaper}
        accessibilityLabel="Paper size"
      />
      <Stack grow />
      {!!note && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {note}
        </Text>
      )}
      <Button size="sm" title="Print" icon="print" onPress={() => window.print()} />
    </Stack>
  )
}
