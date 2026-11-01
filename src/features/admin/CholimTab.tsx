import { Button, Card, SemanticColor, Stack, Text } from '@beezyworks/design'
import { addDays, civilDateShort, type Choleh, type DateString } from '@beitecha/engine'
import React, { useState } from 'react'

import { Field } from '@/components/Field'
import { SectionPage } from './SectionPage'
import { newId, useAdmin } from './store'

/** Names on the list longer than this are asked about. */
const REVIEW_DAYS = 30

const HEBREW = /[֐-׿]/

/** One name per line, each in English or Hebrew by its letters. */
export function parseCholim(text: string, today: DateString): Choleh[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      id: newId(),
      name: HEBREW.test(line) ? { en: '', he: line } : { en: line },
      added: today,
    }))
}

function NameForm({ initial, onDone }: { initial: Choleh; onDone: (c?: Choleh) => void }) {
  const [en, setEn] = useState(initial.name.en)
  const [he, setHe] = useState(initial.name.he ?? '')
  return (
    <Card gap="md">
      <Field label="Name" placeholder="Yosef Chaim ben Rivka" value={en} onChangeText={setEn} />
      <Field label="In Hebrew" placeholder="יוסף חיים בן רבקה" value={he} onChangeText={setHe} />
      <Stack direction="row" gap="sm">
        <Button
          title="Save"
          disabled={!en.trim() && !he.trim()}
          onPress={() =>
            onDone({ ...initial, name: { en: en.trim(), ...(he.trim() && { he: he.trim() }) } })
          }
        />
        <Button variant="ghost" title="Cancel" onPress={() => onDone()} />
      </Stack>
    </Card>
  )
}

/** The refuah shleimah list, for the display, the printed week and the Siddur. */
export function CholimTab({ today }: { today: DateString }) {
  const cholim = useAdmin((s) => s.schedule?.cholim) ?? []
  const setCholim = useAdmin((s) => s.setCholim)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const old = (c: Choleh) => c.added < addDays(today, -REVIEW_DAYS)
  const stale = cholim.filter(old)

  const add = () => {
    setCholim([...cholim, ...parseCholim(draft, today)])
    setDraft('')
  }
  const replace = (c: Choleh) => setCholim(cholim.map((x) => (x.id === c.id ? c : x)))

  return (
    <SectionPage title="Refuah shleimah" intro="Names for the Mi Shebeirach, shown on the display and the printed week.">
      <Card gap="md">
        <Field
          label="Add names"
          placeholder={'One per line, in English or Hebrew:\nYosef Chaim ben Rivka\nשרה בת לאה'}
          help="With the mother’s name, as said in the Mi Shebeirach"
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <Stack direction="row">
          <Button icon="add" title="Add" disabled={!draft.trim()} onPress={add} />
        </Stack>
      </Card>
      {!cholim.length && (
        <Text variant="body" color={SemanticColor.TextSecondary}>
          No names yet. They show on the display, the printed week and in the Siddur until you take
          them off.
        </Text>
      )}
      {stale.length > 0 && (
        <Card gap="sm" background={SemanticColor.AccentTint}>
          <Text variant="body">
            {stale.length === 1 ? 'One name has' : `${stale.length} names have`} been on the list
            over a month. Keep the ones still needed, and take the others off.
          </Text>
          <Stack direction="row">
            <Button
              variant="secondary"
              size="sm"
              title="Keep them all"
              onPress={() => setCholim(cholim.map((c) => (old(c) ? { ...c, added: today } : c)))}
            />
          </Stack>
        </Card>
      )}
      {cholim.length > 0 && (
        <Card gap="sm">
          {cholim.map((c) =>
            editing === c.id ? (
              <NameForm
                key={c.id}
                initial={c}
                onDone={(changed) => {
                  if (changed) replace(changed)
                  setEditing(null)
                }}
              />
            ) : (
              <Stack key={c.id} direction="row" align="center" gap="sm" wrap>
                <Stack grow width={0} gap="none">
                  <Stack direction="row" gap="sm" wrap>
                    {!!c.name.en && <Text variant="item">{c.name.en}</Text>}
                    {!!c.name.he && (
                      <Text
                        variant="item"
                        rtl
                        color={c.name.en ? SemanticColor.TextSecondary : undefined}
                      >
                        {c.name.he}
                      </Text>
                    )}
                  </Stack>
                  <Text
                    variant="caption"
                    color={old(c) ? SemanticColor.TextAccent : SemanticColor.TextSecondary}
                  >
                    Since {civilDateShort(c.added)}
                  </Text>
                </Stack>
                {old(c) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Keep"
                    onPress={() => replace({ ...c, added: today })}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  icon="edit"
                  title="Edit"
                  onPress={() => setEditing(c.id)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon="delete"
                  title="Take off"
                  onPress={() => setCholim(cholim.filter((x) => x.id !== c.id))}
                />
              </Stack>
            ),
          )}
        </Card>
      )}
    </SectionPage>
  )
}
