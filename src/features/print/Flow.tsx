import { SemanticColor, Stack } from '@beezyworks/design'
import React from 'react'

export interface FlowItem {
  key: string
  /** Roughly how tall it is, in lines of text. */
  weight: number
  node: React.ReactNode
  /** A heading: it stays with the item after it. */
  keep?: boolean
  /** The first item of a group, a good place to start the second column. */
  start?: boolean
}

/** Splitting a group between the columns costs about this many lines of imbalance. */
const SPLIT_COST = 2
/** Less than this many lines doesn't need two columns. */
const MIN_WEIGHT = 6

/**
 * Where to cut `items` so two columns come out the same height: the first column takes `items[0..cut)`.
 * Never right after a heading; a cut between groups is preferred to one inside a group. Null for one column.
 */
export function splitFlow(items: Pick<FlowItem, 'weight' | 'keep' | 'start'>[]): number | null {
  const total = items.reduce((sum, i) => sum + i.weight, 0)
  if (items.length < 2 || total < MIN_WEIGHT) return null
  let best: { cut: number; cost: number } | null = null
  let before = 0
  for (let cut = 1; cut < items.length; cut++) {
    before += items[cut - 1].weight
    if (items[cut - 1].keep) continue
    const cost = Math.max(before, total - before) + (items[cut].start ? 0 : SPLIT_COST)
    if (!best || cost < best.cost) best = { cut, cost }
  }
  return best && best.cost < total ? best.cut : null
}

/** A list laid out in two balanced columns, the first flowing into the second (one column if it's short). */
export function Flow({
  items,
  gap = 'xs',
}: {
  items: FlowItem[]
  gap?: React.ComponentProps<typeof Stack>['gap']
}) {
  const cut = splitFlow(items)
  const column = (list: FlowItem[], side?: boolean) => (
    <Stack grow={side} width={side ? 0 : undefined} gap={gap}>
      {list.map((i) => (
        <React.Fragment key={i.key}>{i.node}</React.Fragment>
      ))}
    </Stack>
  )
  if (cut === null) return column(items)
  return (
    <Stack direction="row" gap="md">
      {column(items.slice(0, cut), true)}
      <Stack width={1} background={SemanticColor.BorderStrong} />
      {column(items.slice(cut), true)}
    </Stack>
  )
}
