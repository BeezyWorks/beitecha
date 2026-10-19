import { DesignSystemProvider, HeaderTypeface } from '@beezyworks/design'
import React from 'react'
import { useColorScheme } from 'react-native'

import { brandFor } from '@/lib/brand'

/**
 * The DL theme. Shul pages pass the shul's brand color and may force a mode
 * (a monitor picks light or dark once, regardless of the TV's setting).
 */
export function ThemeRoot({
  children,
  brandColor,
  mode,
}: {
  children: React.ReactNode
  brandColor?: string
  mode?: 'light' | 'dark'
}) {
  const system = useColorScheme()
  return (
    <DesignSystemProvider
      mode={mode ?? (system === 'dark' ? 'dark' : 'light')}
      brand={brandFor(brandColor)}
      headerTypeface={HeaderTypeface.Cardo}
    >
      {children}
    </DesignSystemProvider>
  )
}
