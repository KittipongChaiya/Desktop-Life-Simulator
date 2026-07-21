/**
 * Import cycle detection. CODE_STYLE.md §7.4.
 *
 * A cycle means a module boundary is wrong. The fix is extracting the shared
 * piece, never adding a lazy import to break the loop.
 *
 * Layer enforcement lives in eslint.config.js; this covers cycles and orphans,
 * which ESLint's per-file model cannot see.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A dependency cycle means the boundary is wrong. Extract the shared piece rather than breaking the loop with a lazy import.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable module — dead code is banned (AI_RULES.md §1.6).',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)src/(main|preload)/index\\.ts$'] },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys)$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Follow type-only imports. Without this, interface-only modules (the
    // snapshot store contract, the simulation control surface) look like
    // orphans, and cycles that run through types go undetected.
    tsPreCompilationDeps: true,
    // `tsx?` matters: `\\.test\\.ts$` did not match `.test.tsx`, so React
    // component tests were analysed as production modules and produced a
    // ui -> bootstrap edge that no source file actually has.
    exclude: { path: '\\.test\\.tsx?$' },
    tsConfig: { fileName: 'tsconfig.renderer.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js'],
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
};
