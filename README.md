# Beitecha · בביתך

> בְּשִׁבְתְּךָ **בְּבֵיתֶךָ** וּבְלֶכְתְּךָ **בַדֶּרֶךְ**

The Baderech apps are for each person on their way. Beitecha is for the house: the shul.

A shul sets up its schedule once as **rules** ("Shacharis 6:15 on Mon, Thu and Rosh Chodesh, otherwise 6:30"; "Mincha
on Erev Shabbos at the earliest of candle lighting and plag, never after 7:15, rounded down to 5") plus **one-time
changes** ("no shiur this Shabbos, the Rav is away") and **sponsors and announcements**. Beitecha works out every day's
times from the zmanim and the Jewish calendar for the shul's exact location, in the shul's own time zone, and shows them:

- **On the monitor in the lobby**: `beitecha.baderech.app/<shul>/display`. Point any TV's browser at it and leave it. It
  keeps working offline, reloads itself each night, and checks in so the gabbai can see it's on.
- **On a page anyone can open** by scanning the QR code in the display's corner: `beitecha.baderech.app/<shul>`.
- **In people's calendars**: `beitecha.baderech.app/<shul>.ics`.
- **In the Siddur** (planned): subscribe from the QR code or by searching, and see your shul's times on the home screen.

It's free. Gabbaim sign in with the shared Baderech account (the same one the Siddur uses).

## Layout

| Path | What |
| --- | --- |
| `packages/engine` | `@beitecha/engine`: the rules engine. Pure TypeScript on `@hebcal/core`. Schedule + date → times. Shared by the web app, the worker, and (later) the Siddur. |
| `worker/` | Cloudflare Worker: the API on D1, the ICS feed, and the static web app. |
| `src/` | Expo Router web app: public page, display, admin, home. |
| `packages/design` | `@beezyworks/design`, git submodule (BeezyWorks/design-system). |
| `migrations/` | D1 schema. |

## Develop

```sh
git submodule update --init
pnpm install
pnpm db:migrate:local
printf 'DEV_AUTH=1\nPUBLIC_URL=http://localhost:8090\n' > .dev.vars
printf 'EXPO_PUBLIC_API_URL=http://localhost:8787\nEXPO_PUBLIC_DEV_AUTH=1\nEXPO_PUBLIC_SITE_URL=http://localhost:8090\n' > .env.local
pnpm dev:api                       # wrangler dev on :8787
pnpm start --port 8090             # the app
(cd packages/engine && npx tsx scripts/seed.ts)   # a demo shul at /demo, owned by the dev user
```

`DEV_AUTH=1` lets the local worker accept `Bearer dev-<name>`, and the app offers "Continue as a dev user". Never set it in production.

Tests: `pnpm test` (engine + worker with vitest, app with jest). `pnpm typecheck`.

## Deploy

One-time setup:

1. `npx wrangler d1 create beitecha` and put the id in `wrangler.jsonc`.
2. `pnpm db:migrate:remote`.
3. Add `https://beitecha.baderech.app` to `TRUSTED_ORIGINS` in BeezyWorksAccounts (for sign-in) and deploy it.

Then `pnpm deploy` (builds the web app and deploys the worker to `beitecha.baderech.app`).
