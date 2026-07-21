/**
 * Renderer entry.
 *
 * Deliberately thin. This file matches no boundary element pattern, so the
 * linter cannot constrain what it imports (found by the phase-01.6 architecture
 * review). Everything real therefore lives under `src/renderer/bootstrap/`,
 * where the rules apply — this file only wires those pieces together.
 */

import { createWorld } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { createOverlayController } from './app/overlay-controller';
import { AppProviders } from './app/store-context';
import { mountDevTools } from './bootstrap/devtools-mount';
import { createGameLoop } from './bootstrap/game-loop';
import { createSnapshotStore } from './bootstrap/snapshot-store';

import './app/global.css';

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
