import type {
  DateString,
  Localized,
  OccasionKind,
  OccasionSettings,
  UpcomingOccasion,
  UpcomingYahrzeit,
  Yahrzeit,
  YahrzeitNames,
  YahrzeitSettings,
} from '@beitecha/engine'

import { makeT } from './language'

type T = ReturnType<typeof makeT>
const HE = makeT('he')

/** One line of a remembered list: someone's names and the day they come up. */
export interface RememberedEntry {
  key: string
  person: Pick<Yahrzeit, 'hebrewName' | 'displayName'>
  date: DateString
  when: (t: T) => string
}

/**
 * Yahrzeits, birthdays and anniversaries all show the same way, a titled list of names with a day: this is the one
 * shape every surface (the display, the bulletin) draws, whatever the list is of.
 */
export interface RememberedList {
  key: string
  /** The shul's own heading. */
  title?: Localized
  names?: YahrzeitNames
  defaultTitle: (t: T) => string
  defaultHe: string
  items: RememberedEntry[]
}

export function yahrzeitList(
  items: UpcomingYahrzeit[],
  settings?: YahrzeitSettings,
): RememberedList {
  return {
    key: 'yahrzeits',
    title: settings?.title,
    names: settings?.names,
    defaultTitle: (t) => t.s.yahrzeits,
    defaultHe: HE.s.yahrzeits,
    items: items.map(({ date, yahrzeit }) => ({
      key: `${yahrzeit.id}-${date}`,
      person: yahrzeit,
      date,
      when: (t) => t.yahrzeitDate(date, settings?.dates),
    })),
  }
}

export function occasionList(
  kind: OccasionKind,
  items: UpcomingOccasion[],
  settings?: OccasionSettings,
): RememberedList {
  return {
    key: kind,
    title: settings?.title,
    names: settings?.names,
    defaultTitle: (t) => t.occasionTitle(kind),
    defaultHe: kind === 'birthday' ? HE.s.birthdays : HE.s.anniversaries,
    items: items.map(({ date, occasion, by }) => ({
      key: `${occasion.id}-${date}`,
      person: occasion,
      date,
      when: (t) => t.occasionDate(date, by),
    })),
  }
}

/** The heading in English (or the shul's language) and in Hebrew. */
export function rememberedHeading(t: T, list: RememberedList): { en: string; he?: string } {
  return list.title
    ? { en: list.title.en, he: list.title.he }
    : { en: list.defaultTitle(t), he: list.defaultHe }
}
