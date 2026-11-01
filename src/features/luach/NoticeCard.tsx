import { Badge, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import type { Notice, NoticeCategory } from '@beitecha/engine'
import React from 'react'

import { useT } from './language'
import { SponsorName } from './SponsorName'
import { hasSponsor } from './sponsorGroups'

/** A sponsorship, announcement, reminder, mazal tov or condolence. */
export function NoticeCard({
  notice,
  categories,
  size = 'page',
}: {
  notice: Notice
  /** The shul's announcement categories, for the notice's tag. */
  categories?: NoticeCategory[]
  size?: 'page' | 'display'
}) {
  const big = size === 'display'
  const { bothNames, noticeTag, text, dateShort } = useT()
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
          label={noticeTag(notice, categories)}
          tone={
            notice.kind === 'sponsor' ? 'accent' : notice.kind === 'simcha' ? 'success' : 'neutral'
          }
        />
        {!!notice.title && (
          <Text variant={big ? 'titleLarge' : 'bodyStrong'}>{text(notice.title)}</Text>
        )}
        <Stack grow />
        <Text variant={big ? 'title' : 'caption'} color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      {hasSponsor(notice) && (
        <SponsorName notice={notice} variant={big ? 'headerTitleWide' : 'bodyStrong'} />
      )}
      {!!text(notice.text) && (
        <Text
          variant={big ? 'headerTitleWide' : 'bodySerifLarge'}
          color={big ? SemanticColor.TextPrimary : undefined}
        >
          {text(notice.text)}
        </Text>
      )}
      {bothNames && !!notice.text.he && (
        <Text variant={big ? 'titleLarge' : 'bodySerif'} rtl>
          {notice.text.he}
        </Text>
      )}
    </Card>
  )
}
