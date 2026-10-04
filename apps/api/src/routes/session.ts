import { Router, type Request, type Response } from 'express';
import { signAccessToken } from '../auth.js';
import { clearSessionCookie, readSessionCookie, requireSameOriginJson, setSessionCookie } from '../session/cookie.js';
import { logSessionEvent } from '../session/log.js';
import { createSession, endAllForUser, endForReason, endSession, findActive, renew } from '../session/store.js';
import { signInGate } from '../session/throttle.js';

// Browser sessions (spec FR-002 to FR-005g, contracts/session-api.md). These sit outside /api/v1
// because sign-in and renewal work without a bearer token. Every route is a POST guarded by an Origin
// check and a JSON content type, because the cookie authenticates them.
const router = Router();

interface SessionAccount {
  userId: number;
  username: string;
  sessionId: string;
}

function tokenBody(account: SessionAccount) {
  const { token, expiresAt } = signAccessToken(account.userId, account.sessionId);
  return {
    access_token: token,
    expires_at: expiresAt.toISOString(),
    account: { id: account.userId, username: account.username },
  };
}

function sessionEnded(req: Request, res: Response): void {
  clearSessionCookie(req, res);
  res.status(401).json({ error: 'Session ended' });
}

router.post('/', requireSameOriginJson, async (req: Request, res: Response) => {
  const user = await signInGate(req, res);
  if (!user) return;
  const { sessionId, credential, expiresAt } = await createSession(user.id);
  setSessionCookie(req, res, credential.value, expiresAt);
  logSessionEvent('sign_in', { accountId: user.id, sessionId });
  res.json(tokenBody({ userId: user.id, username: user.username, sessionId }));
});

router.post('/refresh', requireSameOriginJson, async (req: Request, res: Response) => {
  const value = readSessionCookie(req);
  const result = value ? await renew(value) : { kind: 'ended' as const };
  if (result.kind === 'ended') {
    sessionEnded(req, res);
    return;
  }
  // A grace hit gets an access token only: the browser already holds the newer cookie from the
  // request that won the race, and a second Set-Cookie could overwrite it with an older one.
  if (result.kind === 'rotated') setSessionCookie(req, res, result.credential.value, result.session.expiresAt);
  res.json(tokenBody(result.session));
});

// Always succeeds from the browser's point of view, and is idempotent.
router.post('/logout', requireSameOriginJson, async (req: Request, res: Response) => {
  const value = readSessionCookie(req);
  const active = value ? await findActive(value) : null;
  if (active?.staleReplaced) {
    // A replaced credential presented long after its replacement: possible theft. The session still
    // ends, as a logout would end it, but the operator sees it as reuse, as on renewal.
    await endForReason(active.sessionId, active.userId, 'reuse');
  } else if (active) {
    await endSession(active.sessionId, 'logout');
    logSessionEvent('logout', { accountId: active.userId, sessionId: active.sessionId });
  }
  clearSessionCookie(req, res);
  res.status(204).end();
});

router.post('/logout-all', requireSameOriginJson, async (req: Request, res: Response) => {
  const value = readSessionCookie(req);
  const active = value ? await findActive(value) : null;
  if (!active) {
    sessionEnded(req, res);
    return;
  }
  // A stale replaced credential is possible theft: that session is recorded as reuse. Ending every
  // session of the account is still the conservative response, so the rest go as usual.
  const reused = active.staleReplaced && (await endForReason(active.sessionId, active.userId, 'reuse'));
  const ended = await endAllForUser(active.userId, 'logout_all');
  logSessionEvent('logout_all', {
    accountId: active.userId,
    sessionId: active.sessionId,
    sessionsEnded: ended.length + (reused ? 1 : 0),
  });
  clearSessionCookie(req, res);
  res.status(204).end();
});

export default router;
