import { type PrintSettings } from '@beitecha/engine'
import React from 'react'

import { PagedSheets, PrintSheet, type Paper } from '@/components/Print'
import {
  hasAnnouncements,
  NoticesSide,
  TimesSide,
  useNoticesParts,
  type WeekProps,
} from './WeekSheet'

/** Pages a sheet runs to when the shul hasn't said: the front, and a back when there are announcements. */
export const DEFAULT_PAGES = 2

/** How many pages the sheet may take (`Infinity` for no limit), and the text size, from the shul's print settings. */
export function printLayout(print: PrintSettings | undefined) {
  const pages = print?.pages
  return {
    maxPages: pages === 'unlimited' ? Infinity : Math.max(1, Math.floor(pages ?? DEFAULT_PAGES)),
    textSize: print?.textSize && print.textSize > 0 ? print.textSize : 1,
  }
}

/**
 * The week's sheets: one side when it's all one page (or all there is), else the times on the front and
 * the announcements behind, over as many more pages as the limit allows. Everything shrinks to its pages.
 */
export function PrintSheets({
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
  const oneSide = !hasAnnouncements(week) || maxPages === 1
  return (
    <>
      <PrintSheet paper={paper} rtl={rtl} scale={textSize}>
        <TimesSide {...week} withNotices={oneSide} />
      </PrintSheet>
      {!oneSide && maxPages === 2 && (
        <PrintSheet paper={paper} rtl={rtl} scale={textSize}>
          <NoticesSide {...week} />
        </PrintSheet>
      )}
      {!oneSide && maxPages !== 2 && (
        <PagedSheets
          paper={paper}
          rtl={rtl}
          scale={textSize}
          maxPages={Number.isFinite(maxPages) ? maxPages - 1 : undefined}
          {...parts}
        />
      )}
    </>
  )
}
