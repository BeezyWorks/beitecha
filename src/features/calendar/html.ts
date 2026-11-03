/* eslint-disable no-restricted-syntax -- the ink of a printed page: white paper in any theme, so these aren't the app's colors */
import {
  type CalendarCell,
  type CalendarGroup,
  type CalendarMonth,
  type CalendarOptions,
  footerFor,
  isHolidayShown,
  type CalendarPrintSettings,
} from '@beitecha/engine'

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
  size: { width: string; height: string },
): string => {
  const cells = month.weeks
    .flat()
    .map((cell) => (cell ? renderCell(cell, page.options) : '<div class="cell empty"></div>'))
    .join('')
  const footer = footerFor(page.settings, month)
  return `<section class="sheet" style="width:${size.width};height:calc(${size.height} - 1px)">
<header><h1>${escapeHtml(month.title)}</h1><div class="sub"><bdi>${escapeHtml(month.subtitle)}</bdi></div></header>
<div class="grid heads">${page.weekdays.map((d) => `<div>${escapeHtml(d)}</div>`).join('')}</div>
<div class="grid days" style="grid-template-rows:repeat(${month.weeks.length},1fr)">${cells}</div>
${footer ? `<footer>${escapeHtml(footer)}</footer>` : ''}
</section>`
}

/**
 * The calendar as a document: a page for each month, sized to the paper so the browser prints it one to a sheet.
 * The type scales with the paper.
 */
export function renderCalendarHtml(page: CalendarPage): string {
  const { options: o } = page
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
`

  const rtl = page.rtl
  return `<!doctype html>
<html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<title>${escapeHtml(page.title)}</title>
<style>${css}</style></head>
<body>
${page.months.map((m) => renderMonth(m, page, size)).join('\n')}
</body></html>`
}
