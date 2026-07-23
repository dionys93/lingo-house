// eslint.config.js  —  flat config, type-aware.  Lives at the repo root.
//
// Two rules here are load-bearing for this project and are `error`, not `warn`.
// They are the anti-duct-tape rules we committed to; downgrading either defeats
// the point of having a linter at all:
//
//   • react-hooks/exhaustive-deps — a missing effect dependency is a real bug,
//     not a style nit. We never silence it; an honest dependency array is the
//     only acceptable fix.
//   • @typescript-eslint/no-floating-promises — a dropped promise is a swallowed
//     signal. The functional-core / Result discipline only holds if async
//     failures are visible, so an unhandled promise fails the build.
//
// switch-exhaustiveness-check backs the discriminated-union discipline: when
// HouseError (or any tagged union) grows a variant, every switch over it must
// handle the new case or the build breaks. That is the compiler-side guarantee
// behind "make illegal states unrepresentable".

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  // Base JS rules + the STRICT, TYPE-AWARE TypeScript set. `strictTypeChecked`
  // (not merely `recommended`) is what gives us no-floating-promises,
  // no-misused-promises, the no-unsafe-* family, and no-explicit-any as errors.
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  // Point the type-aware rules at the TypeScript project. `projectService` is the
  // modern (typescript-eslint v8+) wiring — no explicit `project` path needed.
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Application source.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Hooks — set explicitly rather than via a preset so the intent is on the
      // page and can't drift with a plugin version bump.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error', // load-bearing — never downgrade

      // Async safety — load-bearing.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Discriminated-union exhaustiveness (not enabled by any preset).
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Anti-duct-tape, restated for visibility (strictTypeChecked already errors
      // on these, but they are core project rules so we keep them explicit).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',

      // Vite fast-refresh wants components as the sole export of a module.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node-context config files (vite/vitest configs): give them Node globals.
  {
    files: ['*.config.{ts,mts}'],
    languageOptions: { globals: globals.node },
  },

  // Plain JS (this config file, etc.) has no type information, so the type-aware
  // rules can't run against it — turn them off there to avoid false errors.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);