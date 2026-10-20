import React, { useState } from 'react'
import { View } from 'react-native'

/**
 * Takes the space its row leaves it and shrinks `children` (one line of
 * text, say) until it fits, anchored at the bottom-left so it keeps the
 * row's baseline. Never grows it.
 *
 * Raw View + transform because the DL's Text has no fit-to-width; like
 * `ScaleToFit`, a candidate for the design system.
 */
export function ShrinkToFit({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState(0)
  const [natural, setNatural] = useState(0)
  const scale = room && natural > room ? room / natural : 1
  return (
    <View
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', overflow: 'hidden' }}
      onLayout={(e) => setRoom(e.nativeEvent.layout.width)}
    >
      {/* A row item that won't shrink lays out at its natural width, which is what we measure. */}
      <View
        style={{ flexShrink: 0, transform: [{ scale }], transformOrigin: 'left bottom' }}
        onLayout={(e) => setNatural(e.nativeEvent.layout.width)}
      >
        {children}
      </View>
    </View>
  )
}
