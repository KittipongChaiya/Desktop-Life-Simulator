/**
 * Fails an E2E run immediately when `out/` was built without developer tooling.
 *
 * WHY THIS EXISTS. Eight specs drive the app through the F1 developer console —
 * `money`, `tick` — because there is no other way to fund a farm or skip 900
 * ticks from outside the process. The console is compiled OUT of a production
 * build: `electron.vite.config` sets `__FEATURE_DEBUG__` from `!isProduction`,
 * and Rollup then drops the branch and every module behind it (that elimination
 * is deliberate and asserted by `tests/devtools-excluded-from-production.test.ts`).
 *
 * The suite launches `electron .`, which loads whatever `out/` happens to hold.
 * So after `npm run build` — the gate `TESTING.md` §7.1 lists immediately
 * BEFORE the E2E gate — those eight specs cannot pass, and they failed the
 * expensive way: `locator.fill` waiting 30 s each for a console that was never
 * in the bundle. Eight timeouts, no stated cause, and the shape of the damage
 * (some specs fine, others not) reads exactly like flakiness or cross-spec
 * ordering. It was diagnosed as order-dependence for two days and is not:
 * a single spec run entirely alone fails identically against a production
 * build, and passes against a debug build without touching the spec.
 *
 * One instant, self-explaining failure is worth more than eight silent ones.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A label rendered only by the developer console, so its presence proves the build. */
const CONSOLE_MARKER = 'Developer console input';

const RENDERER_ASSETS = join(import.meta.dirname, '..', '..', 'out', 'renderer', 'assets');

const REBUILD = 'VITE_FEATURE_DEBUG=true npm run build';

export default function globalSetup(): void {
  if (!existsSync(RENDERER_ASSETS)) {
    throw new Error(
      `E2E launches the built app, but out/renderer was not found.\n` +
        `Build it with devtools enabled first:\n\n    ${REBUILD}\n`,
    );
  }

  const bundled = readdirSync(RENDERER_ASSETS)
    .filter((file) => file.endsWith('.js'))
    .some((file) => readFileSync(join(RENDERER_ASSETS, file), 'utf8').includes(CONSOLE_MARKER));

  if (!bundled) {
    throw new Error(
      `The build in out/ has NO developer console, so every spec that drives it ` +
        `would time out for 30 s with no stated cause.\n\n` +
        `A production build strips devtools by design — plain \`npm run build\` is ` +
        `not enough for E2E. Rebuild with them enabled:\n\n    ${REBUILD}\n`,
    );
  }
}
