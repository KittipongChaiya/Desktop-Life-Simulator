/**
 * Spawn tools, against the real app. Phase-07.8k, ADR-018 §3.
 *
 * The unit tests prove the commands submit what they say they submit, against
 * a fake. Only the real app can prove the three properties the rule exists to
 * buy: that a debug spawn travels the ORDINARY dispatcher, that it is REFUSED
 * like a player action when it is illegal, and that it is INDISTINGUISHABLE
 * from a player action downstream — which is what makes a bug reproduced with
 * the tools open a real reproduction.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { waitForDevTools } from './framing';
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
  await waitForDevTools(window);
  await setCollapsed(false);
});

test.afterEach(async () => {
  await session.dispose();
});

test('a spawned worker arrives through the ordinary command path', async () => {
  const window = await app.firstWindow();
  const count = window.locator('[title="Workers hired"]');
  await expect(count).toHaveText('0 workers');

  // Hiring costs real coins, and the spawn tool has no privileged exemption —
  // so it is funded through the declared dev-only source first.
  await consoleCommand('money 5000');
  await consoleCommand('spawn worker 2');

  // The HUD is the proof: the command was validated, queued, executed on a
  // tick, and republished through the snapshot like any hire.
  await expect(count).toHaveText('2 workers');
});

test('an illegal spawn is refused exactly like a player action', async () => {
  // Tile 0,0 is outside the starting plot, so placing there fails validation.
  // A tool that quietly succeeded here would have found a privileged write
  // path, which is the whole of what ADR-018 §3 forbids.
  const output = await consoleCommand('spawn building core:storage_shed 0,0');

  expect(output).toContain('refused');
});

test('a spawn is indistinguishable from a player action to the monitor', async () => {
  const window = await app.firstWindow();

  await consoleCommand('money 5000');
  await consoleCommand('spawn worker');

  await window.keyboard.press('F5');
  const monitor = window.getByTestId('command-monitor');
  const row = monitor.getByTestId('command-row').filter({ hasText: 'hireWorker' });

  // Recorded by the 07.8f wrapper, which wraps the PLAYER source — so seeing
  // it here at all is the proof that the spawn went through that source.
  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText('player');
  await expect(row.first()).toContainText('accepted');
});
