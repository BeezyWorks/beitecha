import {
  Button,
  Card,
  SemanticColor,
  Stack,
  Text,
  ToggleSwitch,
  useIsWideLayout,
} from '@beezyworks/design'
import {
  Calendar,
  type CustomZman,
  customZmanProblem,
  isSunBased,
  makeT,
  type Schedule,
  type ShulSettings,
  type SunPosition,
  todayIn,
  type ZmanRef,
} from '@beitecha/engine'
import React, { useMemo, useState } from 'react'

import { Field } from '@/components/Field'
import { NumberField } from '@/components/NumberField'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import { zmanLabel } from './forms'

/** A point to count from, as one picker value: `sunrise`, `sunset`, `morning`/`evening` (an angle), or `zman:<id>`. */
type PointKey = string

const pointKey = (p: SunPosition | ZmanRef): PointKey =>
  typeof p === 'string' ? p : 'zman' in p ? `zman:${p.zman}` : p.at

const describePoint = (p: SunPosition | ZmanRef, all: CustomZman[]): string =>
  typeof p === 'string'
    ? p
    : 'zman' in p
      ? zmanLabel(p.zman, all)
      : `the sun ${Math.abs(p.degrees)}° ${p.degrees < 0 ? 'above' : 'below'} the horizon (${p.at})`

/** "180 zmani min after Alos 72 (day from Alos 72 to Tzeis 72)", in a line. */
export function describeCustomZman(c: CustomZman, all: CustomZman[]): string {
  const from = describePoint(c.from, all)
  const minutes = c.minutes ?? 0
  if (!minutes) return from[0].toUpperCase() + from.slice(1)
  const at = `${Math.abs(minutes)}${c.zmani ? ' zmani' : ''} min ${minutes < 0 ? 'before' : 'after'} ${from}`
  return c.zmani
    ? `${at} (day from ${describePoint(c.zmani.start, all)} to ${describePoint(c.zmani.end, all)})`
    : at
}

/** Whether a zman sees sunrise or sunset itself (not only angles and other zmanim), so its elevation matters. */
const usesHorizon = (c: CustomZman) =>
  typeof c.from === 'string' ||
  (!!c.zmani && (c.zmani.start === 'sunrise' || c.zmani.end === 'sunset'))

const camel = (name: string) =>
  name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w.toLowerCase()))
    .join('')
    .replace(/^[0-9]+/, '')

const blank: CustomZman = { id: '', name: { he: '' }, from: 'sunrise' }

/**
 * The shul's own zmanim, for a shita the built-ins don't have: a sun angle, minutes from sunrise or sunset (clock or
 * zmani), with the zmani day running from sunrise or an alos to sunset or a tzeis. Rules use them like any zman,
 * and they show beside the built-ins.
 */
export function CustomZmanimCard({
  schedule,
  onChange,
}: {
  schedule: Schedule
  onChange: (s: ShulSettings) => void
}) {
  const { settings } = schedule
  const custom = settings.zmanim?.custom ?? []
  const setCustom = (list: CustomZman[]) =>
    onChange({
      ...settings,
      zmanim: { ...settings.zmanim, custom: list.length ? list : undefined },
    })
  /** The zman being edited: its index, or `new`. */
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<CustomZman>(blank)
  const [open, setOpen] = useState(custom.length > 0)
  // On a phone a line's buttons go under its text: a row child doesn't shrink, so long text would push them off.
  const wide = useIsWideLayout()
  const line = { direction: wide ? 'row' : 'column', align: wide ? 'center' : 'stretch' } as const

  const start = (i: number | 'new') => {
    setDraft(i === 'new' ? blank : custom[i])
    setEditing(i)
  }
  const others =
    editing === null || editing === 'new' ? custom : custom.filter((_, i) => i !== editing)
  const id = draft.id || camel(draft.name.en ?? '')
  const candidate: CustomZman = { ...draft, id }
  const withDraft = [...others, candidate]
  const problem = customZmanProblem(candidate, withDraft)
  const save = () => {
    if (problem || editing === null) return
    setCustom(editing === 'new' ? withDraft : custom.map((c, i) => (i === editing ? candidate : c)))
    setEditing(null)
  }

  // What it comes to this week, so the gabbai can check it against a luach.
  const today = todayIn(settings.location.timeZone)
  const preview = useMemo(() => {
    if (problem || editing === null) return null
    const cal = new Calendar({
      ...schedule,
      settings: { ...settings, zmanim: { ...settings.zmanim, custom: withDraft } },
    })
    const { clock } = makeT('en', settings.timeFormat)
    const m = cal.zmanimOn(today)[candidate.id]
    return m === undefined ? 'The sun doesn’t get there today' : `Today: ${clock(m)}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(withDraft), problem, editing, today])

  // Only zmanim counted straight from the sun can start or end a day, or be counted from.
  const anchors = others.filter(isSunBased)
  const fromOptions = [
    { value: 'sunrise', label: 'Sunrise' },
    { value: 'sunset', label: 'Sunset' },
    { value: 'morning', label: 'The sun at an angle, morning' },
    { value: 'evening', label: 'The sun at an angle, evening' },
    ...anchors.map((c) => ({ value: `zman:${c.id}`, label: zmanLabel(c.id, custom) })),
  ]
  const setFrom = (k: PointKey) => {
    const degrees =
      typeof draft.from === 'object' && 'degrees' in draft.from ? draft.from.degrees : 16.1
    const from: CustomZman['from'] =
      k === 'sunrise' || k === 'sunset'
        ? k
        : k === 'morning' || k === 'evening'
          ? { degrees, at: k }
          : { zman: k.slice(5) }
    setDraft({ ...draft, from })
  }
  const dayPoint = (k: PointKey) => (k.startsWith('zman:') ? { zman: k.slice(5) } : k)
  const minutes = draft.minutes ?? 0

  return (
    <Card gap="md">
      <Text variant="sectionHeader">Custom zmanim</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Advanced: zmanim of your own, by a sun angle or minutes from sunrise or sunset. Rules can
        use them, and they show with the others.
      </Text>
      {!open && (
        <Stack direction="row">
          <Button
            variant="secondary"
            size="sm"
            title="Set up custom zmanim…"
            onPress={() => setOpen(true)}
          />
        </Stack>
      )}
      {open && (
        <>
          {custom.map((c, i) =>
            editing === i ? null : (
              <Stack key={c.id} {...line} gap="sm">
                <Stack grow>
                  <Text variant="bodyStrong">
                    {c.name.he}
                    {c.name.en ? ` · ${c.name.en}` : ''}
                  </Text>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    {describeCustomZman(c, custom)}
                    {c.deadline ? ', rounded down' : ''}
                    {usesHorizon(c) && c.elevation !== undefined
                      ? c.elevation
                        ? ', from the shul’s height'
                        : ', at sea level'
                      : ''}{' '}
                    · id {c.id}
                  </Text>
                </Stack>
                <Stack direction="row" gap="xs">
                  <Button variant="ghost" size="sm" title="Edit" onPress={() => start(i)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Remove"
                    onPress={() => setCustom(custom.filter((_, j) => j !== i))}
                  />
                </Stack>
              </Stack>
            ),
          )}
          {editing === null && (
            <Stack direction="row">
              <Button
                variant="secondary"
                size="sm"
                title="Add a zman…"
                onPress={() => start('new')}
              />
            </Stack>
          )}
          {editing !== null && (
            <Stack
              gap="md"
              padding="md"
              radius="md"
              borderWidth={1}
              borderColor={SemanticColor.BorderDefault}
            >
              <Field
                label="Hebrew name"
                value={draft.name.he}
                placeholder="סוף זמן ק״ש מג״א 16.1°"
                onChangeText={(he) => setDraft({ ...draft, name: { ...draft.name, he } })}
              />
              <Field
                label="English name (optional)"
                value={draft.name.en ?? ''}
                placeholder="Latest Shema (MGA 16.1°)"
                onChangeText={(en) =>
                  setDraft({ ...draft, name: { ...draft.name, en: en || undefined } })
                }
              />
              {editing === 'new' ? (
                <Field
                  label="Id"
                  value={draft.id}
                  placeholder={id || 'shmaMga16'}
                  help="What rules and the Siddur call it. Letters and digits; it can’t change later."
                  onChangeText={(v) => setDraft({ ...draft, id: v.trim() })}
                />
              ) : (
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  Id: {draft.id}
                </Text>
              )}

              <Stack gap="xs">
                <Text variant="label" color={SemanticColor.TextSecondary}>
                  Counted from
                </Text>
                <Select
                  value={pointKey(draft.from)}
                  options={fromOptions}
                  onChange={setFrom}
                  accessibilityLabel="Counted from"
                />
              </Stack>
              {typeof draft.from === 'object' && 'degrees' in draft.from && (
                <NumberField
                  label="Degrees below the horizon"
                  value={draft.from.degrees}
                  help="Negative for above it. Alos is often 16.1°, tzeis 8.5°."
                  onChange={(degrees) =>
                    degrees !== undefined &&
                    setDraft({
                      ...draft,
                      from: { ...(draft.from as { at: 'morning' | 'evening' }), degrees },
                    })
                  }
                />
              )}

              <Stack direction="row" align="end" gap="sm" wrap>
                <Stack grow>
                  <NumberField
                    label="Minutes"
                    value={Math.abs(minutes)}
                    onChange={(n) =>
                      setDraft({
                        ...draft,
                        minutes: n === undefined ? undefined : (minutes < 0 ? -1 : 1) * Math.abs(n),
                      })
                    }
                  />
                </Stack>
                <Segments<'before' | 'after'>
                  options={[
                    { key: 'before', label: 'Before' },
                    { key: 'after', label: 'After' },
                  ]}
                  value={minutes < 0 ? 'before' : 'after'}
                  onChange={(k) =>
                    setDraft({ ...draft, minutes: (k === 'before' ? -1 : 1) * Math.abs(minutes) })
                  }
                />
              </Stack>
              <Segments<'clock' | 'zmani'>
                options={[
                  { key: 'clock', label: 'Clock minutes' },
                  { key: 'zmani', label: 'Zmani minutes' },
                ]}
                value={draft.zmani ? 'zmani' : 'clock'}
                onChange={(k) =>
                  setDraft({
                    ...draft,
                    zmani: k === 'zmani' ? { start: 'sunrise', end: 'sunset' } : undefined,
                  })
                }
              />
              {draft.zmani && (
                <Stack gap="xs">
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    A zmani minute is 1/720 of the day, a sha’a zmanis 60 of them. The day runs from
                    sunrise or an alos to sunset or a tzeis; add your alos and tzeis as zmanim of
                    their own first (by an angle or minutes from sunrise and sunset).
                  </Text>
                  <Stack direction="row" gap="sm">
                    <Stack grow>
                      <Select
                        value={pointKey(draft.zmani.start)}
                        options={[
                          { value: 'sunrise', label: 'Day from sunrise' },
                          ...anchors.map((c) => ({
                            value: `zman:${c.id}`,
                            label: `Day from ${zmanLabel(c.id, custom)}`,
                          })),
                        ]}
                        onChange={(k) =>
                          setDraft({
                            ...draft,
                            zmani: { ...draft.zmani!, start: dayPoint(k) as 'sunrise' | ZmanRef },
                          })
                        }
                        accessibilityLabel="The day starts at"
                      />
                    </Stack>
                    <Stack grow>
                      <Select
                        value={pointKey(draft.zmani.end)}
                        options={[
                          { value: 'sunset', label: 'to sunset' },
                          ...anchors.map((c) => ({
                            value: `zman:${c.id}`,
                            label: `to ${zmanLabel(c.id, custom)}`,
                          })),
                        ]}
                        onChange={(k) =>
                          setDraft({
                            ...draft,
                            zmani: { ...draft.zmani!, end: dayPoint(k) as 'sunset' | ZmanRef },
                          })
                        }
                        accessibilityLabel="The day ends at"
                      />
                    </Stack>
                  </Stack>
                </Stack>
              )}

              {usesHorizon(draft) && (
                <Stack {...line} gap="sm">
                  <Stack grow>
                    <Text variant="body">Sunrise and sunset from the shul’s height</Text>
                    <Text variant="caption" color={SemanticColor.TextSecondary}>
                      {settings.location.elevation
                        ? `As seen from ${settings.location.elevation} m up: sunrise a little earlier and sunset a little later than at sea level.`
                        : 'Set the shul’s elevation under Zmanim first; until then it’s the same as sea level.'}{' '}
                      Sun angles are always from sea level. A zman this counts from keeps its own
                      setting.
                    </Text>
                  </Stack>
                  <Stack direction="row">
                    <ToggleSwitch
                      value={draft.elevation ?? !!settings.zmanim?.useElevation}
                      onValueChange={(elevation) => setDraft({ ...draft, elevation })}
                      accessibilityLabel="Sunrise and sunset from the shul’s height"
                    />
                  </Stack>
                </Stack>
              )}

              <Stack {...line} gap="sm">
                <Stack grow>
                  <Text variant="body">A deadline</Text>
                  <Text variant="caption" color={SemanticColor.TextSecondary}>
                    Like sof zman Shema: rounded down to the minute, so it’s never late. Otherwise
                    it’s rounded up, like tzeis.
                  </Text>
                </Stack>
                <Stack direction="row">
                  <ToggleSwitch
                    value={!!draft.deadline}
                    onValueChange={(deadline) =>
                      setDraft({ ...draft, deadline: deadline || undefined })
                    }
                    accessibilityLabel="A deadline"
                  />
                </Stack>
              </Stack>

              <Text
                variant="bodyStrong"
                color={problem ? SemanticColor.TextDanger : SemanticColor.TextPrimary}
              >
                {problem ?? preview}
              </Text>
              <Stack direction="row" gap="sm">
                <Button
                  title={editing === 'new' ? 'Add' : 'Save'}
                  disabled={!!problem}
                  onPress={save}
                />
                <Button variant="ghost" title="Cancel" onPress={() => setEditing(null)} />
              </Stack>
            </Stack>
          )}
        </>
      )}
    </Card>
  )
}
