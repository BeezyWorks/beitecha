import {
  Button,
  Card,
  Chip,
  ScrollStack,
  SemanticColor,
  Stack,
  Text,
  Touchable,
  useIsWideLayout,
} from '@beezyworks/design'
import {
  addDays,
  Calendar,
  civilDateShort,
  noticeCategory,
  noticeLastDay,
  startOfWeek,
  WEEKDAYS,
  weekdayOf,
  type DateString,
  type Exception,
  type Notice,
} from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

import { makeT } from '@/features/luach/language'
import { adminLabel } from './forms'
import { KIND, NoticeForm, NoticesAi, useNewNotice } from './NoticesTab'
import { AddOneOff, exceptionFor, OccurrenceRow } from './OccurrenceRow'
import type { SectionKey } from './sections'
import { useAdmin } from './store'

const weekdayName = (date: DateString) => WEEKDAYS[weekdayOf(date)].en

/** A notice as one line: what it's for, then who and why. */
function noticeLine(n: Notice) {
  const what = n.title?.en || (n.kind === 'sponsor' ? '' : n.text.en)
  const who = [n.sponsoredBy?.en, n.inHonorOf?.en].filter(Boolean).join(' ')
  const rest = n.kind === 'sponsor' ? who || n.text.en : n.title?.en ? n.text.en : ''
  return { what: what || KIND[n.kind].label, rest }
}

function NoticeRow({ n, onEdit }: { n: Notice; onEdit: () => void }) {
  const removeNotice = useAdmin((s) => s.removeNotice)
  const { what, rest } = noticeLine(n)
  return (
    <Stack direction="row" align="center" gap="sm">
      <Stack grow width={0}>
        <Touchable onPress={onEdit} accessibilityLabel={`Edit ${what}`}>
          <Stack gap="none" paddingVertical="xs">
            <Text variant="bodyStrong" numberOfLines={1}>
              {what}
            </Text>
            {!!rest && (
              <Text variant="caption" color={SemanticColor.TextSecondary} numberOfLines={2}>
                {rest}
              </Text>
            )}
          </Stack>
        </Touchable>
      </Stack>
      <Button variant="ghost" size="sm" title="Remove" onPress={() => removeNotice(n.id)} />
    </Stack>
  )
}

/** The notices showing this week, tap to edit in place. `fresh` is a new one being added, shown first. */
function NoticeList({
  notices,
  editing,
  fresh,
  today,
  onEdit,
  onDone,
}: {
  notices: Notice[]
  editing: Notice | null
  fresh: boolean
  today: DateString
  onEdit: (n: Notice) => void
  onDone: () => void
}) {
  const form = (n: Notice) => <NoticeForm key={n.id} initial={n} today={today} onDone={onDone} />
  return (
    <Stack gap="xs">
      {fresh && editing && form(editing)}
      {notices.map((n) =>
        editing?.id === n.id ? form(n) : <NoticeRow key={n.id} n={n} onEdit={() => onEdit(n)} />,
      )}
    </Stack>
  )
}

/** What the gabbai changed for this week only, as sentences, each with Undo. */
function Different({ weekStart }: { weekStart: DateString }) {
  const schedule = useAdmin((s) => s.schedule)
  const removeException = useAdmin((s) => s.removeException)
  const [day, setDay] = useState<DateString | null>(null)
  const weekEnd = addDays(weekStart, 6)
  const mine =
    schedule?.exceptions
      .filter((x) => x.date >= weekStart && x.date <= weekEnd)
      .sort((a, b) => a.date.localeCompare(b.date)) ?? []
  /** The schedule as it would be without them, to say what a moved time was. */
  const rulesOnly = useMemo(
    () =>
      schedule
        ? new Calendar({
            ...schedule,
            exceptions: schedule.exceptions.filter((x) => x.date < weekStart || x.date > weekEnd),
          })
        : null,
    [schedule, weekStart, weekEnd],
  )
  const live = useMemo(() => (schedule ? new Calendar(schedule) : null), [schedule])
  if (!schedule || !rulesOnly || !live) return null
  const { clock } = makeT('en', schedule.settings.timeFormat)
  const nameOf = (x: Exception) => {
    const event = schedule.events.find((e) => e.id === (x.type === 'add' ? x.event.id : x.eventId))
    return event ? adminLabel(event) : x.type === 'add' ? x.event.name.en : 'Event'
  }
  const timeOf = (cal: Calendar, date: DateString, eventId: string) =>
    cal.occurrences(date).find((o) => o.eventId === eventId)?.minutes ?? null
  const sentence = (x: Exception) => {
    const name = nameOf(x)
    const note = x.note?.en ? ` — ${x.note.en}` : ''
    if (x.type === 'cancel') return `No ${name}${note}`
    if (x.type === 'note') return `${name}${note}`
    const now = timeOf(live, x.date, x.type === 'add' ? x.event.id : x.eventId)
    const at = now === null ? '' : ` at ${clock(now)}`
    if (x.type === 'add') return `${name}${at}${note}`
    const was = timeOf(rulesOnly, x.date, x.eventId)
    return `${name}${at}${was !== null && was !== now ? ` instead of ${clock(was)}` : ''}${note}`
  }
  return (
    <Stack gap="sm">
      <Text variant="title">Different this week</Text>
      {mine.length === 0 && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Nothing changed this week.
        </Text>
      )}
      {mine.map((x) => (
        <Stack key={x.id} direction="row" align="center" gap="sm">
          <Stack grow width={0}>
            <Text variant="body">
              <Text variant="bodyStrong">{weekdayName(x.date)}: </Text>
              {sentence(x)}
            </Text>
          </Stack>
          <Button variant="ghost" size="sm" title="Undo" onPress={() => removeException(x.id)} />
        </Stack>
      ))}
      {day ? (
        <Stack gap="sm">
          <Stack direction="row" wrap gap="xs">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
              <Chip
                key={d}
                label={weekdayName(d).slice(0, 3)}
                selected={d === day}
                onPress={() => setDay(d)}
              />
            ))}
          </Stack>
          <AddOneOff key={day} date={day} />
        </Stack>
      ) : (
        <Stack direction="row" gap="sm" align="center" wrap>
          <Button
            variant="secondary"
            icon="add"
            title="Add a one-time event"
            onPress={() => setDay(weekStart)}
          />
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            To change one time, click it in the week’s times.
          </Text>
        </Stack>
      )}
    </Stack>
  )
}

/** The week's times, each day's occurrences; tap one to cancel, move or note it for that day. */
function WeekTimes({ weekStart, compact }: { weekStart: DateString; compact?: boolean }) {
  const schedule = useAdmin((s) => s.schedule)
  const days = useMemo(
    () => (schedule ? new Calendar(schedule).range(weekStart, 7) : []),
    [schedule, weekStart],
  )
  if (!schedule) return null
  return (
    <Stack gap="md">
      <Text variant="title">The week’s times</Text>
      {days.map((d) => (
        <Stack key={d.date} gap="xs">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            {weekdayName(d.date)}, {civilDateShort(d.date)}
            {d.holidays.length > 0 ? ` · ${d.holidays.map((h) => h.en).join(', ')}` : ''}
          </Text>
          {d.events.length === 0 && (
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              Nothing scheduled
            </Text>
          )}
          {d.events.map((o) => (
            <OccurrenceRow
              key={o.eventId}
              date={d.date}
              o={o}
              exception={exceptionFor(schedule, d.date, o.eventId)}
              compact={compact ?? true}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  )
}

/** The landing page: the week as the bulletin has it, with what a gabbai changes every week. */
export function ThisWeekSection({
  today,
  onSection,
}: {
  today: DateString
  onSection: (s: SectionKey) => void
}) {
  const wide = useIsWideLayout()
  const schedule = useAdmin((s) => s.schedule)
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<Notice | null>(null)
  const [ai, setAi] = useState(false)
  const fresh = useNewNotice(today)
  const weekStart = addDays(startOfWeek(today), offset * 7)
  const weekEnd = addDays(weekStart, 6)
  const cal = useMemo(() => (schedule ? new Calendar(schedule) : null), [schedule])
  if (!schedule || !cal) return null

  const shabbos = cal.day(weekEnd)
  const title = shabbos.parsha
    ? `Shabbos ${shabbos.parsha.en}`
    : (shabbos.holidays[0]?.en ?? 'This week')
  const first = cal.day(weekStart)
  const notices = schedule.notices
    .filter((n) => n.from <= weekEnd && noticeLastDay(n, schedule.exceptions) >= weekStart)
    .sort((a, b) => a.from.localeCompare(b.from))
  const sponsorships = notices.filter((n) => n.kind === 'sponsor')
  const announcements = notices.filter((n) => n.kind !== 'sponsor')
  const categories = schedule.settings.noticeCategories ?? []
  const groups = categories.length
    ? [
        ...categories.map((c) => ({
          name: c.name.en,
          list: announcements.filter((n) => noticeCategory(schedule.settings, n)?.id === c.id),
        })),
        { name: 'Other', list: announcements.filter((n) => !noticeCategory(schedule.settings, n)) },
      ].filter((g) => g.list.length)
    : [{ name: '', list: announcements }]
  const announced = cal.announced(weekStart)
  const cholim = schedule.cholim?.length ?? 0
  const done = () => setEditing(null)
  const editingNew = !!editing && !schedule.notices.some((n) => n.id === editing.id)
  const editingSponsor = editing?.kind === 'sponsor'

  const main = (
    <Stack maxWidth={820} gap="xl">
      <Stack direction="row" align="center" gap="sm">
        <Button variant="ghost" size="sm" title="‹" onPress={() => setOffset(offset - 1)} />
        <Stack grow gap="none">
          <Text variant="largeTitle">{title}</Text>
          <Stack direction="row" gap="sm" wrap>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              {civilDateShort(weekStart)} – {civilDateShort(weekEnd)}
              {offset === 0 ? ' · this week' : ''} ·
            </Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              {first.hebrew.he} – {shabbos.hebrew.he}
            </Text>
          </Stack>
        </Stack>
        <Button variant="ghost" size="sm" title="›" onPress={() => setOffset(offset + 1)} />
      </Stack>

      <Stack gap="sm">
        <Text variant="title">Sponsorships</Text>
        {!sponsorships.length && !(editingNew && editingSponsor) && (
          <Text variant="body" color={SemanticColor.TextSecondary}>
            Nothing sponsored yet this week.
          </Text>
        )}
        <NoticeList
          notices={sponsorships}
          editing={editing}
          fresh={editingNew && editingSponsor}
          today={today}
          onEdit={setEditing}
          onDone={done}
        />
        {!editing && (
          <Stack direction="row">
            <Button
              variant="secondary"
              icon="add"
              title="Add a sponsorship"
              onPress={() => setEditing(fresh.sponsorship(weekEnd))}
            />
          </Stack>
        )}
      </Stack>

      <Stack gap="sm">
        <Text variant="title">Announcements</Text>
        {!announcements.length && !(editingNew && !editingSponsor) && (
          <Text variant="body" color={SemanticColor.TextSecondary}>
            No announcements this week.
          </Text>
        )}
        {groups.map((g, i) => (
          <Stack key={g.name} gap="xs">
            {!!g.name && (
              <Text variant="label" color={SemanticColor.TextSecondary}>
                {g.name}
              </Text>
            )}
            <NoticeList
              notices={g.list}
              editing={editing}
              fresh={editingNew && !editingSponsor && i === 0}
              today={today}
              onEdit={setEditing}
              onDone={done}
            />
          </Stack>
        ))}
        {!groups.length && (
          <NoticeList
            notices={[]}
            editing={editing}
            fresh={editingNew && !editingSponsor}
            today={today}
            onEdit={setEditing}
            onDone={done}
          />
        )}
        {!editing && (
          <Stack direction="row" gap="sm" wrap>
            <Button
              variant="secondary"
              icon="add"
              title="Add"
              onPress={() => setEditing(fresh.announcement(weekStart < today ? today : weekStart))}
            />
            <Button variant="ghost" title="Paste from an email" onPress={() => setAi(!ai)} />
          </Stack>
        )}
        {ai && !editing && <NoticesAi today={today} onClose={() => setAi(false)} />}
      </Stack>

      <Different weekStart={weekStart} />

      <Stack gap="sm">
        <Card gap="xs">
          <Text variant="bodyStrong">Coming up</Text>
          <Text variant="body" color={SemanticColor.TextSecondary}>
            {announced.length
              ? announced
                  .map(({ date, event }) => `${event.name.en} (${civilDateShort(date)})`)
                  .join(', ')
              : 'Nothing starred is coming up. Star an event to list it ahead of time.'}
          </Text>
        </Card>
        <Card gap="xs">
          <Text variant="bodyStrong">Refuah shleimah</Text>
          <Stack direction="row" align="center" gap="sm" wrap>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              {cholim} {cholim === 1 ? 'name' : 'names'}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              title="Edit the list"
              onPress={() => onSection('cholim')}
            />
          </Stack>
        </Card>
      </Stack>
    </Stack>
  )

  if (!wide)
    return (
      <ScrollStack padding="lg" gap="xl">
        {main}
        <WeekTimes weekStart={weekStart} />
      </ScrollStack>
    )
  return (
    <Stack direction="row" grow height={0}>
      <Stack grow width={0}>
        <ScrollStack padding="xl">{main}</ScrollStack>
      </Stack>
      <Stack
        width={360}
        background={SemanticColor.SurfaceCard}
        borderColor={SemanticColor.BorderDefault}
      >
        <ScrollStack padding="lg">
          <WeekTimes weekStart={weekStart} />
        </ScrollStack>
      </Stack>
    </Stack>
  )
}
