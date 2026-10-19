import { Badge, Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import React, { useState } from 'react'

import { useAccount } from '@/features/account/store'
import { api } from '@/lib/api'
import { SITE_URL } from '@/lib/config'
import { useAdmin } from './store'

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000)
  if (min < 2) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`
}

/** Gabbaim, invitations, the monitors in the shul, and who saved what. */
export function TeamTab() {
  const { loaded, slug, load } = useAdmin()
  const me = useAccount((s) => s.user)
  const [invite, setInvite] = useState<{ url: string; role: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!loaded || !slug) return null
  const owner = loaded.role === 'owner'

  const makeInvite = async (role: 'owner' | 'editor') => {
    setError(null)
    try {
      const res = await api.invite(slug, role)
      setInvite({ url: res.url, role })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Stack gap="md">
      <Card gap="sm">
        <Text variant="sectionHeader">Gabbaim</Text>
        {loaded.members.map((m) => (
          <Stack key={m.userId} direction="row" align="center" gap="sm">
            <Stack grow gap="none">
              <Text variant="bodyStrong">{m.name ?? m.email ?? m.userId}</Text>
              {!!m.email && (
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {m.email}
                </Text>
              )}
            </Stack>
            <Badge label={m.role === 'owner' ? 'Owner' : 'Editor'} tone={m.role === 'owner' ? 'accent' : 'neutral'} />
            {(owner || m.userId === me?.id) && (
              <Button
                variant="ghost"
                size="sm"
                title={m.userId === me?.id ? 'Leave' : 'Remove'}
                onPress={() =>
                  api.removeMember(slug, m.userId).then(
                    () => load(slug),
                    (e: Error) => setError(e.message),
                  )
                }
              />
            )}
          </Stack>
        ))}
        {owner && (
          <Stack direction="row" gap="sm" wrap paddingTop="sm">
            <Button variant="secondary" size="sm" title="Invite an editor" onPress={() => makeInvite('editor')} />
            <Button variant="ghost" size="sm" title="Invite an owner" onPress={() => makeInvite('owner')} />
          </Stack>
        )}
        {invite && (
          <Stack gap="xs" padding="md" radius="md" background={SemanticColor.AccentTint}>
            <Text variant="body">
              Send this link to the new {invite.role}. It works once, for two weeks.
            </Text>
            <Text variant="bodyStrong" selectable>
              {invite.url}
            </Text>
          </Stack>
        )}
        {!!error && (
          <Text variant="body" color={SemanticColor.TextDanger}>
            {error}
          </Text>
        )}
      </Card>

      <Card gap="sm">
        <Text variant="sectionHeader">Displays</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Open this on the monitor’s browser and leave it. Add ?theme=dark for a dark screen, or ?label=Lobby to name it here.
        </Text>
        <Text variant="bodyStrong" selectable>
          {SITE_URL}/{slug}/display
        </Text>
        {loaded.displays.length === 0 ? (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            No display has checked in yet.
          </Text>
        ) : (
          loaded.displays.map((d) => {
            const live = Date.now() - d.lastSeen < 15 * 60_000
            return (
              <Stack key={d.id} direction="row" align="center" gap="sm">
                <Text variant="body">{d.label ?? `Display ${d.id.slice(0, 6)}`}</Text>
                <Stack grow />
                <Badge label={live ? 'On' : `Last seen ${ago(d.lastSeen)}`} tone={live ? 'success' : 'neutral'} />
              </Stack>
            )
          })
        )}
      </Card>

      <Card gap="sm">
        <Text variant="sectionHeader">Calendar feed</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Anyone can subscribe in Google or Apple Calendar:
        </Text>
        <Text variant="bodyStrong" selectable>
          {SITE_URL}/{slug}.ics
        </Text>
      </Card>

      <Card gap="sm">
        <Text variant="sectionHeader">Recent saves</Text>
        {loaded.history.map((h) => (
          <Stack key={h.revision} direction="row" gap="sm">
            <Text variant="body">{h.name ?? 'Someone'}</Text>
            <Stack grow />
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {new Date(h.at).toLocaleString()}
            </Text>
          </Stack>
        ))}
      </Card>
    </Stack>
  )
}
