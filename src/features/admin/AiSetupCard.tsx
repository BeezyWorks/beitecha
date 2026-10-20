import { Button, Card, SemanticColor, Stack, Text, TextField } from '@beezyworks/design'
import { todayIn, validate, type EventDef, type Issue } from '@beitecha/engine'
import React, { useState } from 'react'

import { applyImport, buildAiPrompt, parseAiImport } from './aiSetup'
import { useAdmin } from './store'

type Checked = { ok: true; events: EventDef[]; issues: Issue[] } | { ok: false; errors: string[] }

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function pickTextFile(onText: (text: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.txt,.md,application/json,text/plain'
  input.onchange = () => input.files?.[0]?.text().then(onText)
  input.click()
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Describe the schedule to any chat AI in plain words, then paste (or upload) its answer back. */
export function AiSetupCard() {
  const schedule = useAdmin((s) => s.schedule)
  const profile = useAdmin((s) => s.profile)
  const setSchedule = useAdmin((s) => s.setSchedule)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'prompt' | 'problems' | null>(null)
  const [answer, setAnswer] = useState('')
  const [checked, setChecked] = useState<Checked | null>(null)
  const [applied, setApplied] = useState(false)
  if (!schedule || !profile) return null

  const copyPrompt = async () => {
    const prompt = buildAiPrompt(schedule, profile)
    if (await copy(prompt)) setCopied('prompt')
    else download('beitecha-prompt.txt', prompt)
  }

  const check = (text: string) => {
    setApplied(false)
    const result = parseAiImport(text)
    if (!result.ok) return setChecked(result)
    const issues = validate(
      { ...schedule, events: result.events },
      todayIn(schedule.settings.location.timeZone),
      400,
    )
    setChecked({ ok: true, events: result.events, issues: issues.filter((i) => !i.exceptionId) })
  }

  const apply = (mode: 'replace' | 'merge') => {
    if (!checked?.ok) return
    setSchedule({ ...schedule, events: applyImport(schedule.events, checked.events, mode) })
    setChecked(null)
    setAnswer('')
    setApplied(true)
  }

  const problems =
    checked &&
    (checked.ok
      ? checked.issues.filter((i) => i.level === 'error').map((i) => i.message)
      : checked.errors)
  const problemsForAi = problems?.length
    ? `Beitecha found these problems in your JSON. Please fix them and send the whole JSON again:\n${problems.map((p) => `- ${p}`).join('\n')}`
    : ''

  return (
    <Card gap="md">
      <Stack gap="xs">
        <Text variant="title">Set up with AI</Text>
        <Text variant="body" color={SemanticColor.TextSecondary}>
          Describe your minyanim in your own words to ChatGPT, Claude or Gemini, and paste its
          answer back here.
        </Text>
      </Stack>
      {!open ? (
        <Stack direction="row">
          <Button variant="secondary" size="sm" title="Get started" onPress={() => setOpen(true)} />
        </Stack>
      ) : (
        <Stack gap="lg">
          <Stack gap="sm">
            <Text variant="bodyStrong">1. Copy the instructions into a new chat</Text>
            <Text variant="body" color={SemanticColor.TextSecondary}>
              Paste them, then write your schedule underneath, e.g. “Shacharis 6:30, 6:15 on
              Mondays, Thursdays and Rosh Chodesh, 8:00 on Sundays and legal holidays. An early
              Shabbos minyan at 7:30, but not on Rosh Hashana or Yom Kippur. Mincha 15 minutes
              before shkia.”
            </Text>
            <Stack direction="row" gap="sm" wrap>
              <Button
                size="sm"
                icon={copied === 'prompt' ? 'check' : undefined}
                title={copied === 'prompt' ? 'Copied' : 'Copy instructions'}
                onPress={copyPrompt}
              />
              <Button
                variant="ghost"
                size="sm"
                icon="download"
                title="Download as a file"
                onPress={() => download('beitecha-prompt.txt', buildAiPrompt(schedule, profile))}
              />
            </Stack>
          </Stack>

          <Stack gap="sm">
            <Text variant="bodyStrong">2. Paste the AI’s answer, or upload the file it made</Text>
            <TextField
              variant="boxed"
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste the whole answer; Beitecha finds the JSON in it."
              value={answer}
              onChangeText={(t) => {
                setAnswer(t)
                setChecked(null)
              }}
            />
            <Stack direction="row" gap="sm" wrap>
              <Button
                size="sm"
                title="Check it"
                disabled={!answer.trim()}
                onPress={() => check(answer)}
              />
              <Button
                variant="ghost"
                size="sm"
                icon="document"
                title="Upload a file"
                onPress={() =>
                  pickTextFile((text) => {
                    setAnswer(text)
                    check(text)
                  })
                }
              />
            </Stack>
          </Stack>

          {!!problems?.length && (
            <Stack gap="sm" padding="md" radius="md" background={SemanticColor.AccentAlertFaded}>
              <Text variant="bodyStrong" color={SemanticColor.TextPrimary}>
                {checked?.ok
                  ? 'These times can’t be worked out:'
                  : 'This doesn’t fit Beitecha’s format yet:'}
              </Text>
              {problems.slice(0, 12).map((p, i) => (
                <Text key={i} variant="body" color={SemanticColor.TextPrimary}>
                  • {p}
                </Text>
              ))}
              {problems.length > 12 && (
                <Text variant="caption" color={SemanticColor.TextPrimary}>
                  …and {problems.length - 12} more
                </Text>
              )}
              <Stack direction="row" gap="sm" wrap>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copied === 'problems' ? 'check' : undefined}
                  title={
                    copied === 'problems' ? 'Copied; paste it to the AI' : 'Copy these for the AI'
                  }
                  onPress={async () => (await copy(problemsForAi)) && setCopied('problems')}
                />
              </Stack>
            </Stack>
          )}

          {checked?.ok && !problems?.length && (
            <Stack gap="sm">
              <Text variant="bodyStrong">
                {checked.events.length} event{checked.events.length === 1 ? '' : 's'}:{' '}
                {checked.events
                  .map(
                    (e) =>
                      `${e.name.en} (${e.rules.length} rule${e.rules.length === 1 ? '' : 's'})`,
                  )
                  .join(', ')}
              </Text>
              {checked.issues.map((i, n) => (
                <Text key={n} variant="caption" color={SemanticColor.TextSecondary}>
                  Note: {i.message}
                </Text>
              ))}
              <Stack direction="row" gap="sm" wrap>
                <Button
                  size="sm"
                  title="Replace my times with these"
                  onPress={() => apply('replace')}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  title="Add / update, keep the rest"
                  onPress={() => apply('merge')}
                />
              </Stack>
            </Stack>
          )}

          {applied && (
            <Text variant="body" color={SemanticColor.TextAccent}>
              Done. Check the preview and the rules below, then Save. Discard undoes it.
            </Text>
          )}
        </Stack>
      )}
    </Card>
  )
}
