import { Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import { type SelichosMinhag, type ShulSettings, ZMAN_IDS, type ZmanKey } from '@beitecha/engine'
import React from 'react'

import { Field } from '@/components/Field'
import { NumberField } from '@/components/NumberField'
import { Segments } from '@/components/Segments'
import { CustomZmanimCard } from './CustomZmanimCard'
import { zmanLabel } from './forms'
import { SectionPage } from './SectionPage'
import { useAdmin } from './store'

/** Where the shul is and whose zmanim it keeps; saved from the save bar. */
export function ZmanimSection() {
  const { schedule, setSchedule } = useAdmin()
  if (!schedule) return null
  const { location } = schedule.settings
  const zmanim = schedule.settings.zmanim ?? {}
  const hidden = zmanim.hidden ?? []
  const setSettings = (settings: ShulSettings) => setSchedule({ ...schedule, settings })
  const setLocation = (patch: Partial<ShulSettings['location']>) =>
    setSettings({ ...schedule.settings, location: { ...location, ...patch } })
  const setZmanim = (patch: Partial<NonNullable<ShulSettings['zmanim']>>) =>
    setSettings({ ...schedule.settings, zmanim: { ...zmanim, ...patch } })
  const havdalahMode = zmanim.havdalah && 'minutes' in zmanim.havdalah ? 'minutes' : 'angle'

  return (
    <SectionPage
      title="Zmanim"
      intro="Where the shul is, and the opinions every zman and rule is worked out from."
    >
      <Card gap="md">
        <Text variant="sectionHeader">Location</Text>
        <Stack direction="row" gap="md">
          <Stack grow>
            <NumberField
              label="Latitude"
              value={location.latitude}
              onChange={(latitude) => latitude !== undefined && setLocation({ latitude })}
            />
          </Stack>
          <Stack grow>
            <NumberField
              label="Longitude"
              value={location.longitude}
              onChange={(longitude) => longitude !== undefined && setLocation({ longitude })}
            />
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
          <ToggleSwitch
            value={location.israel}
            onValueChange={(israel) => setLocation({ israel })}
            accessibilityLabel="In Eretz Yisrael"
          />
        </Stack>
      </Card>

      <Card gap="md">
        <Text variant="sectionHeader">Zmanim</Text>
        <NumberField
          label="Candle lighting: minutes before sunset"
          value={zmanim.candleLightingMinutes ?? 18}
          onChange={(candleLightingMinutes) => setZmanim({ candleLightingMinutes })}
        />
        <NumberField
          label="Tzeis: degrees below the horizon"
          value={zmanim.tzeisAngle ?? 8.5}
          onChange={(tzeisAngle) => setZmanim({ tzeisAngle })}
        />
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Motzei Shabbos / Havdalah
          </Text>
          <Segments
            options={[
              { key: 'angle', label: 'Sun angle' },
              { key: 'minutes', label: 'Fixed minutes after sunset' },
            ]}
            value={havdalahMode}
            onChange={(k) =>
              setZmanim({ havdalah: k === 'minutes' ? { minutes: 50 } : { angle: 8.5 } })
            }
          />
          <NumberField
            label={
              havdalahMode === 'minutes' ? 'Minutes after sunset' : 'Degrees below the horizon'
            }
            value={
              zmanim.havdalah
                ? 'minutes' in zmanim.havdalah
                  ? zmanim.havdalah.minutes
                  : zmanim.havdalah.angle
                : 8.5
            }
            onChange={(n) =>
              n !== undefined &&
              setZmanim({ havdalah: havdalahMode === 'minutes' ? { minutes: n } : { angle: n } })
            }
          />
        </Stack>
        <Stack direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">Use elevation</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Sunrise and sunset as seen from the shul’s height, not sea level.
            </Text>
          </Stack>
          <ToggleSwitch
            value={!!zmanim.useElevation}
            onValueChange={(useElevation) => setZmanim({ useElevation })}
            accessibilityLabel="Use elevation"
          />
        </Stack>
        {/* A custom zman can see sunrise and sunset from the shul's height on its own. */}
        {(zmanim.useElevation || zmanim.custom?.some((c) => c.elevation)) && (
          <NumberField
            label="Elevation (meters)"
            value={location.elevation ?? 0}
            onChange={(elevation) => setLocation({ elevation })}
          />
        )}
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Show these zmanim
          </Text>
          {[...ZMAN_IDS, ...(zmanim.custom ?? []).map((c) => c.id)].map((id: ZmanKey) => (
            <Stack key={id} direction="row" align="center" gap="md">
              <Stack grow>
                <Text variant="body">{zmanLabel(id, zmanim.custom)}</Text>
              </Stack>
              <ToggleSwitch
                value={!hidden.includes(id)}
                onValueChange={(on) =>
                  setZmanim({ hidden: on ? hidden.filter((h) => h !== id) : [...hidden, id] })
                }
                accessibilityLabel={`Show ${zmanLabel(id, zmanim.custom)}`}
              />
            </Stack>
          ))}
        </Stack>
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Selichos (for the “Selichos” days in rules)
          </Text>
          <Segments<SelichosMinhag>
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

      <CustomZmanimCard schedule={schedule} onChange={setSettings} />
    </SectionPage>
  )
}
