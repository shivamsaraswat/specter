import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Loads .env.test (repo root) for local test runs, matching docker-compose.yml's dev defaults
// (research.md #7). Optional: CI or a host may already export these directly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '..', '..', '..', '.env.test');

try {
  process.loadEnvFile(envFile);
} catch {
  // Missing file or unsupported Node version — fall back to whatever the shell already exports.
}
