import { Badge, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import type { Notice } from '@beitecha/engine'
import React from 'react'

import { civilDateShort } from './format'

/** A sponsorship or announcement. */
export function NoticeCard({ notice, size = 'page' }: { notice: Notice; size?: 'page' | 'display' }) {
  const big = size === 'display'
  const when = notice.to && notice.to !== notice.from ? `${civilDateShort(notice.from)} – ${civilDateShort(notice.to)}` : civilDateShort(notice.from)
  return (
    <Card gap="sm" padding={big ? 'lg' : undefined} background={notice.kind === 'sponsor' ? SemanticColor.AccentTint : undefined}>
      <Stack direction="row" align="center" gap="sm">
        <Badge label={notice.kind === 'sponsor' ? 'Sponsored' : 'Announcement'} tone={notice.kind === 'sponsor' ? 'accent' : 'neutral'} />
        {!!notice.title && <Text variant={big ? 'titleLarge' : 'bodyStrong'}>{notice.title.en}</Text>}
        <Stack grow />
        <Text variant={big ? 'title' : 'caption'} color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      <Text variant={big ? 'headerTitleWide' : 'bodySerifLarge'} color={big ? SemanticColor.TextPrimary : undefined}>
        {notice.text.en}
      </Text>
      {!!notice.text.he && (
        <Text variant={big ? 'titleLarge' : 'bodySerif'} rtl>
          {notice.text.he}
        </Text>
      )}
    </Card>
  )
}
