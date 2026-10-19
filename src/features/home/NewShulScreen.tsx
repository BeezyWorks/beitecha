import { Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import { router } from 'expo-router'
import React, { useState } from 'react'

import { Centered } from '@/components/Centered'
import { Field } from '@/components/Field'
import { Page } from '@/components/Page'
import { usePageTitle } from '@/components/PageTitle'
import { SignIn } from '@/features/account/SignIn'
import { useAccount } from '@/features/account/store'
import { api, ApiError } from '@/lib/api'
import { SITE_URL } from '@/lib/config'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function NewShulScreen() {
  usePageTitle('Add your shul · Beitecha')
  const status = useAccount((s) => s.status)
  const [name, setName] = useState('')
  const [nameHe, setNameHe] = useState('')
  const [city, setCity] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [timeZone, setTimeZone] = useState(browserZone)
  const [israel, setIsrael] = useState(browserZone() === 'Asia/Jerusalem')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'unknown') return <Centered loading />
  if (status === 'signedOut')
    return (
      <Page>
        <Text variant="pageHeader">Add your shul</Text>
        <SignIn returnTo="/new" reason="Sign in first; you’ll be the shul’s owner." />
      </Page>
    )

  const address = slugTouched ? slug : slugify(name)
  const latitude = Number(lat)
  const longitude = Number(lng)
  const ready = name.trim() && address.length >= 3 && lat && lng && Number.isFinite(latitude) && Number.isFinite(longitude)

  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(4))
        setLng(p.coords.longitude.toFixed(4))
      },
      () => setError('Couldn’t get your location. Enter it by hand (right-click the shul on Google Maps to copy it).'),
    )

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const { slug: created } = await api.create({
        slug: address,
        profile: { name: { en: name.trim(), ...(nameHe.trim() ? { he: nameHe.trim() } : {}) }, ...(city.trim() ? { city: city.trim() } : {}) },
        location: { latitude, longitude, timeZone: timeZone.trim(), israel },
      })
      router.replace(`/${created}/admin`)
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Page>
      <Stack gap="xs" paddingTop="lg">
        <Text variant="pageHeader">Add your shul</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          You’ll start with a simple Shacharis, Mincha and Maariv schedule to adjust.
        </Text>
      </Stack>
      <Card gap="md">
        <Field label="Name" placeholder="Young Israel of Lakewood" value={name} onChangeText={setName} />
        <Field label="Hebrew name (optional)" placeholder="בית הכנסת" value={nameHe} onChangeText={setNameHe} />
        <Field label="City" placeholder="Lakewood, NJ" value={city} onChangeText={setCity} />
        <Field
          label="Address on Beitecha"
          value={address}
          onChangeText={(v) => {
            setSlugTouched(true)
            setSlug(slugify(v))
          }}
          autoCapitalize="none"
          help={`${SITE_URL.replace(/^https?:\/\//, '')}/${address || '…'}`}
        />
      </Card>
      <Card gap="md">
        <Text variant="sectionHeader">Where is it?</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Zmanim are worked out for the shul’s exact spot and its local time zone.
        </Text>
        <Button variant="secondary" title="Use my current location" icon="navigation" onPress={locate} />
        <Stack direction="row" gap="md">
          <Stack grow>
            <Field label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" placeholder="40.0821" />
          </Stack>
          <Stack grow>
            <Field label="Longitude" value={lng} onChangeText={setLng} keyboardType="numeric" placeholder="-74.2097" />
          </Stack>
        </Stack>
        <Field
          label="Time zone"
          value={timeZone}
          onChangeText={setTimeZone}
          autoCapitalize="none"
          help="The shul’s local zone. Everyone sees times in it, wherever they are."
        />
        <Stack direction="row" align="center" gap="md">
          <Text variant="body">In Eretz Yisrael (one day Yom Tov)</Text>
          <Stack grow />
          <ToggleSwitch value={israel} onValueChange={setIsrael} accessibilityLabel="In Eretz Yisrael" />
        </Stack>
      </Card>
      {!!error && (
        <Text variant="body" color={SemanticColor.TextDanger}>
          {error}
        </Text>
      )}
      <Button title="Create shul" size="lg" loading={busy} disabled={!ready || busy} onPress={create} />
    </Page>
  )
}
