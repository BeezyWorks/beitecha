-- Connections: what lets a script, a skill or a chat app write to one shul on a member's behalf. A key row holds only
-- the SHA-256 of the secret and a short visible prefix; an oauth row (the MCP) is made on a user's first request.
-- It works only while its user is still in `members` (checked in the same statement as the lookup).
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
CREATE INDEX connections_by_shul ON connections(shul_id, created_at);
CREATE INDEX connections_by_user ON connections(user_id, created_at);

-- Every change a connection makes (or asks to make): pending until a member approves it, then applied, and kept for undo.
CREATE TABLE api_changes (
  id TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES connections(id),
  user_id TEXT NOT NULL,
  op TEXT NOT NULL,
  target TEXT,
  payload TEXT NOT NULL,
  before TEXT,
  after TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','applied','rejected','expired','reverted')),
  idempotency_key TEXT,
  created_at INTEGER NOT NULL,
  decided_by TEXT,
  decided_at INTEGER
);
CREATE INDEX api_changes_by_shul ON api_changes(shul_id, status, created_at);
CREATE UNIQUE INDEX api_changes_idem ON api_changes(connection_id, idempotency_key);

-- A shul with no connections has no API: off until an owner turns it on.
ALTER TABLE shuls ADD COLUMN api_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shuls ADD COLUMN api_default_mode TEXT NOT NULL DEFAULT 'review';

-- Which connection (and change) a revision came from; null for the admin's own saves.
ALTER TABLE history ADD COLUMN connection_id TEXT;
ALTER TABLE history ADD COLUMN change_id TEXT;
