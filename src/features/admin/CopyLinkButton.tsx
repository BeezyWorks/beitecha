import { IconButton } from '@beezyworks/design'
import React from 'react'

import { copy } from './aiClipboard'

/** An icon button that copies `text`; the icon turns into a check for a moment. */
export function CopyLinkButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = React.useState(false)
  React.useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(t)
  }, [done])
  return (
    <IconButton
      name={done ? 'check' : 'share'}
      size={18}
      onPress={() => copy(text).then(setDone)}
      accessibilityLabel={done ? 'Copied' : label}
    />
  )
}
