/** API origin: same origin in production; the local `wrangler dev` when running `expo start`. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

/** The accounts service (Better Auth). */
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? 'https://auth.baderech.app'

/** Local dev: offer "continue as a dev user" (the worker must have DEV_AUTH=1). */
export const DEV_AUTH = process.env.EXPO_PUBLIC_DEV_AUTH === '1'

/** The public site, for links and QR codes. */
export const SITE_URL =
  process.env.EXPO_PUBLIC_SITE_URL ??
  (typeof window !== 'undefined' ? window.location.origin : 'https://beitecha.baderech.app')

/** The Siddur's web origin. Its links open the app where it's installed and its web build elsewhere. */
export const SIDDUR_URL = process.env.EXPO_PUBLIC_SIDDUR_URL ?? 'https://siddur.one'

/** A shul's page in the Siddur: where the display's and the printed sheet's QR codes send people. */
export const siddurShulUrl = (slug: string) => `${SIDDUR_URL}/shul/${slug}`
