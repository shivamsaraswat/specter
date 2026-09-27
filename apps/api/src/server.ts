import config from './config.js';
import app from './app.js';
import migrate from './migrate.js';
import { seedAdminUser } from './auth.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The DB may still be starting when the app boots (compose, ECS), so retry a few times.
async function initDatabase(attempts = 10): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await migrate();
      await seedAdminUser();
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Database not ready (attempt ${i}/${attempts}): ${message}`);
      await sleep(2000);
    }
  }
}

async function main(): Promise<void> {
  await config.load();
  if (!config.jwtSecret) throw new Error('JWT_SECRET must be set');
  await initDatabase();

  const server = app.listen(config.port, () => {
    console.log(`Listening on port ${config.port}`);
  });

  function shutdown(signal: string): void {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
