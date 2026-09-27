// Configuration comes from environment variables. If DB_SECRET_ID is set, `load()` also
// pulls credentials from AWS Secrets Manager (via the instance/task role) and overrides
// the matching env values. Call `await config.load()` once at startup, before using ./db.

export interface DbConfig {
  host?: string;
  port: number;
  database?: string;
  user?: string;
  password?: string;
}

export interface SecretClient {
  send(command: unknown): Promise<{ SecretString?: string }>;
}

export interface LoadOptions {
  secretId?: string;
  client?: SecretClient;
}

interface SecretPayload {
  host?: string;
  port?: string | number;
  dbname?: string;
  username?: string;
  password?: string;
  JWT_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

export interface Config {
  port: number;
  db: DbConfig;
  jwtSecret?: string;
  jwtExpiresIn: string;
  adminUsername?: string;
  adminPassword?: string;
  load: (opts?: LoadOptions) => Promise<Config>;
}

const config: Config = {
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
  load,
};

// Secret keys: host, port, dbname, username, password, JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
async function fetchSecret(secretId: string, client?: SecretClient): Promise<SecretPayload> {
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const resolvedClient = client ?? new SecretsManagerClient({});
  const res = await resolvedClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (!res.SecretString) throw new Error(`Secret ${secretId} has no SecretString`);
  return JSON.parse(res.SecretString) as SecretPayload;
}

async function load(opts: LoadOptions = {}): Promise<Config> {
  const { secretId = process.env.DB_SECRET_ID, client } = opts;
  if (!secretId) return config;
  let s: SecretPayload;
  try {
    s = await fetchSecret(secretId, client);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not load secret "${secretId}": ${message}`, { cause: err });
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

export default config;
