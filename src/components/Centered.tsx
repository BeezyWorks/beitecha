import { ScreenLoader, Stack, Text } from '@beezyworks/design'
import React from 'react'

import { Page } from './Page'

/** Full-page loading spinner or message. */
export function Centered({ loading, title, body, children }: { loading?: boolean; title?: string; body?: string; children?: React.ReactNode }) {
  if (loading) return <ScreenLoader />
  return (
    <Page>
      <Stack gap="md" paddingVertical="xxl" align="center">
        {!!title && <Text variant="pageHeader">{title}</Text>}
        {!!body && <Text variant="bodySerifLarge" align="center">{body}</Text>}
        {children}
      </Stack>
    </Page>
  )
}
