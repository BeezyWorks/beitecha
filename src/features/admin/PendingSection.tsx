import { Badge, Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import React, { useEffect, useState } from 'react'

import { confirmAction } from '@/components/confirm'
import type { ChangeView } from '@/lib/api'
import { relativeTime } from './connect'
import { isLivePending, useConnect } from './connectStore'
import { SectionPage } from './SectionPage'
import { useDescribe } from './useDescribe'

function PendingCard({ c, expired }: { c: ChangeView; expired?: boolean }) {
  const { approve, reject, refused } = useConnect()
  const describe = useDescribe()
  const [busy, setBusy] = useState(false)
  const now = Date.now()
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    await fn()
    setBusy(false)
  }
  return (
    <Card gap="sm">
      <Stack direction="row" align="center" gap="sm" wrap>
        <Stack grow gap="none">
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {c.userName ?? 'A gabbai'} · {c.connectionLabel ?? 'an assistant'} ·{' '}
            {relativeTime(c.createdAt, now)}
          </Text>
        </Stack>
        {expired && <Badge label="Expired" tone="neutral" />}
      </Stack>
      <Text variant="bodyStrong">{describe(c)}</Text>
      {!!refused[c.id] && (
        <Stack padding="md" radius="md" background={SemanticColor.AccentAlertFaded}>
          <Text variant="body">{refused[c.id]}</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            It’s still waiting. Reject it, or ask the assistant to send it again.
          </Text>
        </Stack>
      )}
      {!expired && (
        <Stack direction="row" gap="sm" wrap>
          <Button
            size="sm"
            title="Approve"
            disabled={busy}
            onPress={() => run(() => approve(c.id))}
          />
          <Button
            size="sm"
            variant="secondary"
            title="Reject"
            disabled={busy}
            onPress={() => run(() => reject(c.id))}
          />
        </Stack>
      )}
    </Card>
  )
}

/** Changes waiting for a gabbai: what an assistant in "ask first" mode wants to do. */
export function PendingSection() {
  const { changes, ready, approveAll, notice, error, clearNotice } = useConnect()
  const refreshChanges = useConnect((s) => s.refreshChanges)
  useEffect(() => void refreshChanges(), [refreshChanges])
  const [showExpired, setShowExpired] = useState(false)
  const now = Date.now()
  const live = changes.filter((c) => isLivePending(c, now))
  const expired = changes.filter(
    (c) => c.status === 'expired' || (c.status === 'pending' && !isLivePending(c, now)),
  )
  // Group by connection, in the order the newest request arrived.
  const groups = live.reduce<{ id: string; label: string; user: string; items: ChangeView[] }[]>(
    (acc, c) => {
      const g = acc.find((x) => x.id === c.connectionId)
      if (g) g.items.push(c)
      else
        acc.push({
          id: c.connectionId,
          label: c.connectionLabel ?? 'an assistant',
          user: c.userName ?? 'A gabbai',
          items: [c],
        })
      return acc
    },
    [],
  )
  return (
    <SectionPage
      title="Pending"
      intro="Changes an assistant has asked for, waiting for a gabbai. Any gabbai can approve or reject them. They expire after 14 days."
      actions={
        live.length > 1 ? (
          <Button
            title={`Approve all (${live.length})`}
            onPress={() => {
              if (confirmAction(`Approve all ${live.length} changes?`)) void approveAll()
            }}
          />
        ) : undefined
      }
    >
      {!!(notice || error) && (
        <Stack
          direction="row"
          gap="md"
          padding="md"
          radius="md"
          background={SemanticColor.AccentTint}
        >
          <Stack grow>
            <Text variant="body">{error ?? notice}</Text>
          </Stack>
          <Button size="sm" variant="ghost" title="Dismiss" onPress={clearNotice} />
        </Stack>
      )}
      {ready && live.length === 0 && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing is waiting.
        </Text>
      )}
      {groups.map((g) => (
        <Stack key={g.id} gap="sm">
          <Text variant="title">
            {g.items.length} {g.items.length === 1 ? 'change' : 'changes'} from {g.user}’s {g.label}
          </Text>
          {g.items.map((c) => (
            <PendingCard key={c.id} c={c} />
          ))}
        </Stack>
      ))}
      {expired.length > 0 && (
        <Stack gap="sm">
          <Stack direction="row">
            <Button
              variant="ghost"
              size="sm"
              title={showExpired ? 'Hide expired' : `Expired (${expired.length})`}
              onPress={() => setShowExpired(!showExpired)}
            />
          </Stack>
          {showExpired && expired.map((c) => <PendingCard key={c.id} c={c} expired />)}
        </Stack>
      )}
    </SectionPage>
  )
}
