/**
 * Feature flags for developer tooling. Phase-01.5 deliverable 7.
 *
 * These are LITERALS injected by Vite `define`, not values computed at runtime.
 * That distinction is the entire point: `if (FEATURE_DEBUG)` becomes
 * `if (false)` in a production build, so Rollup eliminates the branch and every
 * module reachable only through it. Computing these — even from
 * `import.meta.env` through a helper — defeats constant folding and ships all
 * of devtools to players.
 *
 * Asserted by tests/devtools-excluded-from-production.test.ts, which inspects
 * the built artifact rather than the source.
 */

/**
 * Master switch. When false, no developer tooling is constructed or bundled.
 *
 * Re-exported from `shared` rather than declared here (07.8i): the render layer
 * may not import devtools, and a scene-drawing debug tool needs a literal it
 * can fold against or its hook ships. One switch, one declaration, two places
 * that may read it.
 */
export { FEATURE_DEBUG } from '../shared/build-flags';

import { FEATURE_DEBUG } from '../shared/build-flags';

/** Timing instrumentation (deliverable 3). */
export const FEATURE_PROFILER: boolean = __FEATURE_PROFILER__;

/** Developer console, F1 (deliverable 2). */
export const FEATURE_CONSOLE: boolean = __FEATURE_CONSOLE__;

/** World inspector, F4 (deliverable 4). */
export const FEATURE_INSPECTOR: boolean = __FEATURE_INSPECTOR__;

/** Snapshot of every flag, for the `version` command and bug reports. */
export function flagSnapshot(): Readonly<Record<string, boolean>> {
  return {
    FEATURE_DEBUG,
    FEATURE_PROFILER,
    FEATURE_CONSOLE,
    FEATURE_INSPECTOR,
  };
}
