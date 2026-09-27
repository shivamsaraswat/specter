import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import config from './config.js';
import db from './db.js';

declare global {
  // Augmenting Express's own ambient types requires its `Express` namespace — there is no
  // ES module alternative for this kind of global type augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
    }
  }
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
}

// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function verifyCredentials(username: string, password: string): Promise<User | null> {
  const { rows } = await db.query<User>(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  return ok && user ? user : null;
}

export function signToken(user: Pick<User, 'id' | 'username'>): string {
  const options: jwt.SignOptions = { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: String(user.id), username: user.username }, config.jwtSecret as string, options);
}

// Creates the single admin user from env vars; re-running with a new password updates it.
export async function seedAdminUser(): Promise<void> {
  const { adminUsername, adminPassword } = config;
  if (!adminUsername || !adminPassword) {
    console.warn('ADMIN_USERNAME / ADMIN_PASSWORD not set; skipping user seed');
    return;
  }
  const hash = await bcrypt.hash(adminPassword, 10);
  await db.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [adminUsername, hash],
  );
  console.log('Seeded admin user');
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret as string);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
