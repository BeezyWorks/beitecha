import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

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
          bindings: {
            TEST_MIGRATIONS: migrations,
            AUTH_URL: 'https://auth.test',
            PUBLIC_URL: 'https://beitecha.test',
          },
          // A fake accounts service: "Bearer <id>" is user <id>.
          serviceBindings: {
            AUTH: (request: Request) => {
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
