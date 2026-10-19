import { computeRange, sampleSchedule, formatClock } from '../src/index'
const [from, n] = [process.argv[2], +process.argv[3]]
for (const d of computeRange(sampleSchedule, from, n)) {
  console.log(d.date, 'wd'+d.weekday, d.hebrew.en, d.tags.join(','), '|', d.holidays.map(h=>h.en).join(';'), '| parsha', d.parsha?.en)
  console.log('   z:', ['plag','candleLighting','sunset','havdalah'].map(k=>k+'='+formatClock((d.zmanim as any)[k])).join(' '))
  console.log('   ', d.events.map(e => `${e.eventId}=${e.minutes==null?'-':formatClock(e.minutes)}${e.cancelled?'(X)':''}${e.error?'!'+e.error:''}`).join(' '), d.notices.length? 'notices:'+d.notices.length:'')
}
