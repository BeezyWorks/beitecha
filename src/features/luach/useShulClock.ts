import { nowMinutesIn, todayIn, type DateString, type Minutes } from '@beitecha/engine'
import { useEffect, useState } from 'react'

/** Today and the time of day *in the shul's time zone*, not the viewer's. */
export function useShulClock(timeZone: string | undefined, tickMs = 15_000): { today: DateString; minutes: Minutes; seconds: number } {
  const read = () => {
    const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const now = new Date()
    return { today: todayIn(tz, now), minutes: nowMinutesIn(tz, now), seconds: now.getSeconds() }
  }
  const [state, setState] = useState(read)
  useEffect(() => {
    setState(read())
    const t = setInterval(() => setState(read()), tickMs)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone, tickMs])
  return state
}
