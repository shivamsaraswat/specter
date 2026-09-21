const { Pool } = require('pg');
const config = require('./config');

// Created on first use so config.load() (Secrets Manager) can run first.
// The pool connects lazily, so the process (and /health) starts even if the DB is down.
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool(config.db);
    pool.on('error', (err) => {
      console.error('Unexpected Postgres pool error:', err.message);
    });
  }
  return pool;
}

module.exports = {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args),
  end: () => (pool ? pool.end() : Promise.resolve()),
};
