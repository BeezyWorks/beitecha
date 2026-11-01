import { SemanticColor, Stack, Text } from '@beezyworks/design'
import type { Notice } from '@beitecha/engine'
import React from 'react'

import { useT } from './language'

/** A sponsorship of the announcements themselves: it has no event or title, just who's behind them. */
export const sponsorsNotices = (n: Notice) =>
  n.kind === 'sponsor' && n.sponsors === 'notices' && !n.eventId && !!n.sponsoredBy

/** "Sponsored by" and then the sponsors' names in bold. */
export function SponsorName({
  notice,
  variant,
  strongVariant,
  color,
}: {
  notice: Notice
  variant: React.ComponentProps<typeof Text>['variant']
  strongVariant: React.ComponentProps<typeof Text>['variant']
  color?: SemanticColor
}) {
  const t = useT()
  return (
    <Stack direction="row" wrap gap="xs" align="center">
      <Text variant={variant} color={color}>
        {t.s.sponsoredBy}
      </Text>
      <Text variant={strongVariant} color={color} rtl={t.nameRtl && !!notice.sponsoredBy?.he}>
        {t.text(notice.sponsoredBy!)}
      </Text>
    </Stack>
  )
}
