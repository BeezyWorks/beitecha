import { Card, SegmentedControl, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import type { SelichosMinhag, ShulSettings } from '@beitecha/engine'
import React from 'react'

import { Field } from '@/components/Field'
import { NumberField } from '@/components/NumberField'
import { useAdmin } from './store'

/** The shul's name and look, where it is, and its zmanim opinions. */
export function ShulTab() {
  const { profile, schedule, setProfile, setSchedule } = useAdmin()
  if (!profile || !schedule) return null
  const { location } = schedule.settings
  const zmanim = schedule.settings.zmanim ?? {}
  const setSettings = (settings: ShulSettings) => setSchedule({ ...schedule, settings })
  const setLocation = (patch: Partial<ShulSettings['location']>) => setSettings({ ...schedule.settings, location: { ...location, ...patch } })
  const setZmanim = (patch: Partial<NonNullable<ShulSettings['zmanim']>>) => setSettings({ ...schedule.settings, zmanim: { ...zmanim, ...patch } })
  const havdalahMode = zmanim.havdalah && 'minutes' in zmanim.havdalah ? 'minutes' : 'angle'

  return (
    <Stack gap="md">
      <Card gap="md">
        <Text variant="sectionHeader">The shul</Text>
        <Field label="Name" value={profile.name.en} onChangeText={(en) => setProfile({ ...profile, name: { ...profile.name, en } })} />
        <Field label="Hebrew name" value={profile.name.he ?? ''} onChangeText={(he) => setProfile({ ...profile, name: { ...profile.name, he: he || undefined } })} />
        <Field label="Street address" value={profile.address ?? ''} onChangeText={(address) => setProfile({ ...profile, address: address || undefined })} />
        <Field label="City" value={profile.city ?? ''} onChangeText={(city) => setProfile({ ...profile, city: city || undefined })} />
        <Field label="Website" value={profile.website ?? ''} autoCapitalize="none" onChangeText={(website) => setProfile({ ...profile, website: website || undefined })} />
        <Field
          label="Color"
          value={profile.brandColor ?? ''}
          autoCapitalize="none"
          placeholder="#2e5a4f"
          help="Tints the display and the shul’s page (#rrggbb)."
          error={profile.brandColor && !/^#[0-9a-f]{6}$/i.test(profile.brandColor) ? 'Use #rrggbb' : null}
          onChangeText={(c) => setProfile({ ...profile, brandColor: c || undefined })}
        />
      </Card>

      <Card gap="md">
        <Text variant="sectionHeader">Location</Text>
        <Stack direction="row" gap="md">
          <Stack grow>
            <NumberField label="Latitude" value={location.latitude} onChange={(latitude) => latitude !== undefined && setLocation({ latitude })} />
          </Stack>
          <Stack grow>
            <NumberField label="Longitude" value={location.longitude} onChange={(longitude) => longitude !== undefined && setLocation({ longitude })} />
          </Stack>
        </Stack>
        <Field
          label="Time zone"
          value={location.timeZone}
          autoCapitalize="none"
          onChangeText={(timeZone) => setLocation({ timeZone })}
          help="Every time is shown in the shul’s zone, wherever the viewer is."
        />
        <Stack direction="row" align="center" gap="md">
          <Text variant="body">In Eretz Yisrael (one day Yom Tov)</Text>
          <Stack grow />
          <ToggleSwitch value={location.israel} onValueChange={(israel) => setLocation({ israel })} accessibilityLabel="In Eretz Yisrael" />
        </Stack>
      </Card>

      <Card gap="md">
        <Text variant="sectionHeader">Zmanim</Text>
        <NumberField
          label="Candle lighting: minutes before sunset"
          value={zmanim.candleLightingMinutes ?? 18}
          onChange={(candleLightingMinutes) => setZmanim({ candleLightingMinutes })}
        />
        <NumberField label="Tzeis: degrees below the horizon" value={zmanim.tzeisAngle ?? 8.5} onChange={(tzeisAngle) => setZmanim({ tzeisAngle })} />
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Motzei Shabbos / Havdalah
          </Text>
          <SegmentedControl
            options={[
              { key: 'angle', label: 'Sun angle' },
              { key: 'minutes', label: 'Fixed minutes after sunset' },
            ]}
            value={havdalahMode}
            onChange={(k) => setZmanim({ havdalah: k === 'minutes' ? { minutes: 50 } : { angle: 8.5 } })}
          />
          <NumberField
            label={havdalahMode === 'minutes' ? 'Minutes after sunset' : 'Degrees below the horizon'}
            value={zmanim.havdalah ? ('minutes' in zmanim.havdalah ? zmanim.havdalah.minutes : zmanim.havdalah.angle) : 8.5}
            onChange={(n) => n !== undefined && setZmanim({ havdalah: havdalahMode === 'minutes' ? { minutes: n } : { angle: n } })}
          />
        </Stack>
        <Stack direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">Use elevation</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Sunrise and sunset as seen from the shul’s height, not sea level.
            </Text>
          </Stack>
          <ToggleSwitch value={!!zmanim.useElevation} onValueChange={(useElevation) => setZmanim({ useElevation })} accessibilityLabel="Use elevation" />
        </Stack>
        {zmanim.useElevation && (
          <NumberField label="Elevation (meters)" value={location.elevation ?? 0} onChange={(elevation) => setLocation({ elevation })} />
        )}
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Selichos (for the “Selichos” days in rules)
          </Text>
          <SegmentedControl<SelichosMinhag>
            options={[
              { key: 'ashkenaz', label: 'Ashkenaz' },
              { key: 'sefard', label: 'From Rosh Chodesh Elul' },
              { key: 'none', label: 'None' },
            ]}
            value={schedule.settings.selichos ?? 'ashkenaz'}
            onChange={(selichos) => setSettings({ ...schedule.settings, selichos })}
          />
        </Stack>
      </Card>
    </Stack>
  )
}
