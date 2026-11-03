import { useCallback, useEffect, useRef, useState } from 'react'

import { pickBackImages } from './images'
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

  const add = useCallback(async () => {
    const found = await pickBackImages((done, total) => setProgress({ done, total }))
    setProgress(null)
    if (!found.length) return
    setImages((all) => [...all, ...found])
    setSettings((s) => ({ ...s, imageIds: [...s.imageIds, ...found.map((i) => i.id)] }))
  }, [])

  const remove = useCallback((id: string) => {
    setImages((all) => all.filter((i) => i.id !== id))
    setSettings((s) => ({
      ...s,
      imageIds: s.imageIds.filter((x) => x !== id),
      matches: Object.fromEntries(Object.entries(s.matches).filter(([, v]) => v !== id)),
      coverId: s.coverId === id ? undefined : s.coverId,
      backCoverId: s.backCoverId === id ? undefined : s.backCoverId,
    }))
  }, [])

  const move = useCallback((id: string, by: -1 | 1) => {
    setImages((all) => {
      const i = all.findIndex((x) => x.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= all.length) return all
      const next = [...all]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
    setSettings((s) => {
      const i = s.imageIds.indexOf(id)
      const j = i + by
      if (i < 0 || j < 0 || j >= s.imageIds.length) return s
      const ids = [...s.imageIds]
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      return { ...s, imageIds: ids }
    })
  }, [])

  const setCrop = useCallback(
    (id: string, crop: PictureSettings['frames'][string]) =>
      setSettings((s) => ({ ...s, frames: { ...s.frames, [id]: crop } })),
    [],
  )

  return { settings, images, loaded, progress, set, add, remove, move, setCrop }
}
