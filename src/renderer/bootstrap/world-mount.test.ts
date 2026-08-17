/**
 * The world mount's lifecycle across collapse and expand. Phase-23 bugfix.
 *
 * This seam had no unit test, which is how two defects of the same shape lived
 * here unseen: **the world is built asynchronously, and the world it is being
 * built for keeps changing while it builds.** Collapse state is applied
 * optimistically in the renderer and the window resize follows over IPC, so
 * every expand starts its build against the collapsed window — and a player
 * who toggles quickly can collapse again before the GPU has finished.
 *
 * Both cases are settled the same way: reconcile with reality once the build
 * resolves, rather than trusting what was true when it started.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  interface FakeView {
    resize: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    attachInput: ReturnType<typeof vi.fn>;
  }
  const state: {
    views: FakeView[];
    release: (() => void) | null;
    detach: ReturnType<typeof vi.fn>;
  } = { views: [], release: null, detach: vi.fn() };
  return state;
});

vi.mock('@render/world-view', () => ({
  createWorldView: () =>
    new Promise((resolve) => {
      const view = {
        resize: vi.fn(),
        destroy: vi.fn(),
        attachInput: vi.fn(() => harness.detach),
      };
      harness.views.push(view);
      harness.release = () => {
        resolve(view);
      };
    }),
}));

const { createWorldMount } = await import('./world-mount');

/** Viewport the test moves under the mount's feet, as the real window does. */
let viewport = { width: 1920, height: 48, resolution: 1, topInset: 48 };

function mountWith(): ReturnType<typeof createWorldMount> {
  return createWorldMount({
    canvas: {} as HTMLCanvasElement,
    world: {} as never,
    atlas: 'terrain',
    viewport: () => viewport,
    inputTarget: {} as HTMLElement,
    selectedWorkerId: () => null,
    motionIntensity: () => 1,
    particlesEnabled: () => true,
    creaturesEnabled: () => true,
    shakeEnabled: () => true,
    environmentEnabled: () => true,
  });
}

beforeEach(() => {
  harness.views = [];
  harness.release = null;
  harness.detach = vi.fn();
  viewport = { width: 1920, height: 48, resolution: 1, topInset: 48 };
});

describe('a window that resizes while the world is being built', () => {
  it('comes back the size of the window it came back into', async () => {
    const mount = mountWith();
    const pending = mount.mount();

    // The window expands while the GPU is still initializing — the ordinary
    // case on every expand, and the one that showed as a black world.
    viewport = { ...viewport, height: 220 };
    harness.release?.();
    await pending;

    expect(harness.views[0]?.resize).toHaveBeenCalledWith(1920, 220);
  });

  it('does not resize when the window never moved', async () => {
    const mount = mountWith();
    const pending = mount.mount();
    harness.release?.();
    await pending;

    expect(harness.views[0]?.resize).not.toHaveBeenCalled();
  });
});

describe('a collapse that arrives mid-build', () => {
  it('does not leave a live world behind while collapsed', async () => {
    const mount = mountWith();
    const pending = mount.mount();

    // The player collapses again before the GPU finished. ADR-001 §2's whole
    // point is that collapsed costs nothing; a view that survives this is a
    // GPU context burning behind a status bar.
    mount.unmount();
    harness.release?.();
    await pending;

    expect(mount.current()).toBeNull();
    expect(harness.views[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it('never attaches input to a world it is about to discard', async () => {
    const mount = mountWith();
    const pending = mount.mount();
    mount.unmount();
    harness.release?.();
    await pending;

    expect(harness.views[0]?.attachInput).not.toHaveBeenCalled();
    expect(harness.detach).not.toHaveBeenCalled();
  });

  it('expanding again after that builds a fresh world', async () => {
    const mount = mountWith();
    const first = mount.mount();
    mount.unmount();
    harness.release?.();
    await first;

    const second = mount.mount();
    harness.release?.();
    await second;

    expect(harness.views).toHaveLength(2);
    expect(mount.current()).not.toBeNull();
  });
});
