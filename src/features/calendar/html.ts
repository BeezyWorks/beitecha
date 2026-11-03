/* eslint-disable no-restricted-syntax -- the ink of a printed page: white paper in any theme, so these aren't the app's colors */
import {
  type CalendarCell,
  type CalendarGroup,
  type CalendarMonth,
  type CalendarOptions,
  type CalendarPrintSettings,
  footerFor,
  isHolidayShown,
  monthTitles,
} from '@beitecha/engine'

import { FRAME_SCRIPT, MAX_ZOOM } from './frameScript'

export { MAX_ZOOM }

export type CalendarPaper = NonNullable<CalendarPrintSettings['paper']>
export type Orientation = NonNullable<CalendarPrintSettings['orientation']>

export const CALENDAR_PAPERS: CalendarPaper[] = ['letter', 'a4', 'tabloid', 'a3']

/** Page sizes, portrait, as CSS writes them and in inches (for scaling the type). */
export const PAPER_SIZES: Record<
  CalendarPaper,
  { width: string; height: string; inches: [number, number]; label: string }
> = {
  letter: { width: '8.5in', height: '11in', inches: [8.5, 11], label: 'Letter · 8.5 × 11 in' },
  a4: { width: '210mm', height: '297mm', inches: [8.27, 11.69], label: 'A4 · 210 × 297 mm' },
  tabloid: { width: '11in', height: '17in', inches: [11, 17], label: 'Tabloid · 11 × 17 in' },
  a3: { width: '297mm', height: '420mm', inches: [11.69, 16.54], label: 'A3 · 297 × 420 mm' },
}

/** The white border: what a home printer reaches on letter and A4, a safe distance from the trim on the big sheets. */
const marginFor = (paper: CalendarPaper) => (paper === 'letter' || paper === 'a4' ? 0.25 : 0.5)

export type PicturePlacement = 'above' | 'opposite'

/**
 * How a picture is cropped into its frame: zoomed in by `zoom` (1 fills the frame), looking at the point (`cx`,
 * `cy`), as fractions across and down the picture.
 */
export interface PictureFrame {
  id: string
  /** Width over height of the picture, as it is before turning. */
  aspect: number
  zoom: number
  cx: number
  cy: number
  /** Turned clockwise, in degrees; a quarter turn at a time. */
  rot?: number
}

export interface CalendarPictures {
  /** The picture for each month, by month, as a data URL; none leaves that space blank. */
  images: (string | undefined)[]
  /** How each of `images` is cropped (when it fills its frame); the preview lets them be dragged and zoomed. */
  frames?: (PictureFrame | undefined)[]
  fit: 'cover' | 'contain'
  /** On the month's own page, above its days, or on the back of the page before it, which hangs above the month once
   * that page is turned up. */
  placement: PicturePlacement
  /** With the picture above the days: it reaches the top of the page and the month's name is written over it. */
  titleOver?: boolean
}

/** A picture filling a whole cover, cropped by its frame. */
export interface CoverPicture {
  src: string
  frame?: PictureFrame
}

export interface CalendarCovers {
  /** The front cover leads the calendar (it always does with pictures on the opposite pages). */
  front: boolean
  /** The back cover is printed, blank without a picture. */
  back?: boolean
  /** The cover's own words, in place of the months it spans. */
  title?: string
  subtitle?: string
  image?: CoverPicture
  /** Behind the last month with pictures on the opposite pages, otherwise a sheet at the end. */
  backImage?: CoverPicture
}

export interface CalendarPage {
  title: string
  months: CalendarMonth[]
  /** Sunday first. */
  weekdays: string[]
  options: CalendarOptions
  /** The footer settings (a month's own, else the one for all). */
  settings: CalendarPrintSettings | undefined
  /** Right to left (the shul's language is Hebrew). */
  rtl: boolean
  pictures?: CalendarPictures
  covers?: CalendarCovers
  /** A screen preview: pages stacked with a gap, shrunk to this fraction of their size. Absent for the print. */
  previewScale?: number
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const RED = '#c4161c'
const INK: Record<CalendarGroup | 'event' | 'person', string> = {
  yomTov: '#1c4f9c',
  cholHamoed: '#1c4f9c',
  minor: '#8a5a00',
  fast: '#a02020',
  israeli: '#5b3a8a',
  civil: '#444444',
  other: '#444444',
  event: '#0b5d6b',
  person: '#1d7a46',
}

/** The size of a printed page in CSS px, for fitting a preview to a pane. */
export const pagePixels = (paper: CalendarPaper, orientation: Orientation) => {
  const [w, h] = PAPER_SIZES[paper].inches
  return orientation === 'landscape'
    ? { width: h * 96, height: w * 96 }
    : { width: w * 96, height: h * 96 }
}

type Size = { width: string; height: string }

const num = (n: number) => +n.toFixed(4)
const rotation = ({ rot = 0 }: PictureFrame) => ((rot % 360) + 360) % 360
/** Width over height of the picture once turned. */
const turnedAspect = (frame: PictureFrame) =>
  rotation(frame) % 180 ? 1 / frame.aspect : frame.aspect

const frameAttrs = (frame: PictureFrame | undefined, fit: string) =>
  frame && fit === 'cover'
    ? ` data-pic="${escapeHtml(frame.id)}" data-ar="${num(frame.aspect)}"`
    : ''

/** The picture, placed by its frame when it fills its box. */
const pictureImg = (src: string, frame: PictureFrame | undefined, fit: string) =>
  frame && fit === 'cover'
    ? `<img class="fr" data-rot="${rotation(frame)}" src="${escapeHtml(src)}" alt="" draggable="false" style="--ar:${num(turnedAspect(frame))};--z:${num(frame.zoom)};--cx:${num(frame.cx)};--cy:${num(frame.cy)}">`
    : `<img src="${escapeHtml(src)}" alt="">`

/** Zoom buttons over a picture, on screen only. */
const tools = (frame: PictureFrame | undefined, fit: string, page: CalendarPage) =>
  page.previewScale !== undefined && frame && fit === 'cover'
    ? '<div class="tools"><button data-act="out" title="Zoom out">−</button><button data-act="in" title="Zoom in">+</button><button data-act="rotate" title="Rotate">↻</button><button data-act="reset" title="Reset" class="wide">Reset</button></div>'
    : ''

const renderCell = (cell: CalendarCell, o: CalendarOptions): string => {
  const holidays = cell.holidays.filter((h) => isHolidayShown(h, o))
  const red = holidays.some((h) => h.marks)
  const line = (cls: string, text: string, group?: CalendarGroup | 'event' | 'person') =>
    `<div class="ln ${cls}"${group && o.ink === 'color' ? ` style="color:${INK[group]}"` : ''}>${escapeHtml(text)}</div>`
  const lines = [
    cell.parsha ? `<div class="parsha">${escapeHtml(cell.parsha)}</div>` : '',
    ...holidays.map((h) => line(`hol ${h.group}`, h.name, h.group)),
    cell.omer ? `<div class="omer">${escapeHtml(cell.omer)}</div>` : '',
    ...cell.events.map(
      (e) =>
        `<div class="ln ev"${o.ink === 'color' ? ` style="color:${INK.event}"` : ''}><span class="et">${escapeHtml(e.time)}</span> ${escapeHtml(e.name)}</div>`,
    ),
    ...cell.people.map(
      (p) =>
        `<div class="ln pe"${o.ink === 'color' ? ` style="color:${INK.person}"` : ''}><span class="pl">${escapeHtml(p.label)}</span> ${escapeHtml(p.text)}</div>`,
    ),
  ].join('')
  const times = cell.times
    .map(
      ({ label, time }) =>
        `<div class="tm"><span class="tl">${escapeHtml(label)}</span> <span class="tv">${escapeHtml(time)}</span></div>`,
    )
    .join('')
  return `<div class="cell${red ? ' red' : ''}${cell.shabbos ? ' shabbos' : ''}">
<div class="top"><span class="big">${escapeHtml(cell.primary)}</span><span class="small"><bdi>${escapeHtml(cell.secondary)}</bdi></span></div>
<div class="body">${lines}</div><div class="times">${times}</div></div>`
}

const renderMonth = (
  month: CalendarMonth,
  page: CalendarPage,
  size: Size,
  picture?: { src: string; fit: 'cover' | 'contain'; frame?: PictureFrame },
): string => {
  const cells = month.weeks
    .flat()
    .map((cell) => (cell ? renderCell(cell, page.options) : '<div class="cell empty"></div>'))
    .join('')
  const footer = footerFor(page.settings, month)
  const over = !!picture && !!page.pictures?.titleOver
  return `<section class="sheet${over ? ' over' : ''}" style="width:${size.width};height:calc(${size.height} - 1px)">
${
  picture
    ? `<div class="photo ${picture.fit}"${frameAttrs(picture.frame, picture.fit)}>${pictureImg(picture.src, picture.frame, picture.fit)}${tools(picture.frame, picture.fit, page)}</div>`
    : ''
}
<header><h1>${escapeHtml(month.title)}</h1><div class="sub"><bdi>${escapeHtml(month.subtitle)}</bdi></div></header>
<div class="grid heads">${page.weekdays.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}</div>
<div class="grid days" style="grid-template-rows:repeat(${month.weeks.length},1fr)">${cells}</div>
${footer ? `<footer>${escapeHtml(footer)}</footer>` : ''}
</section>`
}

const renderCover = (page: CalendarPage, size: Size) => {
  const first = page.months[0]
  const last = page.months[page.months.length - 1]
  const range = monthTitles(page.options.basis, first.start, last.end, page.rtl ? 'he' : 'en')
  const title = page.covers?.title || range.title
  const subtitle = page.covers?.subtitle ?? range.subtitle
  const image = page.covers?.image
  const picture = image
    ? `<div class="cvpic"${frameAttrs(image.frame, 'cover')}>${pictureImg(image.src, image.frame, 'cover')}${tools(image.frame, 'cover', page)}</div>`
    : ''
  return `<section class="sheet titlepage${image ? ' over' : ''}" style="width:${size.width};height:calc(${size.height} - 1px)">
${picture}<h1>${escapeHtml(title)}</h1>${subtitle ? `<div class="sub"><bdi>${escapeHtml(subtitle)}</bdi></div>` : ''}</section>`
}

const renderBack = (
  src: string | undefined,
  frame: PictureFrame | undefined,
  page: CalendarPage,
  fit: 'cover' | 'contain',
  size: Size,
) =>
  `<section class="sheet back ${fit}" style="width:${size.width};height:calc(${size.height} - 1px)"${src ? frameAttrs(frame, fit) : ''}>${src ? pictureImg(src, frame, fit) + tools(frame, fit, page) : ''}</section>`

/**
 * The calendar as a document: a page for each month (and, when there are pictures, the page behind it), sized to the
 * paper so the browser prints it one to a sheet. The type scales with the paper.
 */
export function renderCalendarHtml(page: CalendarPage): string {
  const { options: o, pictures, covers } = page
  const w0 = PAPER_SIZES[o.paper].width
  const h0 = PAPER_SIZES[o.paper].height
  const size = o.orientation === 'landscape' ? { width: h0, height: w0 } : { width: w0, height: h0 }
  const [w, h] = PAPER_SIZES[o.paper].inches
  // Type is sized to the short side of the sheet: 7.5pt on letter.
  const base = +((7.5 * Math.min(w, h)) / 8.5).toFixed(2)
  const pt = (k: number) => `${(base * k).toFixed(2)}pt`
  const face = `'Frank Ruhl Libre','Noto Serif Hebrew','Cardo',Georgia,'Times New Roman',serif`
  const color = o.ink === 'color'
  const ink = color
    ? { red: RED, line: '#b8b8b8', muted: '#555', shade: '#f1efe9' }
    : { red: 'black', line: '#777', muted: '#333', shade: '#ececec' }
  const preview = page.previewScale !== undefined
  const margin = marginFor(o.paper)

  const css = `
@page{size:${size.width} ${size.height};margin:0;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;background:${preview ? '#7d7d82' : 'white'};
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
body{font-family:${face};color:black;${
    preview
      ? `zoom:${page.previewScale};padding:12px 0;display:flex;flex-direction:column;align-items:center;gap:40px;`
      : ''
  }}
.sheet{position:relative;display:flex;flex-direction:column;overflow:hidden;background:white;padding:${margin}in;${
    preview
      ? 'box-shadow:0 2px 10px rgba(0,0,0,.45);flex:none;'
      : 'break-after:page;page-break-after:always;'
  }}
.sheet:last-child{break-after:auto;page-break-after:auto;}
header{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:${pt(0.5)};gap:12pt;}
h1,.sub{margin:0;font-size:${pt(3.6)};font-weight:700;line-height:1;}
.sub{color:${ink.muted};}
.grid{display:grid;grid-template-columns:repeat(7,1fr);}
.heads div{text-align:center;font-weight:700;font-size:${pt(1.1)};padding:${pt(0.35)} 0;border:0.6pt solid ${ink.line};${color ? `background:${ink.shade};` : ''}}
.days{flex:1;min-height:0;}
.cell{border:0.6pt solid ${ink.line};margin:-0.3pt;padding:${pt(0.3)} ${pt(0.45)};display:flex;flex-direction:column;overflow:hidden;min-width:0;}
.cell.empty{background:${ink.shade};}
.cell.shabbos{${color ? `background:${ink.shade};` : ''}}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:3pt;}
.big{font-size:${pt(2.4)};font-weight:700;line-height:1;}
.red .big{${color ? `color:${ink.red};` : 'background:black;color:white;border-radius:2pt;padding:0 2.5pt;'}}
.small{font-size:${pt(1.5)};color:${ink.muted};line-height:1;white-space:nowrap;}
.body{margin-top:${pt(0.3)};}
.omer{font-size:${base}pt;line-height:1.15;color:${ink.muted};font-style:italic;}
.parsha{font-weight:700;font-size:${pt(1.1)};line-height:1.15;}
.ln{font-size:${base}pt;line-height:1.15;margin-top:0.5pt;}
.hol{font-weight:600;}
.hol.fast{font-style:italic;}
.hol.israeli,.hol.civil,.hol.other{font-weight:400;}
.et{font-weight:700;font-variant-numeric:tabular-nums;}
.pe{${color ? '' : 'font-style:italic;'}}
.pl{font-weight:700;}
.times{margin-top:auto;padding-top:${pt(0.3)};}
.tm{font-size:${pt(0.95)};line-height:1.2;display:flex;justify-content:space-between;gap:3pt;color:black;}
.tl{color:${ink.muted};}
.tv{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;}
footer{padding-top:${pt(1)};font-size:${pt(1.3)};line-height:1.3;text-align:center;white-space:pre-wrap;color:${ink.muted};}
.photo,.back{container-type:size;}
.photo{position:relative;flex:0 0 ${o.orientation === 'landscape' ? 36 : 40}%;min-height:0;overflow:hidden;
  margin-bottom:${(base * 0.8).toFixed(2)}pt;}
${(() => {
  // The header leaves the flow, so the picture grows by its height to
  // reach the top of the page.
  const pad = (base * 1.6).toFixed(2)
  const head = (base * 4.1 + base * 1.6 * 2).toFixed(2)
  return `.over header{position:absolute;z-index:2;top:${margin}in;inset-inline:${margin}in;padding:${pad}pt;}
.over .photo{flex-basis:calc(${o.orientation === 'landscape' ? 36 : 40}% + ${head}pt);}
.over h1,.over .sub{color:black;-webkit-text-stroke:${(base * 1.2).toFixed(2)}pt white;paint-order:stroke fill;
  text-shadow:0 0 ${(base * 0.8).toFixed(2)}pt white;}`
})()}
.photo img:not(.fr){width:100%;height:100%;object-fit:cover;display:block;}
.photo.contain img{object-fit:contain;}
${
  preview
    ? `[data-pic]{cursor:grab;touch-action:none;user-select:none;}
[data-pic]:active{cursor:grabbing;}
.tools{position:absolute;top:6px;inset-inline-end:6px;display:flex;gap:4px;opacity:0;
  transition:opacity .15s;zoom:${+(1 / (page.previewScale || 1)).toFixed(3)};}
[data-pic]:hover .tools{opacity:1;}
.tools button{font:600 14px system-ui,sans-serif;width:28px;height:28px;border:0;border-radius:6px;
  background:rgba(0,0,0,.65);color:white;cursor:pointer;}
.tools button:hover{background:rgba(0,0,0,.85);}
.tools button.wide{width:auto;padding:0 8px;font-size:12px;}
.tools button:disabled{opacity:.35;cursor:default;background:rgba(0,0,0,.65);}`
    : ''
}
.pair{display:flex;flex-direction:column;gap:3px;}
.titlepage{align-items:center;justify-content:center;text-align:center;gap:${(base * 2).toFixed(2)}pt;}
.titlepage h1,.titlepage .sub{position:relative;z-index:2;pointer-events:none;}
.titlepage h1{font-size:${(base * 7).toFixed(2)}pt;}
.cvpic{position:absolute;inset:0;container-type:size;overflow:hidden;}
.titlepage .sub{font-size:${(base * 4).toFixed(2)}pt;}
.back{padding:0;align-items:center;justify-content:center;position:relative;}
.fr{position:absolute;max-width:none;
  --w:calc(max(100cqw,100cqh*var(--ar))*var(--z));--h:calc(var(--w)/var(--ar));
  --l:clamp(min(0px,100cqw - var(--w)),calc(50cqw - var(--cx)*var(--w)),max(0px,100cqw - var(--w)));
  --t:clamp(min(0px,100cqh - var(--h)),calc(50cqh - var(--cy)*var(--h)),max(0px,100cqh - var(--h)));
  width:var(--w);height:var(--h);left:var(--l);top:var(--t);}
.fr[data-rot="90"],.fr[data-rot="270"]{width:var(--h);height:var(--w);
  left:calc(var(--l) + var(--w)/2);top:calc(var(--t) + var(--h)/2);
  transform:translate(-50%,-50%) rotate(90deg);}
.fr[data-rot="270"]{transform:translate(-50%,-50%) rotate(270deg);}
.fr[data-rot="180"]{transform:rotate(180deg);}
.back.contain{padding:${margin * 1.5}in;}
.back img:not(.fr){width:100%;height:100%;object-fit:cover;display:block;}
.back.contain img{object-fit:contain;}
`

  const opposite = pictures?.placement === 'opposite'
  const backOf = (i: number) =>
    opposite
      ? renderBack(pictures?.images[i], pictures?.frames?.[i], page, pictures?.fit ?? 'cover', size)
      : ''
  const backCover =
    covers?.backImage || covers?.back
      ? renderBack(covers.backImage?.src, covers.backImage?.frame, page, 'cover', size)
      : ''
  const last = page.months.length - 1
  const sheets = page.months.map((month, i) => {
    if (!pictures) return renderMonth(month, page, size)
    if (!opposite) {
      const src = pictures.images[i]
      return renderMonth(
        month,
        page,
        size,
        src ? { src, fit: pictures.fit, frame: pictures.frames?.[i] } : undefined,
      )
    }
    // Opposite: a month's picture is on the back of the page before it, so a page's back carries the next month's
    // (the first month's is on the cover's); the last month's back is the back cover.
    return renderMonth(month, page, size) + (i < last ? backOf(i + 1) : backCover)
  })
  // The cover leads, its back behind the first month.
  const showCover = page.months.length > 0 && (!!covers?.front || opposite)
  const cover = showCover ? renderCover(page, size) + (opposite ? backOf(0) : '') : ''
  // Without a month to hang it behind, the back cover is a sheet of its own.
  const closing = opposite && page.months.length ? '' : backCover

  // On screen the pairs that hang together are shown together: each picture directly above the month it hangs over.
  const body =
    preview && opposite
      ? renderCover(page, size) +
        page.months
          .map(
            (month, i) => `<div class="pair">${backOf(i)}${renderMonth(month, page, size)}</div>`,
          )
          .join('\n') +
        backCover
      : `${cover}\n${sheets.join('\n')}\n${closing}`

  const rtl = page.rtl
  return `<!doctype html>
<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<title>${escapeHtml(page.title)}</title>
<style>${css}</style></head>
<body>
${body}
${preview && (pictures?.frames || covers?.image || covers?.backImage) ? `<script>${FRAME_SCRIPT}</script>` : ''}
</body></html>`
}
