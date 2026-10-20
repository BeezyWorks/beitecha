import { Button, Chip, Screen, ScrollStack, SemanticColor, Stack, Text, useIsWideLayout } from '@beezyworks/design'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Platform } from 'react-native'

import { Centered } from '@/components/Centered'
import { Page } from '@/components/Page'
import { usePageTitle } from '@/components/PageTitle'
import { SignIn } from '@/features/account/SignIn'
import { useAccount } from '@/features/account/store'
import { useShulClock } from '@/features/luach/useShulClock'
import { ChangesTab } from './ChangesTab'
import { EventsTab } from './EventsTab'
import { NoticesTab } from './NoticesTab'
import { Preview } from './Preview'
import { ShulTab } from './ShulTab'
import { useAdmin } from './store'
import { TeamTab } from './TeamTab'

type Tab = 'times' | 'changes' | 'sponsors' | 'shul' | 'team'

const TABS: { key: Tab; label: string }[] = [
  { key: 'times', label: 'Times' },
  { key: 'changes', label: 'This week' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'shul', label: 'Shul' },
  { key: 'team', label: 'Team & displays' },
]

/** Where gabbaim set up and maintain their shul. */
export function AdminScreen({ slug }: { slug: string }) {
  const status = useAccount((s) => s.status)
  const { load, loaded, loadError, schedule, profile, dirty, save, saveError, saveDraft, discard } = useAdmin()
  const [tab, setTab] = useState<Tab>('times')
  const wide = useIsWideLayout()
  const { today } = useShulClock(schedule?.settings.location.timeZone, 60_000)
  usePageTitle(profile ? `${profile.name.en} · Manage · Beitecha` : 'Manage · Beitecha')

  useEffect(() => {
    if (status === 'signedIn') load(slug)
  }, [status, slug, load])

  // Don't lose unsaved edits to a closed tab.
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

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

  const editor = (
    <Stack gap="lg">
      {tab === 'times' && <EventsTab />}
      {tab === 'changes' && <ChangesTab today={today} />}
      {tab === 'sponsors' && <NoticesTab today={today} />}
      {tab === 'shul' && <ShulTab />}
      {tab === 'team' && <TeamTab />}
    </Stack>
  )
  const showPreview = tab === 'times' || tab === 'shul'
  // On a wide screen the preview docks beside the (width-capped) editor column; each scrolls on its own.
  const aside =
    wide && showPreview ? (
      <Stack width={420} borderColor={SemanticColor.BorderDefault} background={SemanticColor.SurfaceCard}>
        <ScrollStack padding="lg" gap="md">
          <Text variant="sectionHeader">Preview</Text>
          <Preview schedule={schedule} today={today} />
        </ScrollStack>
      </Stack>
    ) : undefined

  return (
    <Screen aside={aside}>
      <Stack fill>
        <Stack
          direction="row"
          align="center"
          gap="md"
          paddingHorizontal="lg"
          paddingVertical="md"
          wrap
          borderBottomWidth="hairline"
          borderColor={SemanticColor.BorderDefault}
          background={SemanticColor.SurfaceCard}
        >
          <Stack gap="none">
            <Text variant="title">{profile.name.en}</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {save === 'saving'
                ? 'Saving…'
                : save === 'saved' && !dirty
                  ? 'Saved; displays update within 5 minutes'
                  : dirty
                    ? 'Unsaved changes'
                    : 'Up to date'}
            </Text>
          </Stack>
          <Stack grow />
          <Button variant="ghost" size="sm" title="Public page" icon="external-link" onPress={() => router.push(`/${slug}`)} />
          <Button variant="ghost" size="sm" title="Display" icon="external-link" onPress={() => router.push(`/${slug}/display`)} />
          {dirty && <Button variant="secondary" size="sm" title="Discard" onPress={discard} />}
          <Button size="sm" title="Save" disabled={!dirty || save === 'saving'} loading={save === 'saving'} onPress={() => saveDraft()} />
        </Stack>
        {save === 'conflict' && (
          <Stack direction="row" align="center" gap="md" padding="md" background={SemanticColor.AccentAlertFaded} wrap>
            <Text variant="body">Someone else saved changes while you were editing.</Text>
            <Stack grow />
            <Button variant="secondary" size="sm" title="Load theirs (drop mine)" onPress={discard} />
            <Button size="sm" title="Save mine over theirs" onPress={() => saveDraft(true)} />
          </Stack>
        )}
        {save === 'error' && (
          <Stack padding="md" background={SemanticColor.AccentAlertFaded}>
            <Text variant="body">
              {saveError}
            </Text>
          </Stack>
        )}
        <Stack direction="row" wrap gap="xs" paddingHorizontal="lg" paddingTop="md">
          {TABS.map((t) => (
            <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />
          ))}
        </Stack>
        <ScrollStack key={tab} padding="lg" gap="lg">
          {editor}
          {showPreview && !aside && (
            <Stack gap="md">
              <Text variant="sectionHeader">Preview</Text>
              <Preview schedule={schedule} today={today} />
            </Stack>
          )}
        </ScrollStack>
      </Stack>
    </Screen>
  )
}
