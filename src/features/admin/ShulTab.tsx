import { Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import { type NameStyle, nameStyle, type ShulSettings } from '@beitecha/engine'
import React from 'react'

import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { LocalHolidaysCard } from './LocalHolidaysCard'
import { PrintCard } from './PrintCard'
import { SectionPage } from './SectionPage'
import { TimeFormatCard } from './TimeFormatCard'
import { useAdmin } from './store'

/** The shul's name and look, its language, local holidays and the printed week; saved from the save bar. */
export function ShulTab() {
  const { profile, schedule, setProfile, setSchedule } = useAdmin()
  if (!profile || !schedule) return null
  const setSettings = (settings: ShulSettings) => setSchedule({ ...schedule, settings })

  return (
    <SectionPage title="Shul settings">
      <Card gap="md">
        <Text variant="sectionHeader">The shul</Text>
        <Field
          label="Name"
          value={profile.name.en}
          onChangeText={(en) => setProfile({ ...profile, name: { ...profile.name, en } })}
        />
        <Field
          label="Hebrew name"
          value={profile.name.he ?? ''}
          onChangeText={(he) =>
            setProfile({ ...profile, name: { ...profile.name, he: he || undefined } })
          }
        />
        <Field
          label="Street address"
          value={profile.address ?? ''}
          onChangeText={(address) => setProfile({ ...profile, address: address || undefined })}
        />
        <Field
          label="City"
          value={profile.city ?? ''}
          onChangeText={(city) => setProfile({ ...profile, city: city || undefined })}
        />
        <Field
          label="Website"
          value={profile.website ?? ''}
          autoCapitalize="none"
          onChangeText={(website) => setProfile({ ...profile, website: website || undefined })}
        />
        <Field
          label="Color"
          value={profile.brandColor ?? ''}
          autoCapitalize="none"
          placeholder="#3E7FD1"
          help="Tints the display and the shul’s page (#rrggbb)."
          error={
            profile.brandColor && !/^#[0-9a-f]{6}$/i.test(profile.brandColor) ? 'Use #rrggbb' : null
          }
          onChangeText={(c) => setProfile({ ...profile, brandColor: c || undefined })}
        />
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Language of the shul’s page, display and calendar
          </Text>
          <Segments
            options={[
              { key: 'en', label: 'English' },
              { key: 'he', label: 'עברית' },
            ]}
            value={schedule.settings.language ?? 'en'}
            onChange={(language) => setSettings({ ...schedule.settings, language })}
          />
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Labels like “Next” and “Coming up”, weekdays and the date.
          </Text>
        </Stack>
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Names: minyanim, shiurim, zmanim, parsha, holidays, notices
          </Text>
          <Segments<NameStyle>
            options={[
              { key: 'en', label: 'English' },
              { key: 'he', label: 'עברית' },
              { key: 'both', label: 'Both' },
            ]}
            value={nameStyle(schedule.settings)}
            onChange={(names) => setSettings({ ...schedule.settings, names })}
          />
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Can differ from the language above, e.g. English dates with Hebrew minyan names. Names
            you haven’t given in Hebrew stay in English.
          </Text>
        </Stack>
      </Card>

      <TimeFormatCard
        value={schedule.settings.timeFormat}
        onChange={(timeFormat) => setSettings({ ...schedule.settings, timeFormat })}
      />

      <LocalHolidaysCard settings={schedule.settings} onChange={setSettings} />

      <PrintCard settings={schedule.settings} onChange={setSettings} />
    </SectionPage>
  )
}
