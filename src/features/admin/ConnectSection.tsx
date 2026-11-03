import { Badge, Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import type { Scope } from '@beitecha/engine'
import React, { useState } from 'react'

import { confirmAction } from '@/components/confirm'
import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { API_URL } from '@/lib/config'
import type { Connection, ConnectionMode, ConnectionPurpose } from '@/lib/api'
import { copy } from './aiClipboard'
import {
  ALL_SCOPES,
  DEFAULT_SCOPES,
  expiryState,
  expiryText,
  MODE_LABELS,
  newConnectionNote,
  newConnectionsByOthers,
  PURPOSE_LABELS,
  relativeTime,
  SCOPE_LABELS,
  scopeList,
} from './connect'
import { useConnect } from './connectStore'
import { SectionPage } from './SectionPage'
import { downloadSkill } from './skillZip'
import { useAdmin } from './store'

const MODES: { key: ConnectionMode; label: string }[] = [
  { key: 'review', label: MODE_LABELS.review },
  { key: 'publish', label: MODE_LABELS.publish },
]

const EXPIRIES: { key: '30' | '90' | '180' | '365'; label: string }[] = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '180', label: '6 months' },
  { key: '365', label: '1 year' },
]

const PUBLISH_WARNING =
  'Whatever the assistant writes goes live on the display, the bulletin and the Siddur right away. You can undo it afterwards, but people may see it first. Cancelling or moving a minyan always waits for a gabbai either way.'

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  return (
    <Stack gap="xs">
      {ALL_SCOPES.map((s) => (
        <Stack key={s} direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">{SCOPE_LABELS[s]}</Text>
          </Stack>
          <ToggleSwitch
            value={value.includes(s)}
            onValueChange={(on) =>
              onChange(
                on
                  ? ALL_SCOPES.filter((x) => x === s || value.includes(x))
                  : value.filter((x) => x !== s),
              )
            }
            accessibilityLabel={SCOPE_LABELS[s]}
          />
        </Stack>
      ))}
    </Stack>
  )
}

function ApiCard({ owner }: { owner: boolean }) {
  const { enabled, defaultMode, setEnabled, setDefaultMode } = useConnect()
  const turn = (on: boolean) => {
    if (!on && !confirmAction('This disconnects every assistant and key. Turn it off?')) return
    void setEnabled(on)
  }
  return (
    <Card gap="md">
      <Stack direction="row" align="center" gap="md">
        <Stack grow gap="xs">
          <Text variant="sectionHeader">Assistants & API</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Let an AI assistant, like Claude, or a script help keep the schedule up to date: add a
            sponsorship, post a notice, move a time for one week. Each gabbai connects their own, it
            can only do what you allow below, and every change can be undone.
          </Text>
        </Stack>
        <ToggleSwitch
          value={enabled}
          disabled={!owner}
          onValueChange={turn}
          accessibilityLabel="Assistants and API"
        />
      </Stack>
      {!owner && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          {enabled
            ? 'Only an owner can turn this off or change how new connections start.'
            : 'It’s off. Ask an owner to turn it on.'}
        </Text>
      )}
      {enabled && (
        <Stack gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            New connections start as
          </Text>
          {owner ? (
            <Segments<ConnectionMode>
              options={MODES}
              value={defaultMode}
              onChange={(m) => void setDefaultMode(m)}
              accessibilityLabel="Default mode"
            />
          ) : (
            <Text variant="bodyStrong">{MODE_LABELS[defaultMode]}</Text>
          )}
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {defaultMode === 'review'
              ? 'What an assistant writes waits under Pending until a gabbai approves it.'
              : 'What an assistant writes goes live at once.'}
          </Text>
          {defaultMode === 'publish' && (
            <Stack padding="md" radius="md" background={SemanticColor.AccentAlertFaded}>
              <Text variant="body">{PUBLISH_WARNING}</Text>
            </Stack>
          )}
        </Stack>
      )}
    </Card>
  )
}

/** Shown once, right after a key is made. */
function KeyReveal({
  secret,
  label,
  onDone,
}: {
  secret: string
  label: string
  onDone: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Your new key for “{label}”</Text>
      <Stack padding="md" radius="md" background={SemanticColor.AccentAlertFaded}>
        <Text variant="bodyStrong">
          You won’t see this key again. Copy it now and keep it private.
        </Text>
      </Stack>
      <Stack padding="md" radius="md" background={SemanticColor.SurfaceSelected}>
        <Text variant="bodyStrong" selectable>
          {secret}
        </Text>
      </Stack>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Anyone with it can act as you in this shul, within the limits you picked. If it leaks,
        revoke it below.
      </Text>
      <Stack direction="row" gap="sm">
        <Button
          title={copied ? 'Copied' : 'Copy key'}
          onPress={async () => setCopied(await copy(secret))}
        />
        <Button variant="secondary" title="I’ve saved it" onPress={onDone} />
      </Stack>
    </Card>
  )
}

function CreateKeyForm({
  onCreated,
  onCancel,
}: {
  onCreated: (r: { key: string; label: string }) => void
  onCancel: () => void
}) {
  const { defaultMode, create } = useConnect()
  const [label, setLabel] = useState('')
  const [purpose, setPurpose] = useState<Exclude<ConnectionPurpose, 'skill'>>('script')
  const [scopes, setScopes] = useState<Scope[]>(DEFAULT_SCOPES)
  const [mode, setMode] = useState<ConnectionMode>(defaultMode)
  const [days, setDays] = useState<'30' | '90' | '180' | '365'>('90')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    const res = await create({
      purpose,
      ...(label.trim() && { label: label.trim() }),
      scopes,
      mode,
      expiresInDays: Number(days),
    })
    setBusy(false)
    if (res) onCreated({ key: res.key, label: res.connection.label })
  }
  return (
    <Card gap="md">
      <Text variant="sectionHeader">Create an API key</Text>
      <Text variant="body" color={SemanticColor.TextSecondary}>
        For a script or another tool that writes to the schedule. It acts as you.
      </Text>
      <Segments
        options={[
          { key: 'script', label: 'Script' },
          { key: 'other', label: 'Other' },
        ]}
        value={purpose}
        onChange={setPurpose}
        accessibilityLabel="What it's for"
      />
      <Field
        label="Name"
        value={label}
        onChangeText={(t) => setLabel(t.slice(0, 60))}
        placeholder={purpose === 'script' ? 'Script' : 'Connection'}
        help="So you can tell it apart later."
      />
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          It may change
        </Text>
        <ScopePicker value={scopes} onChange={setScopes} />
      </Stack>
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Its changes
        </Text>
        <Segments<ConnectionMode> options={MODES} value={mode} onChange={setMode} />
        {mode === 'publish' && (
          <Text variant="caption" color={SemanticColor.TextDanger}>
            {PUBLISH_WARNING}
          </Text>
        )}
      </Stack>
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Expires after
        </Text>
        <Segments options={EXPIRIES} value={days} onChange={setDays} />
      </Stack>
      <Stack direction="row" gap="sm">
        <Button
          title="Create key"
          loading={busy}
          disabled={busy || scopes.length === 0}
          onPress={go}
        />
        <Button variant="ghost" title="Cancel" onPress={onCancel} />
      </Stack>
    </Card>
  )
}

function ConnectionCard({ c, canManage }: { c: Connection; canManage: boolean }) {
  const { patch, revoke } = useConnect()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(c.label)
  const [scopes, setScopes] = useState<Scope[]>(c.scopes)
  const now = Date.now()
  const expiry = expiryState(c.expiresAt, now)
  const revoked = c.revokedAt !== null
  const save = async () => {
    await patch(c.id, {
      ...(label.trim() && label.trim() !== c.label && { label: label.trim() }),
      scopes,
    })
    setEditing(false)
  }
  return (
    <Card gap="sm">
      <Stack direction="row" align="center" gap="sm" wrap>
        <Stack grow gap="none">
          <Text variant="bodyStrong">{c.label}</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {c.userName ?? 'A gabbai'}
            {c.mine ? ' (you)' : ''} · {PURPOSE_LABELS[c.purpose] ?? c.purpose}
            {c.kind === 'oauth' ? ' · signed in' : c.prefix ? ` · ${c.prefix}…` : ''}
          </Text>
        </Stack>
        {revoked ? (
          <Badge label="Revoked" tone="neutral" />
        ) : expiry.state === 'expired' ? (
          <Badge label="Expired" tone="neutral" />
        ) : (
          <Badge label={MODE_LABELS[c.mode]} tone={c.mode === 'publish' ? 'accent' : 'success'} />
        )}
      </Stack>
      <Text variant="body">{scopeList(c.scopes)}</Text>
      <Stack direction="row" gap="md" wrap>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Last used {relativeTime(c.lastUsedAt, now)}
        </Text>
        {!revoked && (
          <Text
            variant="caption"
            color={
              expiry.state === 'soon' || expiry.state === 'expired'
                ? SemanticColor.TextDanger
                : SemanticColor.TextSecondary
            }
          >
            {expiryText(expiry)}
            {expiry.state === 'soon' && c.purpose === 'skill' ? ' · download the skill again' : ''}
          </Text>
        )}
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Created {relativeTime(c.createdAt, now)}
        </Text>
      </Stack>
      {!revoked && canManage && (
        <Stack gap="sm">
          <Segments<ConnectionMode>
            options={MODES}
            value={c.mode}
            onChange={(mode) => {
              if (mode === 'publish' && !confirmAction(`${PUBLISH_WARNING}\n\nPost right away?`))
                return
              void patch(c.id, { mode })
            }}
            accessibilityLabel={`Mode of ${c.label}`}
          />
          {editing ? (
            <Stack gap="sm">
              <Field label="Name" value={label} onChangeText={(t) => setLabel(t.slice(0, 60))} />
              <ScopePicker value={scopes} onChange={setScopes} />
              <Stack direction="row" gap="sm">
                <Button size="sm" title="Save" disabled={scopes.length === 0} onPress={save} />
                <Button
                  size="sm"
                  variant="ghost"
                  title="Cancel"
                  onPress={() => setEditing(false)}
                />
              </Stack>
            </Stack>
          ) : (
            <Stack direction="row" gap="sm" wrap>
              <Button
                size="sm"
                variant="secondary"
                title="Edit name & permissions"
                onPress={() => {
                  setLabel(c.label)
                  setScopes(c.scopes)
                  setEditing(true)
                }}
              />
              <Button
                size="sm"
                variant="destructiveGhost"
                title="Revoke"
                onPress={() => {
                  if (confirmAction(`Revoke “${c.label}”? It stops working right away.`))
                    void revoke(c.id)
                }}
              />
            </Stack>
          )}
        </Stack>
      )}
    </Card>
  )
}

function ConnectionsList({ owner }: { owner: boolean }) {
  const { connections, revokeAll } = useConnect()
  const [showRevoked, setShowRevoked] = useState(false)
  const now = Date.now()
  const active = connections.filter((c) => c.revokedAt === null)
  const gone = connections.filter((c) => c.revokedAt !== null)
  const fresh = owner ? newConnectionsByOthers(connections, now) : []
  return (
    <Stack gap="sm">
      <Stack direction="row" align="center" gap="md">
        <Stack grow>
          <Text variant="title">{owner ? 'Connections' : 'Your connections'}</Text>
        </Stack>
        {owner && active.length > 0 && (
          <Button
            size="sm"
            variant="destructiveGhost"
            title="Revoke all"
            onPress={() => {
              if (
                confirmAction(
                  `Revoke all ${active.length} connections? Every assistant and key stops working.`,
                )
              )
                void revokeAll()
            }}
          />
        )}
      </Stack>
      {fresh.map((c) => (
        <Stack key={c.id} padding="md" radius="md" background={SemanticColor.AccentTint}>
          <Text variant="body">
            <Text variant="bodyStrong">New: </Text>
            {newConnectionNote(c, now)}
          </Text>
        </Stack>
      ))}
      {active.length === 0 && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing connected yet.
        </Text>
      )}
      {active.map((c) => (
        <ConnectionCard key={c.id} c={c} canManage={owner || c.mine} />
      ))}
      {gone.length > 0 && (
        <Stack gap="sm">
          <Stack direction="row">
            <Button
              variant="ghost"
              size="sm"
              title={showRevoked ? 'Hide revoked' : `Revoked (${gone.length})`}
              onPress={() => setShowRevoked(!showRevoked)}
            />
          </Stack>
          {showRevoked && gone.map((c) => <ConnectionCard key={c.id} c={c} canManage={false} />)}
        </Stack>
      )}
    </Stack>
  )
}

const MCP_STEPS = [
  'Open Claude and go to Customize, then Connectors.',
  'Choose “Add custom connector”.',
  'Paste https://beitecha.baderech.app/mcp',
  'Press Connect and sign in with your Baderech account.',
  'Choose this shul and press Allow.',
]

export function ConnectSection() {
  const slug = useAdmin((s) => s.slug)
  const loaded = useAdmin((s) => s.loaded)
  const profile = useAdmin((s) => s.profile)
  const { ready, enabled, defaultMode, connections, error, notice, clearNotice, create, revoke } =
    useConnect()
  const [form, setForm] = useState(false)
  const [reveal, setReveal] = useState<{ key: string; label: string } | null>(null)
  const [skillBusy, setSkillBusy] = useState(false)
  const [skillDone, setSkillDone] = useState<string | null>(null)
  const [skillError, setSkillError] = useState<string | null>(null)
  if (!slug || !loaded || !profile) return null
  const owner = loaded.role === 'owner'

  const skill = async () => {
    setSkillBusy(true)
    setSkillError(null)
    setSkillDone(null)
    const res = await create({ purpose: 'skill' })
    if (res) {
      try {
        await downloadSkill({
          key: res.key,
          slug,
          shulName: profile.name.en,
          apiBase: API_URL || window.location.origin,
        })
        setSkillDone(res.connection.label)
      } catch (e) {
        // The key was never seen by anyone: don't leave it behind.
        await revoke(res.connection.id)
        setSkillError(`Couldn’t make the download: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    setSkillBusy(false)
  }

  return (
    <SectionPage
      title="Assistants & API"
      intro="Connect Claude or a script so it can add sponsorships, notices and one-time changes for you."
    >
      <ApiCard owner={owner} />
      {!!error && (
        <Stack
          direction="row"
          gap="md"
          padding="md"
          radius="md"
          background={SemanticColor.AccentAlertFaded}
        >
          <Stack grow>
            <Text variant="body">{error}</Text>
          </Stack>
          <Button size="sm" variant="ghost" title="Dismiss" onPress={clearNotice} />
        </Stack>
      )}
      {!!notice && (
        <Stack
          direction="row"
          gap="md"
          padding="md"
          radius="md"
          background={SemanticColor.AccentTint}
        >
          <Stack grow>
            <Text variant="body">{notice}</Text>
          </Stack>
          <Button size="sm" variant="ghost" title="Dismiss" onPress={clearNotice} />
        </Stack>
      )}

      {reveal && (
        <KeyReveal secret={reveal.key} label={reveal.label} onDone={() => setReveal(null)} />
      )}

      {enabled && (
        <Card gap="md">
          <Text variant="sectionHeader">Connect something</Text>
          <Stack gap="xs">
            <Text variant="bodyStrong">Claude skill</Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              Downloads a skill with its own key inside. Add it to Claude (Customize, then Skills)
              and ask Claude to update the schedule. It starts as{' '}
              {MODE_LABELS[defaultMode].toLowerCase()}.
            </Text>
            <Stack direction="row">
              <Button
                title="Download Claude skill"
                icon="download"
                loading={skillBusy}
                disabled={skillBusy}
                onPress={skill}
              />
            </Stack>
            {!!skillDone && (
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                Downloaded “{skillDone}”. The key is inside the file and can’t be shown again.
              </Text>
            )}
            {!!skillError && (
              <Text variant="caption" color={SemanticColor.TextDanger}>
                {skillError}
              </Text>
            )}
          </Stack>
          <Stack gap="xs">
            <Text variant="bodyStrong">API key</Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              For a script or any other tool. You choose what it may change and when it expires.
            </Text>
            <Stack direction="row">
              <Button
                variant="secondary"
                title="Create API key"
                onPress={() => setForm(true)}
                disabled={form}
              />
            </Stack>
          </Stack>
        </Card>
      )}
      {enabled && form && (
        <CreateKeyForm
          onCancel={() => setForm(false)}
          onCreated={(r) => {
            setForm(false)
            setReveal(r)
          }}
        />
      )}

      {ready && (enabled || connections.length > 0) && <ConnectionsList owner={owner} />}

      <Card gap="sm">
        <Stack direction="row" align="center" gap="sm">
          <Text variant="sectionHeader">Connect Claude (MCP)</Text>
          <Badge label="Coming soon" tone="neutral" />
        </Stack>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Soon you’ll be able to connect Claude without downloading anything:
        </Text>
        {MCP_STEPS.map((step, i) => (
          <Text key={i} variant="body">
            {i + 1}. {step}
          </Text>
        ))}
      </Card>
    </SectionPage>
  )
}
