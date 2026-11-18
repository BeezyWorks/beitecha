import { useWindowDimensions } from 'react-native'

/** Phone-sized: below this, pages tighten up and controls take the full width. */
export const COMPACT_WIDTH = 600

export function useIsCompact() {
  return useWindowDimensions().width < COMPACT_WIDTH
}
