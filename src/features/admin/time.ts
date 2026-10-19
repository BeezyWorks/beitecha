import { formatClock, type Minutes } from '@beitecha/engine'

/** Minutes → `HH:MM` for a `{ clock }` expression (wraps past midnight). */
export const formatClockHHMM = (m: Minutes) => formatClock(((m % 1440) + 1440) % 1440)
