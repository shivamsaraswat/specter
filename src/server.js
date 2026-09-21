const config = require('./config');
const app = require('./app');
const migrate = require('./migrate');
const { seedAdminUser } = require('./auth');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The DB may still be starting when the app boots (compose, ECS), so retry a few times.
async function initDatabase(attempts = 10) {
  for (let i = 1; ; i++) {
    try {
      await migrate();
      await seedAdminUser();
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      console.warn(`Database not ready (attempt ${i}/${attempts}): ${err.message}`);
      await sleep(2000);
    }
  }
}

async function main() {
  if (!config.jwtSecret) throw new Error('JWT_SECRET must be set');
  await initDatabase();

  const server = app.listen(config.port, () => {
    console.log(`Listening on port ${config.port}`);
  });

  function shutdown(signal) {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
