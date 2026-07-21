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

import '../app/global.css';

/**
 * Boots the application.
 *
 * Composition order is load-bearing: the loop starts before React mounts so the
 * first render already has a settled snapshot, and devtools mount last so a
 * failure there can never prevent the game from starting.
 */
export function startApplication(): void {
  // Fixed seed until phase-07 introduces save/load.
  const world = createWorld(1);
  const store = createSnapshotStore(world.snapshots);
  const overlay = createOverlayController(window.desktopLife.overlay);

  const loop = createGameLoop({ world, store });
  loop.start();

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
    appVersion: __APP_VERSION__,
    reload: () => {
      window.location.reload();
    },
  });
}
