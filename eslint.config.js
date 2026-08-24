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

  // ── core/ IS THE PURE LAYER — ENFORCED BY ONE GLOB, NO ALLOWLIST ────────────
  //
  // Everything under src/core/ must be reachable by `node --experimental-strip-types`,
  // which is how this project finds bugs fastest: run the pure code, print
  // numbers. A single module-level `import * as THREE` ends that for EVERY
  // function in the file, used or not — that is how `corrugate` and `gableMesh`
  // once lost the strip-types loop, sitting beside a module that needed three.
  //
  // This used to be a hand-maintained per-file allowlist, and it drifted twice
  // over. Pure modules that merely happened to sit in src/scene/ — wallMaterials,
  // windowStyles, lights, shadows — went unprotected; and when roofMesh/doorMesh
  // were renamed, the allowlist kept pointing at paths that no longer existed.
  // The boundary is now the filesystem itself: if a module is pure it lives in
  // core/ and this one glob guards it; if it needs three or react it lives in
  // render/ and this rule never sees it. There is no list left to fall out of sync.
  //
  // Three things are errors here:
  //   • three (and the r3f / postprocessing packages that pull it in) — VALUE
  //     imports only. `allowTypeImports` is deliberate and not a loophole: node's
  //     type stripping ERASES `import type`, so a type-only reference to
  //     THREE.Side or THREE.Texture costs the loop nothing. A value import is
  //     what breaks it, and that is precisely what this bans.
  //   • react / react-dom — core is domain logic, not components. The old rule
  //     banned three but not react, so core/ could have grown a hook unnoticed.
  //   • the render/ and content/ layers — DIRECTION. Dependencies point inward:
  //     render and content import core, never the reverse. The old rule didn't
  //     enforce this, so `core/` importing `scene/` would have passed.
  //
  // The sanctioned three adapter is render/three/meshGeometry.ts, which lives in
  // render/ precisely so it sits outside this glob.
  {
    files: ['src/core/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              allowTypeImports: true,
              message:
                'Value-importing three here breaks `node --experimental-strip-types` for the whole module and the pure/render boundary. Keep the work pure and convert via render/three/meshGeometry.ts. A type-only import is fine.',
            },
            {
              name: 'react',
              allowTypeImports: true,
              message: 'core/ is pure domain logic — no React. Hooks and components belong in render/.',
            },
            {
              name: 'react-dom',
              allowTypeImports: true,
              message: 'core/ is pure domain logic — no React. Hooks and components belong in render/.',
            },
          ],
          patterns: [
            {
              group: ['three/*', '@react-three/*', 'postprocessing', 'react/*', 'react-dom/*'],
              allowTypeImports: true,
              message:
                'Value-importing the three / react-three stack here breaks the pure/render boundary and `node --experimental-strip-types`. A type-only import is fine; do the conversion in render/.',
            },
            {
              group: ['**/render/**', '**/content/**'],
              message:
                'core/ must not import the render or content layers. Dependencies point inward: render and content depend on core, never the reverse.',
            },
          ],
        },
      ],
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