const path = require('path');
const express = require('express');
const { requireAuth } = require('./auth');
const loginRouter = require('./routes/login');
const threatsRouter = require('./routes/threats');
const usersRouter = require('./routes/users');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Liveness check for the load balancer: no auth, no DB dependency.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/login', loginRouter);
app.use('/api/threats', requireAuth, threatsRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Express 5 forwards async handler rejections here.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
