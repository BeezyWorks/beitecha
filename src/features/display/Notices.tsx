import { PageDots, SemanticColor, Stack, Text } from '@beezyworks/design'
import type {
  Choleh,
  Notice,
  NoticeCategory,
  UpcomingYahrzeit,
  YahrzeitSettings,
} from '@beitecha/engine'
import React from 'react'

import { makeT, useT } from '@/features/luach/language'
import { useRotation } from './Panels'

/** The refuah shleimah heading is in Hebrew whenever the page or its names are. */
const HE = makeT('he')
const HEBREW = /[\u0590-\u05FF]/
/** Refuah shleimah names on one page of the notice panel. */
const CHOLIM_PER_PAGE = 12
/** Yahrzeits on one page of the notice panel. */
const YAHRZEITS_PER_PAGE = 4

type Page =
  | { notice: Notice }
  | { cholim: Choleh[]; key: string }
  | { yahrzeits: UpcomingYahrzeit[]; key: string }

/** Sponsors, announcements, yahrzeits and the refuah shleimah list, taking turns; `height` fixed, or filling its place. */
export function NoticeRotator({
  height,
  notices,
  categories,
  cholim,
  yahrzeits,
  yahrzeitSettings,
}: {
  height?: number
  notices: Notice[]
  categories?: NoticeCategory[]
  cholim: Choleh[]
  yahrzeits: UpcomingYahrzeit[]
  yahrzeitSettings?: YahrzeitSettings
}) {
  const pages: Page[] = notices.map((notice) => ({ notice }))
  for (let at = 0; at < yahrzeits.length; at += YAHRZEITS_PER_PAGE)
    pages.push({ yahrzeits: yahrzeits.slice(at, at + YAHRZEITS_PER_PAGE), key: `yahrzeits-${at}` })
  for (let at = 0; at < cholim.length; at += CHOLIM_PER_PAGE)
    pages.push({ cholim: cholim.slice(at, at + CHOLIM_PER_PAGE), key: `cholim-${at}` })
  const i = useRotation(pages.length)
  if (!pages.length) return null
  const page = pages[i % pages.length]
  const dots = pages.length > 1 && <PageDots count={pages.length} index={i % pages.length} />
  if ('yahrzeits' in page)
    return (
      <YahrzeitsPage
        key={page.key}
        height={height}
        items={page.yahrzeits}
        settings={yahrzeitSettings}
        dots={dots}
      />
    )
  return 'notice' in page ? (
    <NoticePage height={height} n={page.notice} categories={categories} dots={dots} />
  ) : (
    <CholimPage key={page.key} height={height} cholim={page.cholim} dots={dots} />
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
      <Text variant="headerTitleWide" numberOfLines={3} color={SemanticColor.TextPrimary}>
        {t.text(n.text)}
      </Text>
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

function YahrzeitsPage({
  height,
  items,
  settings,
  dots,
}: {
  height?: number
  items: UpcomingYahrzeit[]
  settings?: YahrzeitSettings
  dots: React.ReactNode
}) {
  const t = useT()
  const hebrew = t.rtl || t.nameRtl
  const he = settings?.title ? settings.title.he : HE.s.yahrzeits
  const title = settings?.title ? t.text(settings.title) : hebrew ? HE.s.yahrzeits : t.s.yahrzeits
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
      {items.map(({ date, yahrzeit }) => (
        <Stack key={`${yahrzeit.id}-${date}`} direction="row" align="center" gap="md">
          <Stack grow width={0} direction="row" gap="md">
            {t.yahrzeitNames(yahrzeit, settings?.names).map((n) => (
              <Text key={n} variant="headline" numberOfLines={1} rtl={HEBREW.test(n)}>
                {n}
              </Text>
            ))}
          </Stack>
          <Text variant="headline" color={SemanticColor.TextSecondary}>
            {t.yahrzeitDate(date, settings?.dates)}
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
