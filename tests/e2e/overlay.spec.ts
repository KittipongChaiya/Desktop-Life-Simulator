/**
 * Overlay behavior. Phase-01 acceptance criteria 1, 2, 4, 7, 12.
 *
 * The properties asserted here are what make the overlay livable. They have no
 * unit-testable surface — window geometry and always-on-top only exist in a
 * real Electron process.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

import { OVERLAY_HEIGHT_COLLAPSED, OVERLAY_HEIGHT_EXPANDED } from '../../src/shared/constants';

let app: ElectronApplication;
/** The throwaway profile this spec runs on (07e — the app saves itself now). */
let session: IsolatedSession;

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  // Wait for the window to exist before any evaluate(): otherwise
  // getAllWindows() is empty and assertions fail for the wrong reason.
  await app.firstWindow();
});

test.afterEach(async () => {
  await session.dispose();
});

test('docks to the bottom of the work area, spanning its full width', async () => {
  const geometry = await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0]?.getBounds();
    const { workArea } = screen.getPrimaryDisplay();
    return { bounds, workArea };
  });

  expect(geometry.bounds).toBeDefined();
  const bounds = geometry.bounds!;
  const { workArea } = geometry;

  expect(bounds.x).toBe(workArea.x);
  expect(bounds.width).toBe(workArea.width);

  // Bottom edge flush with the work area — ABOVE the taskbar, never over it.
  expect(bounds.y + bounds.height).toBe(workArea.y + workArea.height);
});

test('is frameless, transparent, and absent from the taskbar', async () => {
  const flags = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return {
      resizable: win?.isResizable(),
      alwaysOnTop: win?.isAlwaysOnTop(),
      movable: win?.isMovable(),
    };
  });

  // ALWAYS-ON-TOP again (owner decision, 2026-07-23 — the livability verdict
  // on phase-01.8c's z-order inversion): a maximized window covering the game
  // entirely proved unlivable, so ADR-003's original clause stands restored
  // (ADR-014 amendment). The window still NEVER steals focus — on-top and
  // focus-proof are independent properties, and only the first reverted.
  expect(flags.alwaysOnTop).toBe(true);
  expect(flags.resizable).toBe(false);
  expect(flags.movable).toBe(false);
});

test('never takes focus', async () => {
  // Focus stealing is the fastest way to get a desktop overlay uninstalled
  // (VISION.md §2.1). The window is created non-focusable and shown with
  // showInactive.
  const focusable = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.isFocusable(),
  );

  expect(focusable).toBe(false);
});

test('collapse and expand resize the window and keep it docked', async () => {
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');

  const heightFor = async (collapsed: boolean): Promise<number> => {
    // Drive the real UI path — the preload bridge and the main-process IPC
    // handler — rather than resizing the window directly.
    //
    // The cast is explicit because this callback is serialized into the page
    // context: the ambient `window.desktopLife` declaration does not carry
    // across that boundary, so the type has to be restated here.
    await window.evaluate(async (target: boolean) => {
      const api = (
        globalThis as unknown as {
          desktopLife: { overlay: { setCollapsed(collapsed: boolean): Promise<unknown> } };
        }
      ).desktopLife;

      await api.overlay.setCollapsed(target);
    }, collapsed);

    await new Promise((resolve) => setTimeout(resolve, 400));

    return app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds().height ?? -1,
    );
  };

  expect(await heightFor(true)).toBe(OVERLAY_HEIGHT_COLLAPSED);
  expect(await heightFor(false)).toBe(OVERLAY_HEIGHT_EXPANDED);

  // Still flush with the bottom of the work area after resizing.
  const docked = await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()[0]?.getBounds();
    const { workArea } = screen.getPrimaryDisplay();
    return bounds !== undefined && bounds.y + bounds.height === workArea.y + workArea.height;
  });

  expect(docked).toBe(true);
});

test('renders the status bar', async () => {
  const window = await app.firstWindow();

  await expect(window.locator('[title="Simulation uptime"]')).toBeVisible();
  await expect(window.getByRole('button', { name: /overlay$/ })).toBeVisible();
});

test('the expanded world KEEPS the mouse, so clicks reach the game (07.5g regression)', async () => {
  // THE BUG THIS GUARDS. Hit-testing used to ask only "is the pointer over a
  // `data-interactive` element?", and the world is not one — so an expanded
  // overlay asked main for click-through and every click on a tile went to the
  // desktop. Tilling, planting and harvesting were impossible with a mouse.
  //
  // Observed in MAIN, at the receiving end of the IPC. The renderer cannot be
  // instrumented from the page — `contextBridge` exposes a frozen proxy, so a
  // spy on `window.desktopLife` silently fails to install (found trying). And
  // the OS half is unobservable either way: Playwright's synthetic events never
  // travel through the window manager, which is precisely why neither suite
  // caught this bug. What IS observable, and what actually broke, is the value
  // the renderer asks main for.
  const window = await app.firstWindow();
  await window.locator('[title="Simulation uptime"]').waitFor();

  await app.evaluate(({ ipcMain }) => {
    const store = globalThis as { clickThroughRequests?: boolean[] };
    store.clickThroughRequests = [];
    // An additional listener; the real handler keeps running beside it.
    ipcMain.on('overlay:set-click-through', (_event, enabled: unknown) => {
      if (typeof enabled === 'boolean') store.clickThroughRequests?.push(enabled);
    });
  });

  await window.evaluate(() => {
    // The controller de-duplicates, and with the fix the overlay ALREADY holds
    // the mouse while expanded — so a move over the world alone produces no
    // call at all. Force the opposite state first: a pointerleave hands the
    // mouse away unconditionally, whatever the mode.
    globalThis.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    globalThis.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: globalThis.innerWidth / 2,
        clientY: globalThis.innerHeight - 20,
        bubbles: true,
      }),
    );
  });

  const requests = await app.evaluate(
    () => (globalThis as { clickThroughRequests?: boolean[] }).clickThroughRequests ?? [],
  );

  // Handed away on leave, then TAKEN BACK the moment the pointer is over the
  // world. Before the fix the second value was `true` and stayed there.
  expect(requests).toEqual([true, false]);
});
