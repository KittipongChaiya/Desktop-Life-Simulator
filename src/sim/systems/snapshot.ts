/**
 * Publishes changed snapshot slices to views.
 *
 * Runs LAST in the tick (ADR-007 §4) so views only ever observe fully settled
 * state, never a half-stepped world.
 */

import { projectStatus, publishIfChanged, statusEquals } from '../snapshot/state';
import type { World } from '../world/world';

export function snapshotSystem(world: World): void {
  publishIfChanged(world.snapshots.status, projectStatus(world.tick), statusEquals);
}
