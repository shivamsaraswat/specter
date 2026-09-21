// Configuration comes from environment variables. If DB_SECRET_ID is set, `load()` also
// pulls credentials from AWS Secrets Manager (via the instance/task role) and overrides
// the matching env values. Call `await config.load()` once at startup, before using ./db.
const config = {
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
};

async function fetchSecret(secretId, client) {
  if (!client) {
    const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
    client = new SecretsManagerClient({});
  }
  const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) throw new Error(`Secret ${secretId} has no SecretString`);
  return JSON.parse(res.SecretString);
}

// Secret keys: host, port, dbname, username, password, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
async function load({ secretId = process.env.DB_SECRET_ID, client } = {}) {
  if (!secretId) return config;
  let s;
  try {
    s = await fetchSecret(secretId, client);
  } catch (err) {
    throw new Error(`Could not load secret "${secretId}": ${err.message}`);
  }
  if (s.host) config.db.host = s.host;
  if (s.port) config.db.port = Number(s.port);
  if (s.dbname) config.db.database = s.dbname;
  if (s.username) config.db.user = s.username;
  if (s.password) config.db.password = s.password;
  if (s.JWT_SECRET) config.jwtSecret = s.JWT_SECRET;
  if (s.ADMIN_USERNAME) config.adminUsername = s.ADMIN_USERNAME;
  if (s.ADMIN_PASSWORD) config.adminPassword = s.ADMIN_PASSWORD;
  return config;
}

config.load = load;
module.exports = config;
