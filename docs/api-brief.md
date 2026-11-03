# Brief: public API, embeds, API keys, write API, MCP

Status: draft for audit. Nothing here is built.

## 1. Goal

Let a shul manage its data from outside the admin and show it on its own site.

1. **Read API + embeds**: a shul's own website shows its computed times, zmanim, shul info and bulletin.
2. **Write API**: a narrow, safe way to change sponsors, notices, one-off changes and a few lists, from scripts and from an AI assistant ("kiddush this week is sponsored by X in honor of Y").
3. **MCP server** over the write (and read) API, so an AI tool plugged in does exactly that.

Non-goals: native apps using keys; editing rules, settings, displays or the team through a key; exposing the rules themselves; a developer portal or billing.

## 2. Ground truth in the current code

The design has to fit these, so the auditor should check them:

- One JSON `Schedule` per shul in D1 (`shuls.schedule`), saved whole with `baseRevision` (`putShul`, `worker/shuls.ts`). `history` records only `(shul, revision, user, at)`, with no diffs and no way to revert.
- Auth is a Baderech bearer token checked on the accounts Worker (`worker/auth.ts`). Roles: `owner`, `editor`. There is no API-key concept.
- `GET /api/shuls/:slug` is **already public** and returns the whole schedule: rules, notices, `cholim`, `yahrzeits`, `birthdays`, `anniversaries`. It has CORS for the three Siddur hosts only and a per-IP limit (`PUBLIC_LIMIT`, 300/min). So the new API's privacy posture must be decided against what is already exposed (see §13).
- The worker never computes times except for the ICS feed (`worker/ics.ts`, 60 days). The engine runs fine in the Worker, so server-computed days are not a new capability.
- `Exception` (`packages/engine/src/types.ts`) is a union: `cancel`, `retime`, `note`, `add` (a single-date event). The admin's Today field edits these through `upsertException` / `removeException` in `features/admin/store.ts`. A write API should mirror those operations.
- `Notice` covers sponsors, announcements, reminders, simcha and condolence. A sponsorship is a notice with `kind: 'sponsor'`, optionally an `eventId`, `sponsoredBy`, `inHonorOf` and `text`.
- `Yahrzeit`, `Occasion` (birthday / anniversary) and `Choleh` carry names of people. The admin gets CSV/JSON import for them.
- `scheduleProblem()` validates shape; `validate()` in the engine dry-runs a year. `scheduleProblem` currently validates the whole document, which is useful for write-op validation.

## 3. Key model

Two kinds of key, both per shul, created by an **owner** only.

| | Public key `bk_pub_…` | Secret key `bk_sec_…` |
|---|---|---|
| For | a browser on the shul's own site | server, script or AI tool |
| Pinned to | 1–5 domains | none |
| Can do | reads only | reads plus the write scopes it was given |
| Guarded by | `Origin` check, rate limit, revoke | secrecy, scopes, rate limit, audit log, revoke, optional expiry |

Why two: browsers set `Origin` themselves and scripts can fake it, so domain pinning stops only reuse of a leaked key on another website. It cannot protect a write key, and an AI tool sends no Origin anyway. It is still worth having on public keys, because it keeps the honest case honest and makes leaked keys useless on other sites.

**No apps.** A public key's requests must carry an `Origin` header that exactly matches a pinned origin (scheme, host, port; no wildcards beyond an explicit `*.example.org` form, to be decided). Requests with no `Origin` are rejected on public keys. Documented as "websites only". This is a speed bump, not a guarantee, and the docs should not claim otherwise.

Key handling:

- Format `bk_pub_<22 base62>` / `bk_sec_<32 base62>`, 128+ bits of entropy.
- Shown once at creation. Stored as SHA-256 of the key (a fast hash is fine for high-entropy random keys) plus a short visible prefix. Never logged. Redacted in error output.
- Per key: label, scopes, domains (public), created by/at, last used at, optional expiry, revoked at, per-key rate limit tier.
- Owners list, rotate (create new, revoke old after overlap) and revoke instantly. A revoked or expired key fails with 401 on the next request (no long cache on key lookups; at most a few seconds).
- Limits: e.g. 10 active keys per shul.
- Sent as `Authorization: Bearer bk_…` (or `x-api-key`). Never accepted in a query string, to keep keys out of logs and referrers. Embeds need a different mechanism (§5).

## 4. Read API

Base `/v1/shuls/:slug/…`, JSON, versioned independently of the internal `/api` (which stays private and unversioned).

All responses are **computed**: no `Rule`, `Condition` or `TimeExpr` ever appears.

| Endpoint | Scope | Returns |
|---|---|---|
| `GET /info` | `info` | name, address, city, website, brand color, time zone, language, `israel` |
| `GET /day/:date` | `times` | one day: Hebrew date, holidays, parsha, tags, zmanim, public events with computed times |
| `GET /days?from&to` | `times` | a range; capped (e.g. 62 days) |
| `GET /week` | `times` | the shul's current week, by the shul's clock |
| `GET /zmanim?from&to` | `zmanim` | zmanim only (built-in + custom names, respecting `hidden`) |
| `GET /next` | `times` | what's next, from the shul's clock |
| `GET /notices` | `notices` | current announcements and sponsorships |
| `GET /bulletin` | `bulletin` | the published week as HTML/PDF/JSON (see §12) |
| `GET /calendar.ics` | `times` | existing feed under the same auth |

Event shape: `id`, localized `name`, `kind`, `tefila`, `category`, `audience`, `time`, optional `end`, `relative` ("after Maariv"), `cancelled`, `note`, `source: 'rule' | 'exception'`, speaker/topic/room/link where set. Times are given as both `minutes` and an ISO local string with the shul's UTC offset for that date, plus the IANA zone, so consumers never do zone math. `internal` events are never returned.

Cross-cutting:

- Responses use the shul's `language` and `names` settings unless `?lang=` / `?names=` overrides.
- `ETag` from `(shul id, revision, shul's date)` and `Cache-Control` with `s-maxage`, so Cloudflare serves most traffic. Because day output depends on the shul's date and on revision, cache keys include both.
- CORS: for a public key, allow exactly the pinned origins (`Vary: Origin`). For secret keys, no CORS.
- Rate limit per key (Workers rate-limit binding, like `PUBLIC_LIMIT`), plus a per-shul ceiling so a single shul's traffic can't starve others, plus a per-IP limit.
- Cache hits should still enforce key checks. If the edge caches a response at the CDN, the key check happens in the Worker first; only the computation is cached (in-Worker cache keyed by shul, revision, date, options).

## 5. Embeds

Two ways to show a shul on another site:

1. **Iframe**: `https://beitecha.baderech.app/embed/:slug/<view>` (views: `week`, `today`, `shabbos`, `zmanim`, `sponsors`). We serve it, so **no key is in the page**. Authorization is the shul's domain list, enforced with `Content-Security-Policy: frame-ancestors <pinned origins>` set per response. Params: `lang`, `theme` (light/dark/auto), `accent` (hex), `compact`. Resizing via `postMessage` height events.
2. **JS widget** (`embed.js` data-attribute or custom element) that renders into the host page's DOM using a **public key** and the read API. More flexible, more fragile with host CSS. Phase 2 and optional.

Use the same domain list for iframe `frame-ancestors` and public-key origins, so there is one setting: "websites allowed to show our times".

The embed views reuse the existing luach components and `ThemeRoot` brand theming; strings via `useT()`. No raw colors in app code (per AGENTS.md); embed theming goes through the design system. Check bundle weight, since embed routes load the whole Expo web app today; may need a lean entry.

## 6. Scopes

Keys carry a set of scopes. Read scopes are above. Write scopes are in §7. Rules:

- Scopes are checked per endpoint; an endpoint with no matching scope is 403.
- A public key may hold only read scopes.
- Sensitive lists are separate scopes, off by default, and **absent from public keys unless explicitly added**: `cholim:read`, `yahrzeits:read`, `birthdays:read`, `anniversaries:read`.
- `times`, `zmanim`, `info`, `notices` are the default for a new public key.

## 7. Write API (secret keys)

Principle: **writes are operations, not documents.** A write key can never replace the schedule, and can never touch `rules`, `settings`, `profile`, `displays`, `members` or `keys`. Each operation loads the current schedule, applies one change, validates, and saves with the revision check, retrying on conflict (bounded retries).

### Operations and scopes

| Scope | Operations |
|---|---|
| `sponsors:write` | create/update/delete a sponsorship notice (`kind: 'sponsor'`); fields as `Notice` incl. `eventId`, `from`/`to`, `sponsoredBy`, `inHonorOf`, `text` |
| `notices:write` | create/update/delete announcement, reminder, simcha, condolence notices |
| `changes:write` | `cancel` an event on a date; `retime` it; add a `note`; each is an `Exception`, and delete one. Mirrors the admin's Today field |
| `events:write` | create a **one-time** event (an `add` exception, or equivalent single-date `EventDef`) and edit/delete events *this key created* |
| `yahrzeits:write` | add, edit, delete a yahrzeit |
| `occasions:write` | add, edit, delete a birthday / anniversary |
| `cholim:write` | add a name; **remove a name**; confirm (renew `added`) |
| `cholim:read`, `yahrzeits:read`, `occasions:read` | list them (secret keys only), so a tool can find the entry to change or remove |

Not offered, deliberately: creating or editing recurring events and rules, events not created by the key, settings, profile, custom zmanim, local holidays, display setups, print settings, team and keys.

**Decided:** `events:write` creates **one-time events only** (a BBQ, a special shiur, a one-off kiddush on a given date). Nothing rule-based and nothing recurring, ever, through a key: a weekly shiur or a standing kiddush program is a rule and stays in the admin. A one-time event carries a single date and time; it can't carry a `Rule`, `Condition` or `TimeExpr` beyond a fixed clock time.

**Removing and editing people-lists.** Removal is a first-class operation, mainly for refuah shleimah names (someone recovered):

- `GET /cholim` (scope `cholim:read`, secret keys only) lists names with `id`, `name`, `added`.
- `DELETE /cholim/:id`, or `POST /cholim/remove {match: "Yosef Chaim"}`. A match is accepted only if it identifies exactly one entry (case/diacritic-insensitive over `en`, `he`); with several candidates the API answers 400 with the list instead of removing anything. Same for yahrzeits and occasions.
- Removing is the low-harm direction and is often urgent, so **removals apply immediately even on a `review` key**; they are logged, listed in the activity log, and revertable. Adds stay in the review queue per the rule below. (Auditor: is a mistaken removal of someone who still needs a refuah worse than a delayed one?)

### Targeting by name, not just id

An AI says "this week's kiddush". Ids and dates are brittle for it. Provide `GET /v1/shuls/:slug/upcoming?days=14` returning event **instances** with a stable `ref` (`<eventId>@<date>`), name, time and any existing sponsor/exception/note. Write ops accept `ref`. The MCP tools resolve fuzzy names to refs *before* writing, and the API refuses ambiguous matches (400 listing candidates) rather than guessing.

### Semantics

- **Idempotency**: `Idempotency-Key` header; repeated key within 24h returns the first result. Essential for AI retries.
- **Upsert rules**: one sponsorship per `(eventId, date)`: creating again replaces or 409s depending on a `replace` flag. Cancel and retime are unique per `(eventId, date)`.
- **Dates are the shul's** (`todayIn(tz)`). Reject past dates beyond a small window (e.g. 1 day) for exceptions; reject dates beyond ~1 year ahead.
- **Lifetimes follow the data, not the key.**
  - Sponsorships and anything tied to an event or date don't expire; they become past, as in the admin, and the public feed already drops them after `PUBLIC_HISTORY_DAYS`. A sponsorship needs an `eventId`/date, or a `to`.
  - Announcements and reminders already carry `from`/`to`: require a `to` (default: `from` + 14 days, max 90) so a forgotten announcement can't stay on the lobby screen for good.
  - Yahrzeits, birthdays, anniversaries and refuah names **never expire**. Refuah names keep their existing `added` date so the admin still asks about old ones; removal is explicit.
- **Ownership tags**: items created through a key get `origin: { keyId }` (new optional field on `Notice`, `Exception`, `Yahrzeit`, `Occasion`, `EventDef`), used for the "events:write may only edit what it created" rule, for filtering in the admin, and for revert.
- **Validation**: field-length caps (names 100 chars, notice text 500, list sizes), `https` only for links, no HTML or control characters, Hebrew/English both allowed; yahrzeits and occasions pass the same validators as the admin (`isRealMonthDay`, civil date format). Whole-document `scheduleProblem` + a `validate()` pass on the changed region after applying.
- **Limits** per key per day (e.g. 200 writes) and per shul total caps on list sizes (e.g. cholim ≤ 300) so a runaway agent can't fill the 512 KB document.
- **Responses** return the created/changed object, the new revision, and a `revertToken`.

### Review mode (default on)

Each secret key has `mode: 'review' | 'publish'`, default **`review`**.

- In `review`, a write is stored as a **pending change** (`api_changes` table), not applied. The admin shows a queue ("2 changes waiting") with before/after, and approve / reject / edit. Approval applies it with the same revision-checked path, as the approving gabbai.
- In `publish`, writes apply immediately. Owners opt into this per key, with a warning. Maybe restrict `publish` to specific scopes (e.g. sponsors yes, cholim no).
- Writes that touch **people's names** (yahrzeits, occasions, cholim) default to `review` even for a `publish` key, because wrong names on a lobby screen are worse than a wrong sponsor line. (Auditor: is that too paternalistic? Gabbaim wanting AI to add yahrzeits from a list will hit the queue each time.)
- Pending changes expire (e.g. 14 days) and are capped (e.g. 50 per key).

### Audit and undo

- New `audit` table: `(shul, at, key id or user id, operation, target ref, before, after, status)`. The existing `history` table keeps per-revision rows; add `key_id` and `change_id` there too.
- `POST /v1/…/changes/:id/revert` (and an admin button) reverses an applied change if the target hasn't been changed since; otherwise 409 with what changed.
- Owners get an email/notification option on writes (later).

## 8. Data model changes (D1 migration `0002_api.sql`)

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('public','secret')),
  prefix TEXT NOT NULL,          -- first chars, shown in the admin
  hash TEXT NOT NULL UNIQUE,     -- sha-256 of the key
  label TEXT NOT NULL,
  scopes TEXT NOT NULL,          -- JSON array
  origins TEXT,                  -- JSON array, public keys
  mode TEXT NOT NULL DEFAULT 'review',
  rate_tier TEXT NOT NULL DEFAULT 'standard',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER
);
CREATE TABLE api_changes (       -- pending or applied writes
  id TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  key_id TEXT REFERENCES api_keys(id),
  op TEXT NOT NULL, target TEXT, payload TEXT NOT NULL,
  before TEXT, after TEXT,
  status TEXT NOT NULL,          -- pending|applied|rejected|expired|reverted
  idempotency_key TEXT,
  created_at INTEGER NOT NULL, decided_by TEXT, decided_at INTEGER
);
```

Plus: `history.key_id`, the embed/site domain list (profile or `shuls` column), an index on `(shul_id, status)` for the queue. `last_used_at` writes should be throttled (once per few minutes per key) to avoid a D1 write per request.

Engine changes (submodule `packages/engine`, picked up by the Siddur too): optional `origin` on the entity types; a pure `applyOperation(schedule, op) → schedule` with its own tests, so the Worker and any future client share one definition; a `computeDay`/`computeRange` shaping function that returns the public JSON (so the Siddur and API cannot drift). Old Siddur builds must ignore the new optional fields.

## 9. Worker structure

- `worker/keys.ts`: create/list/revoke/rotate (session-authenticated, owner only); key lookup + hash compare; scope and origin checks.
- `worker/v1.ts`: read handlers; `worker/v1write.ts`: operations; `worker/changes.ts`: queue, approve, reject, revert.
- A `v1` route group in `index.ts` with its own auth (`requireKey`) rather than `currentUser`; internal `/api` unchanged.
- Write path reuses the revision-checked UPDATE from `putShul`; extract it into a shared `saveSchedule(env, shul, mutate, actor)` with bounded retry.
- Error format: `{ error: { code, message, details? } }` for `/v1` with stable codes; documented.
- Tests (Vitest pool-workers): key auth matrix (missing, wrong, revoked, expired, wrong scope, wrong origin, no Origin, public key on write), every operation, idempotency, conflict retry, review queue, revert, cache headers, CORS, per-key rate limit, field validation, and that no rule data appears in any response.

## 10. Admin UI

New section "Connect" (owner-only create; editors view):

- **Websites**: domain list; embed snippets (iframe, script) with a live preview and options.
- **API keys**: create public/secret, scopes as checkboxes with plain-language labels, mode, expiry; copy-once dialog; list with prefix, last used, usage; revoke / rotate.
- **Pending changes**: queue with approve / reject / edit, badge in the sidebar; applied-by-key items flagged in the Today field and the notices tab with a "via <key label>" chip.
- **Activity log**: audit table with revert.
- **Use with AI**: copyable MCP config and a prompt snippet.

Admin stays English (per AGENTS.md); embeds and any public output use `useT()`.

## 11. MCP server

A small server (`packages/mcp` or a separate repo) wrapping the `/v1` API, configured with the shul slug and a secret key. Tools (descriptions written so the model picks well):

- `get_upcoming(days)`: instances with refs; used first for any request about "this week".
- `set_sponsor(ref | event name + date, sponsoredBy, inHonorOf?)`
- `add_notice(kind, text, from, to?)`
- `cancel_event(ref, note?)`, `retime_event(ref, time, note?)`, `add_note(ref, note)`
- `create_event(name, date, time, …)` (one-time)
- `add_yahrzeit(hebrewName, displayName, hebrewDate | civilDate)`, `add_birthday`, `add_anniversary`
- `list_pending()`, `remove(refOrId)`

Behavior: confirm back what changed ("Kiddush, Shabbos Vayera: sponsored by X in honor of Y. Waiting for approval"). Dates resolved with the shul's clock and Hebrew calendar, never the model's guess; ambiguous input returns candidates, not a write. Later: OAuth in place of pasted keys.

**Prompt-injection stance**: the model may read emails or documents that contain instructions. The API cannot tell them from the gabbai. Mitigations are structural: narrow scopes, review mode default, caps, expiry on everything, audit, one-click revert, and tool descriptions telling the model to confirm destructive or people-name changes with the user.

## 12. Bulletin

Today the bulletin is composed in the browser (`components/Bulletin.tsx`, paper-sized sheets, `@page` CSS), not on the server. Options for `GET /bulletin`:

- a) a link/redirect to `/<slug>/bulletin` (the published page) + the settings, cheap, no PDF;
- b) server-rendered PDF (needs headless rendering or a PDF library; Workers can't run Chromium unless using Browser Rendering): bigger, and probably phase 3.

Recommendation: ship (a) as `bulletinUrl` in `/info` and an iframe embed view; defer PDF. Auditor: confirm.

## 13. Privacy and abuse

- The existing public feed already contains cholim, yahrzeits and birthdays. The new `/v1` API can be **stricter** than that, but the stricter posture means little while `GET /api/shuls/:slug` returns everything to anyone.
- **Can the feed be limited to the Siddur alone? Not hard, with what we have.** `Origin` is browser-only and forgeable, native apps send none, and a key or shared secret inside the Siddur's apps or web build can be extracted. Also `siddur.one/shul/<slug>` is itself public and shows these lists, so the Siddur is a public window onto the data. What is achievable:
  1. **Per-list visibility on the shul** (`settings.public` or similar): cholim, yahrzeits, birthdays, anniversaries each "show in the Siddur / display / bulletin" or hidden, applied by the server when it builds the feed. The `/v1` API honors the same flags and is stricter by default.
  2. **Window the sensitive lists in the feed**: the server includes yahrzeits and occasions only for the next N days (the shul's `days` setting) instead of the whole list, since the Siddur only ever shows the coming week. Cuts what a scraper can harvest to a week at a time. Cost: the feed starts computing a little, and the client engine must tolerate a windowed list (and the Siddur needs no change if it only lists upcoming entries; verify its "all yahrzeits" views, if any).
  3. **Hard limit later, if wanted**: a Worker-to-Worker **service binding** (as `AUTH` already is) so only the Siddur's Worker can fetch the full feed, with the Siddur's clients reading from the Siddur's own endpoint. That is a real boundary for the Beitecha origin, but it is a Siddur-side change, and the Siddur's endpoint becomes the public one.
  Recommendation: do 1 now, 2 with the same change, treat 3 as a separate decision.
- Birthdays/anniversaries of private families: per-list public toggle, default off for the API.
- Scraping: keys + rate limits + short caching; the data is meant to be shown.
- DoS: unauthenticated paths stay behind `PUBLIC_LIMIT`; invalid keys also count against the IP limit (so key guessing is throttled); key lookup is by hash index.
- Key theft: shown once, hashed, revocable, last-used visible, optional expiry, secret keys never in browser code (docs and the admin warn; GitHub secret-scanning-friendly prefix `bk_sec_`).
- Spam via write keys: caps, review mode, expiry.
- Content moderation: text caps, no HTML (rendered as text everywhere; verify display/bulletin/ICS/Siddur never interpret markup), links `https` only.
- ICS injection: escape properly (existing `escape()`); check new free-text fields flow through it.

## 14. Phasing

1. **Read**: keys (public), `/v1` reads, domain list, iframe embeds with `frame-ancestors`, admin "Connect" (websites + public keys), tests. No schema change to `Schedule`.
2. **Write**: secret keys, `applyOperation` in the engine, `/v1` writes, idempotency, `origin` tags, review queue, audit/revert, admin queue.
3. **MCP** + docs, JS widget, PDF bulletin if wanted.

## 15. Questions for the auditor

1. Is two key types the right cut, or should reads need no key at all and keys exist only for writes plus rate-limit attribution?
2. Does `Origin`-only pinning give anything worth the complexity? Is `frame-ancestors` for iframes enough on its own?
3. Gaps in the write surface: anything an agent could do through the allowed operations that effectively edits rules (e.g. a one-time `add` event that shadows a recurring minyan; `cancel` spam wiping a week; `note` text that misleads)?
4. Concurrency: bounded retries on revision conflicts versus admin edits of the whole document. Does the admin's whole-document save clobber an API write that landed between its load and save? (It uses `baseRevision`, so it should 409; confirm the admin handles that without dropping the API change.)
5. Review-mode defaults and the "people's names always reviewed" rule: right call?
6. Revert correctness when later changes depend on the earlier one.
7. Privacy inconsistency with the existing public feed (§13): are per-list visibility flags plus windowing the sensitive lists enough, or is the service-binding proxy needed? Does windowing break any Siddur or engine behavior (e.g. a yahrzeit view that lists beyond the coming week)?
8. Caching correctness: day output depends on shul date, revision, language and hidden zmanim. Any missed cache-key dimension? Any case where a revoked key keeps being served from the edge?
9. Engine changes ship through the submodule to the Siddur: forward/backward compatibility of the `origin` fields and the shared day-shaping function.
10. Abuse we haven't thought of: key enumeration, cross-shul access (every query must be scoped by the key's `shul_id`), oversized bodies, timing, replay, log leakage.
11. Is the MCP surface too broad for v1? Which tools would you cut?
12. Anything in AGENTS.md's architecture ("rules are data, computing on the client; server computes only ICS") that this violates and should be recorded as a deliberate change?
