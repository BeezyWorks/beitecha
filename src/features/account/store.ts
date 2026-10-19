import { create } from 'zustand'

import { AUTH_URL, DEV_AUTH } from '@/lib/config'
import { tokenStore } from './tokens'

export interface AccountUser {
  id: string
  name: string
  email: string
}

type Status = 'unknown' | 'signedOut' | 'signedIn'

interface AccountState {
  status: Status
  user: AccountUser | null
  refresh: () => Promise<void>
  signInEmail: (email: string, password: string) => Promise<void>
  signUpEmail: (name: string, email: string, password: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  /** Leaves the page for the provider; comes back at /account/callback. */
  signInWith: (provider: 'google' | 'apple', returnTo: string) => void
  completeHandoff: (oneTimeToken: string) => Promise<void>
  signInDev: (name: string) => void
  signOut: () => Promise<void>
}

async function auth(path: string, body?: unknown) {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.authorization = `Bearer ${token}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await fetch(`${AUTH_URL}/api/auth${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Bearer tokens only, as in the siddur: no cross-site cookies.
    credentials: 'omit',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message ?? data?.error ?? `Sign-in failed (${res.status})`)
  const fresh = res.headers.get('set-auth-token')
  if (fresh) tokenStore.set(fresh)
  return data
}

const RETURN_KEY = 'beitecha.returnTo'

export const useAccount = create<AccountState>((set) => ({
  status: 'unknown',
  user: null,

  refresh: async () => {
    const token = tokenStore.get()
    if (!token) return set({ status: 'signedOut', user: null })
    if (DEV_AUTH && token.startsWith('dev-')) {
      return set({ status: 'signedIn', user: { id: token, name: token.slice(4), email: `${token}@localhost` } })
    }
    try {
      const data = await auth('/get-session')
      if (data?.user) set({ status: 'signedIn', user: data.user })
      else {
        tokenStore.set(null)
        set({ status: 'signedOut', user: null })
      }
    } catch {
      set({ status: 'signedOut', user: null })
    }
  },

  signInEmail: async (email, password) => {
    const data = await auth('/sign-in/email', { email, password })
    set({ status: 'signedIn', user: data.user })
  },

  signUpEmail: async (name, email, password) => {
    const callbackURL = `${AUTH_URL}/handoff?return=${encodeURIComponent(`${window.location.origin}/account/callback`)}`
    await auth('/sign-up/email', { name, email, password, callbackURL })
  },

  requestPasswordReset: async (email) => {
    await auth('/request-password-reset', { email, redirectTo: `${AUTH_URL}/reset-password` })
  },

  signInWith: (provider, returnTo) => {
    try {
      sessionStorage.setItem(RETURN_KEY, returnTo)
    } catch {}
    const back = `${window.location.origin}/account/callback`
    window.location.href = `${AUTH_URL}/start/${provider}?return=${encodeURIComponent(back)}`
  },

  completeHandoff: async (oneTimeToken) => {
    const res = await fetch(`${AUTH_URL}/api/auth/one-time-token/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: oneTimeToken }),
      credentials: 'omit',
    })
    const token = res.headers.get('set-auth-token')
    const data = await res.json().catch(() => null)
    if (!res.ok || !token) throw new Error('That sign-in link has expired. Please try again.')
    tokenStore.set(token)
    set({ status: 'signedIn', user: data.user })
  },

  signInDev: (name) => {
    const id = `dev-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    tokenStore.set(id)
    set({ status: 'signedIn', user: { id, name, email: `${id}@localhost` } })
  },

  signOut: async () => {
    await auth('/sign-out', {}).catch(() => {})
    tokenStore.set(null)
    set({ status: 'signedOut', user: null })
  },
}))

/** Where to go after a social sign-in round trip. */
export function takeReturnTo(): string {
  try {
    const to = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    return to && to.startsWith('/') ? to : '/'
  } catch {
    return '/'
  }
}
