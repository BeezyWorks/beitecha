# Beitecha — project conventions

Shul schedules from rules: a gabbai defines minyanim/shiurim as rules over zmanim and the Jewish calendar, plus
one-time changes and sponsors; Beitecha computes the times and shows them on a lobby display, the Siddur's shul page (QR code),
an ICS feed, and inside the Siddur (SiddurOneRN, `siddur.one/shul/<slug>`). Web only. Beitecha hosts only the display (plus admin and print); a shul's public page is the Siddur's. Served at `beitecha.baderech.app`. A sibling of the
Baderech apps (Halacha/Mikros BaDerech, the Siddur): those are for individuals on their way, this is for institutions.

## Architecture

- **Rules are data, computing happens on the client.** The server stores one JSON `Schedule` per shul
  (`packages/engine/src/types.ts`) and never computes times except for the ICS feed. Every surface runs the same
  engine, so the display, ICS and the Siddur always agree, and displays keep working offline from a
  cached copy.
- **Engine (`packages/engine`, the `BeezyWorks/beitecha-engine` submodule; the Siddur mounts it too).** `Calendar` (memoized per date) resolves an event on a date as: first matching
  rule → its `TimeExpr` → that day's exceptions on top. Events can anchor on other events (cycle-detected, reported as
  `error`, never thrown). `validate()` dry-runs a year for errors and exceptions that do nothing. Vitest; tests run
  under several machine time zones to prove output only depends on the shul's zone.
  - **Time is the shul's.** `Minutes` = minutes since local midnight in `settings.location.timeZone`. Today/now come
    from `todayIn(tz)` / `nowMinutesIn(tz)` (`useShulClock` in the app), never the viewer's clock.
  - **Day tags come from the morning's Hebrew date** (Friday is `erevShabbos`; Shabbos is also `motzeiShabbos` unless
    Yom Tov follows). `fast` = public fasts only (not BeHaB, Bechoros, Erev Tish'a B'Av, Yom Kippur).
  - **Zmanim round the safe way**: deadlines down, start times up (`ROUND_UP` in `day.ts`).
  - **Event details for the Siddur's Shul tab** are set once, never weekly: `category` (program/meal) and `audience`
    sit beside `kind` (old clients only know `kind`) and are guessed from the name when unset (`categories.ts`);
    a time hung on a minyan is said by it ("after Maariv", `Occurrence.relative`) unless the rule says otherwise.
    Sections like "Shabbos afternoon" are the client's, from the times. A reminder with an `eventId` comes down
    after its one-time event (`noticeLastDay`).
- **Worker (`worker/`).** Plain router in `index.ts`; handlers in `shuls.ts`. D1 tables in `migrations/`. Writes use a
  revision check in one SQL statement (409 with the current record, like the accounts service's `app_data`). Auth: the
  app sends the Baderech bearer token, the worker checks it with `GET /api/auth/get-session` on the accounts Worker
  over the `AUTH` service binding. Roles: `owner` (invites, removes) and `editor`. Vitest with
  `@cloudflare/vitest-pool-workers`; the accounts service is faked in `vitest.config.mts` ("Bearer <id>" = user id).
- **App (`src/`).** Expo Router (web only), `src/app/` holds only route files re-exporting feature screens.
  Features: `luach` (shared feed/clock hooks, day components, and `useT()` over the engine's `makeT` wording), `display`, `print`, `admin`, `home`,
  `account`.
  - **Design system = `@beezyworks/design`**, the `packages/design` submodule, same as the siblings. No raw colors or
    style props in app code; the exceptions are `components/ScaleToFit.tsx` (the display's fixed 1280×720 canvas
    scaled to the screen; a DL candidate), `components/ShrinkToFit.tsx` (one line shrunk to the room it
    has; same), `components/Select.tsx` (styled like the DL's own web pickers) and `components/Print.tsx` (paper-sized
    sheets portalled out of the app's clipping root, `@page` CSS, scaled down to fit one sheet).
  - Shul pages theme themselves with the shul's `brandColor` (`ThemeRoot`).
  - Headers are in Cardo, whose bold Hebrew is mostly regular weight; `lib/hebrewHeaders.ts` gives Cardo Bold's Hebrew
    range to Frank Ruhl Libre Bold (a `unicode-range` `@font-face`), so set Hebrew headings in the header variants as usual.
  - Shul pages write themselves in `settings.language` (labels, weekdays, dates: `en` or `he`) and `settings.names` (minyan,
    zman, parsha, holiday and notice names: `en`, `he` or `both`; default follows `language`: `en` → `both`, `he` → `he`).
    Viewer surfaces never read `.en` directly: use `useT()` (`features/luach/language.tsx`) for names, labels, dates and
    chrome strings, and `localize()` in the engine/worker. Hebrew for Maariv is ערבית. The admin stays English.
  - The admin edits a draft in a zustand store (`features/admin/store.ts`) and saves the whole document.
    `features/admin/forms.ts` maps `Condition`/`TimeExpr` to editable forms and back; anything the forms can't say
    round-trips through a JSON editor instead of being lost. Jest-tested.
- **Print** (`/<slug>/print`, the admin's "Print this week"): the published week on A4 or Letter, Shabbos, weekday
  minyanim and zmanim on the front, sponsorships and announcements on the back (or all on one side). Each side is
  shrunk to fit its sheet, never split.
- **The Siddur link.** The display's and the printed sheet's QR codes open `siddur.one/shul/<slug>` (`siddurShulUrl`):
  the Siddur app where it's installed, its web build elsewhere. The Siddur reads `GET /api/shuls/:slug` (CORS for its
  three web hosts only; the public reads are rate-limited per IP by `PUBLIC_LIMIT`, since CORS doesn't stop non-browsers) and computes with the same engine, so labels, dates and "next up" live in the engine
  (`makeT`, `labels.ts`, `nextUp.ts`), not here. A change to them is an engine commit both apps pick up.
- **Display upkeep** (`useDisplayUpkeep`): heartbeat every 5 min (capped at 20 displays per shul), wake lock, hidden
  cursor, reload when the shul's day rolls over, hourly 1px drift against burn-in.

## Conventions

- Prettier: no semicolons, single quotes, width 100 (the engine/worker files run a little wider; keep to the file).
- Commit straight to `main`. Conventional commits.
- Hebrew in chat output prints reversed for the user's terminal; never reverse it in files.
