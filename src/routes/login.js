const express = require('express');
const { verifyCredentials, signToken } = require('../auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = await verifyCredentials(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(user) });
});

module.exports = router;
