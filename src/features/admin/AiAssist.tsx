import { Button, SemanticColor, Stack, Text, TextField } from '@beezyworks/design'
import React, { useState } from 'react'

import { copy, download } from './aiClipboard'
import type { Parsed } from './aiItems'

/**
 * One thing done through any chat AI: the gabbai says what they want, copies it (with Beitecha's format) into
 * ChatGPT, Claude or Gemini, and pastes the answer back. What it understood is shown before anything changes.
 */
export function AiAssist<T>({
  title,
  example,
  prompt,
  parse,
  check,
  preview,
  applyLabel,
  onApply,
  onClose,
  initialAnswer = '',
  answerHint = 'Paste the whole answer; Beitecha finds the JSON in it.',
}: {
  title: string
  /** What a gabbai might ask for, as the placeholder. */
  example: string
  /** The whole message for the AI, with the gabbai's request at its end. */
  prompt: (request: string) => string
  parse: (answer: string) => Parsed<T>
  /** Problems the format doesn't catch (times that can't be worked out). */
  check?: (value: T) => string[]
  preview: (value: T) => React.ReactNode
  applyLabel: string
  onApply: (value: T) => void
  onClose: () => void
  /** An answer already in hand (a file the gabbai loaded), checked at once. */
  initialAnswer?: string
  /** What the answer box says when empty. */
  answerHint?: string
}) {
  const [request, setRequest] = useState('')
  const [copied, setCopied] = useState<'prompt' | 'problems' | null>(null)
  const [answer, setAnswer] = useState(initialAnswer)

  const parsed = answer.trim() ? parse(answer) : null
  const problems = parsed ? (parsed.ok ? (check?.(parsed.value) ?? []) : parsed.errors) : []
  const forAi = `Beitecha found these problems in your answer. Please fix them and send the whole answer again:\n${problems
    .map((p) => `- ${p}`)
    .join('\n')}`

  const copyPrompt = async () => {
    const text = prompt(request.trim())
    if (await copy(text)) setCopied('prompt')
    else download('beitecha-prompt.txt', text)
  }

  return (
    <Stack gap="md" padding="md" radius="md" background={SemanticColor.SurfaceBackground} borderWidth={1} borderColor={SemanticColor.BorderDefault}>
      <Stack direction="row" align="center" gap="sm">
        <Stack grow gap="none">
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            With ChatGPT, Claude or Gemini: say what you want, copy it over, paste the answer back.
          </Text>
        </Stack>
        <Button variant="ghost" size="sm" title="Close" onPress={onClose} />
      </Stack>

      <Stack gap="sm">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          1. What you want, in your own words
        </Text>
        <TextField variant="boxed" multiline placeholder={example} value={request} onChangeText={setRequest} />
        <Stack direction="row" gap="sm" wrap>
          <Button
            size="sm"
            icon={copied === 'prompt' ? 'check' : undefined}
            title={copied === 'prompt' ? 'Copied; paste it into a new chat' : 'Copy for the AI'}
            onPress={copyPrompt}
          />
        </Stack>
      </Stack>

      <Stack gap="sm">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          2. Paste the AI’s answer
        </Text>
        <TextField
          variant="boxed"
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={answerHint}
          value={answer}
          onChangeText={(t) => {
            setAnswer(t)
            setCopied(null)
          }}
        />
      </Stack>

      {problems.length > 0 && (
        <Stack gap="sm" padding="md" radius="md" background={SemanticColor.AccentAlertFaded}>
          <Text variant="bodyStrong" color={SemanticColor.TextPrimary}>
            {parsed?.ok ? 'These times can’t be worked out:' : 'This doesn’t fit yet:'}
          </Text>
          {problems.slice(0, 8).map((p, i) => (
            <Text key={i} variant="body" color={SemanticColor.TextPrimary}>
              • {p}
            </Text>
          ))}
          {problems.length > 8 && <Text variant="caption" color={SemanticColor.TextPrimary}>…and {problems.length - 8} more</Text>}
          <Stack direction="row">
            <Button
              variant="secondary"
              size="sm"
              icon={copied === 'problems' ? 'check' : undefined}
              title={copied === 'problems' ? 'Copied; paste it to the AI' : 'Copy these for the AI'}
              onPress={async () => (await copy(forAi)) && setCopied('problems')}
            />
          </Stack>
        </Stack>
      )}

      {parsed?.ok && !problems.length && (
        <Stack gap="sm">
          <Text variant="label" color={SemanticColor.TextSecondary}>
            3. Check what it understood
          </Text>
          {preview(parsed.value)}
          <Stack direction="row" gap="sm">
            <Button
              size="sm"
              title={applyLabel}
              onPress={() => {
                onApply(parsed.value)
                onClose()
              }}
            />
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}
