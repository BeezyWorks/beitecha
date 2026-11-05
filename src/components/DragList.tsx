import { SemanticColor, useColorResolver } from '@beezyworks/design'
import React, { useState } from 'react'

/**
 * A list whose rows are reordered by dragging (web). `onMove(from, to)` gets the row's old index and
 * the index it should end up at. A line shows where it will land.
 */
export function DragList({
  children,
  onMove,
  locked,
}: {
  children: React.ReactNode[]
  onMove: (from: number, to: number) => void
  /** Rows that can't be dragged (say, one being edited, whose text fields need the mouse). */
  locked?: (i: number) => boolean
}) {
  const resolve = useColorResolver()
  const [from, setFrom] = useState<number | null>(null)
  // The gap the dragged row is over: 0 is before the first row, n after the last.
  const [gap, setGap] = useState<number | null>(null)
  const line = `2px solid ${resolve(SemanticColor.TextAccent)}`
  const end = () => {
    setFrom(null)
    setGap(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {children.map((child, i) => (
        <div
          key={i}
          draggable={!locked?.(i)}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(i))
            setFrom(i)
          }}
          onDragOver={(e) => {
            if (from === null) return
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            setGap(e.clientY < r.top + r.height / 2 ? i : i + 1)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (from !== null && gap !== null) {
              const to = gap > from ? gap - 1 : gap
              if (to !== from) onMove(from, to)
            }
            end()
          }}
          onDragEnd={end}
          style={{
            cursor: locked?.(i) ? undefined : 'grab',
            opacity: from === i ? 0.5 : 1,
            borderTop: gap === i && from !== null ? line : '2px solid transparent',
            borderBottom:
              i === children.length - 1 && gap === children.length && from !== null
                ? line
                : '2px solid transparent',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}
