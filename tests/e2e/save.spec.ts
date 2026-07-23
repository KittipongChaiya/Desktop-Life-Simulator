/**
 * Save/load against the real app. Phase-07c — acceptance criteria 5, 25
 * (the 07c halves: the atomic write, the load pipeline, and relaunch
 * continuity; the automatic quit-save trigger arrives in 07e).
 *
 * Runs on an isolated userData profile (the DESKTOP_LIFE_USER_DATA seam), so
 * the tests own their save files outright. Saves are triggered the way every
 * real trigger works — main sends `save:requested` and the renderer
 * serializes — driven here from the Electron main handle.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

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
  return instance;
}

/** Triggers a save exactly as quit/tray/autosave will: main asks. */
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

test.beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'dls-save-'));
});

test.afterEach(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('saves atomically, and a relaunch resumes the same world (crit 25)', async () => {
  app = await launch();

  // Let the world live a little, then save.
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await requestSave(app);
  await expect.poll(() => existsSync(savePath()), { timeout: 10_000 }).toBe(true);

  const first = readSave();
  expect(first.magic).toBe('desktop-life-simulator/save');
  expect(first.schemaVersion).toBe(1);
  expect(first.world.tick).toBeGreaterThan(0);
  expect(first.world.wallet.coins).toBe(100); // the untouched starting capital
  expect(first.meta.saveCount).toBe(1);

  await app.close();
  app = await launch();

  // Save again on the resumed world: the file proves continuity —
  // the SAME farm (seed, creation time), further along (tick), counted (2).
  await requestSave(app);
  await expect.poll(() => readSave().meta.saveCount, { timeout: 10_000 }).toBe(2);

  const second = readSave();
  expect(second.world.seed).toBe(first.world.seed); // same world, not a new game
  expect(second.meta.createdAtUnixMs).toBe(first.meta.createdAtUnixMs);
  expect(second.world.tick).toBeGreaterThan(first.world.tick); // resumed, not restarted
  // The previous good save rotated into .bak (SAVE_FORMAT.md §7.1 step 4).
  expect(existsSync(bakPath())).toBe(true);
});

test('a corrupt slot file recovers from .bak with the world intact (crit 5)', async () => {
  app = await launch();
  await requestSave(app);
  await expect.poll(() => existsSync(savePath()), { timeout: 10_000 }).toBe(true);
  await requestSave(app);
  await expect.poll(() => existsSync(bakPath()), { timeout: 10_000 }).toBe(true);

  const goodSeed = readSave().world.seed;
  await app.close();

  // Corrupt the primary by hand; the .bak still holds a good save.
  writeFileSync(savePath(), '{"schemaVersion":1,"wor', 'utf8');

  app = await launch(); // reaching the status bar means a world loaded
  await requestSave(app);
  // The slot stays corrupt until the write lands — a throwing parse must be
  // a retry, not a poll failure.
  await expect
    .poll(
      () => {
        try {
          return readSave().world.seed;
        } catch {
          return -1;
        }
      },
      { timeout: 10_000 },
    )
    .toBe(goodSeed);
});
