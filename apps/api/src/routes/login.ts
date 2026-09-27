import { Router, type Request, type Response } from 'express';
import { signToken, verifyCredentials } from '../auth.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }
  const user = await verifyCredentials(username, password);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  res.json({ token: signToken(user) });
});

export default router;
