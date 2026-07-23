/**
 * Crop commands. Phase-03, made dispatchable in phase-03.5.
 *
 * Commands VALIDATE then MUTATE then PUBLISH, in that order. Validation
 * failures return a typed error and leave the world byte-identical — a rejected
 * command must never half-apply (ADR-010 §2).
 *
 * Events are published, not dispatched: subscribers run in `postUpdate` during
 * `eventFlush`, never inline (ADR-008 §1).
 *
 * The three exported mutators keep their phase-03 signatures and their
 * immediate semantics deliberately. They are the HANDLERS the dispatcher calls
 * (ADR-010 §Consequences); queuing is the dispatcher's job, not theirs, which
 * is what lets phase-03's behaviour and its tests stand unchanged.
 *
 * Each validator is separated from its mutator so the SAME check runs at
 * dispatch (pure, for immediate caller feedback) and again at execution (the
 * world may have changed in between — ADR-010 §3).
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isValidIndex } from '../../shared/geometry';
import {
  asTileIndex,
  asWorkerId,
  isContentId,
  type ContentId,
  type TileIndex,
} from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { isMature } from '../content/crops';
import { stackSizeOf } from '../content/items';
import {
  acceptable,
  addItems,
  containerCount,
  removeItems,
  type Container,
} from '../world/container';
import { elapsedTicks } from '../world/crop';
import { isOwned } from '../world/tile-grid';
import { isTilled } from '../world/tile-state';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

// ── Validators ───────────────────────────────────────────────────────────────

/**
 * Checks a plant is legal.
 *
 * Rejects: unknown crop, tile outside the owned plot, untilled tile, occupied
 * tile, no seed held. Checked in that order so the most specific cause is
 * reported.
 */
export function validatePlant(
  world: CommandWorld,
  tile: TileIndex,
  cropId: ContentId,
): ValidationResult {
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

  // Planting costs 1 seed (§8.1) drawn from the farm stock — the player
  // inventory, for player and worker plants alike (06b interpretation 2).
  if (containerCount(world.inventory, definition.value.seedItem) < 1) {
    return err(
      appError(ErrorCode.MissingItem, 'no seed for this crop', {
        cropId,
        seedItem: definition.value.seedItem,
      }),
    );
  }

  return ok();
}

/** Checks a harvest is legal. Rejects: no crop, crop not yet mature. */
export function validateHarvest(world: CommandWorld, tile: TileIndex): ValidationResult {
  const crop = world.crops.get(tile);
  if (crop === undefined) {
    return err(appError(ErrorCode.UnknownContent, 'no crop on tile', { tile }));
  }

  const definition = world.cropRegistry.get(crop.cropId);
  if (!definition.ok) return err(definition.error);

  if (!isMature(definition.value, elapsedTicks(crop, world.tick))) {
    return err(appError(ErrorCode.InvalidIntent, 'crop is not ready to harvest', { tile }));
  }

  return ok();
}

/** Checks a till is legal. Rejects: unowned tile, already-tilled tile. */
export function validateTill(world: CommandWorld, tile: TileIndex): ValidationResult {
  if (!isOwned(world.tiles, tile)) {
    return err(appError(ErrorCode.TileNotOwned, 'tile is outside the owned plot', { tile }));
  }
  if (isTilled(world.tiles, tile)) {
    return err(appError(ErrorCode.TileWrongKind, 'tile is already tilled', { tile }));
  }
  return ok();
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/** Plants a crop on a tile. Validates first; a rejection mutates nothing. */
export function plantCrop(world: CommandWorld, tile: TileIndex, cropId: ContentId): Result<void> {
  const validation = validatePlant(world, tile, cropId);
  if (!validation.ok) return validation;

  const definition = world.cropRegistry.get(cropId);
  if (!definition.ok) return err(definition.error); // unreachable — validated above

  // The seed leaves the inventory as the crop enters the ground — a CONVERSION
  // boundary (ADR-013): the item's quantity ends here, the planted crop begins.
  removeItems(world.inventory, definition.value.seedItem, 1); // validated — removes exactly

  world.crops.set(tile, { cropId, tile, plantedTick: world.tick });
  world.events.publish('cropPlanted', { tile, cropId, plantedTick: world.tick });
  return ok();
}

/**
 * Harvests a mature crop.
 *
 * Yields are reported on the event; who receives them is inventory's problem in
 * phase-05, and harvest deliberately does not know.
 */
export function harvestCrop(
  world: CommandWorld,
  tile: TileIndex,
  // A player harvest goes to the player inventory by default; a worker harvest
  // passes its own hold (via the registration, from `metadata.actor`).
  destination: Container = world.inventory,
): Result<void> {
  const validation = validateHarvest(world, tile);
  if (!validation.ok) return validation;

  const crop = world.crops.get(tile);
  const definition = crop === undefined ? undefined : world.cropRegistry.get(crop.cropId);
  if (crop === undefined || definition === undefined || !definition.ok) {
    // Unreachable — validateHarvest proved both exist. Handled rather than
    // asserted because a non-null assertion here would be a claim the compiler
    // cannot check (`CODE_STYLE.md` §1.2).
    return err(appError(ErrorCode.UnknownContent, 'no crop on tile', { tile }));
  }

  const yields = definition.value.harvestYield;
  // Block if the destination cannot hold the WHOLE yield — never a partial
  // harvest, never a discarded one (ADR-011 §7, crit 4). The crop stays put.
  for (const stack of yields) {
    const space = acceptable(destination, stack.item, stackSizeOf(world.itemRegistry, stack.item));
    if (space < stack.quantity) {
      return err(appError(ErrorCode.InventoryFull, 'no room to hold the harvest', { tile }));
    }
  }

  world.crops.delete(tile);
  for (const stack of yields) {
    // Harvest is a SOURCE (ADR-011 §4): quantity legitimately enters here.
    addItems(destination, stack.item, stack.quantity, stackSizeOf(world.itemRegistry, stack.item));
  }
  world.events.publish('cropHarvested', {
    tile,
    cropId: crop.cropId,
    yields: yields.map((stack) => ({ item: stack.item, quantity: stack.quantity })),
  });
  return ok();
}

/**
 * Where a harvest's yield goes: the harvesting worker's hold, or — for a player
 * harvest, which carries no actor — the player inventory (ADR-011 §5).
 */
function harvestDestination(world: CommandWorld, actor: number | undefined): Container | undefined {
  if (actor === undefined) return world.inventory;
  return world.workers.get(asWorkerId(actor))?.carrying;
}

/** Tills an owned tile so it can be planted. */
export function tillTile(world: CommandWorld, tile: TileIndex): Result<void> {
  const validation = validateTill(world, tile);
  if (!validation.ok) return validation;

  // Clamped to 1: `tilledAt === 0` MEANS "never tilled", and a world begins at
  // tick 0, so tilling before the first tick would otherwise record 0 and read
  // back as untilled. Found by the first plant test.
  world.tiles.tilledAt[tile] = Math.max(1, world.tick);
  return ok();
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Parses a raw command field into a tile index.
 *
 * Commands carry untrusted primitives (ADR-010 §5), so this is the boundary
 * where a replayed or malformed index becomes a typed rejection rather than an
 * out-of-range array write.
 */
function toTile(tile: number): Result<TileIndex> {
  if (!isValidIndex(tile)) {
    return err(appError(ErrorCode.TileOutOfBounds, 'tile index is outside the world', { tile }));
  }
  return ok(asTileIndex(tile));
}

/** Parses a raw command field into a content id. */
function toCropId(cropId: string): Result<ContentId> {
  if (!isContentId(cropId)) {
    return err(appError(ErrorCode.UnknownContent, 'malformed content id', { cropId }));
  }
  return ok(cropId);
}

/**
 * Registers the crop commands into a dispatcher.
 *
 * Explicit registration, called once per world — no decorator scanning and no
 * filesystem discovery (ADR-010 §8).
 */
export function registerCropCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('tillTile', {
    validate: (world, command) => {
      const tile = toTile(command.tile);
      return tile.ok ? validateTill(world, tile.value) : tile;
    },
    execute: (context, command) => {
      const tile = toTile(command.tile);
      return tile.ok ? tillTile(context.world, tile.value) : tile;
    },
  });

  dispatcher.register('plantCrop', {
    validate: (world, command) => {
      const tile = toTile(command.tile);
      if (!tile.ok) return tile;
      const cropId = toCropId(command.cropId);
      return cropId.ok ? validatePlant(world, tile.value, cropId.value) : cropId;
    },
    execute: (context, command) => {
      const tile = toTile(command.tile);
      if (!tile.ok) return tile;
      const cropId = toCropId(command.cropId);
      return cropId.ok ? plantCrop(context.world, tile.value, cropId.value) : cropId;
    },
  });

  dispatcher.register('harvestCrop', {
    validate: (world, command) => {
      const tile = toTile(command.tile);
      return tile.ok ? validateHarvest(world, tile.value) : tile;
    },
    execute: (context, command) => {
      const tile = toTile(command.tile);
      if (!tile.ok) return tile;
      const destination = harvestDestination(context.world, context.metadata.actor);
      if (destination === undefined) {
        return err(appError(ErrorCode.InvalidIntent, 'harvesting worker no longer exists', {}));
      }
      return harvestCrop(context.world, tile.value, destination);
    },
  });
}
