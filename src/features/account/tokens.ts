import { storage } from '@/lib/storage'

const KEY = 'beitecha.authToken'

/** The BeezyWorks bearer token. Gabbaim edit on the web only, so localStorage is the store. */
export const tokenStore = {
  get: () => storage.get(KEY),
  set: (token: string | null) => storage.set(KEY, token),
}
