import { DesignSystemProvider, HeaderTypeface } from '@beezyworks/design'
import React from 'react'
import { useColorScheme } from 'react-native'

import { useAppearance } from '@/lib/appearance'
import { brandFor } from '@/lib/brand'

/**
 * The DL theme. Shul pages pass the shul's brand color and may force a mode
 * (a monitor picks light or dark once, regardless of the TV's setting); otherwise
 * it's the viewer's own choice, else the system's.
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
  const chosen = useAppearance((s) => s.appearance)
  const auto = system === 'dark' ? 'dark' : 'light'
  return (
    <DesignSystemProvider
      mode={mode ?? (chosen === 'auto' ? auto : chosen)}
      brand={brandFor(brandColor)}
      headerTypeface={HeaderTypeface.Cardo}
    >
      {children}
    </DesignSystemProvider>
  )
}
