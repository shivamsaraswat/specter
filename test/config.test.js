const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');

const fakeClient = (secret) => ({ send: async () => ({ SecretString: JSON.stringify(secret) }) });

test('load() is a no-op without a secret id', async () => {
  const before = JSON.stringify(config.db);
  await config.load({ secretId: undefined });
  assert.strictEqual(JSON.stringify(config.db), before);
});

test('load() overrides config from the secret', async () => {
  await config.load({
    secretId: 'x',
    client: fakeClient({ host: 'h', port: '5433', dbname: 'd', username: 'u', password: 'p', JWT_SECRET: 'j', ADMIN_USERNAME: 'a', ADMIN_PASSWORD: 'ap' }),
  });
  assert.deepStrictEqual(config.db, { host: 'h', port: 5433, database: 'd', user: 'u', password: 'p' });
  assert.strictEqual(config.jwtSecret, 'j');
  assert.strictEqual(config.adminUsername, 'a');
  assert.strictEqual(config.adminPassword, 'ap');
});

test('load() fails clearly when the secret cannot be read', async () => {
  const client = { send: async () => { throw new Error('AccessDenied'); } };
  await assert.rejects(config.load({ secretId: 'x', client }), /Could not load secret "x": AccessDenied/);
});
