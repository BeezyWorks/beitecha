# Brief: public reads, embeds, connections, write API, MCP

Status: decided, ready to build in phases (§16). Nothing here is built yet.

## 1. Goal

The person we design for is the shul's office manager: not technical, and she won't learn new tech if she can avoid
it. Every week she updates sponsorships, notices, one-time changes, yahrzeits and birthdays. The end goal: she opens the
chat app she already uses, says "kiddush this week is sponsored by the Cohens in honor of Dovid's bar mitzvah", and it's
done.

1. **Public reads + embeds**: a shul's own website shows its computed times, zmanim, info and notices. No key needed.
2. **Write API**: a narrow set of operations (never a whole document) to change sponsorships, notices, one-time changes,
   one-time events, yahrzeits, birthdays/anniversaries and refuah names.
3. **Three ways in**, all through the same write API:
   - **MCP** (hosted by us at `beitecha.baderech.app/mcp`): she pastes the URL into her chat app's connectors, clicks
     Connect and signs in with her Baderech account. No key to copy.
   - **Our script + skill**: the admin gives her a zip (a Python script with a key built in, plus a `SKILL.md`) to add to
     Claude as a skill. This needs no OAuth server, so it ships before the MCP.
   - **Their own script**: a technical shul member gets a plain API key.

Non-goals: email-in (the LLM cost would be ours; maybe later); public keys for browsers; editing rules, settings,
displays or the team through any connection; a developer portal or billing.

## 2. Decisions

- **The Siddur keeps the whole feed.** `GET /api/shuls/:slug` stays as it is, with cholim, yahrzeits, birthdays and
  anniversaries, and there is **no shul setting** to hide them from the Siddur. The stricter rules here apply only to
  `/v1`.
- **No public keys.** Everything a browser key would read is already public. Reads under `/v1` need no key and are
  limited per IP; iframe embeds are gated by the shul's website list (`frame-ancestors`).
- **Every connection belongs to a person and has a purpose.** A connection is either a key or an MCP sign-in grant; both
  live in one table (§4). It works only while its user is still a member of the shul with the role it needs.
- **A shul with no connections has no API.** `api_enabled` is off by default. While it's off, every `/v1` write path
  returns 404 before anything is loaded.
- **Review is a choice per connection**: "Post right away" or "Ask a gabbai first". A shul can live dangerously.
  Retiming or cancelling a **minyan** is always queued, whatever the mode.
- **One write path.** The MCP, our script and their scripts all call the same `/v1` operations.
- **The accounts service (BeezyWorksAccounts) becomes the OAuth server** for the MCP, through Better Auth's own
  `@better-auth/mcp` plugin (§12).

## 3. Ground truth in the current code

- One JSON `Schedule` per shul in D1 (`shuls.schedule`), saved whole with `baseRevision` (`putShul`,
  `worker/shuls.ts`). `history` records only `(shul, revision, user, at)`.
- Auth: a Baderech bearer token checked with `GET /api/auth/get-session` on the accounts Worker (`worker/auth.ts`), over
  the `AUTH` service binding. Roles: `owner`, `editor` (`members` table). The Siddur signs in to the same accounts
  service (`auth.baderech.app`), so a person has one account across all the apps.
- `GET /api/shuls/:slug` is public: the whole schedule, CORS for the Siddur's hosts, `PUBLIC_LIMIT` 300/min per IP.
- The worker computes only the ICS feed (`worker/ics.ts`); the engine runs fine in the Worker.
- `Exception` is `cancel | retime | note | add`; the admin's Today field edits them through `upsertException` /
  `removeException` (`features/admin/store.ts`). A sponsorship is a `Notice` with `kind: 'sponsor'`.
- `scheduleProblem()` validates shape; the engine's `validate()` dry-runs a year.
- Static assets are served directly (`wrangler.jsonc` `assets`, `run_worker_first` only for `/api/*`, `/health`,
  `/*.ics`). **No framing protection is set anywhere today** (no `frame-ancestors`, no `X-Frame-Options`).

## 4. Connections

One table, two kinds:

| | `key` | `oauth` |
|---|---|---|
| Made by | a member in the admin ("Create key" or "Download Claude skill") | a member signing in from a chat app's connector |
| Secret | `bk_sec_<32 base62>`, shown once (built into the skill zip) | an access token from the accounts service; refreshed by the chat app |
| Purpose | picked at creation: AI assistant (skill), Script, Other + a note | "AI assistant, <client name>" from the OAuth client |

Rules:

- **Owner of a connection = the member who made it.** It is checked on every request in the same SQL as the lookup
  (`JOIN members ON shul_id AND user_id`), so removing a member or making an owner an editor ends their connections at
  once.
- **Who can create one**: any member, once an owner has turned on `api_enabled`. A connection can't do more than its
  user's role allows. Owners see and revoke every connection in the shul; editors see and revoke their own.
- **Every owner is told** (in the admin, and by email when we have email for it) when a connection is created.
- **Keys**: stored as SHA-256 + a visible prefix; never logged; never accepted in a query string; `Authorization:
  Bearer` only. Expiry is required: default 90 days, max 1 year. The admin warns 14 days before, and a skill whose key
  expires is re-downloaded.
- **OAuth grants**: Beitecha creates the connection row the first time a valid token for a new `(user, client)` arrives
  (§12). If the user belongs to several shuls, tools take a `shul` argument and the row is per shul.
- **Revoke one, revoke all, freeze.** Revoke takes effect on the next request (key lookups aren't cached for more than a
  few seconds). "Revoke all" revokes every connection in the shul. Turning `api_enabled` off does the same and blocks new
  ones. An env var `V1_WRITES=off` stops every write on every shul (kill switch).
- **Limits**: 10 active connections per shul, 3 per user. Creating keys is rate-limited per user.
- **What the admin shows per connection**: user, purpose, kind, mode, scopes, created, last used (throttled to one
  write per few minutes), last IP and user agent, writes this week, expiry.

## 5. Public reads (no key)

Base `/v1/shuls/:slug/…`, JSON, versioned apart from the internal `/api`. All responses are **computed**: no `Rule`,
`Condition` or `TimeExpr` appears. Limited per IP (`PUBLIC_LIMIT` or a sibling binding).

| Endpoint | Returns |
|---|---|
| `GET /info` | name, address, city, website, brand color, time zone, language, `israel`, `bulletinUrl` |
| `GET /day/:date` | one day: Hebrew date, holidays, parsha, tags, zmanim, public events with computed times |
| `GET /days?from&to` | a range, at most 62 days |
| `GET /week` | the shul's current week, by the shul's clock |
| `GET /zmanim?from&to` | zmanim only (built-in + custom, respecting `hidden`) |
| `GET /next` | what's next, from the shul's clock |
| `GET /notices` | current notices and sponsorships, with ids |
| `GET /upcoming?days=14` | event **instances** with a stable `ref` (`<eventId>@<date>`), name, time and any existing sponsor, exception or note. Writes accept `ref` |

- Events: `id`, localized `name`, `kind`, `tefila`, `category`, `audience`, `time`, optional `end`, `relative`,
  `cancelled`, `note`, `source`, speaker/topic/room/link. Times as `minutes` and an ISO local string with the date's
  UTC offset, plus the IANA zone. `internal` events never appear.
- **Yahrzeits, birthdays, anniversaries and refuah names are not in `/v1` reads.** The Siddur's feed carries them.
- Language from `settings.language`/`names` unless `?lang=` / `?names=`.
- Caching: `ETag` from `(shul id, revision, shul's date, lang, names)`; `Cache-Control` with `s-maxage`. Nothing
  key-dependent is cached at the edge.
- CORS: open (`*`) for these reads, since the data is public.
- `calendar.ics` stays public at its current URL. Calendar apps can't send headers.
- The bulletin: `bulletinUrl` in `/info` and an iframe embed. No server-rendered PDF.

## 6. Embeds

- **Iframe** `https://beitecha.baderech.app/embed/:slug/<view>` (`week`, `today`, `shabbos`, `zmanim`, `sponsors`,
  `bulletin`). Params `lang`, `theme`, `accent`, `compact`; height through `postMessage`.
- **Gated by the shul's website list** (`profile.websites`, 1–5 origins, owner-edited): the Worker sets
  `Content-Security-Policy: frame-ancestors <origins>` per response. With an empty list the view sends
  `frame-ancestors 'none'` and doesn't render.
- Add `/embed/*` to `run_worker_first` so the Worker can set the header (it then serves the SPA through `ASSETS`).
- Views reuse the luach components and `ThemeRoot`; strings via `useT()`; no raw colors. Check bundle weight; this may
  need a lean entry.
- **Separately, and now**: send `frame-ancestors 'none'` (and `X-Frame-Options: DENY`) on everything else, the admin
  above all. Today it can be framed (clickjacking).

## 7. Scopes and operations

Writes are **operations, not documents**: load, apply one change (`applyOperation`, §10), validate, save with the
revision check, retry on conflict (at most 3 times). A connection can never replace the schedule or touch `rules`,
`settings`, `profile`, `displays`, `members` or connections.

| Scope | Operations |
|---|---|
| `sponsors` | create, update or delete a sponsorship (`kind: 'sponsor'`: `ref` or `eventId` + date, or `from`/`to`; `sponsoredBy`, `inHonorOf`, `text`) |
| `notices` | create, update or delete an announcement, reminder, simcha or condolence notice |
| `changes` | on a `ref`: `cancel`, `retime`, `note`, and delete one. **Retiming or cancelling a `tefila` event always goes to review** |
| `events` | create a **one-time** event (date + clock time, no rule); edit or delete events this connection created |
| `yahrzeits` | add, edit, delete a yahrzeit |
| `occasions` | add, edit, delete a birthday or anniversary |
| `cholim` | add, remove or renew a refuah name; `GET /cholim` (with this scope only) lists names to remove |

- New connections default to `sponsors`, `notices`, `changes`, `events`, `yahrzeits`, `occasions`; `cholim` is opt-in.
- **Targeting by name**: tools call `/upcoming` first and write by `ref`. Removing or editing people-list entries is
  by the id returned on creation or by `match` (case- and diacritic-insensitive over `en`/`he`), which must find exactly
  one entry. Otherwise the response is 400 with the candidates (name and date only), and nothing changes.
- **Not offered**: recurring events or rules, events this connection didn't create, settings, profile, custom zmanim,
  local holidays, displays, print settings, the team, connections.

### Semantics

- **Idempotency**: `Idempotency-Key` header, scoped to the connection, kept for 24 h.
- **Uniqueness**: one sponsorship per `(eventId, date)` (`replace: true` replaces, otherwise 409); one cancel/retime per
  `(eventId, date)`.
- **Dates are the shul's** (`todayIn(tz)`). Exceptions at most 1 day in the past and 1 year ahead.
- **Lifetimes**: sponsorships and anything on a date become past as in the admin. Announcements and reminders need a
  `to` (default `from` + 14 days, at most 90) so nothing stays on the lobby screen forever. Yahrzeits, occasions and
  refuah names never expire; refuah names keep `added`.
- **Origin tags**: what a connection creates carries `origin: { connectionId }` (new optional field on `Notice`,
  `Exception`, `Yahrzeit`, `Occasion`, `EventDef`). Used for "edit only what you created", for the admin's "via <label>"
  chip, and for revert.
- **Text**: names 100 chars, notice text 500; plain text only (no HTML, everywhere renders it as text: verify display,
  bulletin, ICS, Siddur); links `https` only. **Strip** C0/C1 controls, bidi overrides and isolates (U+202A–202E,
  U+2066–2069), zero-width and other invisible characters (U+200B–200F, U+FEFF, U+2060); no word over 40 characters
  (protects the 1280×720 layout). Yahrzeits and occasions pass the admin's validators (`isRealMonthDay`, civil date
  format). Then `scheduleProblem` on the whole document.
- **Caps**: per connection 50 writes a day, at most 5 live notices at once; per shul cholim ≤ 300 and the existing list
  caps, so nothing can fill the 512 KB document. **Removals**: at most 3 a day applied at once per connection; any more
  go to review.
- **Responses**: the created or changed object, the new revision, the change id, and whether it is `applied` or
  `pending`.
- **Errors**: `{ error: { code, message, details? } }` with stable codes. An unknown shul, a shul with the API off and
  a slug that doesn't match the connection's shul all return the **same 404**.

## 8. Review and undo

Each connection has `mode: 'publish' | 'review'`. The owner picks the shul's default for new connections when turning
the API on (preselected: `review`); any connection can be switched later.

- **The chat or skill confirms before writing.** Tool descriptions and `SKILL.md` tell the model to show what it will
  change and get an OK first. This is the review the office manager actually sees.
- **`publish`**: applied at once. Exceptions: minyan retime/cancel and removals beyond the daily cap go to Pending.
- **`review`**: stored in `api_changes` as `pending`. The admin shows **Pending** at the top ("3 changes from Rivka's
  assistant"): each card shows the change as the display will show it, with Approve, Edit, Reject and Approve all. Any
  member may approve. Approval re-applies it to the current schedule through the same path and fails clearly if it no
  longer fits. Pending changes expire after 14 days; at most 50 per connection.
- **Recent changes** in the admin: everything a connection did, newest first, each with **Undo** (if the target hasn't
  changed since; otherwise it says what changed). **"Undo everything this connection did since…"** sits next to Revoke.
- **Owners' weekly summary** of changes by connection, by email when the accounts service can send it (it already sends
  mail); in the admin until then.

## 9. Data model (`migrations/0002_api.sql`)

```sql
CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,          -- the member it acts for; must still be in members
  kind TEXT NOT NULL CHECK (kind IN ('key','oauth')),
  purpose TEXT NOT NULL,          -- 'assistant' | 'skill' | 'script' | 'other'
  label TEXT NOT NULL,            -- "Rivka's Claude", or the note given
  prefix TEXT,                    -- key: first chars, shown in the admin
  hash TEXT UNIQUE,               -- key: sha-256 of the key
  oauth_client_id TEXT,           -- oauth: the client from the accounts service
  scopes TEXT NOT NULL,           -- JSON array
  mode TEXT NOT NULL DEFAULT 'review' CHECK (mode IN ('publish','review')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER,             -- required for keys
  revoked_at INTEGER,
  last_used_at INTEGER,
  last_ip TEXT,
  last_user_agent TEXT,
  UNIQUE (shul_id, user_id, oauth_client_id)
);
CREATE TABLE api_changes (
  id TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES connections(id),
  user_id TEXT NOT NULL,
  op TEXT NOT NULL, target TEXT, payload TEXT NOT NULL,
  before TEXT, after TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','applied','rejected','expired','reverted')),
  idempotency_key TEXT,
  created_at INTEGER NOT NULL, decided_by TEXT, decided_at INTEGER
);
CREATE INDEX api_changes_by_shul ON api_changes(shul_id, status, created_at);
CREATE UNIQUE INDEX api_changes_idem ON api_changes(connection_id, idempotency_key);
ALTER TABLE shuls ADD COLUMN api_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shuls ADD COLUMN api_default_mode TEXT NOT NULL DEFAULT 'review';
ALTER TABLE history ADD COLUMN connection_id TEXT;
ALTER TABLE history ADD COLUMN change_id TEXT;
```

`profile.websites` (JSON in `profile`) holds the embed origins.

## 10. Engine changes (`packages/engine`, picked up by the Siddur)

- Optional `origin?: { connectionId: string }` on `Notice`, `Exception`, `Yahrzeit`, `Occasion`, `EventDef`. Old
  Siddur builds ignore unknown fields; check that nothing strips or rejects them (`scheduleProblem` included).
- `applyOperation(schedule, op, ctx) → { schedule, before, after } | { error }`: pure, one definition for the Worker
  and any future client, with its own tests. `ctx` carries today in the shul's zone and the connection id.
- `revertOperation(schedule, change) → schedule | { conflict }`.
- `sanitizeText()` (the stripping rules in §7) and the field caps.
- `computeDays(schedule, from, to, opts)` returning the public JSON of §5, so the API and any client agree.

## 11. Worker

- `worker/connections.ts`: create, list, revoke, revoke all, enable/disable API, default mode (session-authenticated;
  owner/own-connection rules); `requireConnection(request, env, slug)`: key hash or OAuth token → connection row joined
  with `members` and `shuls.api_enabled`; scope check.
- `worker/v1.ts` (public reads), `worker/v1write.ts` (operations), `worker/changes.ts` (pending, approve, reject, undo).
- `saveSchedule(env, shulId, mutate, actor)` taken out of `putShul`, with bounded retry. **The admin's `putShul` must
  behave exactly as before**; tests guard it.
- The shul id for every write comes from the connection row, never from the URL.
- `/v1` and `/mcp` routes in `index.ts`; add `/v1/*`, `/mcp`, `/embed/*` to `run_worker_first`.
- Security headers on every response (§6).
- Tests (Vitest pool-workers): the auth matrix (no secret, wrong, revoked, expired, member removed, demoted, API off,
  wrong shul's slug, wrong scope); every operation; minyan retime always pending; removal cap; idempotency; conflict
  retry against an admin save in between; pending/approve/reject/expire; undo and undo-all; text stripping; caps; the
  identical 404s; no rule data and no people lists in any `/v1` read; `frame-ancestors` per shul.

## 12. MCP and the accounts service

### BeezyWorksAccounts (`~/Projects/BeezyWorksAccounts`)

- Bump `better-auth` and `@better-auth/expo` 1.7.7 → 1.7.15 (patch). Add `@better-auth/mcp` and `@better-auth/cimd`.
- `src/auth.ts` plugins: `[expo(), bearer(), oneTimeToken(), jwt(), mcp({ loginPage, consentPage, resource, scopes }),
  cimd()]`. Don't also add `oauthProvider()` (the docs say so).
- Migration `0003_oauth.sql` from `npx auth generate`: `oauthClient`, `oauthAccessToken`, `oauthRefreshToken`,
  `oauthConsent`, `oauthClientAssertion`, plus the `jwt` plugin's `jwks`.
- Two Worker-hosted pages beside `/reset-password` and `/verified`: sign-in and consent ("Claude wants to manage
  your shul's notices for you. Allow?"), naming the client clearly.
- **CIMD on Workers needs a custom fetch transport**: resolve the host once, reject private and special-use addresses
  (RFC 6890), pin the address, refuse redirects. If that proves too fiddly, enable dynamic client registration as the
  fallback (`allowDynamicClientRegistration`).
- **Scope it tightly**: the only resource is `https://beitecha.baderech.app/mcp` (token audience), scopes `beitecha:*`.
  A token for Beitecha is useless anywhere else.
- **Test on D1**: the plugin's replay protection (DPoP) uses the database adapter, and the docs don't mention D1.
- **Existing users are unaffected**: sessions, `bearer()`, `get-session`, social sign-in and the Siddur's flows don't
  change; the plugins only add tables and routes. Run the accounts test suite and a Siddur sign-in before deploying.

### Beitecha `/mcp`

- On the Worker, with the MCP TypeScript SDK. Tokens are checked with the plugin's `createMcpProtectedRequestHandler`
  against the accounts JWKS (fetched over the `AUTH` binding), audience and scopes required.
- First request from a new `(user, client)` for a shul where the user is a member and `api_enabled` is on → a new
  `oauth` connection in the shul's default mode. Not a member, or the API is off → the tool answers "This shul hasn't
  turned on assistants. Ask a gabbai to turn it on in Beitecha → Connect."
- Tools: `get_upcoming(days)`, `list_notices()`, `set_sponsor(ref, sponsoredBy, inHonorOf?, text?)`,
  `add_notice(kind, title?, text, from?, to?)`, `edit_notice`, `remove_notice`, `cancel_event(ref, note?)`,
  `retime_event(ref, time, note?)`, `add_note(ref, note)`, `create_event(name, date, time, …)`, `add_yahrzeit`,
  `add_birthday`, `add_anniversary`, `remove_person(kind, idOrMatch)`, `add_refuah`/`remove_refuah` (with `cholim`),
  `list_pending()`. Descriptions say: call `get_upcoming` first for anything about "this week"; show the change and get
  an OK before writing; never guess a date.
- Each result says plainly what happened: "Kiddush, Shabbos Vayera: sponsored by the Cohens in honor of Dovid's bar
  mitzvah. Live now." or "… Waiting for a gabbai to approve."

### Her setup (the help page in the admin's Connect section)

Claude (any plan, Free included; Free allows one custom connector): Customize → Connectors → Add custom connector →
paste `https://beitecha.baderech.app/mcp` → Connect → sign in → Allow. ChatGPT needs a paid plan with developer mode;
Gemini only on paid plans inside Spark tasks. Write the help page for Claude first.

## 13. Our script + skill

- `packages/skill/` (or `tools/skill/`): `beitecha.py` (standard library only: `urllib`, `json`, `argparse`), the same
  operations as the MCP tools as subcommands, JSON in and out; `SKILL.md` with the same guidance as the tool descriptions.
- The admin's **Download Claude skill** creates a `key` connection (purpose `skill`, the user's name in the label) and
  builds the zip with the key and the shul slug in a config file beside the script.
- Her setup: Settings → Capabilities → turn on code execution, allow network access to `beitecha.baderech.app`, upload
  the zip. **To verify**: that the extra-allowed-domains setting is available on the Free plan.
- The same script works for a technical member with their own key, and in Claude Code or Cowork.

## 14. Privacy and abuse

- `/v1` reads carry no people lists. The Siddur's feed is unchanged by policy.
- A stolen key or token: narrow scopes, review or caps, 5 live notices, 3 removals a day, minyan changes always
  pending, revoke + "undo everything since", expiry, and the owners' summary.
- Spoofed instructions to the AI (prompt injection from an email it reads): the API can't tell them from her. The
  mitigations are the same structural ones, plus tool descriptions that ask for confirmation.
- Key guessing: invalid secrets count against the per-IP limit; lookup is by hash index.
- Cross-shul access: the shul id always comes from the connection row.
- Oversized bodies: `readJson` with a small limit (8 KB) on every write.
- Logs: never log `Authorization`, keys or tokens; redact them in errors.
- ICS: new free text goes through `escape()`.

## 15. Admin UI: "Connect" (owner-only settings; members see their own connections)

- **Assistants & API**: turn on or off; default mode; the connection list (§4) with Revoke and Revoke all; Create key;
  Download Claude skill; the "Connect Claude" help (§12).
- **Pending** (badge in the sidebar) and **Recent changes** with Undo (§8). Items created by a connection get a
  "via <label>" chip in the Today field and the notices, yahrzeits and birthdays tabs.
- **Websites**: the embed origin list, snippets and a live preview.
- The admin stays English.

## 16. Phases and work packages

Each package is a self-contained task. → marks what it needs first.

**Phase 0 (now, independent)**
- **P0a Security headers**: `frame-ancestors 'none'` + `X-Frame-Options: DENY` on the app (assets need
  `run_worker_first` or a `_headers` file in `dist`). Small.

**Phase 1: write API + script/skill** (no OAuth yet)
- **P1a Engine** (`packages/engine`): `origin` fields, `applyOperation`, `revertOperation`, `sanitizeText`,
  `computeDays`, with tests. Commit in the submodule.
- **P1b Worker connections** → P1a's types: migration `0002_api.sql`, `connections.ts`, `requireConnection`, the
  `saveSchedule` extraction with `putShul` unchanged, tests.
- **P1c Worker `/v1`** → P1a, P1b: public reads, writes, pending/approve/undo, rate limits, tests.
- **P1d Admin Connect** → P1c's endpoints: connections list, enable/default mode, create key, Pending, Recent changes,
  chips. Jest for store and forms.
- **P1e Script + skill** → P1c: `beitecha.py`, `SKILL.md`, the zip download in the admin.

**Phase 2: MCP**
- **P2a Accounts OAuth** (BeezyWorksAccounts, independent of phase 1): plugin upgrade, migration, pages, CIMD
  transport, D1 test, tests that existing sign-in is unchanged.
- **P2b `/mcp`** → P1c, P2a: the MCP server on the Worker, OAuth connections, tools, help page.

**Phase 3**: iframe embeds and the website list; later, email-in if we find a way to pay for it.

## 17. Open questions (defaults chosen; change if wrong)

1. The preselected default mode when an owner turns the API on: `review`. (She can pick "Post right away" in one
   click.)
2. Editors may create connections for themselves. (Alternative: owners only.)
3. Skill keys expire after 90 days. (Longer means fewer re-downloads and a longer life for a stolen key.)
4. Removing a refuah name counts against the 3-a-day cap like any removal.
