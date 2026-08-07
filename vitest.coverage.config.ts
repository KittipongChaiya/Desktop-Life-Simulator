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
 * The behavioural long-runs stay in: `economy-longrun` and `worker-longrun`
 * assert what the simulation DOES, which instrumentation does not distort —
 * only slow down, which their explicit timeouts allow for.
 */

import base from './vitest.config';

const test = base.test ?? {};

export default {
  ...base,
  test: {
    ...test,
    exclude: [...(test.exclude ?? []), 'tests/memory-longrun.test.ts'],
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
