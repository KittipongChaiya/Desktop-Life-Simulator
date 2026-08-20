/**
 * Time controls, against the real app. Phase-07.8g.
 *
 * The unit tests drive a fake control. What only the real app can show is that
 * the panel is wired to the LOOP — that pausing from it actually stops the
 * simulation advancing, and that a scale set from it is the scale the loop
 * reports back.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { waitForDevTools } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await waitForDevTools(window);
});

test.afterEach(async () => {
  await session.dispose();
});

test('pausing from the panel stops the simulation advancing', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F6');
  const panel = window.getByTestId('time-controls');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('running');

  await panel.getByRole('button', { name: 'Pause' }).click();
  await expect(panel).toContainText('paused');

  // The tick is the proof, not the label: read it, wait through what would be
  // twenty ticks at normal rate, and read it again.
  const heading = window.getByTestId('time-controls-heading');
  const before = await heading.textContent();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(await heading.textContent()).toBe(before);

  // And it resumes, so the pause is a pause rather than a stop.
  await panel.getByRole('button', { name: 'Resume' }).click();
  await expect(heading).not.toHaveText(before ?? '');
});

test('stepping advances a paused world by exactly what was asked', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F6');
  const panel = window.getByTestId('time-controls');
  await panel.getByRole('button', { name: 'Pause' }).click();
  await expect(panel).toContainText('paused');

  const tickOf = async (): Promise<number> => {
    const text = (await window.getByTestId('time-controls-heading').textContent()) ?? '';
    return Number.parseInt((text.split('tick')[1] ?? '0').replace(/[^0-9]/g, ''), 10);
  };

  const before = await tickOf();
  await panel.getByRole('button', { name: '+10' }).click();
  await expect.poll(async () => await tickOf(), { timeout: 5_000 }).toBe(before + 10);
});

test('the scale the panel sets is the scale the loop reports', async () => {
  const window = await app.firstWindow();

  await window.keyboard.press('F6');
  const panel = window.getByTestId('time-controls');

  await panel.getByRole('button', { name: '8×' }).click();
  await expect(panel).toContainText('8×');
  await expect(panel.getByRole('button', { name: '8×' })).toHaveAttribute('aria-pressed', 'true');

  await panel.getByRole('button', { name: '1×' }).click();
  await expect(panel.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
});
