import { useEffect } from 'react'

/** Sets the browser tab title. */
export function usePageTitle(title: string | undefined) {
  useEffect(() => {
    if (title && typeof document !== 'undefined') document.title = title
  }, [title])
}
