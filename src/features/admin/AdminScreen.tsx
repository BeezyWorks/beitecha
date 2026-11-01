import { Button, SemanticColor, Stack, Text, useIsWideLayout } from '@beezyworks/design'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect } from 'react'
import { Linking, Platform, useWindowDimensions } from 'react-native'

import { Centered } from '@/components/Centered'
import { Page } from '@/components/Page'
import { usePageTitle } from '@/components/PageTitle'
import { Select } from '@/components/Select'
import { SignIn } from '@/features/account/SignIn'
import { useAccount } from '@/features/account/store'
import { useShulClock } from '@/features/luach/useShulClock'
import { siddurShulUrl } from '@/lib/config'
import { CalendarTab } from './CalendarTab'
import { CholimTab } from './CholimTab'
import { YahrzeitsTab } from './YahrzeitsTab'
import { DisplaySection } from './DisplaySection'
import { EventsSection } from './EventsSection'
import { NoticesTab } from './NoticesTab'
import { PrintSection } from './PrintSection'
import { isSection, SECTIONS, type SectionKey } from './sections'
import { ShulTab } from './ShulTab'
import { Sidebar } from './Sidebar'
import { useAdmin } from './store'
import { TeamTab } from './TeamTab'
import { ThisWeekSection } from './ThisWeekSection'
import { ZmanimSection } from './ZmanimSection'

/** Where gabbaim set up and maintain their shul. */
export function AdminScreen({ slug }: { slug: string }) {
  const status = useAccount((s) => s.status)
  const { load, loaded, loadError, schedule, profile, dirty, save, saveError, persist, discard, editing } = useAdmin()
  const params = useLocalSearchParams<{ s?: string }>()
  const section: SectionKey = isSection(params.s) ? params.s : 'week'
  const wide = useIsWideLayout()
  const { height } = useWindowDimensions()
  const { today } = useShulClock(schedule?.settings.location.timeZone, 60_000)
  usePageTitle(profile ? `${profile.name.en} · Manage · Beitecha` : 'Manage · Beitecha')

  useEffect(() => {
    if (status === 'signedIn') load(slug)
  }, [status, slug, load])

  // Don't lose unsaved edits to a closed tab.
  const unsaved = dirty || !!editing?.changed
  useEffect(() => {
    if (Platform.OS !== 'web' || !unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  if (status === 'unknown') return <Centered loading />
  if (status === 'signedOut')
    return (
      <Page>
        <SignIn returnTo={`/${slug}/admin`} reason="Sign in to manage this shul." />
      </Page>
    )
  if (loadError?.status === 403)
    return <Centered title="Not on the team" body="You’re signed in, but not as a gabbai of this shul. Ask its owner for an invitation." />
  if (loadError?.status === 404) return <Centered title="No such shul" body={`Nothing lives at /${slug}.`} />
  if (loadError) return <Centered title="Couldn’t load" body={loadError.message} />
  if (!loaded || !schedule || !profile || loaded.slug !== slug) return <Centered loading />

  const go = (s: SectionKey) => {
    if (s === section) return
    // An open event with changes would be lost on the way out.
    if (editing?.changed && Platform.OS === 'web' && !window.confirm(`Drop your changes to ${editing.event.name.en || 'this'}?`)) return
    useAdmin.setState({ editing: null })
    router.setParams({ s })
  }
  const statusText =
    save === 'saving' ? 'Saving…' : save === 'error' || save === 'conflict' ? 'Not saved' : save === 'saved' ? 'Saved · displays update within 5 minutes' : 'All saved'

  const body = (
    <>
      {section === 'week' && <ThisWeekSection today={today} onSection={go} />}
      {section === 'minyanim' && <EventsSection kind="tefila" today={today} />}
      {section === 'shiurim' && <EventsSection kind="shiur" today={today} />}
      {section === 'programs' && <EventsSection kind="other" today={today} />}
      {section === 'events' && <CalendarTab today={today} />}
      {section === 'zmanim' && <ZmanimSection />}
      {section === 'notices' && <NoticesTab today={today} />}
      {section === 'cholim' && <CholimTab today={today} />}
      {section === 'yahrzeits' && <YahrzeitsTab today={today} />}
      {section === 'display' && <DisplaySection slug={slug} />}
      {section === 'print' && <PrintSection slug={slug} />}
      {section === 'shul' && <ShulTab />}
      {section === 'team' && <TeamTab />}
    </>
  )

  return (
    <Stack direction={wide ? 'row' : 'column'} height={Platform.OS === 'web' ? height : undefined} fill={Platform.OS !== 'web'} background={SemanticColor.SurfaceBackground}>
      {wide ? (
        <Sidebar
          shulName={profile.name.en}
          status={statusText}
          section={section}
          onSection={go}
          onSiddur={() => Linking.openURL(siddurShulUrl(slug))}
        />
      ) : (
        <Stack direction="row" align="center" gap="md" padding="md" background={SemanticColor.SurfaceSelected}>
          <Stack grow gap="none">
            <Text variant="headline" numberOfLines={1}>
              {profile.name.en}
            </Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {statusText}
            </Text>
          </Stack>
          <Select value={section} options={SECTIONS.map((s) => ({ value: s.key, label: s.label }))} onChange={(s) => go(s as SectionKey)} />
        </Stack>
      )}
      <Stack grow width={wide ? 0 : undefined} height={wide ? undefined : 0}>
        {save === 'conflict' && (
          <Stack direction="row" align="center" gap="md" padding="md" background={SemanticColor.AccentAlertFaded} wrap>
            <Text variant="body">Someone else saved changes while you were editing.</Text>
            <Stack grow />
            <Button variant="secondary" size="sm" title="Load theirs (drop mine)" onPress={discard} />
            <Button size="sm" title="Save mine over theirs" onPress={() => persist(true)} />
          </Stack>
        )}
        {save === 'error' && (
          <Stack direction="row" align="center" gap="md" padding="md" background={SemanticColor.AccentAlertFaded} wrap>
            <Stack grow>
              <Text variant="body">Couldn’t save: {saveError}</Text>
            </Stack>
            <Button size="sm" title="Try again" onPress={() => persist()} />
          </Stack>
        )}
        <Stack grow height={0}>
          {body}
        </Stack>
        {dirty && (
          <Stack
            direction="row"
            align="center"
            gap="md"
            paddingHorizontal="xl"
            paddingVertical="md"
            borderTopWidth="hairline"
            borderColor={SemanticColor.BorderDefault}
            background={SemanticColor.SurfaceCard}
          >
            <Stack grow>
              <Text variant="body">You have unsaved changes.</Text>
            </Stack>
            <Button variant="secondary" title="Cancel" onPress={discard} />
            <Button title="Save" loading={save === 'saving'} disabled={save === 'saving'} onPress={() => persist()} />
          </Stack>
        )}
      </Stack>
    </Stack>
  )
}
