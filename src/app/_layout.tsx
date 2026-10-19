import { DesignFonts, SemanticColor, useColorResolver, useThemeMode } from '@beezyworks/design'
import { useFonts } from 'expo-font'
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect } from 'react'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'

import { ThemeRoot } from '@/components/ThemeRoot'
import { useAccount } from '@/features/account/store'

function RootNavigator() {
  const resolve = useColorResolver()
  const dark = useThemeMode() === 'dark'
  return (
    <ThemeProvider
      value={{
        dark,
        colors: {
          background: resolve(SemanticColor.SurfaceBackground),
          border: resolve(SemanticColor.BorderDefault),
          primary: resolve(SemanticColor.AccentPrimary),
          text: resolve(SemanticColor.TextPrimary),
          card: resolve(SemanticColor.SurfaceCard),
          notification: resolve(SemanticColor.AccentPrimary),
        },
        fonts: DefaultTheme.fonts,
      }}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(DesignFonts)
  const refresh = useAccount((s) => s.refresh)

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!fontsLoaded) return null

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeRoot>
        <RootNavigator />
      </ThemeRoot>
    </SafeAreaProvider>
  )
}
