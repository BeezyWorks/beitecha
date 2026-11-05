import { Button, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import {
  type BandPages,
  type BulletinBand,
  type PrintSettings,
  type ShulProfile,
  type ShulSettings,
} from '@beitecha/engine'
import React from 'react'

import { Logo } from '@/components/Bulletin'
import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { CollapsibleCard } from './CollapsibleCard'

const WHERE: { value: BandPages; label: string }[] = [
  { value: 'all', label: 'Every page' },
  { value: 'first', label: 'First page only' },
  { value: 'last', label: 'Last page only' },
  { value: 'off', label: 'Not shown' },
]

const KINDS = {
  header: {
    title: 'Header',
    help: 'The top of the sheet, beside the week’s dates. Starts from your shul’s name and address; fill in a field to change it.',
    pages: 'first' as BandPages,
  },
  footer: {
    title: 'Footer',
    help: 'The bottom of the sheet. Shows only what you fill in, with a QR code beside it.',
    pages: 'last' as BandPages,
  },
}

/** The bulletin's header or footer: which pages, and the logo, names, address, phones and QR code on it. */
export function BulletinBandCard({
  kind,
  settings,
  profile,
  onChange,
}: {
  kind: 'header' | 'footer'
  profile: ShulProfile
  settings: ShulSettings
  onChange: (settings: ShulSettings) => void
}) {
  const { title, help, pages } = KINDS[kind]
  const band: BulletinBand = settings.print?.[kind] ?? {}
  const set = (patch: Partial<BulletinBand>) => {
    const next: BulletinBand = { ...band, ...patch }
    // Anything left empty falls away, so the band is back to its defaults when all is cleared.
    for (const k of Object.keys(next) as (keyof BulletinBand)[])
      if (next[k] === undefined || next[k] === '') delete next[k]
    const print: PrintSettings = { ...settings.print }
    if (Object.keys(next).length > 0) print[kind] = next
    else delete print[kind]
    onChange({ ...settings, print })
  }
  const text = (key: 'rabbi' | 'address' | 'officePhone' | 'rabbiPhone' | 'email') => ({
    value: band[key] ?? '',
    onChangeText: (v: string) => set({ [key]: v.trim() === '' ? undefined : v }),
  })
  const qr = band.qr
  // The footer has the Siddur link unless turned off; the header has no QR code unless asked for.
  const qrOn = kind === 'footer' ? qr !== false : !!qr
  const qrFields = qr || {}

  return (
    <CollapsibleCard id={`bulletin-card-${kind}`} title={title}>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        {help}
      </Text>
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Show on
        </Text>
        <Stack direction="row">
          <Select
            accessibilityLabel={`${title}: pages`}
            value={band.pages ?? pages}
            options={WHERE}
            onChange={(v) => set({ pages: v === pages ? undefined : (v as BandPages) })}
          />
        </Stack>
      </Stack>
      {(band.pages ?? pages) !== 'off' && (
        <>
          <Stack direction="row" align="end" gap="md">
            {!!band.logo && <Logo src={band.logo} size={48} />}
            <Stack grow width={0}>
              <Field
                label="Logo web address"
                help={
                  band.logo?.startsWith('data:')
                    ? 'This logo was uploaded earlier; paste an address to replace it.'
                    : 'Link to an image already online, so nothing is stored here.'
                }
                value={band.logo?.startsWith('data:') ? '' : (band.logo ?? '')}
                placeholder="https://example.org/logo.png"
                autoCapitalize="none"
                keyboardType="url"
                onChangeText={(v) => set({ logo: v.trim() === '' ? undefined : v.trim() })}
              />
            </Stack>
            {!!band.logo && (
              <Button
                variant="ghost"
                size="sm"
                title="Remove"
                onPress={() => set({ logo: undefined })}
              />
            )}
          </Stack>
          <Field
            label={kind === 'header' ? 'Shul name' : 'Shul name (optional)'}
            placeholder={kind === 'header' ? profile.name.en : undefined}
            value={band.name?.en ?? ''}
            onChangeText={(en) =>
              set({ name: en || band.name?.he ? { ...band.name, en } : undefined })
            }
          />
          <Field
            label="Hebrew name"
            placeholder={kind === 'header' ? profile.name.he : undefined}
            value={band.name?.he ?? ''}
            onChangeText={(he) =>
              set({
                name:
                  band.name?.en || he
                    ? { en: band.name?.en ?? '', he: he || undefined }
                    : undefined,
              })
            }
          />
          <Field label="Rabbi" {...text('rabbi')} />
          <Field
            label="Address"
            placeholder={kind === 'header' ? profile.address : undefined}
            {...text('address')}
          />
          <Field label="Office phone" {...text('officePhone')} />
          <Field label="Rabbi’s phone" {...text('rabbiPhone')} />
          <Field label="Email" {...text('email')} />
          {kind === 'footer' && (
            <>
              <Stack direction="row" align="center" gap="md">
                <Stack grow>
                  <Text variant="body">QR code</Text>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    {kind === 'footer'
                      ? 'Off hides it. Without a link of your own it opens the shul’s page in the Siddur.'
                      : 'Opens the link below, or the shul’s page in the Siddur when that is blank.'}
                  </Text>
                </Stack>
                <ToggleSwitch
                  value={qrOn}
                  onValueChange={(on) =>
                    set({ qr: on ? (kind === 'footer' ? undefined : {}) : false })
                  }
                  accessibilityLabel={`${title}: QR code`}
                />
              </Stack>
              {qrOn && (
                <>
                  <Field
                    label="QR link"
                    help="Where scanning goes, e.g. a donation or newsletter page. Blank: the Siddur page."
                    value={qrFields.url ?? ''}
                    autoCapitalize="none"
                    onChangeText={(url) =>
                      set({ qr: { ...qrFields, url: url.trim() || undefined } })
                    }
                  />
                  <Field
                    label="What it does"
                    help="Printed beside the code, e.g. “Scan to donate”."
                    value={qrFields.label ?? ''}
                    onChangeText={(label) =>
                      set({ qr: { ...qrFields, label: label || undefined } })
                    }
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </CollapsibleCard>
  )
}
