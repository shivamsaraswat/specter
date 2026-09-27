import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs once before the test suite, in Vitest's main process (not a worker), so a fresh
// database (a new CI service container, or a freshly `docker compose up`'d volume) has a
// schema and an admin user before any contract test tries to log in. Without this, the
// DB-backed tests silently depended on someone having migrated the volume beforehand
// (research.md #4).
export default async function setup(): Promise<void> {
  // Loads .env.test (repo root) if present, matching env.setup.ts's pattern. It is gitignored,
  // so CI won't have it; CI supplies the same throwaway values directly as job `env:` (research.md
  // #1), and process.loadEnvFile() never overwrites a variable that's already set.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.join(__dirname, '..', '..', '..', '.env.test');
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Missing file or unsupported Node version — fall back to whatever the shell already exports.
  }

  // config.ts reads process.env into a module-level object at import time, not lazily. A static
  // top-level `import` here would be hoisted and evaluated before the env-loading code above
  // runs, capturing empty values. These are dynamic imports, deliberately, so they resolve only
  // after `.env.test` (or the CI-provided env) is in place.
  const [{ default: config }, { default: db }, { default: migrate }, { seedAdminUser }] = await Promise.all([
    import('../src/config.js'),
    import('../src/db.js'),
    import('../src/migrate.js'),
    import('../src/auth.js'),
  ]);

  try {
    await config.load();
    await migrate();
    await seedAdminUser();
  } finally {
    // Closing the pool is required: an open handle here can keep Vitest's main process alive
    // past the last test, until the job's timeout (FR-010) kills it.
    await db.end();
  }
}
