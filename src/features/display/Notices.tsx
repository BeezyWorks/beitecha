import { PageDots, SemanticColor, Stack, Text } from '@beezyworks/design'
import type {
  Choleh,
  DaySchedule,
  Notice,
  NoticeCategory,
  OccasionKind,
  OccasionSettings,
  UpcomingOccasion,
  UpcomingYahrzeit,
  YahrzeitSettings,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { makeT, useT } from '@/features/luach/language'
import { SponsorName } from '@/features/luach/SponsorName'
import { occasionList, yahrzeitList, type RememberedList } from '@/features/luach/remembered'
import { hasSponsor, sponsorGroups, type SponsorGroup } from '@/features/luach/sponsorGroups'
import { useRotation } from './Panels'

/** The refuah shleimah heading is in Hebrew whenever the page or its names are. */
const HE = makeT('he')
const HEBREW = /[\u0590-\u05FF]/
/** Refuah shleimah names on one page of the notice panel. */
const CHOLIM_PER_PAGE = 12
/** Yahrzeits, birthdays or anniversaries on one page of the notice panel. */
const REMEMBERED_PER_PAGE = 4
/** Pixels a sponsors page spends besides its sponsors (padding, heading, dots, gaps). */
const SPONSOR_CHROME = 120
/** A sponsor's name, its dedication line under it (one line), and the gap after. */
const SPONSOR_NAME_H = 38
const SPONSOR_TEXT_H = 32

/** A sponsor group cut into pages that fit `room` pixels, so a long list never overruns its box. */
function sponsorPages(group: SponsorGroup, room: number, t: ReturnType<typeof useT>) {
  const avail = room - SPONSOR_CHROME
  const pages: SponsorGroup[] = []
  let cur: Notice[] = []
  let used = 0
  for (const n of group.sponsors) {
    const h = SPONSOR_NAME_H + (t.text(n.text) ? SPONSOR_TEXT_H : 0)
    if (cur.length && used + h > avail) {
      pages.push({ ...group, sponsors: cur })
      cur = []
      used = 0
    }
    cur.push(n)
    used += h
  }
  if (cur.length) pages.push({ ...group, sponsors: cur })
  return pages.map((g, i) => ({ ...g, key: `${group.key}-${i}` }))
}

type Page =
  | { notice: Notice }
  | { group: SponsorGroup }
  | { cholim: Choleh[]; key: string }
  | { remembered: RememberedList; key: string }

export interface OccasionList {
  kind: OccasionKind
  items: UpcomingOccasion[]
  settings?: OccasionSettings
}

/** Sponsors, announcements, yahrzeits and the refuah shleimah list, taking turns; `height` fixed, or filling its place. */
export function NoticeRotator({
  height,
  notices,
  categories,
  cholim,
  yahrzeits,
  yahrzeitSettings,
  occasions = [],
  days,
}: {
  height?: number
  /** The days the sponsored events are looked up in. */
  days: DaySchedule[]
  notices: Notice[]
  categories?: NoticeCategory[]
  cholim: Choleh[]
  yahrzeits: UpcomingYahrzeit[]
  yahrzeitSettings?: YahrzeitSettings
  /** Birthdays and anniversaries, each list with its own pages. */
  occasions?: OccasionList[]
}) {
  const t = useT()
  // A box that fills its place is measured, so the sponsors are paged to what it holds.
  const [room, setRoom] = useState(300)
  const groups = sponsorGroups(t, notices, days)
  const pages: Page[] = [
    ...groups.flatMap((g) =>
      sponsorPages(g, height ?? room, t).map((group) => ({
        group,
      })),
    ),
    ...notices.filter((n) => !hasSponsor(n)).map((notice) => ({ notice })),
  ]
  const lists = [
    yahrzeitList(yahrzeits, yahrzeitSettings),
    ...occasions.map(({ kind, items, settings }) => occasionList(kind, items, settings)),
  ]
  for (const list of lists)
    for (let at = 0; at < list.items.length; at += REMEMBERED_PER_PAGE)
      pages.push({
        remembered: { ...list, items: list.items.slice(at, at + REMEMBERED_PER_PAGE) },
        key: `${list.key}-${at}`,
      })
  for (let at = 0; at < cholim.length; at += CHOLIM_PER_PAGE)
    pages.push({ cholim: cholim.slice(at, at + CHOLIM_PER_PAGE), key: `cholim-${at}` })
  const i = useRotation(pages.length)
  if (!pages.length) return null
  const page = pages[i % pages.length]
  const dots = pages.length > 1 && <PageDots count={pages.length} index={i % pages.length} />
  let body: React.ReactNode
  if ('remembered' in page)
    body = <RememberedPage key={page.key} height={height} list={page.remembered} dots={dots} />
  else if ('group' in page)
    body = <SponsorsPage key={page.group.key} height={height} group={page.group} dots={dots} />
  else if ('notice' in page)
    body = <NoticePage height={height} n={page.notice} categories={categories} dots={dots} />
  else body = <CholimPage key={page.key} height={height} cholim={page.cholim} dots={dots} />
  return (
    <Stack
      height={height}
      grow={!height}
      onLayout={(e: { nativeEvent: { layout: { height: number } } }) =>
        setRoom(Math.round(e.nativeEvent.layout.height))
      }
    >
      {body}
    </Stack>
  )
}

function NoticePage({
  height,
  n,
  categories,
  dots,
}: {
  height?: number
  n: Notice
  categories?: NoticeCategory[]
  dots: React.ReactNode
}) {
  const t = useT()
  const sponsor = n.kind === 'sponsor'
  const when =
    n.to && n.to !== n.from ? `${t.dateShort(n.from)} – ${t.dateShort(n.to)}` : t.dateShort(n.from)
  return (
    <Stack
      key={n.id}
      height={height}
      grow={!height}
      radius="xl"
      padding="lg"
      gap="sm"
      background={sponsor ? SemanticColor.AccentTint : SemanticColor.SurfaceCard}
      borderWidth={1}
      borderColor={sponsor ? SemanticColor.AccentTintSelected : SemanticColor.BorderDefault}
    >
      <Stack direction="row" align="center" gap="sm">
        <Text variant="title" color={SemanticColor.TextAccent}>
          {t.noticeTag(n, categories)}
          {n.title ? ` · ${t.text(n.title)}` : ''}
        </Text>
        <Stack grow />
        <Text variant="headline" color={SemanticColor.TextSecondary}>
          {when}
        </Text>
      </Stack>
      {!!t.text(n.text) && (
        <Text variant="headerTitleWide" numberOfLines={3} color={SemanticColor.TextPrimary}>
          {t.text(n.text)}
        </Text>
      )}
      {t.bothNames && !!n.text.he && (
        <Text variant="pageHeader" rtl numberOfLines={2} color={SemanticColor.TextSecondary}>
          {n.text.he}
        </Text>
      )}
      <Stack grow />
      {dots}
    </Stack>
  )
}

/** Everyone sponsoring the same thing on one page: their names in bold, each dedication under its name. */
function SponsorsPage({
  height,
  group,
  dots,
}: {
  height?: number
  group: SponsorGroup
  dots: React.ReactNode
}) {
  const t = useT()
  return (
    <Stack
      height={height}
      grow={!height}
      radius="xl"
      padding="lg"
      gap="sm"
      background={SemanticColor.AccentTint}
      borderWidth={1}
      borderColor={SemanticColor.AccentTintSelected}
    >
      <Text variant="title" color={SemanticColor.TextAccent}>
        {group.title}
      </Text>
      {group.sponsors.map((n) => (
        <Stack key={n.id} gap="none">
          <SponsorName notice={n} variant="headerTitleWide" color={SemanticColor.TextPrimary} />
          {!!t.text(n.text) && (
            <Text variant="titleLarge" numberOfLines={1} color={SemanticColor.TextPrimary}>
              {t.text(n.text)}
            </Text>
          )}
        </Stack>
      ))}
      <Stack grow />
      {dots}
    </Stack>
  )
}

function RememberedPage({
  height,
  list,
  dots,
}: {
  height?: number
  list: RememberedList
  dots: React.ReactNode
}) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  const he = list.title ? list.title.he : list.defaultHe
  const title = list.title ? t.text(list.title) : hebrew ? list.defaultHe : list.defaultTitle(t)
  return (
    <Stack
      height={height}
      grow={!height}
      radius="xl"
      padding="lg"
      gap="sm"
      background={SemanticColor.SurfaceCard}
      borderWidth={1}
      borderColor={SemanticColor.BorderDefault}
    >
      <Stack direction="row" align="center" gap="sm">
        <Text variant="title" rtl={hebrew && HEBREW.test(title)} color={SemanticColor.TextAccent}>
          {title}
        </Text>
        <Stack grow />
        {!hebrew && t.bothNames && !!he && he !== title && (
          <Text variant="title" rtl color={SemanticColor.TextSecondary}>
            {he}
          </Text>
        )}
      </Stack>
      {list.items.map((item) => (
        <Stack key={item.key} direction="row" align="center" gap="md">
          <Stack grow width={0} direction="row" gap="md">
            {t.yahrzeitNames(item.person, list.names).map((n) => (
              <Text key={n} variant="headline" numberOfLines={1} rtl={HEBREW.test(n)}>
                {n}
              </Text>
            ))}
          </Stack>
          <Text variant="headline" color={SemanticColor.TextSecondary}>
            {item.when(t)}
          </Text>
        </Stack>
      ))}
      <Stack grow />
      {dots}
    </Stack>
  )
}

function CholimPage({
  height,
  cholim,
  dots,
}: {
  height?: number
  cholim: Choleh[]
  dots: React.ReactNode
}) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  return (
    <Stack
      height={height}
      grow={!height}
      radius="xl"
      padding="lg"
      gap="sm"
      background={SemanticColor.SurfaceCard}
      borderWidth={1}
      borderColor={SemanticColor.BorderDefault}
    >
      <Stack direction="row" align="center" gap="sm">
        <Text variant="title" rtl={hebrew} color={SemanticColor.TextAccent}>
          {hebrew ? HE.s.refuahShleimah : t.s.refuahShleimah}
        </Text>
        <Stack grow />
        {!hebrew && t.bothNames && (
          <Text variant="title" rtl color={SemanticColor.TextSecondary}>
            {HE.s.refuahShleimah}
          </Text>
        )}
      </Stack>
      <Stack direction="row" wrap gap="md">
        {cholim.map((c) => {
          const name = t.choleh(c)
          return (
            <Text key={c.id} variant="headline" numberOfLines={1} rtl={HEBREW.test(name)}>
              {name}
            </Text>
          )
        })}
      </Stack>
      <Stack grow />
      {dots}
    </Stack>
  )
}
