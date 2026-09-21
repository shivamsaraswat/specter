const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const pool = require('./db');

// Compared against when the username doesn't exist, so response time doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function verifyCredentials(username, password) {
  const { rows } = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  return ok && user ? user : null;
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Creates the single admin user from env vars; re-running with a new password updates it.
async function seedAdminUser() {
  const { adminUsername, adminPassword } = config;
  if (!adminUsername || !adminPassword) {
    console.warn('ADMIN_USERNAME / ADMIN_PASSWORD not set; skipping user seed');
    return;
  }
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [adminUsername, hash]
  );
  console.log(`Seeded user "${adminUsername}"`);
}

function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyCredentials, signToken, seedAdminUser, requireAuth };
