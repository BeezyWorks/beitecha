import type { Audience, DayTag, EventCategory, EventKind, Localized, NoticeKind, TefilaType, Weekday, ZmanId } from './types'

export const ZMAN_LABELS: Record<ZmanId, Localized> = {
  alos: { en: 'Alos HaShachar', he: 'עלות השחר' },
  misheyakir: { en: 'Misheyakir', he: 'משיכיר' },
  sunrise: { en: 'Netz (sunrise)', he: 'הנץ החמה' },
  sofZmanShmaMga: { en: 'Latest Shema (MGA)', he: 'סוף זמן ק״ש מג״א' },
  sofZmanShma: { en: 'Latest Shema (GRA)', he: 'סוף זמן ק״ש גר״א' },
  sofZmanTefilaMga: { en: 'Latest Shacharis (MGA)', he: 'סוף זמן תפילה מג״א' },
  sofZmanTefila: { en: 'Latest Shacharis (GRA)', he: 'סוף זמן תפילה גר״א' },
  chatzos: { en: 'Chatzos', he: 'חצות' },
  minchaGedola: { en: 'Mincha Gedola', he: 'מנחה גדולה' },
  minchaKetana: { en: 'Mincha Ketana', he: 'מנחה קטנה' },
  plag: { en: 'Plag HaMincha', he: 'פלג המנחה' },
  candleLighting: { en: 'Candle lighting', he: 'הדלקת נרות' },
  sunset: { en: 'Shkia (sunset)', he: 'שקיעה' },
  tzeis: { en: 'Tzeis HaKochavim', he: 'צאת הכוכבים' },
  havdalah: { en: 'Havdalah', he: 'הבדלה' },
}

/** The zmanim a luach shows by default; candle lighting and havdalah only on their days. */
export const DAILY_ZMANIM: ZmanId[] = [
  'alos',
  'misheyakir',
  'sunrise',
  'sofZmanShmaMga',
  'sofZmanShma',
  'sofZmanTefila',
  'chatzos',
  'minchaGedola',
  'plag',
  'sunset',
  'tzeis',
]

export function zmanimForDay(tags: DayTag[]): ZmanId[] {
  const list = [...DAILY_ZMANIM]
  if (tags.includes('erevShabbos') || tags.includes('erevYomTov')) list.splice(list.indexOf('sunset'), 0, 'candleLighting')
  if (tags.includes('motzeiShabbos') || tags.includes('motzeiYomTov')) list.push('havdalah')
  return list
}

export const TAG_LABELS: Record<DayTag, Localized> = {
  shabbos: { en: 'Shabbos', he: 'שבת' },
  erevShabbos: { en: 'Erev Shabbos', he: 'ערב שבת' },
  motzeiShabbos: { en: 'Motzei Shabbos', he: 'מוצאי שבת' },
  yomTov: { en: 'Yom Tov', he: 'יום טוב' },
  erevYomTov: { en: 'Erev Yom Tov', he: 'ערב יום טוב' },
  motzeiYomTov: { en: 'Motzei Yom Tov', he: 'מוצאי יום טוב' },
  cholHamoed: { en: 'Chol HaMoed', he: 'חול המועד' },
  roshChodesh: { en: 'Rosh Chodesh', he: 'ראש חודש' },
  fast: { en: 'Fast day', he: 'תענית' },
  chanukah: { en: 'Chanukah', he: 'חנוכה' },
  purim: { en: 'Purim', he: 'פורים' },
  noTachanun: { en: 'No Tachanun', he: 'אין תחנון' },
  selichos: { en: 'Selichos', he: 'סליחות' },
  aseresYemeiTeshuva: { en: 'Aseres Yemei Teshuva', he: 'עשרת ימי תשובה' },
  omer: { en: 'Sefiras HaOmer', he: 'ספירת העומר' },
  dst: { en: 'Daylight saving time', he: 'שעון קיץ' },
  legalHoliday: { en: 'Federal / bank holidays', he: 'חג מקומי' },
}

export const WEEKDAYS: Localized[] = [
  { en: 'Sunday', he: 'יום ראשון' },
  { en: 'Monday', he: 'יום שני' },
  { en: 'Tuesday', he: 'יום שלישי' },
  { en: 'Wednesday', he: 'יום רביעי' },
  { en: 'Thursday', he: 'יום חמישי' },
  { en: 'Friday', he: 'יום שישי' },
  { en: 'Shabbos', he: 'שבת קודש' },
]

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shab'] as const satisfies readonly string[]

export const weekdayShort = (d: Weekday) => WEEKDAY_SHORT[d]

export const KIND_LABELS: Record<EventKind, string> = { tefila: 'Minyan', shiur: 'Shiur', other: 'Event' }

export const TEFILA_LABELS: Record<TefilaType, string> = {
  shacharis: 'Shacharis',
  mincha: 'Mincha',
  maariv: 'Maariv',
  minchaMaariv: 'Mincha/Maariv',
}

export const CATEGORY_LABELS: Record<EventCategory, Localized> = {
  program: { en: 'Program', he: 'תוכנית' },
  meal: { en: 'Meal', he: 'סעודה' },
}

export const AUDIENCE_LABELS: Record<Audience, Localized> = {
  everyone: { en: 'Everyone', he: 'לכולם' },
  men: { en: 'Men', he: 'גברים' },
  women: { en: 'Women', he: 'נשים' },
  kids: { en: 'Kids', he: 'ילדים' },
  teens: { en: 'Teens', he: 'נוער' },
}

export const NOTICE_LABELS: Record<NoticeKind, Localized> = {
  sponsor: { en: 'Sponsored', he: 'בחסות' },
  announcement: { en: 'Announcement', he: 'הודעה' },
  reminder: { en: 'Reminder', he: 'תזכורת' },
  simcha: { en: 'Mazal tov', he: 'מזל טוב' },
  condolence: { en: 'Condolences', he: 'ניחום אבלים' },
}
