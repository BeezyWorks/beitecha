import {
  Button,
  Card,
  SemanticColor,
  Stack,
  Text,
  TextField,
  ToggleSwitch,
} from '@beezyworks/design'
import { clockFull, DISPLAY_BLOCKS, type DisplayBlock, type DisplaySetup } from '@beitecha/engine'
import { router } from 'expo-router'
import React from 'react'

import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { setupId } from '@/features/display/setup'
import { SITE_URL } from '@/lib/config'
import { SectionPage } from './SectionPage'
import { useAdmin } from './store'

const BLOCKS: Record<DisplayBlock, { label: string; help: string }> = {
  next: { label: 'Next minyan', help: 'The big card with the next minyan and how long until it.' },
  today: { label: 'Today', help: 'The rest of today’s minyanim and shiurim.' },
  shabbos: { label: 'This Shabbos', help: 'Friday night, Shabbos morning and afternoon.' },
  zmanim: { label: 'Zmanim', help: 'Today’s zmanim.' },
  notices: { label: 'Sponsors & announcements', help: 'Taking turns in the corner.' },
  yahrzeits: { label: 'Yahrzeits', help: 'Those kept this week.' },
  birthdays: { label: 'Birthdays', help: 'Those this week.' },
  anniversaries: { label: 'Anniversaries', help: 'Those this week.' },
  cholim: { label: 'Refuah shleimah', help: 'The list for the Mi Shebeirach.' },
  specialZmanim: {
    label: 'Fast & Pesach zmanim',
    help: 'Below Shabbos in weeks with a fast or Erev Pesach.',
  },
  qr: { label: 'QR code', help: 'For the times on a phone, in the Siddur.' },
}

/** Every half hour, for the hours the screen sleeps between. */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30)
const SLEEP_FROM = 22 * 60
const SLEEP_TO = 5 * 60

/** The lobby displays: each setup is its own address, for a monitor of its own. The week on paper has its own section. */
export function DisplaySection({ slug }: { slug: string }) {
  const { schedule, setSchedule } = useAdmin()
  const [name, setName] = React.useState('')
  if (!schedule) return null

  const setups = schedule.settings.displays ?? []
  const save = (displays: DisplaySetup[]) =>
    setSchedule({
      ...schedule,
      settings: { ...schedule.settings, displays: displays.length ? displays : undefined },
    })
  const change = (id: string, patch: Partial<DisplaySetup>) =>
    save(setups.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  const add = (title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    save([
      ...setups,
      {
        id: setupId(
          trimmed,
          setups.map((d) => d.id),
        ),
        name: trimmed,
      },
    ])
    setName('')
  }

  return (
    <SectionPage
      title="Lobby display"
      intro="The monitors in the building. Each one has its own address and its own layout."
    >
      {setups.length === 0 && (
        <Card gap="sm">
          <Text variant="sectionHeader">On the monitor</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Open this on the monitor’s browser and leave it. Add a display below to choose what it
            shows, turn it upright, or give another monitor its own.
          </Text>
          <Address slug={slug} />
        </Card>
      )}
      {setups.map((setup, i) => (
        <SetupCard
          key={setup.id}
          slug={slug}
          setup={setup}
          first={i === 0}
          onChange={(patch) => change(setup.id, patch)}
          onDelete={() => save(setups.filter((d) => d.id !== setup.id))}
        />
      ))}
      <Card gap="sm">
        <Text variant="sectionHeader">Add a display</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Name it for where it hangs. The name is only for you; the screen never shows it.
        </Text>
        <TextField
          variant="boxed"
          placeholder="Upstairs, portrait"
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => add(name)}
        />
        <Stack direction="row">
          <Button
            variant="secondary"
            size="sm"
            title="Add display"
            icon="add"
            disabled={!name.trim()}
            onPress={() => add(name)}
          />
        </Stack>
      </Card>
    </SectionPage>
  )
}

/** A display's address, to copy or open. Open shows what's saved, so save changes first. */
function Address({ slug, id }: { slug: string; id?: string }) {
  const path = id ? `/${slug}/display/${id}` : `/${slug}/display`
  return (
    <>
      <Text variant="bodyStrong" selectable>
        {SITE_URL}
        {path}
      </Text>
      <Stack direction="row">
        <Button
          variant="secondary"
          size="sm"
          title="Open"
          icon="external-link"
          onPress={() => router.push(id ? `/${slug}/display/${id}` : `/${slug}/display`)}
        />
      </Stack>
    </>
  )
}

function SetupCard({
  slug,
  setup,
  first,
  onChange,
  onDelete,
}: {
  slug: string
  setup: DisplaySetup
  first: boolean
  onChange: (patch: Partial<DisplaySetup>) => void
  onDelete: () => void
}) {
  const oled = setup.screen === 'oled'
  const sleep = setup.sleep ?? 'auto'
  const hours = typeof sleep === 'object' ? sleep : { from: SLEEP_FROM, to: SLEEP_TO }
  const setBlock = (block: DisplayBlock, shown: boolean) => {
    const { [block]: _, ...rest } = setup.blocks ?? {}
    const blocks = shown ? rest : { ...rest, [block]: false }
    onChange({ blocks: Object.keys(blocks).length ? blocks : undefined })
  }
  const times = (value: number, onValue: (minutes: number) => void, label: string) => (
    <Select
      accessibilityLabel={label}
      value={String(value)}
      options={HALF_HOURS.map((m) => ({ value: String(m), label: clockFull(m) }))}
      onChange={(m) => onValue(Number(m))}
    />
  )

  return (
    <Card gap="md">
      <Stack direction="row" align="center" gap="md">
        <Stack grow width={0}>
          <TextField
            variant="boxed"
            accessibilityLabel="Display name"
            value={setup.name}
            onChangeText={(name) => onChange({ name })}
          />
        </Stack>
        <Button variant="ghost" size="sm" title="Delete" icon="delete" onPress={onDelete} />
      </Stack>
      <Stack gap="xs">
        <Address slug={slug} id={setup.id} />
        {first && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            The first display is also at /{slug}/display.
          </Text>
        )}
      </Stack>

      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Orientation
        </Text>
        <Segments<NonNullable<DisplaySetup['orientation']>>
          options={[
            { key: 'landscape', label: 'Landscape' },
            { key: 'portrait', label: 'Portrait' },
          ]}
          value={setup.orientation ?? 'landscape'}
          onChange={(orientation) =>
            onChange({ orientation: orientation === 'landscape' ? undefined : orientation })
          }
          accessibilityLabel="Orientation"
        />
      </Stack>

      <Stack gap="sm">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Show
        </Text>
        {DISPLAY_BLOCKS.map((block) => (
          <Stack key={block} direction="row" align="center" gap="md">
            <Stack grow>
              <Text variant="body">{BLOCKS[block].label}</Text>
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {BLOCKS[block].help}
              </Text>
            </Stack>
            <ToggleSwitch
              value={setup.blocks?.[block] !== false}
              onValueChange={(shown) => setBlock(block, shown)}
              accessibilityLabel={BLOCKS[block].label}
            />
          </Stack>
        ))}
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          What’s switched off gives its room to the rest.
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Shabbos on the screen
        </Text>
        <Segments<NonNullable<DisplaySetup['shabbosFocus']>>
          options={[
            { key: 'auto', label: 'Automatic' },
            { key: 'always', label: 'Always' },
            { key: 'never', label: 'Never' },
          ]}
          value={setup.shabbosFocus ?? 'auto'}
          onChange={(shabbosFocus) =>
            onChange({ shabbosFocus: shabbosFocus === 'auto' ? undefined : shabbosFocus })
          }
          accessibilityLabel="Shabbos on the screen"
        />
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Automatic gives Shabbos the main place from Thursday’s last minyan (or the eve before an
          erev Yom Tov) until Havdalah. Never keeps it as a small panel.
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Theme
        </Text>
        <Segments<NonNullable<DisplaySetup['theme']>>
          options={[
            { key: 'light', label: 'Light' },
            { key: 'dark', label: 'Dark' },
          ]}
          value={setup.theme ?? (oled ? 'dark' : 'light')}
          onChange={(theme) => onChange({ theme })}
          accessibilityLabel="Theme"
        />
      </Stack>

      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Screen
        </Text>
        <Segments<NonNullable<DisplaySetup['screen']>>
          options={[
            { key: 'lcd', label: 'LCD' },
            { key: 'oled', label: 'OLED' },
            { key: 'unknown', label: 'Not sure' },
          ]}
          value={setup.screen ?? 'unknown'}
          onChange={(screen) => onChange({ screen: screen === 'unknown' ? undefined : screen })}
          accessibilityLabel="Screen type"
        />
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          OLED screens can burn in. They start dark and slowly move the picture around.
        </Text>
      </Stack>

      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Sleep
        </Text>
        <Segments<'auto' | 'off' | 'hours'>
          options={[
            { key: 'auto', label: 'Automatic' },
            { key: 'off', label: 'Off' },
            { key: 'hours', label: 'Set hours' },
          ]}
          value={typeof sleep === 'object' ? 'hours' : sleep}
          onChange={(k) =>
            onChange({ sleep: k === 'auto' ? undefined : k === 'off' ? 'off' : hours })
          }
          accessibilityLabel="Sleep"
        />
        {typeof sleep === 'object' && (
          <Stack direction="row" align="center" gap="sm" wrap>
            <Text variant="body">Black from</Text>
            {times(sleep.from, (from) => onChange({ sleep: { ...sleep, from } }), 'Sleep from')}
            <Text variant="body">until</Text>
            {times(sleep.to, (to) => onChange({ sleep: { ...sleep, to } }), 'Sleep until')}
          </Stack>
        )}
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {sleep === 'off'
            ? 'The screen stays on all night.'
            : typeof sleep === 'object'
              ? 'The screen goes fully black for these hours.'
              : 'The screen goes fully black an hour after the day’s last minyan, until an hour before the next day’s first.'}{' '}
          The display keeps checking in while it sleeps.
        </Text>
      </Stack>
    </Card>
  )
}
