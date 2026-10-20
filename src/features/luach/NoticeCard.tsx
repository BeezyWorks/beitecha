import { Badge, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import type { Notice } from '@beitecha/engine'
import React from 'react'

import { useT } from './language'

/** A sponsorship or announcement. */
export function NoticeCard({
  notice,
  size = 'page',
}: {
  notice: Notice
  size?: 'page' | 'display'
}) {
  const big = size === 'display'
  const { bothNames, s, text, dateShort } = useT()
  const when =
    notice.to && notice.to !== notice.from
      ? `${dateShort(notice.from)} – ${dateShort(notice.to)}`
      : dateShort(notice.from)
  return (
    <Card
      gap="sm"
      padding={big ? 'lg' : undefined}
      // A sponsor sits flat on a brand wash; a shadow under a tint reads as grime.
      {...(notice.kind === 'sponsor' && {
        background: SemanticColor.AccentTint,
        borderColor: SemanticColor.AccentTintSelected,
        shadow: 'none' as const,
      })}
    >
      <Stack direction="row" align="center" gap="sm">
        <Badge
          label={notice.kind === 'sponsor' ? s.sponsored : s.announcement}
          tone={notice.kind === 'sponsor' ? 'accent' : 'neutral'}
        />
        {!!notice.title && (
          <Text variant={big ? 'titleLarge' : 'bodyStrong'}>{text(notice.title)}</Text>
        )}
        <Stack grow />
        <Text variant={big ? 'title' : 'caption'} color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      <Text
        variant={big ? 'headerTitleWide' : 'bodySerifLarge'}
        color={big ? SemanticColor.TextPrimary : undefined}
      >
        {text(notice.text)}
      </Text>
      {bothNames && !!notice.text.he && (
        <Text variant={big ? 'titleLarge' : 'bodySerif'} rtl>
          {notice.text.he}
        </Text>
      )}
    </Card>
  )
}
