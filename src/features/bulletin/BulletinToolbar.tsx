import { Button, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays, civilDateShort } from '@beitecha/engine'
import React from 'react'

import type { Paper } from '@/components/Bulletin'
import { Segments } from '@/components/Segments'
import { DateField } from '@/features/admin/DateField'
import { MAX_SPAN, shiftRange, spanOf, type DateRange } from './range'

/**
 * Over the sheets: which days (the arrows move by the range's length; "Dates" sets any range), which paper, and the
 * print button. `usual` is the shul's own week around the range, which "Usual week" goes back to. `leading` is the way out.
 */
export function BulletinToolbar({
  range,
  onRange,
  usual,
  paper,
  onPaper,
  leading,
  note,
  canPrev = true,
  canNext = true,
  canEditDates = true,
}: {
  range: DateRange
  onRange: (range: DateRange) => void
  usual: DateRange
  paper: Paper
  onPaper: (paper: Paper) => void
  leading: React.ReactNode
  note?: string
  /** The public page may hide the arrows that lead somewhere the shul hasn't opened, and the free-form dates. */
  canPrev?: boolean
  canNext?: boolean
  canEditDates?: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const isUsual = range.from === usual.from && range.to === usual.to
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
          disabled={!canPrev}
          onPress={() => onRange(shiftRange(range, -1))}
        />
        <Text variant="bodyStrong">
          {civilDateShort(range.from)} – {civilDateShort(range.to)}
        </Text>
        <Button
          variant="ghost"
          size="sm"
          title=""
          icon="chevron-right"
          disabled={!canNext}
          onPress={() => onRange(shiftRange(range, 1))}
        />
      </Stack>
      {canEditDates && (
        <Button
          variant={editing || !isUsual ? 'secondary' : 'ghost'}
          size="sm"
          title="Dates"
          icon="calendar-today"
          onPress={() => setEditing((e) => !e)}
        />
      )}
      {!isUsual && (
        <Button variant="ghost" size="sm" title="Usual week" onPress={() => onRange(usual)} />
      )}
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
      {canEditDates && editing && (
        <Stack direction="row" gap="md" wrap width="100%">
          <Stack grow>
            <DateField
              label="From"
              value={range.from}
              onChange={(from) => from && onRange(fit({ from, to: range.to }, 'to'))}
            />
          </Stack>
          <Stack grow>
            <DateField
              label="To"
              value={range.to}
              help={`Up to ${MAX_SPAN} days.`}
              onChange={(to) => to && onRange(fit({ from: range.from, to }, 'from'))}
            />
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}

/** `range` made valid by moving its `move` end: never backwards, never past `MAX_SPAN` days. */
function fit(range: DateRange, move: 'from' | 'to'): DateRange {
  if (range.to < range.from)
    return move === 'to' ? { ...range, to: range.from } : { ...range, from: range.to }
  if (spanOf(range) <= MAX_SPAN) return range
  return move === 'to'
    ? { ...range, to: addDays(range.from, MAX_SPAN - 1) }
    : { ...range, from: addDays(range.to, 1 - MAX_SPAN) }
}
