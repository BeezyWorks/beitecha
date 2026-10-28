import { Button, Card, Chip, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays, civilDateShort, guessCategory, NOTICE_KINDS, noticeLastDay, type DateString, type Notice, type NoticeKind } from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { NoticeCard } from '@/features/luach/NoticeCard'
import { linkProblem, sponsorTarget, withNoticeKind, withSponsorTarget, type SponsorTarget } from './forms'
import { newId, useAdmin } from './store'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const KIND: Record<NoticeKind, { label: string; title: string; titleHint: string; text: string; textHint: string }> = {
  sponsor: {
    label: 'Sponsorship',
    title: 'What’s sponsored',
    titleHint: 'Kiddush, Seudah Shlishis, the Daf Yomi shiur…',
    text: 'Sponsored by / dedication',
    textHint: 'The Cohen family, in honor of Sarah’s bas mitzvah',
  },
  announcement: { label: 'Announcement', title: 'Title (optional)', titleHint: '', text: 'Text', textHint: '' },
  reminder: {
    label: 'Reminder',
    title: 'What’s coming up',
    titleHint: 'Shul BBQ',
    text: 'Details',
    textHint: 'Sunday at Pine Park. Bring the family!',
  },
  simcha: {
    label: 'Mazal tov',
    title: 'Title (optional)',
    titleHint: '',
    text: 'Mazal tov to…',
    textHint: 'Dovid and Rivka Levy on the birth of a daughter',
  },
  condolence: {
    label: 'Condolence',
    title: 'Title (optional)',
    titleHint: 'Shiva, Yahrzeit',
    text: 'Text',
    textHint: 'Yaakov Klein is sitting shiva for his father at 12 Oak St.',
  },
}

const TARGETS: { kind: SponsorTarget['kind']; label: string }[] = [
  { kind: 'event', label: 'An event' },
  { kind: 'day', label: 'The day' },
  { kind: 'notices', label: 'The notices' },
]

const NONE = '-'

/** Events a notice can be about: weekly ones (the Kiddush) and one-time ones from today on. */
function useEventOptions(today: DateString, oneTimeOnly: boolean) {
  const schedule = useAdmin((s) => s.schedule)
  if (!schedule) return []
  const oneTime = schedule.exceptions.flatMap((x) =>
    x.type === 'add' && x.date >= today ? [{ value: x.event.id, label: `${x.event.name.en} (${civilDateShort(x.date)})` }] : [],
  )
  if (oneTimeOnly) return oneTime
  const weekly = schedule.events
    .filter((e) => e.kind !== 'tefila' && e.visibility !== 'internal')
    .map((e) => ({ value: e.id, label: e.name.en }))
  return [...weekly, ...oneTime]
}

function NoticeForm({ initial, today, onDone }: { initial: Notice; today: DateString; onDone: () => void }) {
  const upsertNotice = useAdmin((s) => s.upsertNotice)
  const [n, setN] = useState(initial)
  const events = useEventOptions(today, n.kind === 'reminder')
  const target = sponsorTarget(n)
  const copy = KIND[n.kind]
  const valid =
    n.text.en.trim() &&
    DATE_RE.test(n.from) &&
    (!n.to || (DATE_RE.test(n.to) && n.to >= n.from)) &&
    !linkProblem(n.link ?? '') &&
    !(n.kind === 'sponsor' && target.kind === 'event' && !target.eventId)
  return (
    <Card gap="md">
      <Stack direction="row" wrap gap="xs">
        {NOTICE_KINDS.map((k) => (
          <Chip key={k} label={KIND[k].label} selected={n.kind === k} onPress={() => setN(withNoticeKind(n, k))} />
        ))}
      </Stack>
      {n.kind === 'condolence' && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Shown quietly, without a banner.
        </Text>
      )}
      {n.kind === 'sponsor' && (
        <Stack gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            Sponsoring
          </Text>
          <Stack direction="row" wrap gap="xs" align="center">
            {TARGETS.map((t) => (
              <Chip
                key={t.kind}
                label={t.label}
                selected={target.kind === t.kind}
                onPress={() =>
                  setN(withSponsorTarget(n, t.kind === 'event' ? { kind: 'event', eventId: events[0]?.value ?? '' } : { kind: t.kind }))
                }
              />
            ))}
            {target.kind === 'event' && events.length > 0 && (
              <Select
                value={target.eventId}
                options={events}
                onChange={(eventId) => setN(withSponsorTarget(n, { kind: 'event', eventId }))}
                accessibilityLabel="Sponsored event"
              />
            )}
          </Stack>
          {target.kind === 'event' && !events.length && (
            <Text variant="caption" color={SemanticColor.TextDanger}>
              Add the Kiddush (or whatever is sponsored) in the Times tab first.
            </Text>
          )}
        </Stack>
      )}
      {n.kind === 'reminder' && events.length > 0 && (
        <Stack gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            About (optional)
          </Text>
          <Select
            value={n.eventId ?? NONE}
            options={[{ value: NONE, label: 'No event' }, ...events]}
            onChange={(id) => {
              const { eventId: _, ...rest } = n
              setN(id === NONE ? rest : { ...rest, eventId: id })
            }}
            accessibilityLabel="Event"
          />
        </Stack>
      )}
      <Field
        label={copy.title}
        placeholder={copy.titleHint}
        value={n.title?.en ?? ''}
        onChangeText={(en) => setN({ ...n, title: en ? { en } : undefined })}
      />
      <Field label={copy.text} placeholder={copy.textHint} value={n.text.en} onChangeText={(en) => setN({ ...n, text: { ...n.text, en } })} multiline />
      <Field
        label="Hebrew line (optional)"
        placeholder="לעילוי נשמת…"
        value={n.text.he ?? ''}
        onChangeText={(he) => setN({ ...n, text: { ...n.text, he: he || undefined } })}
      />
      <Field
        label="Link (optional)"
        placeholder="https://… to sign up or for details"
        value={n.link ?? ''}
        error={linkProblem(n.link ?? '')}
        onChangeText={(link) => setN({ ...n, link: link.trim() || undefined })}
      />
      <Stack direction="row" gap="md">
        <Stack grow>
          <Field label="Show from" value={n.from} onChangeText={(from) => setN({ ...n, from })} help="YYYY-MM-DD" />
        </Stack>
        <Stack grow>
          <Field
            label="Until (optional)"
            value={n.to ?? ''}
            onChangeText={(to) => setN({ ...n, to: to || undefined })}
            help={n.kind === 'reminder' && n.eventId ? 'Leave empty to show it until the event' : 'Leave empty for one day'}
          />
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

/** Sponsorships, announcements, reminders, mazal tovs and condolences for the display, the printed week and the Siddur. */
export function NoticesTab({ today }: { today: DateString }) {
  const notices = useAdmin((s) => s.schedule?.notices)
  const exceptions = useAdmin((s) => s.schedule?.exceptions)
  const kiddush = useAdmin((s) => s.schedule?.events.find((e) => guessCategory(e) === 'meal'))
  const removeNotice = useAdmin((s) => s.removeNotice)
  const [editing, setEditing] = useState<Notice | null>(null)
  if (!notices || !exceptions) return null
  const lastDay = (n: Notice) => noticeLastDay(n, exceptions)

  const nextShabbos = addDays(today, (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7)
  const current = notices.filter((n) => lastDay(n) >= today).sort((a, b) => a.from.localeCompare(b.from))
  const past = notices.filter((n) => lastDay(n) < today).sort((a, b) => b.from.localeCompare(a.from))

  return (
    <Stack gap="md">
      {editing ? (
        <NoticeForm initial={editing} today={today} onDone={() => setEditing(null)} />
      ) : (
        <Stack direction="row" gap="sm" wrap>
          <Button
            icon="add"
            title="Add a sponsorship"
            onPress={() =>
              setEditing({
                id: newId(),
                kind: 'sponsor',
                from: nextShabbos,
                title: { en: kiddush?.name.en ?? 'Kiddush' },
                ...(kiddush && { eventId: kiddush.id }),
                text: { en: '' },
              })
            }
          />
          <Button
            variant="secondary"
            icon="add"
            title="Add a notice"
            onPress={() => setEditing({ id: newId(), kind: 'announcement', from: today, to: addDays(today, 6), text: { en: '' } })}
          />
        </Stack>
      )}
      {!current.length && !editing && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing coming up. Sponsorships, announcements, reminders, mazal tovs and condolences show on the display, the printed
          week and in the Siddur from the day you choose.
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
