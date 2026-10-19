import React from 'react'
import { useWindowDimensions, View } from 'react-native'

/**
 * Lays `children` out on a fixed `width`×`height` canvas and scales it to fit
 * the window, so a display looks the same on a 720p TV and a 4K one.
 * `shift` nudges the canvas a few pixels to spare the panel burn-in.
 *
 * Raw View + transform because the DL has no scaling primitive; a candidate
 * for the design system if another app needs one.
 */
export function ScaleToFit({
  width,
  height,
  shift = { x: 0, y: 0 },
  children,
}: {
  width: number
  height: number
  shift?: { x: number; y: number }
  children: React.ReactNode
}) {
  const window = useWindowDimensions()
  const scale = Math.min(window.width / width, window.height / height)
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View
        style={{
          width,
          height,
          transform: [{ translateX: shift.x }, { translateY: shift.y }, { scale }],
        }}
      >
        {children}
      </View>
    </View>
  )
}
