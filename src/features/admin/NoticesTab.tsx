import { Button, Card, SegmentedControl, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays, type DateString, type Notice, type NoticeKind } from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { NoticeCard } from '@/features/luach/NoticeCard'
import { newId, useAdmin } from './store'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function NoticeForm({ initial, onDone }: { initial: Notice; onDone: () => void }) {
  const upsertNotice = useAdmin((s) => s.upsertNotice)
  const [n, setN] = useState(initial)
  const valid = n.text.en.trim() && DATE_RE.test(n.from) && (!n.to || (DATE_RE.test(n.to) && n.to >= n.from))
  return (
    <Card gap="md">
      <SegmentedControl<NoticeKind>
        options={[
          { key: 'sponsor', label: 'Sponsorship' },
          { key: 'announcement', label: 'Announcement' },
        ]}
        value={n.kind}
        onChange={(kind) => setN({ ...n, kind })}
      />
      <Field
        label={n.kind === 'sponsor' ? 'What’s sponsored' : 'Title (optional)'}
        placeholder={n.kind === 'sponsor' ? 'Kiddush, Seudah Shlishis, the Daf Yomi shiur…' : ''}
        value={n.title?.en ?? ''}
        onChangeText={(en) => setN({ ...n, title: en ? { en } : undefined })}
      />
      <Field
        label={n.kind === 'sponsor' ? 'Sponsored by / dedication' : 'Text'}
        placeholder={n.kind === 'sponsor' ? 'The Cohen family, in honor of Sarah’s bas mitzvah' : ''}
        value={n.text.en}
        onChangeText={(en) => setN({ ...n, text: { ...n.text, en } })}
        multiline
      />
      <Field
        label="Hebrew line (optional)"
        placeholder="לעילוי נשמת…"
        value={n.text.he ?? ''}
        onChangeText={(he) => setN({ ...n, text: { ...n.text, he: he || undefined } })}
      />
      <Stack direction="row" gap="md">
        <Stack grow>
          <Field label="Show from" value={n.from} onChangeText={(from) => setN({ ...n, from })} help="YYYY-MM-DD" />
        </Stack>
        <Stack grow>
          <Field label="Until (optional)" value={n.to ?? ''} onChangeText={(to) => setN({ ...n, to: to || undefined })} help="Leave empty for one day" />
        </Stack>
      </Stack>
      <Stack direction="row" gap="sm">
        <Button
          title="Done"
          disabled={!valid}
          onPress={() => {
            upsertNotice({ ...n, text: { ...n.text, en: n.text.en.trim() } })
            onDone()
          }}
        />
        <Button variant="ghost" title="Never mind" onPress={onDone} />
      </Stack>
    </Card>
  )
}

/** Sponsors and announcements for the display, the public page and the siddur. */
export function NoticesTab({ today }: { today: DateString }) {
  const notices = useAdmin((s) => s.schedule?.notices)
  const removeNotice = useAdmin((s) => s.removeNotice)
  const [editing, setEditing] = useState<Notice | null>(null)
  if (!notices) return null

  const nextShabbos = addDays(today, (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7)
  const current = notices.filter((n) => (n.to ?? n.from) >= today).sort((a, b) => a.from.localeCompare(b.from))
  const past = notices.filter((n) => (n.to ?? n.from) < today).sort((a, b) => b.from.localeCompare(a.from))

  return (
    <Stack gap="md">
      {editing ? (
        <NoticeForm initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <Stack direction="row" gap="sm" wrap>
          <Button
            icon="add"
            title="Add a sponsorship"
            onPress={() => setEditing({ id: newId(), kind: 'sponsor', from: nextShabbos, title: { en: 'Kiddush' }, text: { en: '' } })}
          />
          <Button
            variant="secondary"
            icon="add"
            title="Add an announcement"
            onPress={() => setEditing({ id: newId(), kind: 'announcement', from: today, to: addDays(today, 6), text: { en: '' } })}
          />
        </Stack>
      )}
      {!current.length && !editing && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing coming up. Sponsorships show on the display and the shul’s page from the day you choose.
        </Text>
      )}
      {current.map((n) => (
        <Stack key={n.id} gap="xs">
          <NoticeCard notice={n} />
          <Stack direction="row" gap="sm">
            <Button variant="ghost" size="sm" icon="edit" title="Edit" onPress={() => setEditing(n)} />
            <Button variant="ghost" size="sm" icon="delete" title="Delete" onPress={() => removeNotice(n.id)} />
          </Stack>
        </Stack>
      ))}
      {past.length > 0 && (
        <Card gap="sm">
          <Text variant="sectionHeader">Past</Text>
          {past.slice(0, 20).map((n) => (
            <Stack key={n.id} direction="row" align="center" gap="sm">
              <Text variant="body" numberOfLines={1}>
                {n.from} · {n.title?.en ? `${n.title.en}: ` : ''}
                {n.text.en}
              </Text>
              <Stack grow />
              <Button variant="ghost" size="sm" title="Delete" onPress={() => removeNotice(n.id)} />
            </Stack>
          ))}
        </Card>
      )}
    </Stack>
  )
}
