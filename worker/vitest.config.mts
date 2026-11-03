import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { exportJWK, generateKeyPair } from 'jose'
import { defineConfig } from 'vitest/config'

// Signing keys for the fake accounts service's JWKS: `a` and `b` can be published (tests choose which, through
// `/__jwks?set=a,b`), `x` never is. The tests get the private halves in TEST_KEYS and sign their own access tokens.
const keys: Record<string, { pub: Record<string, unknown>; priv: Record<string, unknown> }> = {}
for (const kid of ['a', 'b', 'x']) {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  keys[kid] = {
    pub: { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA', use: 'sig' },
    priv: { ...(await exportJWK(privateKey)), kid, alg: 'EdDSA' },
  }
}
let published = ['a']
let jwksFetches = 0
const CLIENTS: Record<string, string> = { 'client-claude': 'Claude', 'client-gpt': 'ChatGPT' }

export default defineConfig(async () => {
  const migrations = await readD1Migrations(new URL('../migrations', import.meta.url).pathname)
  return {
    plugins: [
      cloudflareTest({
        main: './index.ts',
        miniflare: {
          compatibilityDate: '2026-08-22',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          ratelimits: { PUBLIC_LIMIT: { namespace_id: '1001', simple: { limit: 3, period: 60 } } },
          bindings: {
            TEST_MIGRATIONS: migrations,
            AUTH_URL: 'https://auth.test',
            PUBLIC_URL: 'https://beitecha.test',
            TEST_KEYS: JSON.stringify(
              Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.priv])),
            ),
          },
          // A fake accounts service: "Bearer <id>" is user <id>.
          serviceBindings: {
            AUTH: (request: Request) => {
              const url = new URL(request.url)
              if (url.pathname === '/__jwks') {
                // Test control: which keys the JWKS publishes, and how often it was fetched.
                const set = url.searchParams.get('set')
                if (set !== null) published = set ? set.split(',') : []
                return Response.json({ published, fetches: jwksFetches })
              }
              if (url.pathname === '/api/auth/jwks') {
                jwksFetches++
                return Response.json({ keys: published.map((k) => keys[k].pub) })
              }
              if (url.pathname === '/api/auth/oauth2/public-client') {
                const name = CLIENTS[url.searchParams.get('client_id') ?? '']
                return name
                  ? Response.json({ client_name: name })
                  : new Response('{}', { status: 404 })
              }
              const id = request.headers.get('authorization')?.replace(/^Bearer /, '')
              if (!id || id === 'expired') return new Response('null', { status: 401 })
              return Response.json({ user: { id, name: `User ${id}`, email: `${id}@example.com` } })
            },
          },
          assets: {
            directory: './test/assets',
            binding: 'ASSETS',
            assetConfig: { not_found_handling: 'single-page-application' },
          },
        },
      }),
    ],
    root: new URL('.', import.meta.url).pathname,
    test: { include: ['test/**/*.test.ts'], setupFiles: ['./test/setup.ts'] },
  }
})
