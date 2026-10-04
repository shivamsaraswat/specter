-- One row per signed-in browser (Phase 1 Milestone 6). A session credential is never stored: only
-- the SHA-256 digest of the current one, and of the one it replaced most recently (FR-005b).
CREATE TABLE browser_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       INTEGER NOT NULL,
  current_hash  BYTEA NOT NULL,
  previous_hash BYTEA,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ,
  end_reason    TEXT,
  -- CASCADE: accounts cannot be deleted in this phase, but a session must never outlive its account.
  CONSTRAINT browser_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT browser_sessions_current_hash_check CHECK (octet_length(current_hash) = 32),
  CONSTRAINT browser_sessions_previous_hash_check CHECK (previous_hash IS NULL OR octet_length(previous_hash) = 32),
  CONSTRAINT browser_sessions_expires_check CHECK (expires_at > created_at),
  CONSTRAINT browser_sessions_end_reason_check CHECK (
    end_reason IS NULL
    OR end_reason IN ('logout', 'logout_all', 'expired', 'idle', 'password_changed', 'reuse')
  ),
  -- A session is ended exactly when it has a reason, and the other way round.
  CONSTRAINT browser_sessions_ended_check CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);

-- Renewal looks a credential up by its digest and rotates it in one conditional UPDATE.
CREATE UNIQUE INDEX browser_sessions_current_hash_key ON browser_sessions (current_hash);
-- A credential that was just replaced is matched here, for the grace window and for reuse detection.
CREATE UNIQUE INDEX browser_sessions_previous_hash_key ON browser_sessions (previous_hash)
  WHERE previous_hash IS NOT NULL;
-- Serves "sign out everywhere", ending sessions on a password change, and the FK cascade. Active
-- sessions are the only ones those need.
CREATE INDEX browser_sessions_user_id_idx ON browser_sessions (user_id) WHERE ended_at IS NULL;
-- Serves the cleanup that runs on sign-in: end what has silently lapsed, then delete what ended long ago.
CREATE INDEX browser_sessions_cleanup_idx ON browser_sessions ((coalesce(ended_at, expires_at)));
