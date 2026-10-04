-- Failed sign-in counts (Phase 1 Milestone 6, FR-005g). The key is an HMAC of what was typed and of
-- the client address, so this table never holds a username, a password or an address in plaintext:
-- a typed username can be a password typed into the wrong field.
CREATE TABLE sign_in_throttle (
  key               TEXT PRIMARY KEY,
  failures          INTEGER NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  blocked_until     TIMESTAMPTZ,
  -- The moment the row stops mattering: both its counting window and its block have passed.
  forget_after      TIMESTAMPTZ NOT NULL,
  CONSTRAINT sign_in_throttle_failures_check CHECK (failures > 0)
);

-- Serves the cleanup that runs with each failure write.
CREATE INDEX sign_in_throttle_forget_after_idx ON sign_in_throttle (forget_after);
