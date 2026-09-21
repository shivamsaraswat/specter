const { Pool } = require('pg');
const config = require('./config');

// The pool connects lazily, so the process (and /health) starts even if the DB is down.
const pool = new Pool(config.db);

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err.message);
});

module.exports = pool;
