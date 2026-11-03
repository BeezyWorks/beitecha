import { type CalendarMonth, monthKey } from '@beitecha/engine'
import { useCallback, useEffect, useRef, useState } from 'react'

import { pickBackImages, readBackImages } from './images'
import { type BackImage, type PictureSettings, defaultPictureSettings } from './pictures'
import { loadImages, loadPictureSettings, saveImages, savePictureSettings } from './store'

/** The calendar's pictures for a shul: loaded from this browser, and kept there as they change. */
export function usePictures(slug: string) {
  const [settings, setSettings] = useState<PictureSettings>(defaultPictureSettings)
  const [images, setImages] = useState<BackImage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // What's been loaded is what may be saved: saving before then would wipe what's stored.
  const ready = useRef(false)
  const latest = useRef(settings)
  latest.current = settings

  useEffect(() => {
    let live = true
    ready.current = false
    const stored = loadPictureSettings(slug)
    setSettings(stored)
    loadImages(slug, stored.imageIds).then((found) => {
      if (!live) return
      setImages(found)
      ready.current = true
      setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [slug])

  useEffect(() => {
    if (!ready.current) return
    savePictureSettings(slug, settings)
  }, [slug, settings])
  useEffect(() => {
    if (!ready.current) return
    saveImages(slug, images)
  }, [slug, images])

  const set = useCallback(
    (patch: Partial<PictureSettings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  )

  /** The pictures a page still uses; the rest are let go (they would otherwise be kept in the draft). */
  const keepUsed = useCallback((next: PictureSettings, extra: BackImage[] = []) => {
    const used = new Set<string | undefined>([
      ...Object.values(next.matches),
      next.coverId,
      next.backCoverId,
    ])
    setSettings({
      ...next,
      imageIds: [...next.imageIds, ...extra.map((i) => i.id)].filter((id) => used.has(id)),
    })
    setImages((all) => [...all, ...extra].filter((i) => used.has(i.id)))
  }, [])

  /**
   * Puts pictures on a page of the preview: a month's (`month:` and its first day), the front cover's (`cover`) or the
   * back cover's (`back`). The extra pictures go on the months after it that have none, in order.
   */
  const putInSlot = useCallback(
    (slot: string, added: BackImage[], months: Pick<CalendarMonth, 'start'>[]) => {
      if (!added.length) return
      const s = latest.current
      if (slot === 'cover') return keepUsed({ ...s, coverId: added[0].id, front: true }, added)
      if (slot === 'back') return keepUsed({ ...s, backCoverId: added[0].id, back: true }, added)
      const at = months.findIndex((m) => `month:${monthKey(m)}` === slot)
      if (at < 0) return
      const queue = [...added]
      const matches = { ...s.matches }
      months.slice(at).forEach((month, i) => {
        const key = monthKey(month)
        if (queue.length && (i === 0 || !matches[key])) matches[key] = queue.shift()!.id
      })
      keepUsed({ ...s, matches }, added)
    },
    [keepUsed],
  )

  /** Takes a page's picture off. */
  const clearSlot = useCallback(
    (slot: string) => {
      const s = latest.current
      const next = { ...s, matches: { ...s.matches } }
      if (slot === 'cover') next.coverId = undefined
      else if (slot === 'back') next.backCoverId = undefined
      else delete next.matches[slot.replace('month:', '')]
      keepUsed(next)
    },
    [keepUsed],
  )

  /** Picture files, chosen (no `files`) or dropped on a page. */
  const load = useCallback(
    async (slot: string, months: Pick<CalendarMonth, 'start'>[], files?: File[]) => {
      try {
        const found = await (files
          ? readBackImages(files, (done, total) => setProgress({ done, total }))
          : pickBackImages((done, total) => setProgress({ done, total })))
        putInSlot(slot, found, months)
      } finally {
        setProgress(null)
      }
    },
    [putInSlot],
  )

  /** Puts these pictures and choices in place of the current ones (a draft opened from a file). */
  const replace = useCallback((next: PictureSettings, all: BackImage[]) => {
    setImages(all)
    setSettings(next)
  }, [])

  const setCrop = useCallback(
    (id: string, crop: PictureSettings['frames'][string]) =>
      setSettings((s) => ({ ...s, frames: { ...s.frames, [id]: crop } })),
    [],
  )

  return { settings, images, loaded, progress, set, load, clearSlot, setCrop, replace }
}
