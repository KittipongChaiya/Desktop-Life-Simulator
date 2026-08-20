/**
 * Starting over, against the running app. ADR-045.
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. The dangerous part of this feature
 * is a race between three processes that no unit test contains: the renderer
 * holds the old world in memory, main runs an autosave cadence and fires a
 * save on quit, and the archive moves files out from underneath both. If the
 * sequencing in `index.ts` is wrong, the reset "works" and then the old farm
 * writes itself straight back — a new game that is the player's old farm, with
 * an archive beside it (ADR-045 §5).
 *
 * The only way to know that did not happen is to end a farm in the real
 * application, let it reload, close it — which fires a quit save — and then
 * look at what is actually on disk.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

let session: IsolatedSession;

const savesDir = (): string => join(session.userData, 'saves');
const savePath = (): string => join(savesDir(), 'slot-0.json');
const archiveDir = (): string => join(savesDir(), 'archive');

/** A save's world seed — the identity of a farm (`world.ts`: "Never changes"). */
function seedOf(document: string): number {
  return (JSON.parse(document) as { world: { seed: number } }).world.seed;
}

/** The dated folders the reset has produced, if any. */
function archives(): string[] {
  return existsSync(archiveDir()) ? readdirSync(archiveDir()) : [];
}

test.afterEach(async () => {
  await session.dispose();
});

/**
 * Opens the settings panel, or leaves it open.
 *
 * Clicking the toggle unconditionally is what the other specs do, and it is
 * wrong here: a test that has already opened the panel to change a setting
 * would have this CLOSE it. `aria-expanded` is the panel's own answer to
 * "are you open", so it is the one to ask.
 */
async function openPanel(): Promise<void> {
  const window = await session.app.firstWindow();
  const toggle = window.getByRole('button', { name: 'Settings' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/**
 * Arms and fires the control, then waits for the reload to produce a world.
 *
 * Two presses, because one is the safety catch (ADR-045 §6) — driving it any
 * other way would be testing a path a player cannot take.
 */
async function startNewGame(): Promise<void> {
  const window = await session.app.firstWindow();
  await openPanel();
  await window.getByRole('button', { name: 'Start new game' }).click();
  await window.getByRole('button', { name: /end this farm/i }).click();
  // The reload tears the page down and boots again; the status bar is the
  // signal that a world exists on the other side of it.
  await window.locator('[title="Simulation uptime"]').waitFor({ timeout: 30_000 });
}

test('ends the farm, and the farm does not come back', async () => {
  // A save planted before launch, so the app boots into an established farm
  // rather than one this spec had to play.
  session = await launchIsolated({}, (userData) => {
    mkdirSync(join(userData, 'saves'), { recursive: true });
  });

  const window = await session.app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  // Let the app write its own save, so what gets archived is a real document
  // this build produced rather than a fixture that might drift from it.
  await session.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('save:requested');
  });
  await expect.poll(() => existsSync(savePath()), { timeout: 15_000 }).toBe(true);
  const before = readFileSync(savePath(), 'utf8');

  await startNewGame();

  // THE assertion. `dispose()` closes the app, which fires the quit save — so
  // if the old world were still live and saving, this is where it would
  // reappear. Reading after the close is the whole point.
  await session.app.close().catch(() => undefined);

  // Compared by SEED rather than by bytes. "The file changed" would pass for a
  // farm that merely ticked on, and — worse — would pass if no save existed at
  // all, which is how this assertion was first written and why it is not any
  // more. A seed is the identity of a world: a different one means a genuinely
  // new farm, and the SAME one means the reset archived the files and then let
  // the old world write itself straight back (ADR-045 §5).
  expect(existsSync(savePath()), 'the new farm never saved, so nothing was proven').toBe(true);
  const after = readFileSync(savePath(), 'utf8');
  expect(seedOf(after), 'the reset produced the same world it started with').not.toBe(
    seedOf(before),
  );
});

test('keeps the old farm in a dated archive rather than deleting it', async () => {
  session = await launchIsolated();
  const window = await session.app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  await session.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('save:requested');
  });
  await expect.poll(() => existsSync(savePath()), { timeout: 15_000 }).toBe(true);
  const before = readFileSync(savePath(), 'utf8');

  await startNewGame();

  // ADR-045 §2: nothing this application does removes a world from disk.
  const folders = archives();
  expect(folders).toHaveLength(1);

  const archived = join(archiveDir(), folders[0] ?? '', 'slot-0.json');
  expect(existsSync(archived), 'the farm is not in the archive').toBe(true);
  expect(readFileSync(archived, 'utf8')).toBe(before);
});

test('does not reset accessibility settings, which were never in the save', async () => {
  // A player who needs reduced motion needs it in their next farm too.
  // Losing it to a "new game" would be a genuinely harmful bug rather than a
  // debatable one, and it is only safe because settings live in
  // `settings.json` — which this asserts rather than assumes.
  session = await launchIsolated();
  const window = await session.app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  await openPanel();
  await window.getByLabel('Reduced motion').click();

  const settingsPath = join(session.userData, 'settings.json');
  await expect
    .poll(
      () => {
        if (!existsSync(settingsPath)) return null;
        const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
          motion?: { reducedMotion?: boolean };
        };
        return parsed.motion?.reducedMotion ?? null;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  await startNewGame();

  const after = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
    motion?: { reducedMotion?: boolean };
  };
  expect(after.motion?.reducedMotion, 'the reset took the player’s accessibility setting').toBe(
    true,
  );
});

test('one press is not enough, in the real application', async () => {
  // The safety catch is unit-tested, but the thing a player actually touches
  // is this button in this window. A single press must leave the save alone.
  session = await launchIsolated();
  const window = await session.app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  await session.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('save:requested');
  });
  await expect.poll(() => existsSync(savePath()), { timeout: 15_000 }).toBe(true);

  await openPanel();
  await window.getByRole('button', { name: 'Start new game' }).click();

  // Give a reset every chance to have happened before concluding it did not.
  await window.waitForTimeout(1_000);

  expect(archives(), 'one press archived the farm').toHaveLength(0);
  expect(existsSync(savePath())).toBe(true);
});

test('refuses a save that lands after the archive, which is the race that would undo it', async () => {
  // THE SEQUENCING GUARD (ADR-045 §5), driven deterministically.
  //
  // The renderer's save controller coalesces and defers, so a write requested
  // before the button was pressed can arrive AFTER the files have moved — and
  // it carries the old world. Waiting for that race to happen by chance is not
  // a test, so this invokes the two channels in order from the main process
  // and asks main what it did.
  //
  // If the refusal were removed, this write would be accepted and would
  // recreate slot-0.json holding the farm that was just archived.
  session = await launchIsolated();
  const window = await session.app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  const refusal = await session.app.evaluate(async ({ ipcMain }) => {
    // Calls main's own registered handlers directly. `_invokeHandlers` is an
    // Electron INTERNAL and the one fragile thing in this file: if an upgrade
    // renames it, this test fails with "no handler registered" rather than
    // with something mysterious, which is what the explicit check below is
    // for. There is no public way to invoke a handler from the main side, and
    // the alternative — racing a real save against a real archive — is not a
    // test, it is a coin toss.
    const handlers = (
      ipcMain as unknown as { _invokeHandlers?: Map<string, (...args: unknown[]) => unknown> }
    )._invokeHandlers;

    const invoke = async (channel: string, payload?: unknown): Promise<unknown> => {
      const handler = handlers?.get(channel);
      if (handler === undefined) throw new Error(`no handler registered for ${channel}`);
      return await handler({}, payload);
    };

    await invoke('save:archive', undefined);
    return invoke('save:write', { not: 'a save' });
  });

  // Refused for being mid-archive, NOT for being malformed — the document
  // above is nonsense, and a handler that validated first would reject it
  // with a different message and this test would pass for the wrong reason.
  expect(refusal).toMatchObject({ ok: false });
  expect((refusal as { error: string }).error).toContain('archived');
});
