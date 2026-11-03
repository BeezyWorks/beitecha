import type { CalendarPrintSettings } from '@beitecha/engine'

import { type BackImage, type PictureSettings, parsePictureSettings } from './pictures'

/** A calendar saved to a file: its choices and its pictures (print size), to keep, move to another browser or share
 * with another gabbai. The shul's own schedule isn't in it: the months, holidays and people are read fresh when it's
 * opened. */
export interface CalendarDraftFile {
  kind: 'beitecha-calendar'
  version: 1
  /** The first and last month shown, as their first days. */
  range?: { from: string; to: string }
  calendar: CalendarPrintSettings
  pictures: PictureSettings
  images: Pick<BackImage, 'id' | 'name' | 'aspect' | 'width' | 'height' | 'url'>[]
}

export const buildDraftFile = (
  calendar: CalendarPrintSettings,
  pictures: PictureSettings,
  images: BackImage[],
  range?: { from: string; to: string },
): CalendarDraftFile => ({
  kind: 'beitecha-calendar',
  version: 1,
  range,
  calendar,
  pictures,
  images: images.map(({ id, name, aspect, width, height, url }) => ({
    id,
    name,
    aspect,
    width,
    height,
    url,
  })),
})

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonEmpty = <T>(v: T[] | undefined) => (v?.length ? v : undefined)

/** The calendar's choices, keeping what's well-formed and dropping the rest. */
export const parseCalendarSettings = (raw: unknown): CalendarPrintSettings => {
  if (!isObject(raw)) return {}
  const pick = <T extends string>(v: unknown, allowed: readonly T[]) => allowed.find((a) => a === v)
  const flag = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
  const footers = isObject(raw.monthFooters)
    ? Object.fromEntries(Object.entries(raw.monthFooters).filter(([, v]) => typeof v === 'string'))
    : undefined
  return {
    basis: pick(raw.basis, ['civil', 'hebrew']),
    paper: pick(raw.paper, ['letter', 'a4', 'tabloid', 'a3']),
    orientation: pick(raw.orientation, ['portrait', 'landscape']),
    ink: pick(raw.ink, ['color', 'mono']),
    hiddenGroups: nonEmpty(
      strings(raw.hiddenGroups)?.filter(
        (g): g is NonNullable<CalendarPrintSettings['hiddenGroups']>[number] =>
          ['yomTov', 'cholHamoed', 'fast', 'minor', 'other', 'israeli', 'civil'].includes(g),
      ),
    ),
    hiddenHolidays: nonEmpty(strings(raw.hiddenHolidays)),
    parsha: flag(raw.parsha),
    clockChange: flag(raw.clockChange),
    omer: flag(raw.omer),
    restTimes: flag(raw.restTimes),
    fastTimes: flag(raw.fastTimes),
    dayZmanim: nonEmpty(strings(raw.dayZmanim)),
    restZmanim: nonEmpty(strings(raw.restZmanim)),
    events: nonEmpty(strings(raw.events)),
    oneTime: flag(raw.oneTime),
    yahrzeits: flag(raw.yahrzeits),
    birthdays: flag(raw.birthdays),
    anniversaries: flag(raw.anniversaries),
    hiddenPeople: nonEmpty(strings(raw.hiddenPeople)),
    footer: typeof raw.footer === 'string' && raw.footer ? raw.footer : undefined,
    monthFooters:
      footers && Object.keys(footers).length ? (footers as Record<string, string>) : undefined,
  }
}

export type OpenedDraft = Omit<CalendarDraftFile, 'images'> & {
  images: Pick<BackImage, 'id' | 'name' | 'aspect' | 'width' | 'height' | 'url'>[]
}

/** A draft read from a file's text, or `undefined` if it isn't one of ours. */
export const parseDraftFile = (text: string): OpenedDraft | undefined => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isObject(raw) || raw.kind !== 'beitecha-calendar' || raw.version !== 1) return undefined
  const images = (Array.isArray(raw.images) ? raw.images : []).flatMap((i) =>
    isObject(i) &&
    typeof i.id === 'string' &&
    typeof i.url === 'string' &&
    i.url.startsWith('data:image/') &&
    finite(i.aspect) &&
    i.aspect > 0 &&
    finite(i.width) &&
    finite(i.height)
      ? [
          {
            id: i.id,
            name: typeof i.name === 'string' ? i.name : 'Picture',
            aspect: i.aspect,
            width: i.width,
            height: i.height,
            url: i.url,
          },
        ]
      : [],
  )
  const have = new Set(images.map((i) => i.id))
  const pictures = parsePictureSettings(raw.pictures)
  const range =
    isObject(raw.range) && typeof raw.range.from === 'string' && typeof raw.range.to === 'string'
      ? { from: raw.range.from, to: raw.range.to }
      : undefined
  return {
    kind: 'beitecha-calendar',
    version: 1,
    range,
    calendar: parseCalendarSettings(raw.calendar),
    // A picture the file doesn't carry can't be placed.
    pictures: {
      ...pictures,
      imageIds: pictures.imageIds.filter((id) => have.has(id)),
      matches: Object.fromEntries(
        Object.entries(pictures.matches).filter(([, id]) => id === 'none' || have.has(id)),
      ),
      coverId: pictures.coverId && have.has(pictures.coverId) ? pictures.coverId : undefined,
      backCoverId:
        pictures.backCoverId && have.has(pictures.backCoverId) ? pictures.backCoverId : undefined,
    },
    images,
  }
}

/** Hands the browser a file to save. */
export const downloadText = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Asks for a file and reads its text; `undefined` if the chooser is closed without one. */
export const pickTextFile = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => resolve(await input.files?.[0]?.text())
    input.oncancel = () => resolve(undefined)
    input.click()
  })
