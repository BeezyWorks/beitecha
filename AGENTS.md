# Beitecha — project conventions

Shul schedules from rules: a gabbai defines minyanim/shiurim as rules over zmanim and the Jewish calendar, plus
one-time changes and sponsors; Beitecha computes the times and shows them on a lobby display, the Siddur's shul page (QR code),
an ICS feed, and inside the Siddur (SiddurOneRN, `siddur.one/shul/<slug>`). Web only. Beitecha hosts only the display (plus admin and bulletin); a shul's public page is the Siddur's. Served at `beitecha.baderech.app`. A sibling of the
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
  - **Custom zmanim** (`settings.zmanim.custom`, `custom.ts`): a shul's own, by sun angle or clock/zmani minutes
    from sunrise, sunset or an angle; the zmani day runs from sunrise or an alos to sunset or a tzeis. They count
    from (or bound the day by) only another custom zman taken straight from the sun, so there's no recursion. Each
    sees sunrise/sunset from the shul's elevation or sea level (`elevation`, default `useElevation`); a referenced
    zman keeps its own. Rules
    use them as `{ zman: id }`; a day carries their names in `zmanNames`, and `zmanimList(day)` lists all shown
    zmanim in time order (old Siddur builds use `zmanimForDay` and simply don't show them).
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
  Features: `luach` (shared feed/clock hooks, day components, and `useT()` over the engine's `makeT` wording), `display`, `bulletin`, `admin`, `home`,
  `account`.
  - **Design system = `@beezyworks/design`**, the `packages/design` submodule, same as the siblings. No raw colors or
    style props in app code; the exceptions are `components/ScaleToFit.tsx` (the display's fixed 1280×720 canvas
    scaled to the screen; a DL candidate), `components/ShrinkToFit.tsx` (one line shrunk to the room it
    has; same), `components/Select.tsx` (styled like the DL's own web pickers), `components/Bulletin.tsx` (paper-sized
    sheets portalled out of the app's clipping root, `@page` CSS, scaled to fill one sheet),
    `features/calendar/html.ts` (the wall calendar's paper ink) and
    `components/Blackout.tsx` (the display's true-black sleep screen).
  - **Lucide icons come from `lucide-subset.js`, not the package.** Metro is pointed at it for `lucide-react-native`
    (`metro.config.js`), because the package's barrel makes Metro open ~1,700 icon files at once and Cloudflare's builder
    dies with `EMFILE` (its open-file limit can't be raised; `ulimit` there is denied). To use a new icon, in the design
    system or here, import it by name as usual **and add it to `lucide-subset.js`** (`Name: require('lucide-react-native/icons/<kebab-file>').default`;
    an alias like `Home` points at its real file, `house`: look for `as <Name>` in `node_modules/lucide-react-native/dist/esm/lucide-react-native.mjs`).
    `src/lib/__tests__/lucideSubset.test.ts` fails if one is missing. Never import the barrel's icons any other way.
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
    An event's `adminName` ("Shabbos Mincha") is what the admin calls it (`adminLabel`); `name` is what everyone
    else sees, so viewer surfaces never read `adminName`.
- **Bulletin** (the admin's "Bulletin" under "See it": options, a live preview and a full-screen preview; `/<slug>/bulletin` is
  the published week): A4 or Letter, Shabbos, weekday minyanim and zmanim on the front, sponsorships and
  announcements behind (or all on one side when they fit there at 90% of the text size). Shabbos is one list in time
  order (`luach/shabbosGroups.ts`, shared with the display) in two balanced columns; shiurim are a list; one-time
  changes (`source: 'exception'`) are boxed with a ◆. Announcements are grouped under a heading per kind and category,
  each notice's title (the people's names) over its text. `settings.print.pages` (the stored key keeps its old name) (1–5 or `unlimited`, default 2) caps
  the pages and `textSize` scales the text; content shrinks to fit its pages and grows (up to 1.4×) to fill them, and
  with more than two the announcements' blocks (`PagedSheets`) go whole onto as many sheets as they need, never split.
  Nothing carries meaning in color alone: `print.ink` is `color` (the brand on headings and rules) or `mono`.
- **Wall calendar** (the admin's "Wall calendar" under "See it"; `settings.calendar`, engine `calendarPrint.ts`, page HTML in
  `features/calendar/html.ts`): a month to a sheet (Letter, A4, Tabloid, A3, either way up), civil or Hebrew months as the
  main calendar with the other small, from any run of months. The engine builds each month (`buildMonth`: weeks of cells
  with holidays grouped as the Siddur's printed calendar groups them, parsha, omer, candle lighting/havdalah/fast times,
  chosen zmanim, the shul's picked events by id plus one-time events, yahrzeits, birthdays and anniversaries); the app
  turns it into a printable HTML document (an iframe preview, printed through a hidden one). Holidays are left off by
  kind (`hiddenGroups`) or one by one (`hiddenHolidays`, a family like every Rosh Chodesh shares an id); people by id
  (`hiddenPeople`), independent of `hideFromBulletin`. Nothing is colored in the writing: the date numbers carry it
  (the Hebrew date red on a day without melacha, over blue for another holiday, over green for the shul's people; the
  civil date blue for a civil holiday), Yom Tov's own days bold. Small icons (`CalendarIcon`, drawn by the app's
  `icons.ts`): candles over the times where they're lit, a menorah with the day's candles on Chanukah, a clock by a clock
  change, each with a toggle. Chanukah is written by its days (`chanukah: 'days'`, default: "Erev Chanukah", "Chanukah
  1"–"8") or its nights, as hebcal has it; Chag HaBanot is its own, unmarked day. `english` writes everything in English
  whatever the shul's language (the app builds the calendar with an English `makeT`; the Hebrew dates' numbers stay in
  gematria). A footer goes under every month (`footer`) or under one month
  instead (`monthFooters`, by the month's first day). Clock changes (`clockChange`, default on) mark the Sundays the clocks
  move, by the shul's time zone (a civil-group holiday, `civil:clockChange`; the Siddur's calendar has the same option).
  Pictures (`features/calendar/pictures.ts`, `usePictures`): above each month, on the back of the page before it or none, a
  front and a back cover, fill or whole, cropped by drag, zoom and turn in the preview (`frameScript.ts`, ported from the
  Siddur's). They are put on pages, not listed: an empty page in the preview (`CalendarPreview`) takes a click or
  dropped files (several fill the empty months after it), and hovering a picture offers to take it off. The preview
  shows the empty pages; the print leaves them out. They stay in the browser (IndexedDB for the pixels, localStorage for the choices, per slug), never in the
  schedule or the server.
- **The Siddur link.** The display's and the bulletin's QR codes open `siddur.one/shul/<slug>` (`siddurShulUrl`):
  the Siddur app where it's installed, its web build elsewhere. The Siddur reads `GET /api/shuls/:slug` (CORS for its
  three web hosts only; the public reads are rate-limited per IP by `PUBLIC_LIMIT`, since CORS doesn't stop non-browsers) and computes with the same engine, so labels, dates and "next up" live in the engine
  (`makeT`, `labels.ts`, `nextUp.ts`), not here. A change to them is an engine commit both apps pick up.
- **Refuah shleimah** (`schedule.cholim`): names for the Mi Shebeirach, in English, Hebrew or both (`t.choleh()` picks
  one). The admin's tab takes them one per line and asks about any over a month old; the display gives them pages in
  the notice rotation, the bulletin a list at the end of the announcements. They're public with the schedule.
- **Yahrzeits** (`schedule.yahrzeits`, `settings.yahrzeits`): a Hebrew name and a display name (English and Hebrew) per
  person, the date of passing kept as both a Hebrew and a civil date (either one entered, the other derived). The week's
  are listed under a customizable title on the display (`days` ahead) and the bulletin, showing the names and dates
  the shul picks. The admin imports and exports CSV or JSON (`aiYahrzeits.ts`), with a prompt for any chat AI to turn a
  spreadsheet into the CSV.
- **Birthdays and anniversaries** (`schedule.birthdays`/`anniversaries`, `settings.birthdays`/`anniversaries`, `Occasion`,
  `occasions.ts`): the same names as a yahrzeit, but one date is enough: a Hebrew date (the year is optional) and/or a
  civil one, the other derived (`resolveOccasion`). `by` says which the person is kept and shown by: `hebrew` unless only
  a civil date was given; a Hebrew date without a year has no civil date and is always Hebrew. Each shows on the
  display's notice rotation, the bulletin and the Siddur like yahrzeits (their own display blocks and print
  toggles, `days` ahead, a title). The admin has a tab for each, with the same CSV/JSON import, AI prompt and export
  (`aiOccasions.ts`; `show_as` column).
- **Display setups** (`settings.displays`, `display/setup.ts`): each at `/<slug>/display/<id>` (`/<slug>/display` is the
  first, or a default landscape one): landscape 1280×720 or portrait 720×1280, blocks on or off (the rest reflow),
  Shabbos focus (the Shabbos list takes the main place from Thursday night), theme, screen type and sleep (default
  `auto`: black from an hour after the day's last event to an hour before the next day's first). Today hides past
  events but one just started, and pages what doesn't fit rather than shrinking it.
- **Display upkeep** (`useDisplayUpkeep`): heartbeat every 5 min (capped at 20 displays per shul), wake lock, hidden
  cursor, reload when the shul's day rolls over, drift against burn-in (hourly 1px; OLED orbits 12px).

## Conventions

- Prettier: no semicolons, single quotes, width 100 (the engine/worker files run a little wider; keep to the file).
- Commit straight to `main`. Conventional commits.
- Hebrew in chat output prints reversed for the user's terminal; never reverse it in files.
