/**
 * Application composition root.
 *
 * The ONE function the renderer entry may call. Everything that wires the
 * simulation, the snapshot bridge, React, and the developer tooling happens
 * here, inside a boundary-linted layer.
 *
 * This exists so `src/renderer/entry/main.tsx` has nothing internal to reach
 * into: the entry imports this module and nothing else, which is enforced by
 * `boundaries/entry-point` rather than by convention.
 */

import { createWorld } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '../app/App';
import { createOverlayController } from '../app/overlay-controller';
import { AppProviders } from '../app/store-context';

import { mountDevTools } from './devtools-mount';
import { createGameLoop } from './game-loop';
import { createSnapshotStore } from './snapshot-store';
import { createWorldMount } from './world-mount';

import '../app/global.css';

/**
 * Boots the application.
 *
 * Composition order is load-bearing: the loop starts before React mounts so the
 * first render already has a settled snapshot, and devtools mount last so a
 * failure there can never prevent the game from starting.
 */
/** Last world-view mount failure, surfaced as a devtools metric. */
let lastWorldError: string | null = null;

export function startApplication(): void {
  // Fixed seed until phase-07 introduces save/load.
  const world = createWorld(1);
  const store = createSnapshotStore(world.snapshots);
  const overlay = createOverlayController(window.desktopLife.overlay);

  const canvas = document.getElementById('world');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#world canvas is missing from index.html');
  }

  const worldMount = createWorldMount({
    canvas,
    world,
    atlas: 'terrain',
    viewport: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: window.devicePixelRatio,
    }),
    // A GPU failure must be VISIBLE. Swallowing it leaves the overlay running
    // with no world and no explanation, which is what happened on the first
    // live check of phase-02.
    onError: (error) => {
      lastWorldError = error instanceof Error ? error.message : String(error);
    },
  });

  const loop = createGameLoop({
    world,
    store,
    // Returning false when nothing was drawn keeps the FPS metric honest: a
    // static world reads 0 fps, which is the intended behaviour, not a stall.
    onFrame: () => worldMount.current()?.renderFrame() ?? false,
  });
  loop.start();

  // The world view exists only while expanded. Collapsing destroys the GPU
  // context entirely (ADR-001 §2).
  const syncWorldToOverlay = (): void => {
    if (overlay.isCollapsed()) {
      worldMount.unmount();
    } else {
      void worldMount.mount();
    }
  };
  overlay.subscribe(syncWorldToOverlay);
  syncWorldToOverlay();

  window.addEventListener('resize', () => {
    worldMount.resize(window.innerWidth, window.innerHeight);
  });

  const container = document.getElementById('ui');
  if (container === null) throw new Error('#ui root is missing from index.html');

  createRoot(container).render(
    <StrictMode>
      <AppProviders store={store} overlay={overlay}>
        <App />
      </AppProviders>
    </StrictMode>,
  );

  void mountDevTools({
    simulation: loop,
    world: () => worldMount.current(),
    worldError: () => lastWorldError,
    appVersion: __APP_VERSION__,
    reload: () => {
      window.location.reload();
    },
  });
}
