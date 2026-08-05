import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // The codebase leans on `_`-prefixed params for unused Express handler args.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Every page fetches through a hand-rolled effect, so this fires across the
      // whole app. Kept visible as a warning until the data layer moves to a
      // caching query client; promote to error once that lands.
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },

  // CLIs and build scripts: stdout is the interface.
  {
    files: ['bin/**/*.js', 'apps/api/src/scripts/**/*.ts', 'apps/web/scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['bin/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
