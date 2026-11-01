import { SemanticColor, Stack, useColorResolver } from '@beezyworks/design'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { View } from 'react-native'

export type Paper = 'a4' | 'letter'

/** Sheet sizes in CSS units, a hair short so rounding never spills a blank page. */
const PAPER: Record<Paper, { size: string; width: string; height: string }> = {
  a4: { size: 'A4', width: '210mm', height: 'calc(297mm - 1px)' },
  letter: { size: 'letter', width: '8.5in', height: 'calc(11in - 1px)' },
}

/** A sheet's size in CSS px (96 per inch), for laying out pages without a sheet to measure. */
export const SHEET_PX: Record<Paper, { width: number; height: number }> = {
  a4: { width: 793.7, height: 1122.5 },
  letter: { width: 816, height: 1056 },
}

/** The sheet's own margin; the printer's is set to none so screen and paper match. */
const MARGIN = '11mm'

const sheetCss = (resolve: (c: SemanticColor) => string) => `
    .bt-sheet { box-sizing: border-box; padding: ${MARGIN}; display: flex; overflow: hidden; flex-shrink: 0;
      background: ${resolve(SemanticColor.SurfaceCard)}; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15) }`

/** A sheet's look, for a sheet shown outside `PrintRoot` (the admin's small preview). */
export function SheetStyle() {
  const resolve = useColorResolver()
  return <style>{sheetCss(resolve)}</style>
}

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
    ${sheetCss(resolve)}
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
  scale: base = 1,
  children,
}: {
  paper: Paper
  rtl?: boolean
  /** How big the content starts out (the text size); it's still shrunk until it fits. */
  scale?: number
  children: React.ReactNode
}) {
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  const [natural, setNatural] = useState(0)
  const [scale, setScale] = useState(base)

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
          setScale(base)
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

const MARGIN_PX = (11 * 96) / 25.4
const MIN_SCALE = 0.4

/** What fits on a sheet inside its margins. */
const roomFor = (paper: Paper) => ({
  width: SHEET_PX[paper].width - 2 * MARGIN_PX,
  height: SHEET_PX[paper].height - 1 - 2 * MARGIN_PX,
})

interface Measured {
  key: string
  list: { y: number; height: number }[]
}

/**
 * A masthead, blocks and a footer spread over as many sheets as the blocks take: each block goes whole on
 * the sheet it fits, the masthead first and the footer last. With `maxPages`, the content shrinks until
 * it fits in that many; without, it stays at `scale`. Blocks are measured laid out off-screen first.
 */
export function PagedSheets({
  paper,
  rtl,
  scale: base = 1,
  maxPages,
  head,
  blocks,
  foot,
}: {
  paper: Paper
  rtl?: boolean
  scale?: number
  maxPages?: number
  head: React.ReactNode
  blocks: { key: string; node: React.ReactNode }[]
  foot: React.ReactNode
}) {
  const [s, setS] = useState(base)
  const [sizes, setSizes] = useState<Measured | null>(null)
  const got = useRef<Measured>({ key: '', list: [] })
  useEffect(() => setS(base), [base])

  const room = roomFor(paper)
  const key = `${s}|${paper}|${blocks.map((b) => b.key).join()}`
  const items = [head, ...blocks.map((b) => b.node), foot]

  const pages = React.useMemo(() => {
    if (!sizes || sizes.key !== key || sizes.list.length !== items.length) return null
    const { list } = sizes
    const gap = list.length > 1 ? Math.max(0, list[1].y - list[0].y - list[0].height) : 16
    const cap = room.height / s
    const out: number[][] = [[0]]
    let used = list[0].height
    for (let i = 1; i < list.length; i++) {
      const page = out[out.length - 1]
      if (used + gap + list[i].height > cap && page.length > 1) {
        out.push([i])
        used = list[i].height
      } else {
        page.push(i)
        used += gap + list[i].height
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes, key])

  useEffect(() => {
    if (pages && maxPages && pages.length > maxPages && s > MIN_SCALE) setS(s * 0.93)
  }, [pages, maxPages, s])

  const measured =
    (i: number) => (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
      if (got.current.key !== key) got.current = { key, list: [] }
      const { y, height } = e.nativeEvent.layout
      got.current.list[i] = { y, height }
      const list = got.current.list
      if (list.length === items.length && list.every(Boolean)) setSizes({ key, list: [...list] })
    }

  return (
    <>
      <View
        key={key}
        pointerEvents="none"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <View style={{ width: room.width / s - 1, opacity: 0 }}>
          <Stack gap="lg">
            {items.map((node, i) => (
              <View key={i} onLayout={measured(i)}>
                {node}
              </View>
            ))}
          </Stack>
        </View>
      </View>
      {pages?.map((idx, n) => (
        <PrintSheet key={`${n}|${s}`} paper={paper} rtl={rtl} scale={s}>
          <Stack grow gap="lg">
            {idx.map((i) => (
              <React.Fragment key={i}>
                {i === items.length - 1 && <Stack grow />}
                {items[i]}
              </React.Fragment>
            ))}
          </Stack>
        </PrintSheet>
      ))}
    </>
  )
}
