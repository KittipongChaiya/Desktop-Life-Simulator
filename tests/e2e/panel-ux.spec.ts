/**
 * Panel UX, against the real app. Phase-07.8n.
 *
 * The unit tests drive synthetic pointer events in jsdom, where there is no
 * layout and nothing overlaps. What the real app adds is the part that made
 * this milestone necessary: a developer with several tools open, dragging one
 * out of another's way with a real mouse, and finding it there next time.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { plotCentreOnScreen, waitForDevTools } from './framing';
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

/** Drags an element by a delta with the real mouse. */
async function dragBy(testId: string, dx: number, dy: number): Promise<void> {
  const window = await app.firstWindow();
  const box = await window.getByTestId(testId).boundingBox();
  if (box === null) throw new Error(`no box for ${testId}`);

  await window.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await window.mouse.down();
  await window.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await window.mouse.up();
}

async function leftOf(testId: string): Promise<number> {
  const window = await app.firstWindow();
  const box = await window.getByTestId(testId).boundingBox();
  return box?.x ?? Number.NaN;
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

test('a panel can be dragged by its title bar', async () => {
  const window = await app.firstWindow();
  await window.keyboard.press('F2');
  await expect(window.getByTestId('panel-events')).toBeVisible();

  const before = await leftOf('panel-events');
  await dragBy('panel-events-bar', 120, 0);

  expect(await leftOf('panel-events')).toBeGreaterThan(before + 80);
});

test('a panel can be resized by its grip', async () => {
  const window = await app.firstWindow();
  await window.keyboard.press('F5');

  const box = await window.getByTestId('panel-commands').boundingBox();
  await dragBy('panel-commands-grip', 60, 40);
  const after = await window.getByTestId('panel-commands').boundingBox();

  expect(after?.width ?? 0).toBeGreaterThan((box?.width ?? 0) + 30);
  expect(after?.height ?? 0).toBeGreaterThan((box?.height ?? 0) + 20);
});

test('the layout is remembered across a reload', async () => {
  const window = await app.firstWindow();
  await window.keyboard.press('F2');
  await dragBy('panel-events-bar', 140, 0);
  const moved = await leftOf('panel-events');

  await window.reload();
  await window.waitForSelector('[title="Simulation uptime"]');
  await waitForDevTools(window);
  await setCollapsed(false);

  // Open BECAUSE it was open, and in the place it was dropped — a layout you
  // rebuild every session is not a layout.
  const panel = window.getByTestId('panel-events');
  await expect(panel).toBeVisible();
  expect(Math.abs((await leftOf('panel-events')) - moved)).toBeLessThan(4);
});

test('search narrows the rows without touching what was recorded', async () => {
  const window = await app.firstWindow();
  const centre = await plotCentreOnScreen(window);

  // Two kinds of observation to tell apart: a tilled tile and app startup.
  await window.keyboard.press('1');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await window.mouse.click(centre.x, centre.y);
  await new Promise((resolve) => setTimeout(resolve, 400));

  await window.keyboard.press('F2');
  const rows = window.getByTestId('panel-events').getByTestId('event-row');
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);

  const search = window.getByRole('searchbox', { name: 'Filter Events' });

  // A term that matches nothing empties the list. Asserted against a NONSENSE
  // term rather than a count, because how many event TYPES a fresh session
  // happens to produce is not this test's subject — and depending on it made
  // the first version of this spec fail for a reason unrelated to search.
  await search.fill('zzzz-no-such-event');
  await expect(rows).toHaveCount(0);

  // A term that matches keeps what it matches.
  await search.fill('tileTilled');
  expect(await rows.count()).toBeGreaterThan(0);

  // Clearing it brings everything back: filtering is a view, not a delete.
  await search.fill('');
  await expect(rows).toHaveCount(total);
});

test('a panel can be closed from its own title bar', async () => {
  const window = await app.firstWindow();
  await window.keyboard.press('F6');
  await expect(window.getByTestId('panel-time')).toBeVisible();

  await window.getByRole('button', { name: 'Close Time' }).click();

  await expect(window.getByTestId('panel-time')).toBeHidden();
});
