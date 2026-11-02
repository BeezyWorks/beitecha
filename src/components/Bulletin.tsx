import { SemanticColor, Stack, useColorResolver } from '@beezyworks/design'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

/** The brand for black-and-white ink: near-black, so headings and rules copy as plain black. */
const MONO_BRAND = '#1a1a1a'

/** The color the sheet is themed with: the shul's brand, or black ink only. */
export const bulletinBrand = (ink: 'color' | 'mono', brandColor?: string) =>
  ink === 'mono' ? MONO_BRAND : brandColor

/** A sheet measured for its fit but never shown or printed (is the whole week one side's worth?). */
const sheetCss = (resolve: (c: SemanticColor) => string) => `
    .bt-sheet { box-sizing: border-box; padding: ${MARGIN}; display: flex; overflow: hidden; flex-shrink: 0;
      background: ${resolve(SemanticColor.SurfaceCard)}; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15) }
    .bt-sheet-probe { position: absolute; visibility: hidden; pointer-events: none }`

/** Strikes through what's inside (a cancelled minyan); RN's `Text` has no line-through. */
export function Struck({ children }: { children: React.ReactNode }) {
  return <span style={{ textDecoration: 'line-through' }}>{children}</span>
}

/** A sheet's look, for a sheet shown outside `BulletinRoot` (the admin's small preview). */
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
export function BulletinRoot({
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
    host.className = 'bt-bulletin'
    document.body.appendChild(host)
    return () => host.remove()
  }, [host])
  const css = `
    @page { size: ${PAPER[paper].size} portrait; margin: 0 }
    .bt-bulletin { position: fixed; inset: 0; z-index: 10; overflow: auto; background: ${resolve(SemanticColor.SurfaceBackground)} }
    .bt-bulletin-sheets { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 24px 16px 48px }
    ${sheetCss(resolve)}
    @media print {
      body > :not(.bt-bulletin), .bt-bulletin-toolbar { display: none !important }
      html, body { height: auto !important; overflow: visible !important; background: none !important }
      .bt-bulletin { position: static; overflow: visible; background: none }
      .bt-bulletin-sheets { display: block; padding: 0 }
      .bt-sheet { box-shadow: none; break-after: page }
      .bt-sheet:last-child { break-after: auto }
      .bt-sheet-probe { display: none !important }
      .bt-bulletin * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
    }
  `
  return createPortal(
    <>
      <style>{css}</style>
      <div className="bt-bulletin-toolbar">{toolbar}</div>
      <div className="bt-bulletin-sheets">{children}</div>
    </>,
    host,
  )
}

/** How much bigger than the text size setting the content may grow to fill a sheet. */
const MAX_GROW = 1.4

/**
 * One side of paper. `children` lay out at the sheet's width and at least its height (so a
 * spacer can push a footer down), at the biggest scale that fits the sheet: scaled down from
 * `scale` when they run longer, and with `grow`, up to `MAX_GROW` times it when there's room to
 * spare, so a lighter week fills the page. `probe` lays it out unseen, for `onFit` alone.
 */
export function BulletinSheet({
  paper,
  rtl,
  scale: base = 1,
  grow,
  probe,
  onFit,
  children,
}: {
  paper: Paper
  rtl?: boolean
  /** How big the content starts out (the text size). */
  scale?: number
  grow?: boolean
  probe?: boolean
  /** The scale the content settled at. */
  onFit?: (scale: number) => void
  children: React.ReactNode
}) {
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  const [scale, setScale] = useState(base)
  const [settled, setSettled] = useState(false)
  const content = useRef<View>(null)
  // The bounds of the search for the biggest scale that fits: the biggest known to, the smallest known not to.
  const bounds = useRef({ fits: 0, over: Infinity, steps: 0 })
  const fitted = useRef('')
  const [round, setRound] = useState(0)
  const cap = grow ? base * MAX_GROW : base

  // Fonts that arrive late change the text's size: fit again once they have.
  useEffect(() => {
    if (document.fonts?.status === 'loaded') return
    document.fonts?.ready.then(() => setRound((r) => r + 1))
  }, [])

  // Laid out without a minimum height, so the height is the content's own; each step is measured before paint.
  useLayoutEffect(() => {
    const el = content.current as unknown as HTMLElement | null
    if (!room || !el) return
    const key = `${base}|${cap}|${room.width}|${room.height}|${round}`
    const b = bounds.current
    if (fitted.current !== key) {
      fitted.current = key
      bounds.current = { fits: 0, over: Infinity, steps: 0 }
      if (settled || scale !== base) {
        setSettled(false)
        setScale(base)
        return
      }
    } else if (settled) return
    const h = el.offsetHeight * scale
    if (h <= room.height + 0.5) b.fits = Math.max(b.fits, scale)
    else b.over = Math.min(b.over, scale)
    b.steps++
    const ratio = h > 0 ? room.height / h : 1
    let next: number | null
    if (b.fits === 0)
      next = b.steps > 24 || scale <= MIN_SCALE ? null : scale * Math.min(0.97, Math.sqrt(ratio))
    else if (b.over < Infinity)
      next = b.over / b.fits < 1.01 || b.steps > 24 ? null : (b.fits + b.over) / 2
    else
      next =
        b.fits >= cap - 0.001 || ratio < 1.02
          ? null
          : Math.min(cap, scale * Math.max(1.02, Math.sqrt(ratio)))
    if (next !== null) return setScale(next)
    const final = b.fits || scale
    if (final !== scale) setScale(final)
    setSettled(true)
    onFit?.(final)
  }, [room, scale, settled, base, cap, round])

  return (
    <div
      className={probe ? 'bt-sheet bt-sheet-probe' : 'bt-sheet'}
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ width: PAPER[paper].width, height: PAPER[paper].height }}
    >
      <View
        style={{ flex: 1, overflow: 'hidden' }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          setRoom({ width, height })
        }}
      >
        {room && (
          <View
            ref={content}
            style={{
              position: 'absolute',
              top: 0,
              ...(rtl ? { right: 0 } : { left: 0 }),
              // A pixel short: the sheet's mm size lands on a fraction and would clip a right-hand border.
              width: room.width / scale - 1,
              minHeight: settled ? room.height / scale : undefined,
              opacity: settled ? 1 : 0,
              transform: [{ scale }],
              transformOrigin: rtl ? 'top right' : 'top left',
            }}
          >
            {children}
          </View>
        )}
      </View>
    </div>
  )
}

/** The shul's logo on the sheet, at most `size` px high and wide, whatever its shape. */
export function Logo({ src, size }: { src: string; size: number }) {
  return (
    <img
      src={src}
      alt=""
      style={{ maxWidth: size * 2, maxHeight: size, objectFit: 'contain', flexShrink: 0 }}
    />
  )
}

/** Whether a header or footer set to show on `where` pages appears on page `page` of `count` (still unknown: undefined). */
export function bandShows(where: 'all' | 'first' | 'last' | 'off', page: number, count?: number) {
  return (
    where === 'all' || (where === 'first' && page === 1) || (where === 'last' && page === count)
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
 * A masthead, blocks, and a header and footer spread over as many sheets as the blocks take: each block goes
 * whole on the sheet it fits, the masthead first. `top` is the header for pages after the first (the masthead has
 * its own on page one) and `bottom` the footer, each on the pages `topWhere` / `bottomWhere` say, with room kept
 * for them. With `maxPages`, the content shrinks until it fits in that many, then grows (up to `MAX_GROW` times
 * `scale`) until one more would not; without, it stays at `scale`. Blocks are measured laid out off-screen first.
 */
export function PagedSheets({
  paper,
  rtl,
  scale: base = 1,
  maxPages,
  head,
  blocks,
  top,
  topWhere = 'off',
  bottom,
  bottomWhere = 'off',
}: {
  paper: Paper
  rtl?: boolean
  scale?: number
  maxPages?: number
  head: React.ReactNode
  blocks: { key: string; node: React.ReactNode }[]
  top?: React.ReactNode
  topWhere?: 'all' | 'first' | 'last' | 'off'
  bottom?: React.ReactNode
  bottomWhere?: 'all' | 'first' | 'last' | 'off'
}) {
  const [s, setS] = useState(base)
  const [sizes, setSizes] = useState<Measured | null>(null)
  const got = useRef<Measured>({ key: '', list: [] })
  // The biggest scale known to fit `maxPages`, and whether growing is over.
  const grown = useRef({ fits: 0, done: false })
  useEffect(() => {
    grown.current = { fits: 0, done: false }
    setS(base)
  }, [base, maxPages])

  const room = roomFor(paper)
  const key = `${s}|${paper}|${blocks.map((b) => b.key).join()}|${topWhere}|${bottomWhere}`
  const items = [head, ...blocks.map((b) => b.node)]
  // Measured with the rest: the header and footer, when there are any.
  const extras = [top, bottom].map((node) => node ?? null)
  const measuredNodes = [...items, ...extras.filter((n) => n !== null)]

  const pages = React.useMemo(() => {
    if (!sizes || sizes.key !== key || sizes.list.length !== measuredNodes.length) return null
    const { list } = sizes
    const gap = list.length > 1 ? Math.max(0, list[1].y - list[0].y - list[0].height) : 16
    const topH = top ? list[items.length].height + gap : 0
    const bottomH = bottom ? list[items.length + (top ? 1 : 0)].height + gap : 0
    const cap = room.height / s
    const reserve = (n: number) =>
      (n > 0 && topWhere === 'all' ? topH : 0) +
      (bottomWhere === 'all' || (bottomWhere === 'first' && n === 0) ? bottomH : 0)
    const out: number[][] = [[0]]
    const used = [list[0].height]
    for (let i = 1; i < items.length; i++) {
      const n = out.length - 1
      const page = out[n]
      if (used[n] + gap + list[i].height > cap - reserve(n) && page.length > 1) {
        out.push([i])
        used.push(list[i].height)
      } else {
        page.push(i)
        used[n] += gap + list[i].height
      }
    }
    // A footer on the last page only needs the room there, found once we know which page is last.
    const last = out.length - 1
    const lastPage = out[last]
    if (bottomWhere === 'last' && lastPage.length > 1 && used[last] + bottomH > cap)
      out.push([lastPage.pop()!])
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes, key])

  useEffect(() => {
    if (!pages || !maxPages) return
    const g = grown.current
    if (pages.length > maxPages) {
      if (g.fits) {
        g.done = true
        setS(g.fits)
      } else if (s > MIN_SCALE) setS(s * 0.93)
    } else if (!g.done) {
      g.fits = s
      if (s >= base * MAX_GROW - 0.001) g.done = true
      else setS(Math.min(base * MAX_GROW, s * 1.06))
    }
  }, [pages, maxPages, s])

  const measured =
    (i: number) => (e: { nativeEvent: { layout: { y: number; height: number } } }) => {
      if (got.current.key !== key) got.current = { key, list: [] }
      const { y, height } = e.nativeEvent.layout
      got.current.list[i] = { y, height }
      const list = got.current.list
      if (list.length === measuredNodes.length && list.every(Boolean))
        setSizes({ key, list: [...list] })
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
            {measuredNodes.map((node, i) => (
              <View key={i} onLayout={measured(i)}>
                {node}
              </View>
            ))}
          </Stack>
        </View>
      </View>
      {pages?.map((idx, n) => (
        <BulletinSheet key={`${n}|${s}`} paper={paper} rtl={rtl} scale={s}>
          <Stack grow gap="lg">
            {n > 0 && top && bandShows(topWhere, n + 1, pages.length) && top}
            {idx.map((i) => (
              <React.Fragment key={i}>{items[i]}</React.Fragment>
            ))}
            <Stack grow />
            {bottom && bandShows(bottomWhere, n + 1, pages.length) && bottom}
          </Stack>
        </BulletinSheet>
      ))}
    </>
  )
}
