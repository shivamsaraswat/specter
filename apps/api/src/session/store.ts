import { createHash, randomBytes } from 'node:crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import config from '../config.js';
import db from '../db.js';
import { logSessionEvent, type EndReason } from './log.js';

// Browser sessions (data-model.md, 011). Only parameterized SQL runs here (Principle I). A session
// credential is never stored or logged: only its SHA-256 digest is, and the credential has 256 bits
// of entropy, so a plain digest is non-reversible and a lookup is one indexed equality (research #4).

// A pool or a transaction's client. Seeding passes its own client so a password change and the end of
// the account's sessions commit together.
interface Executor {
  query: <R extends QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<R>>;
}

// How long the immediately-previous credential is still honoured after a rotation. It covers a
// renewal response that was lost or raced (research #5); after it, replaying the old credential is
// treated as theft.
const GRACE_SECONDS = 30;

interface Credential {
  value: string;
  hash: Buffer;
}

function hashCredential(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function newCredential(): Credential {
  const value = randomBytes(32).toString('base64url');
  return { value, hash: hashCredential(value) };
}

interface SessionRef {
  sessionId: string;
  userId: number;
  username: string;
  expiresAt: Date;
}

interface LapsedRow {
  id: string;
  user_id: number;
  end_reason: 'expired' | 'idle';
}

// Ends every session that has silently lapsed (past its maximum lifetime, or unused past the idle
// limit) and logs each one, so no session leaves the table without its `ended` line (FR-005e).
export async function endLapsedSessions(executor: Executor = db): Promise<{ id: string; userId: number }[]> {
  const { rows } = await executor.query<LapsedRow>(
    `UPDATE browser_sessions
        SET ended_at = now(),
            end_reason = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'idle' END
      WHERE ended_at IS NULL
        AND (expires_at <= now() OR last_used_at <= now() - $1::double precision * interval '1 millisecond')
      RETURNING id, user_id, end_reason`,
    [config.sessionIdleTimeoutMs],
  );
  for (const row of rows) {
    logSessionEvent('ended', { accountId: row.user_id, sessionId: row.id, reason: row.end_reason });
  }
  return rows.map((row) => ({ id: row.id, userId: row.user_id }));
}

// Called on every successful sign-in. It first ends what has lapsed, then deletes what ended more than
// a day ago, so the table doesn't grow without bound and there is no background job (research #8).
async function cleanup(): Promise<void> {
  await endLapsedSessions();
  await db.query(`DELETE FROM browser_sessions WHERE ended_at < now() - interval '1 day'`);
}

export async function createSession(userId: number): Promise<{ sessionId: string; credential: Credential; expiresAt: Date }> {
  await cleanup();
  const credential = newCredential();
  const { rows } = await db.query<{ id: string; expires_at: Date }>(
    `INSERT INTO browser_sessions (user_id, current_hash, expires_at)
     VALUES ($1, $2, now() + $3::double precision * interval '1 millisecond')
     RETURNING id, expires_at`,
    [userId, credential.hash, config.sessionMaxLifetimeMs],
  );
  const created = rows[0];
  if (!created) throw new Error('createSession returned no row');
  return { sessionId: created.id, credential, expiresAt: created.expires_at };
}

type RenewResult =
  // The credential was current: it is now replaced, and the caller sets the new cookie.
  | { kind: 'rotated'; session: SessionRef; credential: Credential }
  // The credential was the one just replaced, inside the grace window: no new cookie is issued.
  | { kind: 'grace'; session: SessionRef }
  // The session is over, or the credential matched nothing.
  | { kind: 'ended' };

interface ClassifyRow {
  id: string;
  user_id: number;
  username: string;
  expires_at: Date;
  ended_at: Date | null;
  is_current: boolean;
  expired: boolean;
  idle: boolean;
  in_grace: boolean;
}

// Ends one session, once, and logs it. It reports whether this call was the one that ended it.
export async function endForReason(id: string, userId: number, reason: EndReason): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE browser_sessions SET ended_at = now(), end_reason = $2 WHERE id = $1 AND ended_at IS NULL`,
    [id, reason],
  );
  if (rowCount === 1) logSessionEvent('ended', { accountId: userId, sessionId: id, reason });
  return rowCount === 1;
}

// Renewal (research #5). Rotation is one conditional UPDATE: two instances, or two tabs, can never both
// rotate one credential, and never both pass the check. What it refuses is then classified.
export async function renew(value: string): Promise<RenewResult> {
  const hash = hashCredential(value);
  const next = newCredential();
  const rotated = await db.query<{ id: string; user_id: number; username: string; expires_at: Date }>(
    `UPDATE browser_sessions s
        SET previous_hash = s.current_hash, current_hash = $2, rotated_at = now(), last_used_at = now()
       FROM users u
      WHERE u.id = s.user_id
        AND s.current_hash = $1
        AND s.ended_at IS NULL
        AND s.expires_at > now()
        AND s.last_used_at > now() - $3::double precision * interval '1 millisecond'
      RETURNING s.id, s.user_id, u.username, s.expires_at`,
    [hash, next.hash, config.sessionIdleTimeoutMs],
  );
  const won = rotated.rows[0];
  if (won) {
    return {
      kind: 'rotated',
      credential: next,
      session: { sessionId: won.id, userId: won.user_id, username: won.username, expiresAt: won.expires_at },
    };
  }

  const { rows } = await db.query<ClassifyRow>(
    `SELECT s.id, s.user_id, u.username, s.expires_at, s.ended_at,
            (s.current_hash = $1) AS is_current,
            (s.expires_at <= now()) AS expired,
            (s.last_used_at <= now() - $2::double precision * interval '1 millisecond') AS idle,
            (s.rotated_at IS NOT NULL AND s.rotated_at > now() - $3::double precision * interval '1 second') AS in_grace
       FROM browser_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.current_hash = $1 OR s.previous_hash = $1`,
    [hash, config.sessionIdleTimeoutMs, GRACE_SECONDS],
  );
  const found = rows[0];
  if (!found || found.ended_at) return { kind: 'ended' };

  if (found.expired) {
    await endForReason(found.id, found.user_id, 'expired');
    return { kind: 'ended' };
  }
  if (found.idle) {
    await endForReason(found.id, found.user_id, 'idle');
    return { kind: 'ended' };
  }
  if (found.is_current) return { kind: 'ended' };

  if (found.in_grace) {
    await db.query('UPDATE browser_sessions SET last_used_at = now() WHERE id = $1 AND ended_at IS NULL', [found.id]);
    return {
      kind: 'grace',
      session: { sessionId: found.id, userId: found.user_id, username: found.username, expiresAt: found.expires_at },
    };
  }
  // A credential that was replaced more than the grace window ago is being replayed: possible theft.
  await endForReason(found.id, found.user_id, 'reuse');
  return { kind: 'ended' };
}

interface ActiveSession {
  sessionId: string;
  userId: number;
  // The credential matched is one that was replaced more than the grace window ago: the same signal
  // as reuse in renew(), seen on a different endpoint.
  staleReplaced: boolean;
}

// The active session a credential belongs to, matching the current or the just-replaced credential, so
// a tab that lost a renewal race can still log out. A replaced credential older than the grace window
// is flagged, so the caller can record it as possible theft instead of an ordinary logout.
export async function findActive(value: string): Promise<ActiveSession | null> {
  const hash = hashCredential(value);
  const { rows } = await db.query<{ id: string; user_id: number; stale: boolean }>(
    `SELECT id, user_id,
            (previous_hash = $1
             AND (rotated_at IS NULL OR rotated_at <= now() - $2::double precision * interval '1 second')) AS stale
       FROM browser_sessions
      WHERE (current_hash = $1 OR previous_hash = $1) AND ended_at IS NULL`,
    [hash, GRACE_SECONDS],
  );
  const found = rows[0];
  return found ? { sessionId: found.id, userId: found.user_id, staleReplaced: found.stale } : null;
}

export async function endSession(id: string, reason: 'logout'): Promise<void> {
  await db.query(`UPDATE browser_sessions SET ended_at = now(), end_reason = $2 WHERE id = $1 AND ended_at IS NULL`, [id, reason]);
}

// Ends every active session of an account and returns their ids. It doesn't log: the caller knows
// whether this is a sign out everywhere or a password change, and logs accordingly.
export async function endAllForUser(
  userId: number,
  reason: 'logout_all' | 'password_changed',
  executor: Executor = db,
): Promise<string[]> {
  const { rows } = await executor.query<{ id: string }>(
    `UPDATE browser_sessions SET ended_at = now(), end_reason = $2
      WHERE user_id = $1 AND ended_at IS NULL RETURNING id`,
    [userId, reason],
  );
  return rows.map((row) => row.id);
}

// Whether a UI access token's session is still active. One primary-key read per /api/v1 request.
export async function isActive(sessionId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'SELECT 1 FROM browser_sessions WHERE id = $1 AND ended_at IS NULL AND expires_at > now()',
    [sessionId],
  );
  return rowCount === 1;
}
