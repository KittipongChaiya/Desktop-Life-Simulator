/**
 * Save/load against the real app. Phase-07c and 07e — acceptance criteria 5,
 * 19, 20, 25.
 *
 * Runs on an isolated userData profile (the DESKTOP_LIFE_USER_DATA seam), so
 * the tests own their save files outright.
 *
 * From 07e the app saves ITSELF: closing it triggers a save that blocks
 * shutdown, so most tests here never ask for one. Where a test still needs a
 * save at a precise moment it sends `save:requested` — the same event every
 * real trigger sends, which is the point of there being only one.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { waitForDevTools } from './framing';
import { CURRENT_SCHEMA_VERSION } from '../../src/persistence/schema';

let app: ElectronApplication;
let userData: string;

const savePath = (): string => join(userData, 'saves', 'slot-0.json');
const bakPath = (): string => join(userData, 'saves', 'slot-0.json.bak');

async function launch(): Promise<ElectronApplication> {
  const instance = await electron.launch({
    args: ['.'],
    env: { ...process.env, DESKTOP_LIFE_USER_DATA: userData },
  });
  const window = await instance.firstWindow();
  // The world exists once the status bar renders — saves need a live world.
  await window.locator('[title="Simulation uptime"]').waitFor();
  // And the console exists a little after that: `mountDevTools` is code-split
  // and awaited off the composition root, so F1 does nothing until it lands.
  await waitForDevTools(window);
  return instance;
}

/** Triggers a save the way every real trigger does: main asks. */
async function requestSave(instance: ElectronApplication): Promise<void> {
  await instance.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('save:requested');
  });
}

interface SavedFile {
  readonly schemaVersion: number;
  readonly magic: string;
  readonly meta: {
    readonly createdAtUnixMs: number;
    readonly saveCount: number;
    readonly gameVersion: string;
  };
  readonly world: {
    readonly seed: number;
    readonly tick: number;
    readonly wallet: { coins: number };
  };
}

const readSave = (): SavedFile => JSON.parse(readFileSync(savePath(), 'utf8')) as SavedFile;

/** Reads the save, tolerating the instant where a write has not landed. */
function readSaveOrNull(): SavedFile | null {
  try {
    return readSave();
  } catch {
    return null;
  }
}

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'dls-save-'));
});

test.afterEach(async () => {
  // Tolerated: a test may have closed or killed the app itself, and a
  // teardown failure must never mask the assertion that ran before it.
  await app.close().catch(() => undefined);
  rmSync(userData, { recursive: true, force: true });
});

test('quitting saves by itself, and a relaunch resumes the same world (crit 19, 25)', async () => {
  app = await launch();
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  // No save is requested anywhere in this test. Closing the app is the
  // trigger (`SAVE_FORMAT.md` §7.2, "before quit — blocks shutdown until
  // complete"), which is the whole point of the assertion below.
  await app.close();

  const first = readSave();
  expect(first.magic).toBe('desktop-life-simulator/save');
  // The CONSTANT, not a literal. This asserted `1` and went stale the moment
  // v0.2 started migrating — it was still asserting the v0.1 format while the
  // chain had reached v6, so a test about "quitting writes a save" was failing
  // for a reason that had nothing to do with quitting or saving. What it means
  // to check is that the save carries THIS BUILD's format, which is a fact that
  // moves every time a migration lands.
  expect(first.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(first.world.tick).toBeGreaterThan(0);
  expect(first.world.wallet.coins).toBe(100); // the untouched starting capital
  expect(first.meta.saveCount).toBe(1);

  app = await launch();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await app.close();

  // The SAME farm (seed, creation time), further along (tick), counted.
  const second = readSave();
  expect(second.world.seed).toBe(first.world.seed); // same world, not a new game
  expect(second.meta.createdAtUnixMs).toBe(first.meta.createdAtUnixMs);
  expect(second.world.tick).toBeGreaterThan(first.world.tick); // resumed, not restarted
  expect(second.meta.saveCount).toBe(2);
  // The previous good save rotated into .bak (`SAVE_FORMAT.md` §7.1 step 4).
  expect(existsSync(bakPath())).toBe(true);
});

test('autosave fires on its own cadence, with nobody touching anything (crit 19)', async () => {
  // The real 60-second period, on the shipped constant, with no test seam
  // shortening it: an autosave that only fires when a test asks is not an
  // autosave. This is why the test is slow, and why it is worth being slow.
  test.setTimeout(180_000);

  app = await launch();
  expect(existsSync(savePath())).toBe(false); // nothing has saved yet

  await expect
    .poll(() => existsSync(savePath()), { timeout: 90_000, intervals: [2_000] })
    .toBe(true);

  const saved = readSave();
  expect(saved.meta.saveCount).toBe(1);

  // THE CADENCE IS PROVEN BY THE POLL ABOVE, not by this number. Nothing else
  // in the app writes a save on an untouched farm: a transaction save needs a
  // transaction, and a quit save needs a quit. So a file appearing at all,
  // after a minute of doing nothing, is the claim.
  //
  // This bound was `60 * 20 * 0.9` — 1,080 ticks — and it flaked twice, at 981
  // and then at 530. It was quietly asserting a second thing: that the
  // simulation keeps up with wall-clock. ADR-007 §3 caps the accumulator
  // precisely so a starved frame loop cannot spiral, so falling behind is
  // permitted behaviour rather than a defect, and **where the tick rate is
  // actually measured is `PERFORMANCE.md`**, deliberately, on a quiet machine.
  // An idle overlay was measured at 19.97 ticks/s for this investigation, so
  // the app is not the reason (`TESTING.md` §6.5).
  //
  // Lowering the threshold was tried first and was the wrong instinct: 530
  // ticks defeats any bound that still pretends to measure a rate. What the
  // number is good for is proving the world was RUNNING rather than frozen,
  // and a quarter of a minute says that without asserting anything about how
  // fast the machine was.
  expect(saved.world.tick, 'the world was not running behind this save').toBeGreaterThan(300);
});

test('a major transaction saves immediately, without waiting for the cadence (crit 19)', async () => {
  app = await launch();
  const window = await app.firstWindow();

  // Fund the hire through the declared dev-only source, exactly as the worker
  // suite does — `hireCost(0)` is 150 against a 100-coin start.
  await window.keyboard.press('F1');
  const input = window.getByLabel('Developer console input');
  await input.fill('money 5000');
  await input.press('Enter');
  await window.keyboard.press('F1');
  await new Promise((resolve) => setTimeout(resolve, 250));

  expect(existsSync(savePath())).toBe(false);

  await window.getByRole('button', { name: /^Hire/ }).click();

  // Far inside the 60-second cadence: the write happened because a worker was
  // hired, not because a timer elapsed.
  await expect.poll(() => existsSync(savePath()), { timeout: 10_000 }).toBe(true);
  expect(readSave().world.tick).toBeGreaterThan(0);
});

test('time away is credited as ticks on the next launch (offline catch-up, 07d)', async () => {
  app = await launch();
  await app.close();
  const first = readSave();

  // The app is CLOSED for this gap; catch-up must convert it to ticks.
  const closedMs = 4_000;
  await new Promise((resolve) => setTimeout(resolve, closedMs));

  app = await launch();
  await requestSave(app);
  await expect.poll(() => readSaveOrNull()?.meta.saveCount ?? 0, { timeout: 10_000 }).toBe(2);

  const second = readSave();
  // At least the closed time arrived as ticks (50 ms per tick); the live
  // session between launch and save only adds more. Without catch-up the
  // delta would be the short session alone (~20–60 ticks).
  expect(second.world.tick - first.world.tick).toBeGreaterThanOrEqual(closedMs / 50);
});

test('a corrupt slot file recovers from .bak with the world intact (crit 5)', async () => {
  app = await launch();
  await app.close();
  app = await launch();
  await app.close(); // the second quit save rotates the first into .bak
  expect(existsSync(bakPath())).toBe(true);

  const goodSeed = readSave().world.seed;

  // Corrupt the primary by hand; the .bak still holds a good save.
  writeFileSync(savePath(), '{"schemaVersion":1,"wor', 'utf8');

  app = await launch(); // reaching the status bar means a world loaded
  await requestSave(app);
  await expect.poll(() => readSaveOrNull()?.world.seed ?? -1, { timeout: 10_000 }).toBe(goodSeed);
});

test('killing the process mid-save still leaves a loadable world (crit 4, 25)', async () => {
  // The crash-safety unit tests halt the write sequence after each of the six
  // steps against a real directory. This is the same guarantee against the
  // real app: SIGKILL during a burst of writes, then prove the farm comes
  // back — same seed, no new game, no hand-repair.
  app = await launch();
  await app.close(); // one known-good save on disk first
  const goodSeed = readSave().world.seed;
  const savedTick = readSave().world.tick;

  app = await launch();
  const pid = await app.evaluate(() => process.pid);

  // A burst of saves, then kill without warning. Whichever step the write is
  // on, §7.1's ordering means at least one of slot/.bak is a complete save.
  for (let burst = 0; burst < 12; burst += 1) void requestSave(app);
  await new Promise((resolve) => setTimeout(resolve, 40));
  process.kill(pid, 'SIGKILL');
  await app.close().catch(() => undefined); // already gone; release the handle

  // §7.1's invariant: after serialization, no single failure leaves zero
  // valid saves. At least one of the two files must still be a whole save.
  const parses = (path: string): boolean => {
    try {
      JSON.parse(readFileSync(path, 'utf8'));
      return true;
    } catch {
      return false;
    }
  };
  expect(parses(savePath()) || parses(bakPath())).toBe(true);

  app = await launch();
  await requestSave(app);
  await expect.poll(() => readSaveOrNull()?.world.seed ?? -1, { timeout: 10_000 }).toBe(goodSeed);
  expect(readSave().world.tick).toBeGreaterThanOrEqual(savedTick);
});
