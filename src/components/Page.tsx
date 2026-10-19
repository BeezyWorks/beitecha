import { Screen, ScrollStack } from '@beezyworks/design'
import React from 'react'

/** A scrolling page in a readable column. */
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <Screen width="reader">
      <ScrollStack padding="lg" gap="lg">
        {children}
      </ScrollStack>
    </Screen>
  )
}
