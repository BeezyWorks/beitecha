import type { CalendarMonth } from '@beitecha/engine'

import type { PictureFrame, PicturePlacement } from './html'

/** A picture added for the calendar. It stays in this browser: it is never uploaded or sent anywhere. */
export interface BackImage {
  id: string
  name: string
  /** Width over height. */
  aspect: number
  /** The pixels of `url`, to tell how sharp it prints. */
  width: number
  height: number
  /** Sized for the print. */
  url: string
  /** Small, for the preview and the thumbnails, so they stay quick. */
  preview: string
}

export interface Crop {
  zoom: number
  cx: number
  cy: number
  rot: number
}

/** Everything about the calendar's pictures except their pixels, which live beside it (see `store.ts`). */
export interface PictureSettings {
  /** Picture ids, in the order they were put. */
  imageIds: string[]
  /** Month key (the month's first day) to the id of the picture on its page; a month not here has none. */
  matches: Record<string, string>
  /** How each picture is cropped, by its id; one not here fills its frame. */
  frames: Record<string, Crop>
  fit: 'cover' | 'contain'
  /** Where the months' pictures go; `none` leaves them off. */
  placement: PicturePlacement
  /** The picture reaches the page's top and the month's name is written over it. */
  titleOver: boolean
  front: boolean
  back: boolean
  coverId?: string
  backCoverId?: string
  coverTitle: string
  coverSubtitle: string
}

export const defaultPictureSettings: PictureSettings = {
  imageIds: [],
  matches: {},
  frames: {},
  fit: 'cover',
  placement: 'above',
  titleOver: false,
  front: false,
  back: false,
  coverTitle: '',
  coverSubtitle: '',
}

/** The picture each month has: the one put on its page (a picture that's gone is none). */
export const picturesForMonths = (
  months: Pick<CalendarMonth, 'start'>[],
  images: BackImage[],
  matches: Record<string, string>,
): (BackImage | undefined)[] => months.map((m) => images.find((i) => i.id === matches[m.start]))

/** An image's frame on the page: its crop, or filling the frame untouched. */
export const frameFor = (image: BackImage, crops: Record<string, Crop>): PictureFrame => ({
  id: image.id,
  aspect: image.aspect,
  ...(crops[image.id] ?? { zoom: 1, cx: 0.5, cy: 0.5, rot: 0 }),
})

/** Keeps what's well-formed of stored settings, and the defaults for the rest. */
export const parsePictureSettings = (raw: unknown): PictureSettings => {
  const d = defaultPictureSettings
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return d
  const r = raw as Record<string, unknown>
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const record = (v: unknown) =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.entries(v as object) : []
  const frames: Record<string, Crop> = {}
  for (const [id, c] of record(r.frames)) {
    const k = c as Partial<Crop>
    if (finite(k?.zoom) && finite(k.cx) && finite(k.cy) && finite(k.rot))
      frames[id] = { zoom: k.zoom, cx: k.cx, cy: k.cy, rot: k.rot }
  }
  return {
    imageIds: strings(r.imageIds),
    matches: Object.fromEntries(
      record(r.matches).filter(([, v]) => typeof v === 'string'),
    ) as Record<string, string>,
    frames,
    fit: r.fit === 'contain' ? 'contain' : 'cover',
    placement: r.placement === 'opposite' || r.placement === 'none' ? r.placement : 'above',
    titleOver: r.titleOver === true,
    front: r.front === true,
    back: r.back === true,
    coverId: typeof r.coverId === 'string' ? r.coverId : undefined,
    backCoverId: typeof r.backCoverId === 'string' ? r.backCoverId : undefined,
    coverTitle: typeof r.coverTitle === 'string' ? r.coverTitle : '',
    coverSubtitle: typeof r.coverSubtitle === 'string' ? r.coverSubtitle : '',
  }
}
