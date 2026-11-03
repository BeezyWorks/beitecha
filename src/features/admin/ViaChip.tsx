import { Badge } from '@beezyworks/design'
import type { Origin } from '@beitecha/engine'
import React from 'react'

import { viaLabel } from './connect'
import { useConnect } from './connectStore'

/** "via Rivka’s Claude" on something an assistant or script added; nothing on what a gabbai typed. */
export function ViaChip({ origin }: { origin?: Origin }) {
  const connections = useConnect((s) => s.connections)
  if (!origin) return null
  return <Badge label={`via ${viaLabel(connections, origin.connectionId)}`} tone="neutral" />
}
