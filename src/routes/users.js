const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores anything past 72 bytes

// Any logged-in user can create another user; there are no roles.
router.post('/', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim() || username.trim().length > 64) {
    return res.status(400).json({ error: 'username is required (max 64 characters)' });
  }
  if (
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH ||
    Buffer.byteLength(password) > MAX_PASSWORD_BYTES
  ) {
    return res
      .status(400)
      .json({ error: `password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_BYTES} bytes long` });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username.trim(), hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    throw err;
  }
});

module.exports = router;
