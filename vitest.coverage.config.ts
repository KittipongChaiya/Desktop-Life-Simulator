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
 */

import base from './vitest.config';

const test = base.test ?? {};

export default {
  ...base,
  test: {
    ...test,
    exclude: [...(test.exclude ?? []), 'tests/memory-longrun.test.ts'],
    // Tells `tests/long-run-budget.ts` that this is the instrumented run, so
    // the long-runs get their measured ~3.3x back. The ordinary suite keeps
    // the tight budget, where a hang should surface in minutes.
    env: { ...(test.env ?? {}), LONG_RUN_INSTRUMENTED: '1' },
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
