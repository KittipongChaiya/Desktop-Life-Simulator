/**
 * Does the application actually start? Phase-13d (regression guard).
 *
 * WHY THIS EXISTS. `src/main/updater.ts` shipped with
 * `import { autoUpdater } from 'electron-updater'`. That package is CommonJS
 * and the bundle is ESM, so the named form typechecked, linted, bundled, and
 * then threw at load:
 *
 *     SyntaxError: Named export 'autoUpdater' not found.
 *
 * The application did not start for two commits. Every existing gate was
 * green throughout — `main` is a host binding, so no unit test imports it, and
 * a type error is not what a module-format mismatch produces. The only thing
 * that would have caught it is launching the thing.
 *
 * So this launches the thing. It is deliberately NOT a Playwright spec: the
 * E2E suite refuses to run against a build without developer tooling
 * (`tests/e2e/global-setup.ts`), which is correct for specs that drive the
 * console and exactly wrong for this one — the build that must be proven
 * bootable is the PRODUCTION build, the one players get.
 *
 * It asserts the narrowest useful thing: the process survives a few seconds
 * without a fatal load error. It is not a functional test and must not grow
 * into one; anything richer belongs in the E2E suite, where a real window and
 * a real bridge are available.
 *
 * Run via `npm run smoke`.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The Electron binary's path. Imported rather than shelling out to `npx`,
// because a shell child is the thing `kill` reaches on Windows — the electron
// process underneath it survives, and this script then hangs forever holding a
// window open. Playwright's own launcher resolves it the same way.
import electronPath from 'electron';

/**
 * The binary's path.
 *
 * `electron`'s published types describe the RENDERER namespace, because that is
 * what the module is inside the app. In a plain Node process its export is the
 * path to the executable instead, and the types cannot say both — so this is
 * narrowed through `unknown` rather than left for `String()` to stringify an
 * object into `[object Object]`, which lint correctly refused.
 */
const ELECTRON_BINARY = /** @type {string} */ (/** @type {unknown} */ (electronPath));

const ROOT = join(import.meta.dirname, '..');

/**
 * How long the app must stay up.
 *
 * A load error is thrown during module evaluation, so it happens almost
 * immediately — but the renderer, the world, and the save load all follow, and
 * a crash in any of them is the same kind of "does not start" this exists to
 * catch. Long enough to clear them; short enough to sit in CI.
 */
const SURVIVE_MS = 12_000;

/**
 * Output that means the app failed to come up.
 *
 * Matched rather than trusting the exit code, because Electron can log a fatal
 * module error and then keep a process alive long enough to look healthy —
 * which is precisely what the regression did.
 */
const FATAL = [
  'App threw an error during load',
  'SyntaxError',
  'ReferenceError',
  'TypeError: Cannot read',
  'Cannot find module',
  'ERR_MODULE_NOT_FOUND',
  'Unable to find Electron app',
];

/** GPU and network-service chatter on a headless runner. Noise, not failure. */
const IGNORED = ['GPU process exited unexpectedly', 'Network service crashed'];

function main() {
  if (!existsSync(join(ROOT, 'out', 'main', 'index.js'))) {
    throw new Error('out/main/index.js is missing — run `npm run build` first.');
  }

  const userData = mkdtempSync(join(tmpdir(), 'dls-smoke-'));
  let output = '';
  let exited = null;

  const child = spawn(ELECTRON_BINARY, ['.'], {
    cwd: ROOT,
    env: { ...globalThis.process.env, DESKTOP_LIFE_USER_DATA: userData },
  });

  const collect = (chunk) => {
    output += String(chunk);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  child.on('exit', (code) => {
    exited = code;
  });

  return new Promise((resolve, reject) => {
    globalThis.setTimeout(() => {
      const fatal = FATAL.filter((marker) => {
        const at = output.indexOf(marker);
        if (at < 0) return false;
        // A marker inside an ignored line is runner noise, not our failure.
        const line = output.slice(output.lastIndexOf('\n', at) + 1, output.indexOf('\n', at) + 1);
        return !IGNORED.some((benign) => line.includes(benign));
      });

      child.kill();
      // TOLERATED, and the same rule `isolated-profile.ts` states: a teardown
      // failure must never mask the assertion that ran before it. `kill` returns
      // before Windows has released the profile's file handles, so this raced
      // and reported EBUSY as though the app had failed to start — which is the
      // exact false negative a launch guard must not produce.
      try {
        rmSync(userData, { recursive: true, force: true });
      } catch {
        // A leftover temp directory is not a failed launch.
      }

      if (fatal.length > 0) {
        reject(
          new Error(
            `The application failed to start (${fatal.join(', ')}).\n\n` +
              `${output.slice(0, 4_000)}\n\n` +
              `This is the gate that phase-13d added after an ESM/CJS import ` +
              `took the app down for two commits with every other check green.`,
          ),
        );
        return;
      }

      if (exited !== null && exited !== 0) {
        reject(new Error(`The application exited with code ${String(exited)}.\n\n${output}`));
        return;
      }

      // Detach the pipes so a lingering GPU child cannot hold the event loop
      // open after the assertion has already been made.
      child.stdout.destroy();
      child.stderr.destroy();

      globalThis.console.log(`smoke: the application stayed up for ${String(SURVIVE_MS)} ms`);
      resolve(undefined);
    }, SURVIVE_MS);
  });
}

main().catch((error) => {
  globalThis.console.error(String(error instanceof Error ? error.message : error));
  globalThis.process.exitCode = 1;
});
