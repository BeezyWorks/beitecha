import { SemanticColor, Text } from '@beezyworks/design'
import type { Notice } from '@beitecha/engine'
import React from 'react'

import { useT } from './language'

/** The sponsors' names, in bold. */
export function SponsorName({
  notice,
  variant,
  color,
}: {
  notice: Notice
  variant: React.ComponentProps<typeof Text>['variant']
  color?: SemanticColor
}) {
  const t = useT()
  return (
    <Text variant={variant} color={color} rtl={t.nameRtl && !!notice.sponsoredBy?.he}>
      {t.text(notice.sponsoredBy!)}
    </Text>
  )
}
