import React, { useEffect, useState } from 'react'

import { Field } from './Field'

/** A labeled number input that keeps what's typed ("40.") and reports only valid numbers. */
export function NumberField({
  label,
  value,
  onChange,
  help,
}: {
  label: string
  value: number | undefined
  onChange: (n: number | undefined) => void
  help?: string
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  useEffect(() => {
    if (Number(text) !== value) setText(value === undefined ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  const invalid = text.trim() !== '' && !Number.isFinite(Number(text))
  return (
    <Field
      label={label}
      value={text}
      keyboardType="numeric"
      help={help}
      error={invalid ? 'Not a number' : null}
      onChangeText={(t) => {
        setText(t)
        if (t.trim() === '') onChange(undefined)
        else if (Number.isFinite(Number(t))) onChange(Number(t))
      }}
    />
  )
}
