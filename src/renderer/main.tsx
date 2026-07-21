/**
 * Renderer entry. Phase-01.
 *
 * Wires the three parts that must not know about each other: the simulation
 * (authoritative), the snapshot store (the bridge), and React (a disposable
 * view). ADR-003 §4.
 *
 * Note the frame loop: ticking the simulation and pumping the store are
 * separate concerns running at different rates — the sim at a fixed 20 Hz, the
 * store at most at UI_UPDATE_HZ, and neither forces a render.
 */

import { stepSimulationBy } from '@sim/tick';
import { createWorld } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { createOverlayController } from './app/overlay-controller';
import { AppProviders } from './app/store-context';
import { createAccumulator } from './bootstrap/loop';
import { createSnapshotStore } from './bootstrap/snapshot-store';

import './app/global.css';

// Fixed seed until phase-07 introduces save/load.
const world = createWorld(1);
const accumulator = createAccumulator();
const store = createSnapshotStore(world.snapshots);
const overlay = createOverlayController(window.desktopLife.overlay);

let previous = performance.now();

function frame(now: number): void {
  const ticks = accumulator.advance(now - previous);
  previous = now;

  if (ticks > 0) stepSimulationBy(world, ticks);

  // Throttled and change-gated internally: a tick that changed nothing
  // observable notifies nobody, so React does no work at all (ADR-005 §2).
  store.pump(now);

  // No draw call yet. Render-on-demand (ADR-001 §1) means a frame with no
  // visible change must cost nothing; phase-02 adds the dirty-gated renderer.

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

const container = document.getElementById('ui');
if (container === null) throw new Error('#ui root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <AppProviders store={store} overlay={overlay}>
      <App />
    </AppProviders>
  </StrictMode>,
);
