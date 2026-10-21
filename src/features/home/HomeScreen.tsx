import { Button, Card, SemanticColor, Stack, Text, TextField } from '@beezyworks/design'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Linking } from 'react-native'

import { Page } from '@/components/Page'
import { usePageTitle } from '@/components/PageTitle'
import { SignIn } from '@/features/account/SignIn'
import { useAccount } from '@/features/account/store'
import { api, type MyShul } from '@/lib/api'
import { siddurShulUrl } from '@/lib/config'

export function HomeScreen() {
  usePageTitle('Beitecha · Your shul’s times, everywhere')
  const { status, user, signOut } = useAccount()

  return (
    <Page>
      <Stack gap="sm" paddingTop="xl">
        <Text variant="displayMedium" color={SemanticColor.TextAccent}>
          Beitecha
        </Text>
        <Text variant="title" rtl align="left" color={SemanticColor.TextSecondary}>
          בשבתך בביתך ובלכתך בדרך
        </Text>
        <Text variant="bodySerifLarge">
          Your shul’s minyanim, shiurim and sponsors from one set of rules. Set them up once, and Beitecha works out
          every day’s times from the zmanim and the calendar. It puts them on the monitor in the lobby, on a page
          anyone can open by scanning a QR code, and in their calendar.
        </Text>
      </Stack>

      <FindShul />

      {status === 'signedIn' && user ? (
        <Stack gap="md">
          <Stack direction="row" align="center">
            <Text variant="sectionHeader">Your shuls</Text>
            <Stack grow />
            <Button variant="ghost" size="sm" title={`Sign out ${user.name}`} onPress={signOut} />
          </Stack>
          <MyShuls />
          <Button title="Add your shul" icon="add" onPress={() => router.push('/new')} />
        </Stack>
      ) : status === 'signedOut' ? (
        <Card gap="md">
          <Text variant="sectionHeader">For gabbaim</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Sign in with your Baderech account (the same one as the Siddur) to set up or manage a shul.
          </Text>
          <SignIn returnTo="/" />
        </Card>
      ) : null}
    </Page>
  )
}

function MyShuls() {
  const [shuls, setShuls] = useState<MyShul[] | null>(null)
  useEffect(() => {
    api.mine().then(setShuls, () => setShuls([]))
  }, [])
  if (!shuls) return null
  if (!shuls.length)
    return (
      <Text variant="body" color={SemanticColor.TextSecondary}>
        You don’t manage any shuls yet.
      </Text>
    )
  return (
    <Stack gap="sm">
      {shuls.map((s) => (
        <Card key={s.slug} direction="row" align="center" gap="md" onPress={() => router.push(`/${s.slug}/admin`)}>
          <Stack grow gap="xs">
            <Text variant="headline">{s.name.en}</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              /{s.slug} · {s.role === 'owner' ? 'Owner' : 'Editor'}
            </Text>
          </Stack>
          <Button variant="secondary" size="sm" title="Siddur page" onPress={() => Linking.openURL(siddurShulUrl(s.slug))} />
        </Card>
      ))}
    </Stack>
  )
}

function FindShul() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.directory>> | null>(null)
  useEffect(() => {
    if (q.trim().length < 2) return setResults(null)
    const t = setTimeout(() => api.directory(q.trim()).then(setResults, () => setResults([])), 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Stack gap="sm">
      <TextField variant="boxed" size="lg" placeholder="Find a shul" value={q} onChangeText={setQ} autoCorrect={false} />
      {results?.map((r) => (
        <Card key={r.slug} onPress={() => Linking.openURL(siddurShulUrl(r.slug))} gap="xs" paddingVertical={14}>
          <Text variant="headline">{r.name.en}</Text>
          {!!r.city && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {r.city}
            </Text>
          )}
        </Card>
      ))}
      {results && !results.length && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          No listed shuls match. A shul’s gabbai can also share its link or QR code directly.
        </Text>
      )}
    </Stack>
  )
}
