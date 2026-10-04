import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // @specter/core must run in the browser too (spec FR-036), so it cannot reach for Node built-ins.
    // Together with the Node-types-free `tsc` pass over src/ (packages/core/tsconfig.build.json),
    // this is checked on every PR by the existing typecheck and lint jobs.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['node:*'], message: '@specter/core must not depend on Node.js APIs.' }],
          paths: builtinModules.map((name) => ({
            name,
            message: '@specter/core must not depend on Node.js APIs.',
          })),
        },
      ],
    },
  },
);
