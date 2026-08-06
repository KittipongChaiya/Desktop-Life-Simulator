/**
 * Quick hide / restore, at the window-call level. ADR-014 §2.
 *
 * WHY THESE ASSERTIONS LOOK ODD. The restore leg asserts that the window is
 * RESIZED before it is shown, which reads like an implementation detail and is
 * not one: on Windows, `hide()` tears down the render widget's child HWND
 * (`Chrome_RenderWidgetHostHWND`) and `showInactive()` does not bring it back.
 * The window then paints, animates, and still receives forwarded mouse MOVES —
 * but every button press lands on the top-level window with no widget beneath
 * to route it to, so the overlay is visible, alive, and completely unclickable.
 * Only a real geometry change makes Chromium re-attach it.
 *
 * WHY IT IS ASSERTED HERE AND NOT IN E2E. Playwright drives Electron over CDP,
 * and an attached debugger keeps the widget alive — the whole suite passes
 * against the broken build. That is not a gap this file can close; it is why
 * this contract has to be pinned somewhere a deletion cannot pass unnoticed.
 * The end-to-end proof is external: `WindowFromPoint` over the restored window
 * plus a real injected click (07.9 investigation).
 */

import { describe, expect, it, vi } from 'vitest';

import { applyHidden } from './desktop-companion';

interface Recorder {
  readonly calls: string[];
  readonly window: Parameters<typeof applyHidden>[0];
}

/**
 * A BrowserWindow stand-in that records the ORDER of the calls, because order
 * is the whole contract: a resize after `showInactive` would flash the player.
 */
function recorder(bounds = { x: 0, y: 860, width: 1920, height: 220 }): Recorder {
  const calls: string[] = [];
  let current = bounds;

  const window = {
    isDestroyed: () => false,
    hide: () => calls.push('hide'),
    showInactive: () => calls.push('showInactive'),
    getBounds: () => current,
    setBounds: (next: typeof bounds) => {
      current = next;
      calls.push(`setBounds:${String(next.width)}x${String(next.height)}`);
    },
  };

  return { calls, window: window as unknown as Parameters<typeof applyHidden>[0] };
}

describe('applyHidden', () => {
  it('hides with hide() and nothing else', () => {
    const { calls, window } = recorder();

    applyHidden(window, true);

    expect(calls).toEqual(['hide']);
  });

  it('re-attaches the render widget BEFORE showing, so the restore cannot flash', () => {
    const { calls, window } = recorder();

    applyHidden(window, false);

    // A real size change, then the size put back, then the window shown. The
    // player never sees the intermediate size because the window is still
    // hidden while it happens.
    expect(calls).toEqual(['setBounds:1920x219', 'setBounds:1920x220', 'showInactive']);
  });

  it('leaves the window on exactly the bounds it had', () => {
    const { window } = recorder();

    applyHidden(window, false);

    // Restoration is exact by construction (ADR-014 §2): the geometry poke must
    // land back on the same rectangle, or quick hide becomes a window mover.
    expect(window.getBounds()).toEqual({ x: 0, y: 860, width: 1920, height: 220 });
  });

  it('re-attaches at the collapsed height too', () => {
    const { calls, window } = recorder({ x: 0, y: 1032, width: 1920, height: 48 });

    applyHidden(window, false);

    expect(calls).toEqual(['setBounds:1920x47', 'setBounds:1920x48', 'showInactive']);
  });

  it('does nothing to a destroyed window', () => {
    const calls: string[] = [];
    const destroyed = {
      isDestroyed: () => true,
      hide: () => calls.push('hide'),
      showInactive: () => calls.push('showInactive'),
      getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
      setBounds: () => calls.push('setBounds'),
    } as unknown as Parameters<typeof applyHidden>[0];

    applyHidden(destroyed, false);
    applyHidden(destroyed, true);

    expect(calls).toEqual([]);
  });

  it('survives repeated round trips without drifting the geometry', () => {
    const { window } = recorder();
    const spy = vi.spyOn(window, 'showInactive');

    for (let i = 0; i < 10; i += 1) {
      applyHidden(window, true);
      applyHidden(window, false);
    }

    expect(spy).toHaveBeenCalledTimes(10);
    expect(window.getBounds()).toEqual({ x: 0, y: 860, width: 1920, height: 220 });
  });
});
