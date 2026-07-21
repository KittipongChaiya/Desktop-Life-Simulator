/**
 * Renderer entry.
 *
 * Wires the parts that must not know about each other: the simulation
 * (authoritative), the snapshot store (the bridge), React (a disposable view),
 * and — behind a feature flag — the developer tooling.
 *
 * The devtools import sits INSIDE `if (FEATURE_DEBUG)`. Vite replaces that flag
 * statically, so a production build evaluates `if (false)` and Rollup drops the
 * whole devtools subtree. Asserted by
 * tests/devtools-excluded-from-production.test.ts.
 */

import { FEATURE_DEBUG } from '@devtools/flags';
import { createWorld } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { createOverlayController } from './app/overlay-controller';
import { AppProviders } from './app/store-context';
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

async function mountDevTools(): Promise<void> {
  const [{ createDevTools }, { DevTools }, { createRoot: createDevRoot }] = await Promise.all([
    import('@devtools/host'),
    import('@devtools/ui/DevTools'),
    import('react-dom/client'),
  ]);

  const host = createDevTools({
    simulation: loop,
    appVersion: __APP_VERSION__,
    reload: () => {
      window.location.reload();
    },
  });

  host.logs
    .get('renderer')
    .info('developer tools ready', { keys: 'F1 console · F3 overlay · F4 inspector' });

  // A separate React root: devtools must never re-render the game UI, and the
  // game UI must never be able to unmount devtools.
  const devContainer = document.createElement('div');
  devContainer.id = 'devtools';
  document.body.appendChild(devContainer);

  createDevRoot(devContainer).render(<DevTools host={host} />);
}

if (FEATURE_DEBUG) {
  void mountDevTools();
}
