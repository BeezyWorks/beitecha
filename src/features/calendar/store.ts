import { type BackImage, type PictureSettings, parsePictureSettings } from './pictures'

// The settings are small and go in localStorage, the pictures are big and go in IndexedDB, both under the shul's
// slug. Both are this browser's own: nothing is sent anywhere. Either may be unavailable (a private window), and the
// calendar still works without them, just without remembering.
const DB_NAME = 'beitecha-calendar'
const STORE = 'images'
const settingsKey = (slug: string) => `beitecha.calendar.pictures.${slug}`

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const wrap = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

type Stored = BackImage & { key: string }

/** The stored pictures for these ids, in that order; one the browser dropped is left out. */
export async function loadImages(slug: string, ids: string[]): Promise<BackImage[]> {
  if (!ids.length) return []
  try {
    const db = await openDb()
    try {
      const store = db.transaction(STORE).objectStore(STORE)
      const found = await Promise.all(
        ids.map((id) => wrap<Stored | undefined>(store.get(`${slug}/${id}`))),
      )
      return found.filter((i): i is Stored => !!i).map(({ key: _key, ...image }) => image)
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

/** Keeps exactly these pictures for the shul, adding new ones and dropping the rest. */
export async function saveImages(slug: string, images: BackImage[]): Promise<void> {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const mine = `${slug}/`
      const keep = new Set(images.map((i) => `${mine}${i.id}`))
      const have = new Set((await wrap(store.getAllKeys())) as string[])
      for (const key of have) if (key.startsWith(mine) && !keep.has(key)) store.delete(key)
      for (const image of images)
        if (!have.has(`${mine}${image.id}`)) store.put({ ...image, key: `${mine}${image.id}` })
      await finished(tx)
    } finally {
      db.close()
    }
  } catch {
    // Not kept: they last until the page closes.
  }
}

export function loadPictureSettings(slug: string): PictureSettings {
  try {
    return parsePictureSettings(JSON.parse(localStorage.getItem(settingsKey(slug)) ?? 'null'))
  } catch {
    return parsePictureSettings(null)
  }
}

export function savePictureSettings(slug: string, settings: PictureSettings) {
  try {
    localStorage.setItem(settingsKey(slug), JSON.stringify(settings))
  } catch {
    // Not kept.
  }
}
