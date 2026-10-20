import { SemanticColor, useColorResolver } from '@beezyworks/design'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { View } from 'react-native'

export type Paper = 'a4' | 'letter'

/** Sheet sizes in CSS units, a hair short so rounding never spills a blank page. */
const PAPER: Record<Paper, { size: string; width: string; height: string }> = {
  a4: { size: 'A4', width: '210mm', height: 'calc(297mm - 1px)' },
  letter: { size: 'letter', width: '8.5in', height: 'calc(11in - 1px)' },
}

/** The sheet's own margin; the printer's is set to none so screen and paper match. */
const MARGIN = '11mm'

/**
 * A page of paper sheets: on screen, a scrolling pile over the app; in print, just the
 * sheets, one per page. The app's root is a fixed-height flex column that clips, so the
 * sheets are portalled straight into `<body>` and everything else is hidden when printing.
 *
 * Raw DOM and CSS because the DL has no print primitives (`@page`, page breaks); like
 * `ScaleToFit`, a candidate for the design system.
 */
export function PrintRoot({
  paper,
  toolbar,
  children,
}: {
  paper: Paper
  toolbar: React.ReactNode
  children: React.ReactNode
}) {
  const resolve = useColorResolver()
  const [host] = useState(() => document.createElement('div'))
  useEffect(() => {
    host.className = 'bt-print'
    document.body.appendChild(host)
    return () => host.remove()
  }, [host])
  const css = `
    @page { size: ${PAPER[paper].size} portrait; margin: 0 }
    .bt-print { position: fixed; inset: 0; z-index: 10; overflow: auto; background: ${resolve(SemanticColor.SurfaceBackground)} }
    .bt-print-sheets { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 16px 48px }
    .bt-sheet { box-sizing: border-box; padding: ${MARGIN}; display: flex; overflow: hidden; flex-shrink: 0;
      background: ${resolve(SemanticColor.SurfaceCard)}; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15) }
    @media print {
      body > :not(.bt-print), .bt-print-toolbar { display: none !important }
      html, body { height: auto !important; overflow: visible !important; background: none !important }
      .bt-print { position: static; overflow: visible; background: none }
      .bt-print-sheets { display: block; padding: 0 }
      .bt-sheet { box-shadow: none; break-after: page }
      .bt-sheet:last-child { break-after: auto }
      .bt-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
    }
  `
  return createPortal(
    <>
      <style>{css}</style>
      <div className="bt-print-toolbar">{toolbar}</div>
      <div className="bt-print-sheets">{children}</div>
    </>,
    host,
  )
}

/**
 * One side of paper. `children` lay out at the sheet's width and at least its height (so a
 * spacer can push a footer down); when they run longer, they're scaled down until they fit,
 * so a busy week still prints on one sheet.
 */
export function PrintSheet({
  paper,
  rtl,
  children,
}: {
  paper: Paper
  rtl?: boolean
  children: React.ReactNode
}) {
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  const [natural, setNatural] = useState(0)
  const [scale, setScale] = useState(1)

  // Only ever shrink: laid out wider, the content gets shorter and fits with room to spare.
  useEffect(() => {
    if (room && natural * scale > room.height + 0.5) setScale(room.height / natural)
  }, [room, natural, scale])

  return (
    <div
      className="bt-sheet"
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ width: PAPER[paper].width, height: PAPER[paper].height }}
    >
      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setRoom({ width, height })
          setScale(1)
        }}
      >
        {room && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              ...(rtl ? { right: 0 } : { left: 0 }),
              // A pixel short: the sheet's mm size lands on a fraction and would clip a right-hand border.
              width: room.width / scale - 1,
              minHeight: room.height / scale,
              transform: [{ scale }],
              transformOrigin: rtl ? 'top right' : 'top left',
            }}
            onLayout={(e) => setNatural(e.nativeEvent.layout.height)}
          >
            {children}
          </View>
        )}
      </View>
    </div>
  )
}

export const PAPERS: Paper[] = ['a4', 'letter']

/** Letter in the Americas, A4 everywhere else. */
export const paperFor = (timeZone: string): Paper =>
  timeZone.startsWith('America/') ? 'letter' : 'a4'
