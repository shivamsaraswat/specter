import { Router, type Request, type Response } from 'express';
import { signToken } from '../auth.js';
import { logSessionEvent } from '../session/log.js';
import { signInGate } from '../session/throttle.js';

const router = Router();

// The bearer-token sign-in for API clients. Its 200, 400 and 401 answers are unchanged; failed attempts
// are now throttled like browser sign-in, which adds a 429 (spec FR-005g).
router.post('/', async (req: Request, res: Response) => {
  const user = await signInGate(req, res);
  if (!user) return;
  logSessionEvent('sign_in', { accountId: user.id, sessionId: null });
  res.json({ token: signToken(user) });
});

export default router;
