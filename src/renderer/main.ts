/**
 * Renderer entry.
 *
 * PHASE-00 SCOPE: boots the world and drives the fixed-timestep loop, proving
 * the simulation ticks inside a real Electron renderer. Nothing is drawn.
 *
 * Phase-01 mounts React and the snapshot bridge; phase-02 boots PixiJS. The
 * render call below is deliberately a no-op rather than a `requestAnimationFrame`
 * draw — ADR-001 §1 requires render-on-demand, and establishing "draw every
 * frame" here would be the exact habit that decision forbids.
 */

import { stepSimulationBy } from '@sim/tick';
import { createWorld } from '@sim/world/world';

import { createAccumulator } from './bootstrap/loop';

// Fixed seed until phase-07 introduces save/load and real world creation.
const world = createWorld(1);
const accumulator = createAccumulator();

let previous = performance.now();

function frame(now: number): void {
  const ticks = accumulator.advance(now - previous);
  previous = now;

  if (ticks > 0) stepSimulationBy(world, ticks);

  // No draw call: nothing is renderable yet, and render-on-demand (ADR-001 §1)
  // means a frame with no visible change must cost nothing.

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
