import { useEffect, useState } from 'react'

import { api, ApiError, type ShulFeed } from '@/lib/api'
import { storage } from '@/lib/storage'

interface State {
  feed: ShulFeed | null
  /** Set when the latest fetch failed; `feed` may still hold the cached copy. */
  error: string | null
  notFound: boolean
}

const cacheKey = (slug: string) => `beitecha.feed.${slug}`

/**
 * A shul's published schedule. Starts from the last copy this browser saw (so a
 * display keeps working through a wifi outage), then refreshes, and keeps
 * refreshing every `pollMs` when given.
 */
export function useShulFeed(slug: string, pollMs?: number): State {
  const [state, setState] = useState<State>(() => {
    const cached = storage.get(cacheKey(slug))
    let feed: ShulFeed | null = null
    try {
      feed = cached ? (JSON.parse(cached).feed as ShulFeed) : null
    } catch {}
    return { feed, error: null, notFound: false }
  })

  useEffect(() => {
    let active = true
    let etag: string | null = null
    try {
      etag = JSON.parse(storage.get(cacheKey(slug)) ?? 'null')?.etag ?? null
    } catch {}
    const load = async () => {
      try {
        const res = await api.feed(slug, etag)
        if (!active) return
        if (res) {
          etag = res.etag
          storage.set(cacheKey(slug), JSON.stringify(res))
          setState({ feed: res.feed, error: null, notFound: false })
        } else {
          setState((s) => ({ ...s, error: null }))
        }
      } catch (e) {
        if (!active) return
        const notFound = e instanceof ApiError && e.status === 404
        setState((s) => ({ ...s, notFound, error: e instanceof Error ? e.message : String(e) }))
      }
    }
    load()
    const timer = pollMs ? setInterval(load, pollMs) : undefined
    return () => {
      active = false
      if (timer) clearInterval(timer)
    }
  }, [slug, pollMs])

  return state
}
