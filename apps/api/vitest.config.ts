import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Workspace packages resolve to source, including inside globalSetup (which Vitest loads
    // outside the `ssr` environment, so export conditions alone don't reach it).
    alias: {
      '@specter/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
      '@specter/db': fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)),
      '@specter/threat-library': fileURLToPath(new URL('../../packages/threat-library/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/env.setup.ts'],
  },
});
