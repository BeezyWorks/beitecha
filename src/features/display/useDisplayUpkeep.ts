import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'

import { api } from '@/lib/api'
import { storage } from '@/lib/storage'

const HEARTBEAT_MS = 5 * 60_000

function displayId(): string {
  let id = storage.get('beitecha.displayId')
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')
    storage.set('beitecha.displayId', id)
  }
  return id
}

/**
 * Keeps a wall display healthy without anyone touching it: checks in so the
 * gabbai can see it's alive, holds a screen wake lock, hides the cursor, and
 * reloads itself once the shul's day rolls over (picking up new code too).
 */
export function useDisplayUpkeep(slug: string, today: string, label?: string) {
  const firstDay = useRef(today)

  useEffect(() => {
    const id = displayId()
    const beat = () => api.heartbeat(slug, id, label).catch(() => {})
    beat()
    const t = setInterval(beat, HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [slug, label])

  useEffect(() => {
    if (today !== firstDay.current && Platform.OS === 'web') {
      // Stagger so a room full of displays doesn't reload in the same second.
      const t = setTimeout(() => window.location.reload(), Math.random() * 60_000)
      return () => clearTimeout(t)
    }
  }, [today])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    document.body.style.cursor = 'none'
    let lock: { release: () => Promise<void> } | null = null
    const request = async () => {
      try {
        lock = (await (navigator as any).wakeLock?.request('screen')) ?? null
      } catch {}
    }
    const onVisible = () => document.visibilityState === 'visible' && request()
    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.body.style.cursor = ''
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])
}
