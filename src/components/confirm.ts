import { Platform } from 'react-native'

/** An "are you sure?" before something that can't be taken back. The admin is web-only; elsewhere it just goes ahead. */
export const confirmAction = (message: string): boolean =>
  Platform.OS !== 'web' || typeof window === 'undefined' ? true : window.confirm(message)
