/**
 * Session recording, against the real app. Phase-07.8m.
 *
 * The unit tests drive fake rings. Only the real app can prove the recorder is
 * attached to the ones the monitors actually fill — that a genuine player
 * action, travelling the real command path and the real event bus, lands in a
 * recording.
 *
 * The export itself is a Blob download, deliberately the only untested line of
 * the milestone: it is a browser API with no logic, and driving a save dialog
 * would be testing Electron rather than this code.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

async function setCollapsed(collapsed: boolean): Promise<void> {
  const window = await app.firstWindow();
  await window.evaluate(async (value: boolean) => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(value);
  }, collapsed);
}

/** Runs a console command and returns the console's own output. */
async function consoleCommand(command: string): Promise<string> {
  const window = await app.firstWindow();
  await window.keyboard.press('F1');
  const input = window.getByLabel('Developer console input');
  await input.fill(command);
  await input.press('Enter');
  const output = (await window.getByTestId('dev-console').textContent()) ?? '';
  await window.keyboard.press('F1');
  await new Promise((resolve) => setTimeout(resolve, 250));
  return output;
}

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await setCollapsed(false);
});

test.afterEach(async () => {
  await session.dispose();
});

test('a recording captures a real action on the real streams', async () => {
  const window = await app.firstWindow();
  const centre = await plotCentreOnScreen(window);

  expect(await consoleCommand('record status')).toContain('not recording');
  expect(await consoleCommand('record start')).toContain('recording started');

  // Till a tile the ordinary way: a command through the dispatcher and a
  // tileTilled event through the bus, both of which the recorder observes.
  await window.keyboard.press('1');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 600));

  const running = await consoleCommand('record status');
  expect(running).toContain('recording since tick');

  const stopped = await consoleCommand('record stop');

  expect(stopped).toContain('recorded ticks');
  expect(stopped).toContain('exported recording-t');
  // Performance is sampled on the recorder's own clock while it runs.
  expect(stopped).not.toContain('0 samples');
  // A short, ordinary session loses nothing.
  expect(stopped).not.toContain('DROPPED');
});

test('stopping without starting says so rather than exporting nothing', async () => {
  expect(await consoleCommand('record stop')).toContain('not recording');
});
