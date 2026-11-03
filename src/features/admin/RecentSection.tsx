import { Badge, Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import React, { useEffect, useState } from 'react'

import { confirmAction } from '@/components/confirm'
import { Field } from '@/components/Field'
import type { ChangeView } from '@/lib/api'
import {
  beforeAfter,
  relativeTime,
  SINCE_CHOICES,
  sinceDate,
  sinceTime,
  type SinceChoice,
} from './connect'
import { useConnect } from './connectStore'
import { SectionPage } from './SectionPage'
import { useAdmin } from './store'
import { useDescribe } from './useDescribe'

function ChangeCard({ c }: { c: ChangeView }) {
  const { undo, refused } = useConnect()
  const describe = useDescribe()
  const [busy, setBusy] = useState(false)
  const { was, now } = beforeAfter(c.before, c.after)
  const reverted = c.status === 'reverted'
  return (
    <Card gap="sm">
      <Stack direction="row" align="center" gap="sm" wrap>
        <Stack grow gap="none">
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            {c.userName ?? 'A gabbai'} · {c.connectionLabel ?? 'an assistant'} ·{' '}
            {relativeTime(c.decidedAt ?? c.createdAt, Date.now())}
          </Text>
        </Stack>
        {reverted && <Badge label="Undone" tone="neutral" />}
      </Stack>
      <Text variant="bodyStrong">{describe(c)}</Text>
      {(!!was || !!now) && (
        <Stack gap="none">
          {!!was && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Was: {was}
            </Text>
          )}
          {!!now && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Now: {now}
            </Text>
          )}
        </Stack>
      )}
      {!!refused[c.id] && (
        <Stack padding="md" radius="md" background={SemanticColor.AccentAlertFaded}>
          <Text variant="body">{refused[c.id]}</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            It was changed after this, so undoing it would lose that. Edit it by hand instead.
          </Text>
        </Stack>
      )}
      {!reverted && (
        <Stack direction="row">
          <Button
            size="sm"
            variant="secondary"
            title="Undo"
            disabled={busy}
            onPress={async () => {
              setBusy(true)
              await undo(c.id)
              setBusy(false)
            }}
          />
        </Stack>
      )}
    </Card>
  )
}

function UndoSince() {
  const { connections, undoSince } = useConnect()
  const tz = useAdmin((s) => s.schedule?.settings.location.timeZone) ?? 'UTC'
  const [open, setOpen] = useState<string | null>(null)
  const [date, setDate] = useState('')
  // Revoked connections too: their changes can still be taken back.
  const active = connections
  if (active.length === 0) return null
  const run = (id: string, label: string, since: number) => {
    if (!confirmAction(`Undo everything “${label}” did since ${new Date(since).toLocaleString()}?`))
      return
    setOpen(null)
    void undoSince(id, since)
  }
  return (
    <Card gap="sm">
      <Text variant="sectionHeader">Undo everything since…</Text>
      <Text variant="body" color={SemanticColor.TextSecondary}>
        Takes back what one connection did, newest first. It stops at anything that was changed
        after.
      </Text>
      {active.map((c) => (
        <Stack key={c.id} gap="xs">
          <Stack direction="row" align="center" gap="sm" wrap>
            <Stack grow>
              <Text variant="body">
                {c.label}
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  {' '}
                  · {c.userName ?? 'A gabbai'}
                </Text>
              </Text>
            </Stack>
            <Button
              size="sm"
              variant="secondary"
              title={open === c.id ? 'Close' : 'Undo since…'}
              onPress={() => setOpen(open === c.id ? null : c.id)}
            />
          </Stack>
          {open === c.id && (
            <Stack direction="row" gap="sm" wrap align="center">
              {SINCE_CHOICES.map((o) => (
                <Button
                  key={o.key}
                  size="sm"
                  variant="outline"
                  title={o.label}
                  onPress={() =>
                    run(c.id, c.label, sinceTime(o.key as SinceChoice, Date.now(), tz))
                  }
                />
              ))}
              <Stack width={160}>
                <Field
                  label="Or a date"
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-11-01"
                />
              </Stack>
              <Button
                size="sm"
                variant="outline"
                title="Undo since date"
                disabled={sinceDate(date) === null}
                onPress={() => {
                  const at = sinceDate(date)
                  if (at !== null) run(c.id, c.label, at)
                }}
              />
            </Stack>
          )}
        </Stack>
      ))}
    </Card>
  )
}

/** What assistants and scripts changed, newest first, each undoable. */
export function RecentSection() {
  const { changes, ready, notice, error, clearNotice } = useConnect()
  const refreshChanges = useConnect((s) => s.refreshChanges)
  useEffect(() => void refreshChanges(), [refreshChanges])
  const done = changes.filter((c) => c.status === 'applied' || c.status === 'reverted')
  return (
    <SectionPage
      title="Recent changes"
      intro="Everything assistants and scripts changed. Undo puts it back, unless it has been changed since."
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
      <UndoSince />
      {ready && done.length === 0 && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing yet.
        </Text>
      )}
      {done.map((c) => (
        <ChangeCard key={c.id} c={c} />
      ))}
    </SectionPage>
  )
}
