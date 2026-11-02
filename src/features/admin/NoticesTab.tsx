import { Button, Card, Chip, SemanticColor, Stack, Text } from '@beezyworks/design'
import {
  addDays,
  civilDateShort,
  guessCategory,
  noticeCategory,
  noticeLastDay,
  type DateString,
  type Notice,
  type NoticeCategory,
  type NoticeKind,
  type NoticeLink,
} from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { Select } from '@/components/Select'
import { NoticeCard } from '@/features/luach/NoticeCard'
import { AiAssist } from './AiAssist'
import { noticePrompt, parseNotices } from './aiItems'
import { DateField } from './DateField'
import {
  adminLabel,
  linkProblem,
  noticeLinkProblem,
  noticeLinks,
  sponsorTarget,
  withNoticeKind,
  withNoticeLinks,
  withSponsorTarget,
  withSponsorText,
  type SponsorTarget,
} from './forms'
import { newId, useAdmin } from './store'
import { SectionPage } from './SectionPage'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const KIND: Record<
  NoticeKind,
  { label: string; title: string; titleHint: string; text: string; textHint: string }
> = {
  sponsor: {
    label: 'Sponsorship',
    title: '',
    titleHint: '',
    text: 'Sponsored by / dedication',
    textHint: 'The Cohen family, in honor of Sarah’s bas mitzvah',
  },
  announcement: {
    label: 'Announcement',
    title: 'Title (optional)',
    titleHint: '',
    text: 'Text',
    textHint: '',
  },
  reminder: {
    label: 'Reminder',
    title: 'What’s coming up',
    titleHint: 'Shul BBQ',
    text: 'Details',
    textHint: 'Sunday at Pine Park. Bring the family!',
  },
  simcha: {
    label: 'Mazal tov',
    title: 'Names (optional)',
    titleHint: 'Dovid and Rivka Levy',
    text: 'Mazal tov on…',
    textHint: 'the birth of a daughter',
  },
  condolence: {
    label: 'Condolence',
    title: 'Names (optional)',
    titleHint: 'Yaakov Klein',
    text: 'Text',
    textHint: 'is sitting shiva for his father at 12 Oak St.',
  },
}

/** The chips, in order: the shul's own categories go after Announcement, beside the built-in Mazal tov and Condolence. */
const KINDS_BEFORE: NoticeKind[] = ['sponsor', 'reminder', 'announcement']
const KINDS_AFTER: NoticeKind[] = ['simcha', 'condolence']

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
    x.type === 'add' && x.date >= today
      ? [{ value: x.event.id, label: `${x.event.name.en} (${civilDateShort(x.date)})` }]
      : [],
  )
  if (oneTimeOnly) return oneTime
  const weekly = schedule.events
    .filter((e) => e.kind !== 'tefila' && e.visibility !== 'internal')
    .map((e) => ({ value: e.id, label: adminLabel(e) }))
  return [...weekly, ...oneTime]
}

/** One notice's form; Save puts it in the schedule at once, Cancel just closes. */
export function NoticeForm({
  initial,
  today,
  onDone,
}: {
  initial: Notice
  today: DateString
  onDone: () => void
}) {
  const upsertNotice = useAdmin((s) => s.upsertNotice)
  const categories = useAdmin((s) => s.schedule?.settings.noticeCategories) ?? []
  const [n, setN] = useState(initial)
  const [links, setLinks] = useState(() => noticeLinks(initial))
  const events = useEventOptions(today, n.kind === 'reminder')
  const target = sponsorTarget(n)
  const copy = KIND[n.kind]
  const category = noticeCategory({ noticeCategories: categories }, n)
  const kindChip = (k: NoticeKind) => (
    <Chip
      key={k}
      label={KIND[k].label}
      selected={n.kind === k && !category}
      onPress={() => setN(withNoticeKind(n, k))}
    />
  )
  const valid =
    (n.text.en.trim() || (n.kind === 'sponsor' && n.sponsoredBy?.en.trim())) &&
    DATE_RE.test(n.from) &&
    (!n.to || (DATE_RE.test(n.to) && n.to >= n.from)) &&
    links.every((l) => !noticeLinkProblem(l)) &&
    !(n.kind === 'sponsor' && target.kind === 'event' && !target.eventId)
  return (
    <Card gap="md">
      <Stack direction="row" wrap gap="xs">
        {KINDS_BEFORE.map(kindChip)}
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name.en}
            selected={category?.id === c.id}
            onPress={() => setN(withNoticeKind(n, 'announcement', c.id))}
          />
        ))}
        {KINDS_AFTER.map(kindChip)}
        <NewCategoryChip onAdd={(c) => setN(withNoticeKind(n, 'announcement', c.id))} />
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
                  setN(
                    withSponsorTarget(
                      n,
                      t.kind === 'event'
                        ? { kind: 'event', eventId: events[0]?.value ?? '' }
                        : { kind: t.kind },
                    ),
                  )
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
      {n.kind !== 'sponsor' && (
        <Field
          label={copy.title}
          placeholder={copy.titleHint}
          value={n.title?.en ?? ''}
          onChangeText={(en) => setN({ ...n, title: en ? { en } : undefined })}
        />
      )}
      {n.kind === 'sponsor' && (
        <>
          <Field
            label="Sponsored by"
            placeholder="the Greenblat family"
            help="Shown in bold under the heading for what’s sponsored"
            value={n.sponsoredBy?.en ?? ''}
            onChangeText={(en) => setN({ ...n, sponsoredBy: en ? { en } : undefined })}
          />
          <Field
            label="Dedication (optional)"
            placeholder="To celebrate Sarah’s bas mitzvah"
            value={n.inHonorOf?.en ?? ''}
            onChangeText={(en) => setN({ ...n, inHonorOf: en ? { en } : undefined })}
          />
        </>
      )}
      {/* A sponsorship from before "Sponsored by" keeps its own line until one is named. */}
      {(n.kind !== 'sponsor' || (!n.sponsoredBy && !!initial.text.en)) && (
        <Field
          label={copy.text}
          placeholder={copy.textHint}
          value={n.text.en}
          onChangeText={(en) => setN({ ...n, text: { ...n.text, en } })}
          multiline
        />
      )}
      <Field
        label="Hebrew line (optional)"
        placeholder="לעילוי נשמת…"
        value={n.text.he ?? ''}
        onChangeText={(he) => setN({ ...n, text: { ...n.text, he: he || undefined } })}
      />
      <LinksEditor links={links} onChange={setLinks} />
      <Stack direction="row" gap="md" wrap>
        <Stack grow>
          <DateField
            label="Show from"
            value={n.from}
            onChange={(from) => from && setN({ ...n, from })}
          />
        </Stack>
        <Stack grow>
          <DateField
            label="Until"
            value={n.to}
            unsetLabel="Show it longer"
            initial={addDays(n.from, 6)}
            onChange={(to) => setN({ ...n, to })}
            help={
              n.to
                ? undefined
                : n.kind === 'reminder' && n.eventId
                  ? 'Until the event'
                  : 'Just that day'
            }
          />
        </Stack>
      </Stack>
      <Stack direction="row" gap="sm">
        <Button
          title="Save"
          disabled={!valid}
          onPress={() => {
            upsertNotice(
              withNoticeLinks(
                withSponsorText({ ...n, text: { ...n.text, en: n.text.en.trim() } }),
                links,
              ),
            )
            onDone()
          }}
        />
        <Button variant="ghost" title="Cancel" onPress={onDone} />
      </Stack>
    </Card>
  )
}

/** "+ Category": names a new announcement category on the spot, and files the notice under it. */
function NewCategoryChip({ onAdd }: { onAdd: (c: NoticeCategory) => void }) {
  const categories = useAdmin((s) => s.schedule?.settings.noticeCategories) ?? []
  const setNoticeCategories = useAdmin((s) => s.setNoticeCategories)
  const [name, setName] = useState<string | null>(null)
  if (name === null) return <Chip label="+ Category" onPress={() => setName('')} />
  const add = () => {
    const c = { id: newId(), name: { en: name.trim() } }
    setNoticeCategories([...categories, c])
    onAdd(c)
    setName(null)
  }
  return (
    <Stack direction="row" gap="sm" align="end" wrap>
      <Stack width={220}>
        <Field
          label="New category"
          placeholder="Community, School…"
          value={name}
          onChangeText={setName}
          autoFocus
          onSubmitEditing={() => name.trim() && add()}
        />
      </Stack>
      <Button size="sm" title="Add" disabled={!name.trim()} onPress={add} />
      <Button variant="ghost" size="sm" title="Cancel" onPress={() => setName(null)} />
    </Stack>
  )
}

/**
 * The shul's announcement categories, beside the built-in Mazal tov and Condolences: named in English and
 * Hebrew, removed (their announcements become plain ones).
 */
function CategoriesCard({ notices }: { notices: Notice[] }) {
  const categories = useAdmin((s) => s.schedule?.settings.noticeCategories) ?? []
  const setNoticeCategories = useAdmin((s) => s.setNoticeCategories)
  const set = (i: number, c: NoticeCategory) =>
    setNoticeCategories(categories.map((x, j) => (j === i ? c : x)))
  const [name, setName] = useState('')
  return (
    <Card gap="md">
      <Stack gap="xs">
        <Text variant="sectionHeader">Categories</Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Mazal tovs and condolences have their own; add your own for announcements (Community,
          School…). the bulletin groups announcements under them, and the display and the Siddur tag
          each one with its category.
        </Text>
      </Stack>
      {categories.map((c, i) => {
        const used = notices.filter((n) => n.category === c.id).length
        return (
          <Stack key={c.id} direction="row" gap="sm" wrap align="end">
            <Stack grow width={180}>
              <Field
                label="Name"
                value={c.name.en}
                onChangeText={(en) => set(i, { ...c, name: { ...c.name, en } })}
              />
            </Stack>
            <Stack grow width={180}>
              <Field
                label="In Hebrew (optional)"
                value={c.name.he ?? ''}
                onChangeText={(he) => set(i, { ...c, name: { ...c.name, he: he || undefined } })}
              />
            </Stack>
            <Button
              variant="ghost"
              size="sm"
              icon="delete"
              title={
                used
                  ? `Remove (${used === 1 ? 'its announcement becomes a plain one' : `its ${used} announcements become plain ones`})`
                  : 'Remove'
              }
              onPress={() => setNoticeCategories(categories.filter((x) => x.id !== c.id))}
            />
          </Stack>
        )
      })}
      <Stack direction="row" gap="sm" align="end" wrap>
        <Stack grow width={180}>
          <Field
            label="Add a category"
            placeholder="Community, School…"
            value={name}
            onChangeText={setName}
          />
        </Stack>
        <Button
          variant="secondary"
          size="sm"
          icon="add"
          title="Add"
          disabled={!name.trim()}
          onPress={() => {
            setNoticeCategories([...categories, { id: newId(), name: { en: name.trim() } }])
            setName('')
          }}
        />
      </Stack>
    </Card>
  )
}

/** A notice's links, each printed as a QR code under what scanning it does. */
function LinksEditor({
  links,
  onChange,
}: {
  links: NoticeLink[]
  onChange: (links: NoticeLink[]) => void
}) {
  const set = (i: number, l: NoticeLink) => onChange(links.map((x, j) => (j === i ? l : x)))
  return (
    <Stack gap="sm">
      <Stack gap="none">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Links and QR codes (optional)
        </Text>
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          the bulletin shows each as a QR code with its title; the first is the notice’s link in the
          Siddur.
        </Text>
      </Stack>
      {links.map((l, i) => (
        <Stack key={i} direction="row" gap="sm" wrap align="end">
          <Stack grow width={200}>
            <Field
              label="What scanning it does"
              placeholder="To sponsor a kiddush, Download the shiur"
              value={l.title.en}
              error={l.title.en.trim() || !l.url.trim() ? undefined : 'Say what scanning it does'}
              onChangeText={(en) => set(i, { ...l, title: { ...l.title, en } })}
            />
          </Stack>
          <Stack grow width={200}>
            <Field
              label="Link"
              placeholder="https://…"
              value={l.url}
              error={l.url.trim() ? linkProblem(l.url) : undefined}
              onChangeText={(url) => set(i, { ...l, url })}
            />
          </Stack>
          <Button
            variant="ghost"
            size="sm"
            icon="delete"
            title="Remove"
            onPress={() => onChange(links.filter((_, j) => j !== i))}
          />
        </Stack>
      ))}
      <Stack direction="row">
        <Button
          variant="secondary"
          size="sm"
          icon="add"
          title={links.length ? 'Add another link' : 'Add a link'}
          onPress={() => onChange([...links, { title: { en: '' }, url: '' }])}
        />
      </Stack>
    </Stack>
  )
}

/** Blank notices to start a form from: a sponsorship for the shul's Kiddush, or an announcement for the week. */
export function useNewNotice(today: DateString) {
  const kiddush = useAdmin((s) => s.schedule?.events.find((e) => guessCategory(e) === 'meal'))
  const nextShabbos = addDays(today, (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7)
  return {
    sponsorship: (from = nextShabbos): Notice => ({
      id: newId(),
      kind: 'sponsor',
      from,
      title: { en: kiddush?.name.en ?? 'Kiddush' },
      ...(kiddush && { eventId: kiddush.id }),
      text: { en: '' },
    }),
    announcement: (from = today): Notice => ({
      id: newId(),
      kind: 'announcement',
      from,
      to: addDays(from, 6),
      text: { en: '' },
    }),
  }
}

/** Paste an email or message; what the AI understood is shown, then added as notices. */
export function NoticesAi({ today, onClose }: { today: DateString; onClose: () => void }) {
  const schedule = useAdmin((s) => s.schedule)
  const profile = useAdmin((s) => s.profile)
  const upsertNotice = useAdmin((s) => s.upsertNotice)
  if (!schedule || !profile) return null
  const eventIds = [
    ...schedule.events.map((e) => e.id),
    ...schedule.exceptions.flatMap((x) => (x.type === 'add' ? [x.event.id] : [])),
  ]
  return (
    <AiAssist<Notice[]>
      title="Sponsorships and notices with AI"
      example="Paste the message you got, e.g. “Kiddush this Shabbos is sponsored by the Cohen family in honor of Sarah’s bas mitzvah. Mazal tov to the Levys on the birth of a daughter!”"
      prompt={(r) => noticePrompt(schedule, profile, today, r)}
      parse={(text) =>
        parseNotices(
          text,
          eventIds,
          (schedule.settings.noticeCategories ?? []).map((c) => c.id),
        )
      }
      preview={(list) => (
        <Stack gap="sm">
          {list.map((n, i) => (
            <Stack key={i} gap="xs">
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                {noticeCategory(schedule.settings, n)?.name.en ?? KIND[n.kind].label} ·{' '}
                {civilDateShort(n.from)}
                {n.to ? ` – ${civilDateShort(n.to)}` : ''}
              </Text>
              <NoticeCard notice={n} categories={schedule.settings.noticeCategories} />
            </Stack>
          ))}
        </Stack>
      )}
      applyLabel="Add them"
      onApply={(list) => list.forEach((n) => upsertNotice({ ...n, id: newId() }))}
      onClose={onClose}
    />
  )
}

/** Sponsorships, announcements, reminders, mazal tovs and condolences for the display, the bulletin and the Siddur. */
export function NoticesTab({ today }: { today: DateString }) {
  const notices = useAdmin((s) => s.schedule?.notices)
  const exceptions = useAdmin((s) => s.schedule?.exceptions)
  const removeNotice = useAdmin((s) => s.removeNotice)
  const schedule = useAdmin((s) => s.schedule)
  const [editing, setEditing] = useState<Notice | null>(null)
  const [ai, setAi] = useState(false)
  const fresh = useNewNotice(today)
  if (!notices || !exceptions || !schedule) return null
  const lastDay = (n: Notice) => noticeLastDay(n, exceptions)

  const current = notices
    .filter((n) => lastDay(n) >= today)
    .sort((a, b) => a.from.localeCompare(b.from))
  const past = notices
    .filter((n) => lastDay(n) < today)
    .sort((a, b) => b.from.localeCompare(a.from))

  return (
    <SectionPage
      title="Sponsors & notices"
      actions={
        !editing && (
          <Stack direction="row" gap="sm" wrap>
            <Button
              icon="add"
              title="Add a sponsorship"
              onPress={() => setEditing(fresh.sponsorship())}
            />
            <Button
              variant="secondary"
              icon="add"
              title="Add a notice"
              onPress={() => setEditing(fresh.announcement())}
            />
            <Button variant="ghost" title="Paste with AI" onPress={() => setAi(!ai)} />
          </Stack>
        )
      }
    >
      {editing && <NoticeForm initial={editing} today={today} onDone={() => setEditing(null)} />}
      {ai && !editing && <NoticesAi today={today} onClose={() => setAi(false)} />}
      {!current.length && !editing && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing coming up. Sponsorships, announcements, reminders, mazal tovs and condolences show
          on the display, the bulletin and in the Siddur from the day you choose.
        </Text>
      )}
      {current.map((n) => (
        <Stack key={n.id} gap="xs">
          <NoticeCard notice={n} categories={schedule.settings.noticeCategories} />
          <Stack direction="row" gap="sm">
            <Button
              variant="ghost"
              size="sm"
              icon="edit"
              title="Edit"
              onPress={() => setEditing(n)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon="delete"
              title="Delete"
              onPress={() => removeNotice(n.id)}
            />
          </Stack>
        </Stack>
      ))}
      {!editing && <CategoriesCard notices={notices} />}
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
    </SectionPage>
  )
}
