import React from 'react'
import { View } from 'react-native'

/**
 * A fully black screen over everything, for a display that sleeps while the shul is quiet: on an OLED panel black
 * pixels are off, which no theme colour is.
 *
 * Raw View and colour because the design system's palette has no true black.
 */
export function Blackout() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: '#000',
      }}
    />
  )
}
