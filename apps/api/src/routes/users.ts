import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const router = Router();

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past 72 bytes

interface CreatedUser {
  id: number;
  username: string;
}

function hasCode(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

// Any logged-in user can create another user; there are no roles.
router.post('/', async (req: Request, res: Response) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== 'string' || !username.trim() || username.trim().length > 64) {
    res.status(400).json({ error: 'username is required (max 64 characters)' });
    return;
  }
  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH ||
    Buffer.byteLength(password) > MAX_PASSWORD_BYTES
  ) {
    res.status(400).json({ error: `password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_BYTES} bytes long` });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query<CreatedUser>(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username.trim(), hash],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (hasCode(err) && err.code === '23505') {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }
    throw err;
  }
});

export default router;
