import { useCallback } from 'react'

import type { ChangeView } from '@/lib/api'
import { describeOperation } from './connect'
import { adminLabel } from './forms'
import { useAdmin } from './store'

/** A change as a sentence, naming events the way the admin does. */
export function useDescribe() {
  const schedule = useAdmin((s) => s.schedule)
  return useCallback(
    (c: ChangeView) => {
      if (!c.payload) return c.op
      const event = (id: string) => {
        const e =
          schedule?.events.find((x) => x.id === id) ??
          schedule?.exceptions
            .flatMap((x) => (x.type === 'add' ? [x.event] : []))
            .find((x) => x.id === id)
        return e ? adminLabel(e) : undefined
      }
      return describeOperation(c.payload, c.before, { event })
    },
    [schedule],
  )
}
