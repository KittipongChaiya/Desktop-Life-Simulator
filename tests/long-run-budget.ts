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
 *
 * ## The gap this left, found at phase 54 — and what the cause turned out to be
 *
 * The paragraph above says "each carries an explicit timeout", and that was
 * true of the four tests this file was written for. It was not true of the
 * suite: a test that declares no timeout inherits `testTimeout: 120_000` from
 * `vitest.config.ts`, and **nothing scaled that default for the coverage run.**
 * So the fix reached exactly the tests somebody had already noticed were slow
 * and left every unnoticed one unprotected.
 *
 * The saturation case in `catch-up.test.ts` surfaced it at the v0.6 baseline
 * gate: it steps 50,000 ticks twice, has always relied on the default, passes
 * in `npm test`, and timed out at 131 s in the coverage run.
 *
 * **The obvious explanation was instrumentation, and it is wrong.** Measured
 * alone on an idle machine:
 *
 * | Run                          | Duration |
 * | ---------------------------- | -------- |
 * | solo, `vitest.config.ts`     | 38.9 s   |
 * | solo, coverage config, V8 on | 36.6 s   |
 * | inside the full coverage run | 131 s    |
 *
 * Instrumentation costs this test **nothing measurable**. What costs it 3.4x is
 * CONTENTION: the coverage run is three times longer in wall-clock than
 * `npm test` (2,479 s against 813 s), so the workers overlap for far longer and
 * every CPU-bound test stretches. A 39-second test under a 120-second timeout
 * has three times headroom, and a saturated machine eats it.
 *
 * That distinction is worth keeping, because it means the multiplier this file
 * applies is not really the cost of instrumentation — it is the cost of running
 * inside a long, wide suite, which the coverage run always is. The table at the
 * top was measured the same way, inside full runs, and is very likely the same
 * effect wearing the same wrong name.
 *
 * The list of tests in the same position is not short: `schedule-determinism`,
 * `expeditions`, `gathering`, `sim-headless` and `dry-farm` all drive tens of
 * thousands of ticks with no declared budget, and simply have not tipped over
 * yet. Enumerating and measuring them one at a time would fix the instances and
 * leave the mechanism, so `vitest.coverage.config.ts` scales the DEFAULT by
 * this same factor instead. The ordinary run keeps 120 s, where a hang still
 * surfaces in two minutes.
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
 *
 * EXPORTED SINCE PHASE-54, because `vitest.coverage.config.ts` needs the same
 * number to scale the DEFAULT timeout — see the header note there. The factor
 * lives here rather than there because this is the file that explains it.
 */
export const INSTRUMENTED_FACTOR = 4;

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
