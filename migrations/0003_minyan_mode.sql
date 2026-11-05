-- Whether a connection's one-off change to a minyan's time or existence waits for a gabbai ('review') or goes live ('publish').
ALTER TABLE shuls ADD COLUMN api_minyan_mode TEXT NOT NULL DEFAULT 'review';
