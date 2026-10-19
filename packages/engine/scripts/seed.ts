// Seeds the sample shul into a local `wrangler dev` (DEV_AUTH=1) as user dev-gabbai.
import { sampleSchedule, addDays, todayIn } from '../src/index'

const API = process.argv[2] ?? 'http://localhost:8787'
const headers = { 'content-type': 'application/json', authorization: 'Bearer dev-gabbai' }
const slug = 'demo'
const created = await fetch(`${API}/api/shuls`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    slug,
    profile: { name: { en: 'Congregation Ohr Chaim', he: 'קהילת אור חיים' }, city: 'Lakewood, NJ', address: '123 Forest Ave' },
    location: sampleSchedule.settings.location,
  }),
})
console.log('create', created.status)
const admin = await (await fetch(`${API}/api/shuls/${slug}/admin`, { headers })).json()
const today = todayIn(sampleSchedule.settings.location.timeZone)
const shabbos = addDays(today, (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7)
const schedule = {
  ...sampleSchedule,
  exceptions: [{ id: 'x1', date: shabbos, type: 'cancel', eventId: 'shiur', note: { en: 'The Rav is away this week' } }],
  notices: [
    { id: 'n1', kind: 'sponsor', from: shabbos, title: { en: 'Kiddush' }, text: { en: 'Sponsored by the Cohen family in honor of Sarah’s bas mitzvah' } },
    { id: 'n2', kind: 'sponsor', from: today, to: addDays(today, 6), title: { en: 'Daf Yomi' }, text: { en: 'This week’s learning is l’iluy nishmas Yaakov ben Avraham', he: 'לעילוי נשמת יעקב בן אברהם' } },
    { id: 'n3', kind: 'announcement', from: today, to: addDays(today, 6), title: { en: 'Clocks' }, text: { en: 'Clocks go back Sunday morning; Shacharis times change with them.' } },
  ],
}
const saved = await fetch(`${API}/api/shuls/${slug}`, { method: 'PUT', headers, body: JSON.stringify({ schedule, baseRevision: admin.revision }) })
console.log('save', saved.status)
