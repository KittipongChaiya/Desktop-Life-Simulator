// @ts-check
/**
 * ESLint flat configuration.
 *
 * This file is the mechanical enforcement of the architecture. ARCHITECTURE.md
 * §10 lists boundary erosion as the top architectural risk precisely because it
 * happens one convenient import at a time — so the boundary is a build failure,
 * not a review comment.
 *
 * Implements CODE_STYLE.md §8.1 (import matrix) and AI_RULES.md §2.1 (sim purity).
 */

import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

/**
 * Layers, in dependency order. Mirrors CODE_STYLE.md §8.1.
 *
 * Patterns are FOLDER patterns (the plugin's default `mode: "folder"`), matched
 * against the directory portion of a path. Do NOT write `src/sim/**\/*` here —
 * a file-glob form leaves every file `isUnknown` and the whole boundary check
 * silently passes. Verified by the deliberate-violation tests in phase-00.
 */
const ELEMENTS = [
  { type: 'shared', pattern: 'src/shared' },
  { type: 'sim', pattern: 'src/sim' },
  { type: 'persistence', pattern: 'src/persistence' },
  { type: 'render', pattern: 'src/renderer/render' },
  { type: 'ui', pattern: 'src/renderer/app' },
  { type: 'bootstrap', pattern: 'src/renderer/bootstrap' },
  { type: 'main', pattern: 'src/main' },
  { type: 'preload', pattern: 'src/preload' },
  { type: 'plugins', pattern: 'plugins' },
  { type: 'devtools', pattern: 'src/devtools' },
  // The renderer entry lives in its own folder so it can be matched as an
  // element at all. Element patterns are FOLDER patterns; a file glob such as
  // 'src/renderer/main.tsx' leaves the file isUnknown and therefore
  // unconstrained — which is exactly the hole this closes.
  { type: 'entry', pattern: 'src/renderer/entry' },
];

/** Which layers may import which. Anything not listed is forbidden. */
const LAYER_POLICIES = [
  { from: 'shared', to: ['shared'] },
  { from: 'sim', to: ['shared', 'sim'] },
  { from: 'persistence', to: ['shared', 'sim', 'persistence'] },
  { from: 'render', to: ['shared', 'sim', 'render'] },
  { from: 'ui', to: ['shared', 'sim', 'ui'] },
  // Bootstrap gains 'plugins' in phase-08b: the composition root is exactly
  // what assembles content sources. `sim` deliberately does NOT gain it — the
  // engine must not depend on content (ARCHITECTURE.md §14.1, goals 4 and 5).
  {
    from: 'bootstrap',
    to: ['shared', 'sim', 'persistence', 'render', 'ui', 'bootstrap', 'devtools', 'plugins'],
  },
  // Devtools reads game state but nothing in the game may import devtools
  // (phase-01.5 deliverable 8). Absence from every other `to` list is what
  // enforces that.
  { from: 'devtools', to: ['shared', 'sim', 'devtools'] },
  // The entry point composes nothing itself; it calls the bootstrap
  // composition root and stops. Everything else is denied by omission.
  { from: 'entry', to: ['bootstrap'] },
  { from: 'main', to: ['shared', 'persistence', 'main'] },
  { from: 'preload', to: ['shared', 'preload'] },
  { from: 'plugins', to: ['shared', 'sim', 'plugins'] },
].map(({ from, to }) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
}));

/**
 * Third-party packages forbidden per layer.
 *
 * `src/sim` is the important one: it must remain a headless library that has no
 * idea it is inside a game client (ARCHITECTURE.md §2.1).
 *
 * NOTE: this uses the DEPRECATED `boundaries/external` rule on purpose. In
 * eslint-plugin-boundaries 7.1.0 the replacement `boundaries/dependencies` rule
 * enforces internal layer policies correctly but silently ignores
 * `to.module.origin: "external"` denials — it reports nothing for a banned
 * package. Verified by the phase-00 deliberate-violation tests. A deprecation
 * warning is strictly better than a boundary check that passes silently.
 * Re-test on every plugin upgrade; migrate once `dependencies` catches these.
 */
const FORBIDDEN_EXTERNALS = [
  { from: ['shared'], disallow: ['pixi.js', 'react', 'react-dom', 'electron'] },
  { from: ['sim'], disallow: ['pixi.js', 'react', 'react-dom', 'electron', 'fs', 'path'] },
  { from: ['persistence'], disallow: ['pixi.js', 'react', 'react-dom', 'electron'] },
  { from: ['render'], disallow: ['react', 'react-dom', 'electron'] },
  { from: ['ui'], disallow: ['pixi.js', 'electron'] },
  { from: ['plugins'], disallow: ['pixi.js', 'react', 'react-dom', 'electron'] },
  { from: ['devtools'], disallow: ['electron', 'pixi.js'] },
  // The entry renders nothing and talks to no platform API directly.
  { from: ['entry'], disallow: ['electron', 'pixi.js', 'react', 'react-dom'] },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'release/**',
      'coverage/**',
      'assets/dist/**',
      'playwright-report/**',
      'test-results/**',
      '*.config.js',
      '*.config.ts',
      '*.cjs',
    ],
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
  },

  // ---------------------------------------------------------------------------
  // Project-wide style rules. CODE_STYLE.md §1.2.
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'plugins/**/*.ts'],
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message:
            'enum is banned (CODE_STYLE.md §1.2). Use an `as const` object plus a derived union type.',
        },
        {
          selector: 'TSModuleDeclaration[kind="namespace"]',
          message: 'namespace is banned (CODE_STYLE.md §1.2). Use ES modules.',
        },
      ],
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
          },
        },
      ],

      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-cycle': ['error', { maxDepth: Infinity }],
      'import-x/no-self-import': 'error',
      'import-x/no-duplicates': 'error',
    },
  },

  // ---------------------------------------------------------------------------
  // ARCHITECTURE BOUNDARIES. CODE_STYLE.md §8.1. THIS IS THE LOAD-BEARING RULE.
  // ---------------------------------------------------------------------------
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'plugins/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // REQUIRED: without a TypeScript resolver, extensionless relative imports
      // do not resolve and every internal layer violation passes silently.
      //
      // `project` MUST list the real tsconfigs. The root tsconfig.json is a
      // solution file with `files: []` and no `paths`, so a resolver pointed at
      // it cannot resolve path aliases — an aliased import (`@devtools/flags`)
      // resolved to null, was treated as an external package, and bypassed the
      // layer check entirely, while the equivalent relative import was caught.
      // Found in phase-01.7 by probing both forms of the same import.
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: [
            'tsconfig.renderer.json',
            'tsconfig.main.json',
            'tsconfig.sim.json',
            'tsconfig.tools.json',
          ],
          // Four projects is intentional — each environment has different libs
          // and aliases (TECH_STACK.md §3.1). The resolver's perf hint does not
          // apply, so silence it rather than collapsing them.
          noWarnOnMultipleProjects: true,
        },
      },
      'boundaries/elements': ELEMENTS,
    },
    rules: {
      // Internal layer boundaries.
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [
            // External packages pass through here; they are governed by
            // `boundaries/external` below.
            { allow: { to: { module: { origin: 'external' } } } },
            ...LAYER_POLICIES,
          ],
        },
      ],
      // Per-layer third-party package bans. See FORBIDDEN_EXTERNALS note above.
      'boundaries/external': ['error', { default: 'allow', rules: FORBIDDEN_EXTERNALS }],

      // WHICH FILE of a layer outsiders may import. This is what makes
      // "no bootstrap internals" enforceable: bootstrap exposes start.tsx and
      // nothing else, so the entry cannot reach past the composition root.
      // Every other element keeps the default (any file), because their
      // internal structure is already governed by the layer policies above.
      'boundaries/entry-point': [
        'error',
        {
          default: 'allow',
          rules: [
            // Ordered: deny everything in bootstrap, then re-allow the
            // composition root. Combining both keys in one rule lets the
            // denial win and blocks start.tsx too.
            { target: ['bootstrap'], disallow: '*' },
            { target: ['bootstrap'], allow: 'start.tsx' },
          ],
        },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // SIMULATION PURITY. AI_RULES.md §2.1, ADR-007 §1.
  //
  // tsconfig.sim.json already removes DOM and Node globals, so `document` and
  // `process` are type errors. These rules cover what remains: globals that
  // exist in every environment and would silently break determinism.
  // ---------------------------------------------------------------------------
  // `console.*` is banned across src/. The single exception is the logger's
  // console sink, which opts out with a file-level disable and a reason
  // (phase-01.5 deliverable 6).
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: { 'no-console': 'error' },
  },

  {
    files: ['src/sim/**/*.ts', 'src/persistence/**/*.ts', 'plugins/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random() is banned in the simulation (AI_RULES.md §2.1). Use the injected seeded RNG — determinism is what save round-trips, reproducible bugs, and future multiplayer all depend on.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'Date.now() is banned in the simulation (AI_RULES.md §2.1). Time is the tick counter, passed in.',
        },
        {
          object: 'performance',
          property: 'now',
          message:
            'performance.now() is banned in the simulation (AI_RULES.md §2.1). Use the tick counter.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message: 'Date is banned in the simulation (AI_RULES.md §2.1). Time is the tick counter.',
        },
      ],
      'no-console': 'error',
    },
  },

  // ---------------------------------------------------------------------------
  // Tests may use constructs banned in production code.
  // ---------------------------------------------------------------------------
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'boundaries/dependencies': 'off',
      'boundaries/entry-point': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-globals': 'off',
      'no-console': 'off',
    },
  },
);
