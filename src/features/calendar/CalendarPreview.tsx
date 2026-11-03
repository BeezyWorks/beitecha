import React from 'react'

import type { PictureFrame } from './html'

export interface CalendarPreviewProps {
  html: string
  title: string
  /** A picture was moved, zoomed or turned. */
  onFrame?: (frame: Pick<PictureFrame, 'id' | 'zoom' | 'cx' | 'cy'> & { rot: number }) => void
  /** An empty page was clicked, to add a picture to it. */
  onAdd?: (slot: string) => void
  /** Picture files were dropped on a page. */
  onDrop?: (slot: string, files: File[]) => void
  /** A page's picture was taken off. */
  onRemove?: (slot: string) => void
  /** The page the preview is changing to has loaded. */
  onLoaded?: () => void
}

// The frame's own backdrop is the document's (its pages sit on grey).
const frameStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  border: 0,
}

/** Where a page is scrolled to: the sheet at the top of the view and how far down it, so a changed page can be put back
 * at the same sheet even when sheets above it came or went. */
interface Anchor {
  key?: string
  within: number
  overall: number
}

const sheets = (win: Window) =>
  Array.from(win.document.querySelectorAll<HTMLElement>('.sheet[data-key]'))

const anchorOf = (win: Window): Anchor => {
  const root = win.document.documentElement
  const overall = win.scrollY / Math.max(1, root.scrollHeight)
  const top = sheets(win).find((el) => el.getBoundingClientRect().bottom > 0)
  if (!top) return { within: 0, overall }
  const rect = top.getBoundingClientRect()
  return { key: top.dataset.key, within: -rect.top / Math.max(1, rect.height), overall }
}

const restoreTo = (win: Window, anchor: Anchor) => {
  const target = sheets(win).find((el) => el.dataset.key === anchor.key)
  if (target) {
    const rect = target.getBoundingClientRect()
    win.scrollTo(0, win.scrollY + rect.top + anchor.within * rect.height)
  } else {
    win.scrollTo(0, anchor.overall * win.document.documentElement.scrollHeight)
  }
}

/**
 * The calendar as it will print, in a frame that fills its pane. A change is loaded into a second frame behind the
 * first, and swapped in once it is ready and scrolled to the same sheet, so the page never flashes back to the top
 * while it rebuilds.
 */
export function CalendarPreview({
  html,
  title,
  onFrame,
  onLoaded,
  onAdd,
  onDrop,
  onRemove,
}: CalendarPreviewProps) {
  const frames = [React.useRef<HTMLIFrameElement>(null), React.useRef<HTMLIFrameElement>(null)]
  const [docs, setDocs] = React.useState<[string, string]>([html, ''])
  // A frame handed a page it already holds fires no load, so each page it is given is a new frame.
  const [versions, setVersions] = React.useState<[number, number]>([0, 0])
  const [shown, setShown] = React.useState(0)
  const shownRef = React.useRef(0)
  shownRef.current = shown
  const docsRef = React.useRef(docs)
  docsRef.current = docs
  const onLoadedRef = React.useRef(onLoaded)
  onLoadedRef.current = onLoaded

  // Anything new goes into the frame that isn't showing.
  React.useEffect(() => {
    const next = 1 - shownRef.current
    if (html === docsRef.current[shownRef.current]) {
      // Back to what is showing: drop whatever was loading instead.
      if (docsRef.current[next]) {
        setDocs((current) => (shownRef.current ? ['', current[1]] : [current[0], '']))
        onLoadedRef.current?.()
      }
      return
    }
    setVersions((current) => {
      const copy: [number, number] = [...current]
      copy[next] += 1
      return copy
    })
    setDocs((current) => {
      const copy: [string, string] = [...current]
      copy[next] = html
      return copy
    })
  }, [html])

  const latest = React.useRef({ onFrame, onAdd, onDrop, onRemove })
  latest.current = { onFrame, onAdd, onDrop, onRemove }

  // The preview page reports a picture's new framing once a gesture ends, and clicks, drops and removals on its pages.
  React.useEffect(() => {
    const listen = (e: MessageEvent) => {
      const d = e.data
      if (!frames.some((f) => e.source === f.current?.contentWindow) || typeof d?.type !== 'string')
        return
      const { onFrame: frame, onAdd: add, onDrop: drop, onRemove: remove } = latest.current
      if (d.type === 'calendar-frame')
        frame?.({ id: d.id, zoom: d.zoom, cx: d.cx, cy: d.cy, rot: d.rot })
      else if (d.type === 'calendar-add') add?.(d.slot)
      else if (d.type === 'calendar-drop') drop?.(d.slot, d.files)
      else if (d.type === 'calendar-remove') remove?.(d.slot)
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
    // The refs never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loaded = (index: number) => {
    const win = frames[index].current?.contentWindow
    if (!win) return
    if (index !== shownRef.current) {
      const before = frames[shownRef.current].current?.contentWindow
      if (before) restoreTo(win, anchorOf(before))
      setShown(index)
    }
    onLoadedRef.current?.()
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {[0, 1].map((index) => (
        <iframe
          key={`${index}-${versions[index]}`}
          ref={frames[index]}
          title={index === shown ? title : undefined}
          aria-hidden={index !== shown}
          srcDoc={docs[index]}
          onLoad={() => docs[index] && loaded(index)}
          style={{
            ...frameStyle,
            opacity: index === shown ? 1 : 0,
            pointerEvents: index === shown ? 'auto' : 'none',
          }}
        />
      ))}
    </div>
  )
}
