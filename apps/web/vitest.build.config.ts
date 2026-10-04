import { defineConfig } from 'vitest/config';

// Runs only the built-output check, after `pnpm build` (the verify:build script).
export default defineConfig({
  test: {
    include: ['test/build-output.test.ts'],
    environment: 'node',
  },
});
