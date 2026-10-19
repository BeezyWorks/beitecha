-- A shul: its public profile and its whole schedule (rules, exceptions, notices) as one
-- JSON document, written with a revision check so two gabbaim can't overwrite each other.
CREATE TABLE shuls (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  profile TEXT NOT NULL,   -- JSON ShulProfile
  schedule TEXT NOT NULL,  -- JSON Schedule (@beitecha/engine)
  revision INTEGER NOT NULL DEFAULT 1,
  listed INTEGER NOT NULL DEFAULT 0, -- shown in the directory (after verification)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

-- Who may edit a shul. user_id is the BeezyWorks account id (auth.baderech.app).
CREATE TABLE members (
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  name TEXT,
  email TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (shul_id, user_id)
);
CREATE INDEX members_by_user ON members(user_id);

-- Invitation links an owner hands to another gabbai.
CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Monitors running the display page, so the gabbai can see one has gone dark.
CREATE TABLE displays (
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,
  label TEXT,
  user_agent TEXT,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (shul_id, display_id)
);

-- One row per saved revision: who changed the schedule and when.
CREATE TABLE history (
  shul_id TEXT NOT NULL REFERENCES shuls(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  user_id TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (shul_id, revision)
);
