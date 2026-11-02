import { type PrintSettings } from '@beitecha/engine'
import { Stack } from '@beezyworks/design'
import React, { useRef, useState } from 'react'

import { bandShows, PagedSheets, BulletinSheet, type Paper } from '@/components/Bulletin'
import { pagesOf } from './pages'
import {
  Footer,
  HeaderBand,
  hasAnnouncements,
  Masthead,
  sectionBlocks,
  TimesSide,
  useNoticesParts,
  type WeekProps,
} from './WeekSheet'

/** Pages a sheet runs to when the shul hasn't said: the front, and a back when there are announcements. */
export const DEFAULT_PAGES = 2

/** The announcements go on the front too when that still leaves the text this much of its size. */
const ONE_SIDE_MIN = 0.9

/** How many pages the sheet may take (`Infinity` for no limit), the text size and the ink, from the shul's print settings. */
export function bulletinLayout(print: PrintSettings | undefined) {
  const pages = print?.pages
  return {
    maxPages: pages === 'unlimited' ? Infinity : Math.max(1, Math.floor(pages ?? DEFAULT_PAGES)),
    textSize: print?.textSize && print.textSize > 0 ? print.textSize : 1,
    ink: print?.ink === 'mono' ? ('mono' as const) : ('color' as const),
  }
}

/**
 * The week's sheets: one side when it's all one page (or all there is), else the times on the front and
 * the announcements behind, over as many more pages as the limit allows. Everything shrinks to its pages,
 * and (but for unlimited pages) grows to fill them. At two pages, the announcements join the front if they fit
 * there with the text hardly smaller.
 */
export function BulletinSheets({
  week,
  paper,
  rtl,
  maxPages,
  textSize,
}: {
  week: WeekProps
  paper: Paper
  rtl?: boolean
  maxPages: number
  textSize: number
}) {
  const parts = useNoticesParts(week)
  if (week.layout)
    return (
      <ChosenSheets
        week={week}
        paper={paper}
        rtl={rtl}
        textSize={textSize}
        grow={Number.isFinite(maxPages)}
      />
    )
  // A different week (or edit) lays everything out afresh.
  const seen = useRef({ week, n: 0 })
  if (seen.current.week !== week) seen.current = { week, n: seen.current.n + 1 }
  const v = seen.current.n
  const grow = Number.isFinite(maxPages)
  const announcements = hasAnnouncements(week)
  // How big the text can be with everything on the front, measured unseen.
  const [probed, setProbed] = useState<{ v: number; scale: number } | null>(null)
  const probing = announcements && maxPages === 2
  const fit = probed?.v === v ? probed.scale : null
  const oneSide =
    !announcements || maxPages === 1 || (probing && fit !== null && fit >= ONE_SIDE_MIN * textSize)
  if (probing && fit === null)
    return (
      <BulletinSheet
        key={`probe|${v}`}
        probe
        grow
        paper={paper}
        rtl={rtl}
        scale={textSize}
        onFit={(scale) => setProbed({ v, scale })}
      >
        <TimesSide {...week} withNotices />
      </BulletinSheet>
    )
  return (
    <>
      {oneSide && (
        <BulletinSheet key={`front|${v}`} paper={paper} rtl={rtl} scale={textSize} grow={grow}>
          <TimesSide {...week} withNotices />
        </BulletinSheet>
      )}
      {!oneSide && (
        <PagedSheets
          key={`paged|${v}`}
          paper={paper}
          rtl={rtl}
          scale={textSize}
          maxPages={Number.isFinite(maxPages) ? maxPages : undefined}
          {...parts}
          head={<TimesSide {...week} withNotices={false} />}
        />
      )}
    </>
  )
}

/** The sheets of a layout the shul chose (`print.layout`): each page has the sections assigned to it, in order. */
function ChosenSheets({
  week,
  paper,
  rtl,
  textSize,
  grow,
}: {
  week: WeekProps
  paper: Paper
  rtl?: boolean
  textSize: number
  grow: boolean
}) {
  const blocks = sectionBlocks(week)
  const pages = pagesOf(
    week.layout ?? [],
    blocks.map((b) => b.key),
  )
  return (
    <>
      {pages.map((sections, i) => (
        <BulletinSheet key={i} paper={paper} rtl={rtl} scale={textSize} grow={grow}>
          <Stack grow gap="lg">
            {i === 0 ? (
              <Masthead {...week} pages={pages.length} />
            ) : (
              bandShows(week.header?.pages ?? 'first', i + 1, pages.length) && (
                <HeaderBand {...week} />
              )
            )}
            {sections.map((s) => (
              <React.Fragment key={s}>{blocks.find((b) => b.key === s)?.node}</React.Fragment>
            ))}
            <Stack grow />
            <Footer {...week} page={i + 1} pages={pages.length} />
          </Stack>
        </BulletinSheet>
      ))}
    </>
  )
}
