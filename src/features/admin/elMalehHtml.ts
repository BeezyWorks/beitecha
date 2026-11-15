import { makeT, type ElMalehShabbos, type Wording, type Yahrzeit } from '@beitecha/engine'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface ElMalehPage {
  shul: string
  /** What the sheet covers, e.g. "Next Shabbos". */
  range: string
  shabbosim: ElMalehShabbos[]
  language: 'en' | 'he'
}

/** The sheet: one heading per Shabbos (its parsha and date), the names said at El Maleh Rachamim under it. */
export function renderElMalehHtml({ shul, range, shabbosim, language }: ElMalehPage): string {
  const t: Wording = makeT(language)
  const he = language === 'he'
  const sections = shabbosim
    .map((s) => {
      const title = s.title ? (he ? (s.title.he ?? s.title.en) : s.title.en) : ''
      const names = s.names
        .map(({ yahrzeit, date }: { yahrzeit: Yahrzeit; date: string }) => {
          const lines = t.yahrzeitNames(yahrzeit, 'both').map(escapeHtml).join(' · ')
          return `<li><span class="n">${lines}</span><span class="d">${escapeHtml(t.yahrzeitDate(date))}</span></li>`
        })
        .join('')
      return `<section><h2>${escapeHtml(title)} <small>${escapeHtml(t.yahrzeitDate(s.date, 'english'))}</small></h2><ul>${names}</ul></section>`
    })
    .join('')
  const body = sections || '<p class="none">No names to say in this time.</p>'
  return `<!doctype html><html dir="${he ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>El Maleh Rachamim</title><style>
@page{margin:.75in}
body{font:16pt/1.5 Georgia,'Times New Roman',serif;color:#000;margin:0}
h1{font-size:20pt;margin:0 0 .1em}.sub{margin:0 0 1.2em;font-size:12pt;color:#333}
section{break-inside:avoid;margin:0 0 1.2em}
h2{font-size:17pt;margin:0 0 .3em;border-bottom:1.5px solid #000}h2 small{font-size:11pt;font-weight:normal}
ul{list-style:none;margin:0;padding:0}li{display:flex;justify-content:space-between;gap:1em;padding:.12em 0}
.d{font-size:11pt;color:#333;white-space:nowrap}.none{font-size:13pt}
</style></head><body><h1>${escapeHtml(he ? 'אל מלא רחמים' : 'El Maleh Rachamim')}</h1><p class="sub">${escapeHtml(shul)} · ${escapeHtml(range)}</p>${body}</body></html>`
}
