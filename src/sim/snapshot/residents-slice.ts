/**
 * Resident snapshot projection. Phase-19 — ADR-031 §4.
 *
 * The sim→view boundary for the village's people. Everything here is DERIVED
 * — `residentsAt` is a pure function of (content, seed, tick), so this
 * projection stores nothing and reads no store. Indoors residents are simply
 * absent: at night the slice is an empty array, `residentsEqual` says nothing
 * changed, and the sleeping town publishes nothing (ADR-005 §2's rule,
 * honoured by construction).
 *
 * Republish cadence mirrors the workers slice: every tick while someone is
 * walking (their fraction genuinely changes), and never while the whole
 * village stands still or sleeps.
 */

import { toIndexUnchecked } from '../../shared/geometry';
import { residentsAt, type ResidentClock } from '../town/residents';

import { Direction } from './workers-slice';

/** One resident, projected for rendering. Plain, immutable data. */
export interface ResidentView {
  readonly id: string;
  readonly name: string;
  /** Which villager costume sprite set draws this resident. */
  readonly costume: string;
  /** Current tile. */
  readonly tile: number;
  /** Tile being entered while walking; equal to `tile` when standing. */
  readonly toTile: number;
  /** Progress 0–1 from `tile` to `toTile`; 0 when standing. */
  readonly moveFraction: number;
  readonly facing: Direction;
}

/** What the projection reads. `World` satisfies this structurally. */
export type ResidentProjectionSource = ResidentClock & { readonly tick: number };

export function projectResidents(source: ResidentProjectionSource): readonly ResidentView[] {
  const views: ResidentView[] = [];
  for (const moment of residentsAt(source, source.tick)) {
    if (moment.indoors) continue;

    const walking = moment.tile.x !== moment.toTile.x || moment.tile.y !== moment.toTile.y;
    const facing = !walking
      ? Direction.South
      : moment.toTile.y < moment.tile.y
        ? Direction.North
        : moment.toTile.y > moment.tile.y
          ? Direction.South
          : moment.toTile.x > moment.tile.x
            ? Direction.East
            : Direction.West;

    views.push({
      id: moment.definition.id,
      name: moment.definition.displayName,
      costume: moment.definition.costume,
      tile: toIndexUnchecked(moment.tile.x, moment.tile.y),
      toTile: toIndexUnchecked(moment.toTile.x, moment.toTile.y),
      moveFraction: moment.moveFraction,
      facing,
    });
  }
  return views;
}

export function residentsEqual(a: readonly ResidentView[], b: readonly ResidentView[]): boolean {
  if (a.length !== b.length) return false;
  for (const [index, view] of a.entries()) {
    const other = b[index];
    if (
      other === undefined ||
      view.id !== other.id ||
      view.tile !== other.tile ||
      view.toTile !== other.toTile ||
      view.moveFraction !== other.moveFraction ||
      view.facing !== other.facing
    ) {
      return false;
    }
  }
  return true;
}
