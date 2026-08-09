/**
 * v4 → v5: `moisture` out, `wateredAt` in, and the weather period frozen.
 * ADR-022 §3, ADR-027 §3.
 *
 * **The first REMOVAL in the chain**, and the reason it is safe is worth
 * stating rather than assuming: `grid.moisture` was persisted from version 1,
 * serialized, validated, and **read by nothing**. It was written for a moisture
 * model ADR-009 deferred and never built, and the v0.2 architecture review found
 * it dead. So this drops an array of zeros rather than discarding player value.
 *
 * That distinction is the whole test for a removal. A field nobody reads can go;
 * a field somebody reads needs a successor decision, not a migration.
 *
 * ## The replacement is a different SHAPE, not a renamed field
 *
 * `moisture` was a 0–100 level per tile — an accumulator, the exact shape
 * ADR-009 §2 spent phase-03 removing from crops. `wateredAt` is a recorded fact
 * with the same shape as `tilledAt`: a tick, or zero for never. Wetness is then
 * derived from it and the rainfall since (ADR-022 §3), so nothing accumulates
 * and offline needs no catch-up.
 *
 * Every tile migrates to `0` — never watered — which is exactly true: no v4
 * world could have watered anything, because there was nothing to water with.
 */

import { DEFAULT_TICKS_PER_WEATHER_PERIOD } from '../../shared/constants';
import { encodeUint32 } from '../base64';
import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const v4ToV5: Migration = {
  from: 4,
  to: 5,
  describe: "replace the grid's dead moisture with wateredAt, and freeze the weather period (v5)",

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    const grid = isRecord(world['grid']) ? world['grid'] : {};

    const width = typeof grid['width'] === 'number' ? grid['width'] : 0;
    const height = typeof grid['height'] === 'number' ? grid['height'] : 0;
    // Sized from the document's own grid rather than the current world
    // constants: a migration describes the save it is handed, and a future
    // world size must not retro-resize an old one.
    const wateredAt = encodeUint32(new Uint32Array(Math.max(0, width * height)));

    // Dropped by NAME, so the removal is a statement rather than an omission.
    const keptGrid = Object.fromEntries(
      Object.entries(grid).filter(([field]) => field !== 'moisture'),
    );

    return {
      ...document,
      schemaVersion: 5,
      world: {
        ...world,
        ticksPerWeatherPeriod: DEFAULT_TICKS_PER_WEATHER_PERIOD,
        grid: { ...keptGrid, wateredAt },
      },
    };
  },
};
