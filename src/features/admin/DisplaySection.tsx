import { Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import { router } from 'expo-router'
import React from 'react'

import { SITE_URL } from '@/lib/config'
import { SectionPage } from './SectionPage'

/** The lobby display. The week on paper has its own section under "See it". */
export function DisplaySection({ slug }: { slug: string }) {
  return (
    <SectionPage title="Lobby display" intro="The monitor in the lobby.">
      <Card gap="sm">
        <Text variant="sectionHeader">On the monitor</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Open this on the monitor’s browser and leave it.
        </Text>
        <Text variant="bodyStrong" selectable>
          {SITE_URL}/{slug}/display
        </Text>
        <Stack direction="row">
          <Button
            variant="secondary"
            size="sm"
            title="Open the display"
            icon="external-link"
            onPress={() => router.push(`/${slug}/display`)}
          />
        </Stack>
      </Card>
    </SectionPage>
  )
}
