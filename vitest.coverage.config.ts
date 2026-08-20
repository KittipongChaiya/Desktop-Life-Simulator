/**
 * The coverage run. Phase-07e.
 *
 * Identical to `vitest.config.ts` except that it drops the MEMORY gate.
 *
 * `tests/memory-longrun.test.ts` measures heap growth across 576,000 real
 * ticks. Under V8 coverage instrumentation that number is the instrumenter's
 * heap as much as the game's, so running it here would spend ten minutes
 * producing a measurement nobody may trust — and it contributes no coverage
 * the ordinary suite does not already have. It runs, unexcluded and
 * uninstrumented, in `npm test`, which is where its result is meaningful
 * (`PERFORMANCE.md` §8.1).
 *
 * The behavioural long-runs stay in: `economy-longrun`, `worker-longrun`,
 * `chain-longrun` and `catch-up-factories` assert what the simulation DOES,
 * which instrumentation does not distort — only slow down.
 *
 * ## That last clause used to say "which their explicit timeouts allow for", and it was wrong
 *
 * At the v0.5 RC all four timed out here while passing uninstrumented, so the
 * obvious move was to exclude them the way `memory-longrun` is excluded, on
 * the same argument: they add no coverage the ordinary suite does not have.
 *
 * **That argument was tested rather than believed, and it is false.** With the
 * four excluded, `src/persistence/**` branches fall to 88.47% against a 90%
 * threshold — the gate goes RED. `catch-up-factories` drives `catch-up.ts`
 * across gaps nothing else reaches, and a timed-out run still contributed
 * those branches because it got most of the way through before being killed.
 * Excluding them would have traded a visible timeout for an invisible hole.
 *
 * So they stay, and the timeouts were raised instead — in the tests
 * themselves, each with the measurement that justified it. A timeout here
 * detects a hang; what the simulation costs is measured in `PERFORMANCE.md`.
 *
 * ## Phase-54: the same fix, for the tests nobody had noticed were slow
 *
 * Raising the timeouts "in the tests themselves" reached the four tests that
 * declared timeouts. Every other test inherits `testTimeout` from the base
 * config, and **that default was never scaled** — so a 39-second test got the
 * same 120 seconds here that it gets in a run finishing three times sooner.
 *
 * The saturation case in `catch-up.test.ts` found it at the v0.6 baseline gate:
 * 131 s against 120 s, while passing in `npm test`.
 *
 * **It is not instrumentation.** Measured alone, that test takes 38.9 s under
 * `vitest.config.ts` and 36.6 s under this one with V8 coverage ON. The cost is
 * CONTENTION — this run is 2,479 s of wall-clock against `npm test`'s 813 s, so
 * the workers overlap three times as long and every CPU-bound test stretches.
 * `tests/long-run-budget.ts` records the measurements.
 *
 * `testTimeout` below therefore scales the default by the identical factor
 * `longRunBudget` uses. Fixing the mechanism rather than the five instances
 * (`schedule-determinism`, `expeditions`, `gathering`, `sim-headless` and
 * `dry-farm` are all one bad minute from the same failure) is the difference
 * between this recurring and not.
 */

import { INSTRUMENTED_FACTOR } from './tests/long-run-budget';
import base from './vitest.config';

const test = base.test ?? {};

/**
 * The DEFAULT test timeout, scaled for instrumentation.
 *
 * `longRunBudget()` covers tests that declare their own timeout. Nothing
 * covered the ones that do not — they inherit `testTimeout` from the base
 * config, which was 120 s in both runs, so a test measured at 39 s alone had
 * 120 s here and needed 131 s under this run's contention. That is the
 * saturation case in `catch-up.test.ts`, and it is why the v0.6 baseline gate
 * went red.
 *
 * Scaling the default rather than enumerating the slow tests fixes the
 * mechanism instead of the instances: any test that relies on the default now
 * gets exactly what an explicit `longRunBudget` would have given it. The
 * ordinary run is untouched at 120 s, which is where a hang should surface
 * quickly.
 */
const DEFAULT_TIMEOUT_MS = (test.testTimeout ?? 120_000) * INSTRUMENTED_FACTOR;

export default {
  ...base,
  test: {
    ...test,
    exclude: [...(test.exclude ?? []), 'tests/memory-longrun.test.ts'],
    // Tells `tests/long-run-budget.ts` that this is the instrumented run, so
    // the long-runs get their measured ~3.3x back. The ordinary suite keeps
    // the tight budget, where a hang should surface in minutes.
    env: { ...(test.env ?? {}), LONG_RUN_INSTRUMENTED: '1' },
    testTimeout: DEFAULT_TIMEOUT_MS,
    coverage: {
      ...(test.coverage ?? {}),
      // Report even when a test fails. Phase-08.0c: an unrelated red test
      // otherwise suppresses the whole coverage report, so the one number this
      // config exists to produce disappears exactly when someone is mid-fix and
      // needs to know whether their coverage work landed.
      reportOnFailure: true,
    },
  },
};
