/**
 * How long a long-run test is allowed to take. Phase-52.
 *
 * ## The problem this exists to solve
 *
 * Four tests step the real simulation for 576,000 ticks or run hundreds of
 * property cases against it. Each carries an explicit timeout, stated at the
 * test rather than raised globally so the cost is attributed to whoever incurs
 * it — the project's convention since v0.3.
 *
 * That worked until the same tests had to run twice under different
 * conditions. `npm test` runs them uninstrumented; `npm run test:coverage`
 * runs them under V8 coverage, and **measured at the v0.5 RC, instrumentation
 * costs about 3.3×**:
 *
 * | Test                             | Uninstrumented | Instrumented |
 * | -------------------------------- | -------------- | ------------ |
 * | `chain-longrun`, the 8-hour run  | 687 s          | 1,980 s      |
 * | `economy-longrun`, full idle     | 625 s          | 1,987 s      |
 * | `economy-longrun`, determinism   | 84 s           | 273 s        |
 * | `catch-up-factories`, 300 props  | 93 s           | ~184 s       |
 *
 * One number cannot serve both. Sized for the coverage run, the timeout stops
 * being a hang detector in the ordinary run — a wedged simulation would take
 * over half an hour to report instead of ten minutes. Sized for the ordinary
 * run, the coverage gate goes red for a reason nobody can act on.
 *
 * ## Why not just drop the long-runs from the coverage run
 *
 * That was the obvious fix, it was tried, and it is wrong: with them excluded
 * `src/persistence/**` branches fall to 88.47% against a 90% threshold.
 * `catch-up-factories` drives `catch-up.ts` across gaps nothing else reaches.
 * Excluding them trades a visible timeout for an invisible hole, which is the
 * worse of the two. `vitest.coverage.config.ts` records that finding.
 *
 * ## What this is NOT
 *
 * Not a performance budget. A timeout here detects a hang; what the simulation
 * costs is measured deliberately and lives in `PERFORMANCE.md`. A number doing
 * both jobs fails for two different reasons and tells you neither.
 */

/**
 * Set by `vitest.coverage.config.ts`. An env var rather than a runtime probe
 * because the coverage config is the thing that knows, and asking Vitest
 * whether it is instrumenting from inside a test is undocumented surface.
 */
const INSTRUMENTED = process.env['LONG_RUN_INSTRUMENTED'] === '1';

/**
 * Headroom over the measured 3.3×. Round numbers, because the point is to be
 * clearly outside the noise rather than to predict the multiplier.
 */
const INSTRUMENTED_FACTOR = 4;

/**
 * The budget for a long run, given what it costs uninstrumented.
 *
 * Pass the measurement, not a guess: `longRunBudget(700_000)` reads as "this
 * takes about seven hundred seconds", and the multiplier is applied where the
 * run that needs it is described.
 */
export function longRunBudget(uninstrumentedMs: number): number {
  return INSTRUMENTED ? uninstrumentedMs * INSTRUMENTED_FACTOR : uninstrumentedMs;
}
