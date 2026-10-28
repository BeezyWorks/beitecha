import { Chip, SemanticColor, Stack, Text } from '@beezyworks/design'
import { AUDIENCES, AUDIENCE_LABELS, CATEGORY_LABELS, EVENT_CATEGORIES, type EventDef } from '@beitecha/engine'
import React, { useEffect, useState } from 'react'

import { Field } from '@/components/Field'
import { audienceChoice, categoryChoice, linkProblem, parseMinutes } from './forms'

type Details = Omit<EventDef, 'rules'>

const GUESSED = 'Guessed from the name; pick one to set it.'

/** A Localized's English, or the field cleared. */
const en = (value: string, was?: { en: string; he?: string }) => (value ? { ...was, en: value } : undefined)

/**
 * What the Siddur shows beside a shiur or program's time: what kind it is, who it's for, who gives it,
 * where, how long. All of it is set once; category and audience start as the name's guess.
 */
export function DetailsEditor({
  event,
  onChange,
  oneTime = false,
}: {
  event: Details
  onChange: (patch: Partial<Details>) => void
  /** One-time events say their end as a time, not a length. */
  oneTime?: boolean
}) {
  const category = categoryChoice(event)
  const audience = audienceChoice(event)
  const [duration, setDuration] = useState(event.duration ? String(event.duration) : '')
  useEffect(() => setDuration(event.duration ? String(event.duration) : ''), [event.duration])
  const badDuration = parseMinutes(duration) === null
  if (event.kind === 'tefila') return null

  return (
    <Stack gap="md">
      {event.kind === 'other' && (
        <Stack gap="xs">
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            What it is{category.guessed ? ` · ${GUESSED}` : ''}
          </Text>
          <Stack direction="row" wrap gap="xs">
            {EVENT_CATEGORIES.map((c) => (
              <Chip key={c} label={CATEGORY_LABELS[c].en} selected={category.value === c} onPress={() => onChange({ category: c })} />
            ))}
          </Stack>
        </Stack>
      )}
      <Stack gap="xs">
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Who it’s for{audience.guessed && audience.value !== 'everyone' ? ` · ${GUESSED}` : ''}
        </Text>
        <Stack direction="row" wrap gap="xs">
          {AUDIENCES.map((a) => (
            <Chip key={a} label={AUDIENCE_LABELS[a].en} selected={audience.value === a} onPress={() => onChange({ audience: a })} />
          ))}
        </Stack>
      </Stack>
      <Field
        label="Who exactly (optional)"
        placeholder="Boys 1st–5th, Ages 3–6"
        value={event.ages?.en ?? ''}
        onChangeText={(v) => onChange({ ages: en(v, event.ages) })}
      />
      <Stack direction="row" gap="md" wrap>
        <Stack grow>
          <Field
            label={event.kind === 'shiur' ? 'Given by (optional)' : 'Run by (optional)'}
            placeholder="R’ Stern"
            value={event.speaker?.en ?? ''}
            onChangeText={(v) => onChange({ speaker: en(v, event.speaker) })}
          />
        </Stack>
        <Stack grow>
          <Field
            label="On (optional)"
            placeholder="Hilchos Shabbos"
            value={event.topic?.en ?? ''}
            onChangeText={(v) => onChange({ topic: en(v, event.topic) })}
          />
        </Stack>
      </Stack>
      <Field
        label="Somewhere else (optional)"
        placeholder="At the Levys’, 14 Forest Ave"
        help="For an event that isn’t at the shul"
        value={event.location ?? ''}
        onChangeText={(location) => onChange({ location: location || undefined })}
      />
      <Stack direction="row" gap="md" wrap>
        <Stack grow>
          <Field
            label="Link (optional)"
            placeholder="https://… to RSVP or for details"
            value={event.link ?? ''}
            error={linkProblem(event.link ?? '') ?? undefined}
            onChangeText={(link) => onChange({ link: link.trim() || undefined })}
          />
        </Stack>
        {!oneTime && (
          <Stack width={160}>
            <Field
              label="Lasts (minutes)"
              placeholder="75"
              value={duration}
              error={badDuration ? 'Whole minutes' : undefined}
              onChangeText={(text) => {
                setDuration(text)
                const m = parseMinutes(text)
                if (m !== null) onChange({ duration: m })
              }}
            />
          </Stack>
        )}
      </Stack>
    </Stack>
  )
}

/** "Meal · Kids · R’ Stern", for an event card's caption. */
export function describeDetails(event: Details): string {
  if (event.kind === 'tefila') return ''
  const category = categoryChoice(event).value
  const audience = audienceChoice(event).value
  return [
    event.kind === 'other' && category && category !== 'program' ? CATEGORY_LABELS[category].en : undefined,
    audience !== 'everyone' ? AUDIENCE_LABELS[audience].en : undefined,
    event.speaker?.en,
    event.location,
  ]
    .filter(Boolean)
    .map((s) => ` · ${s}`)
    .join('')
}
