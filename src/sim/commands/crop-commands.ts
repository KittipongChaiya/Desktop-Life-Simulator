/**
 * Crop commands. Phase-03.
 *
 * Commands VALIDATE then MUTATE then PUBLISH, in that order. Validation
 * failures return a typed error and leave the world byte-identical — a rejected
 * command must never half-apply (ARCHITECTURE.md §4.1).
 *
 * Events are published, not dispatched: subscribers run in `postUpdate` during
 * `eventFlush`, never inline (ADR-008 §1).
 */

import { appError, ErrorCode } from '../../shared/errors';
import type { ContentId, TileIndex } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { isMature } from '../content/crops';
import { elapsedTicks } from '../world/crop';
import { isOwned } from '../world/tile-grid';
import { isTilled } from '../world/tile-state';
import type { World } from '../world/world';

/**
 * Plants a crop on a tile.
 *
 * Rejects: unknown crop, tile outside the owned plot, untilled tile, occupied
 * tile. Checked in that order so the most specific cause is reported.
 */
export function plantCrop(world: World, tile: TileIndex, cropId: ContentId): Result<void> {
  const definition = world.cropRegistry.get(cropId);
  if (!definition.ok) return err(definition.error);

  if (!isOwned(world.tiles, tile)) {
    return err(appError(ErrorCode.TileNotOwned, 'tile is outside the owned plot', { tile }));
  }

  if (!isTilled(world.tiles, tile)) {
    return err(appError(ErrorCode.TileWrongKind, 'tile is not tilled', { tile }));
  }

  if (world.crops.has(tile)) {
    return err(appError(ErrorCode.TileWrongKind, 'tile already has a crop', { tile }));
  }

  world.crops.set(tile, { cropId, tile, plantedTick: world.tick });
  world.events.publish('cropPlanted', { tile, cropId, plantedTick: world.tick });
  return ok();
}

/**
 * Harvests a mature crop.
 *
 * Rejects: no crop, crop not yet mature. Yields are reported on the event; who
 * receives them is inventory's problem in phase-05, and harvest deliberately
 * does not know.
 */
export function harvestCrop(world: World, tile: TileIndex): Result<void> {
  const crop = world.crops.get(tile);
  if (crop === undefined) {
    return err(appError(ErrorCode.UnknownContent, 'no crop on tile', { tile }));
  }

  const definition = world.cropRegistry.get(crop.cropId);
  if (!definition.ok) return err(definition.error);

  if (!isMature(definition.value, elapsedTicks(crop, world.tick))) {
    return err(appError(ErrorCode.InvalidIntent, 'crop is not ready to harvest', { tile }));
  }

  world.crops.delete(tile);
  world.events.publish('cropHarvested', {
    tile,
    cropId: crop.cropId,
    yields: definition.value.harvestYield.map((stack) => ({
      item: stack.item,
      quantity: stack.quantity,
    })),
  });
  return ok();
}

/** Tills an owned tile so it can be planted. */
export function tillTile(world: World, tile: TileIndex): Result<void> {
  if (!isOwned(world.tiles, tile)) {
    return err(appError(ErrorCode.TileNotOwned, 'tile is outside the owned plot', { tile }));
  }
  if (isTilled(world.tiles, tile)) {
    return err(appError(ErrorCode.TileWrongKind, 'tile is already tilled', { tile }));
  }

  // Clamped to 1: `tilledAt === 0` MEANS "never tilled", and a world begins at
  // tick 0, so tilling before the first tick would otherwise record 0 and read
  // back as untilled. Found by the first plant test.
  world.tiles.tilledAt[tile] = Math.max(1, world.tick);
  return ok();
}
