/**
 * Building commands. Phase-05 + 06c, ADR-011, GAME_DESIGN.md §5.2.
 *
 * `placeBuilding` validates the tile (owned, walkable, empty) AND the wallet
 * (06c — cost is a real sink now), records the building, and — the
 * load-bearing part — marks the tile `blocked` so it leaves the walkability
 * model correct for pathfinding without pathfinding ever inspecting buildings
 * (ADR-011). A storing building gets a container in the side-table.
 *
 * `sellBuilding` refunds exactly 50% of cost (§5.2). A storing building sells
 * only once its container is empty: the refund must never destroy stored goods
 * (ADR-011 §7 — never discard; ADR-013 — losses never destroy value).
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isValidIndex } from '../../shared/geometry';
import {
  asBuildingId,
  asContentId,
  asTileIndex,
  isContentId,
  type BuildingId,
  type ContentId,
  type TileIndex,
} from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { DEFAULT_FACTORY_SLOTS, footprintOf } from '../content/buildings';
import { footprintTiles } from '../content/footprint';
import { containerTotal, createContainer } from '../world/container';
import { createFactoryState } from '../world/factory';
import { getKind, isBlocked, isOwned, setBlocked } from '../world/tile-grid';
import { addCoins, spendCoins } from '../world/wallet';

import type { CommandDispatcher } from './dispatcher';
import { isFactoryKind } from './factory-commands';
import type { CommandWorld, ValidationResult } from './types';

/**
 * Checks a placement is legal.
 *
 * Rejects: unknown building, tile outside the owned plot, non-walkable terrain
 * (water/stone), a tile already holding a building, a tile with a crop, or —
 * since 06c — an unaffordable cost.
 */
export function validatePlacement(
  world: CommandWorld,
  tile: TileIndex,
  buildingId: ContentId,
): ValidationResult {
  const definition = world.buildingRegistry.get(buildingId);
  if (!definition.ok) return err(definition.error);

  // The town's buildings are founded, never bought (ADR-030 §4).
  if (definition.value.playerPlaceable === false) {
    return err(appError(ErrorCode.InvalidIntent, 'this building cannot be placed', { buildingId }));
  }

  // EVERY tile the building would stand on, not just the one clicked
  // (phase-41 — ADR-042 §3). A 3x2 house refused on its origin tile and
  // accepted over a pond is the bug this loop exists to prevent.
  const tiles = footprintTiles(tile, footprintOf(definition.value));
  if (tiles === null) {
    return err(
      appError(ErrorCode.TileWrongKind, 'building does not fit inside the world', { tile }),
    );
  }

  for (const covered of tiles) {
    if (!isOwned(world.tiles, covered)) {
      return err(
        appError(ErrorCode.TileNotOwned, 'building would reach outside the owned plot', {
          tile: covered,
        }),
      );
    }

    const kind = world.tileKinds.byIndex(getKind(world.tiles, covered));
    if (kind === undefined || !kind.walkable) {
      return err(
        appError(ErrorCode.TileWrongKind, 'building needs walkable land', { tile: covered }),
      );
    }

    if (isBlocked(world.tiles, covered)) {
      return err(
        appError(ErrorCode.TileWrongKind, 'tile already has a building', { tile: covered }),
      );
    }

    if (world.crops.has(covered)) {
      return err(appError(ErrorCode.TileWrongKind, 'tile has a crop', { tile: covered }));
    }
  }

  if (world.wallet.coins < definition.value.cost) {
    return err(
      appError(ErrorCode.InsufficientFunds, 'not enough coins for this building', {
        buildingId,
        cost: definition.value.cost,
        held: world.wallet.coins,
      }),
    );
  }

  return ok();
}

/**
 * Places a building: charges its cost (06c — the one-time sink, §6.4),
 * records it, blocks its tile, and — if it stores — opens a container for it
 * in the side-table (ADR-011).
 */
export function placeBuilding(
  world: CommandWorld,
  tile: TileIndex,
  buildingId: ContentId,
): Result<void> {
  const validation = validatePlacement(world, tile, buildingId);
  if (!validation.ok) return validation;

  const definition = world.buildingRegistry.get(buildingId);
  if (!definition.ok) return err(definition.error); // unreachable — validated above

  const spend = spendCoins(world.wallet, definition.value.cost);
  if (!spend.ok) return spend; // unreachable — funds validated above

  const id = world.ids.allocateBuilding();
  world.buildings.set(id, { id, tile, buildingId });
  // Buildings contribute to walkability in the tile model (ADR-011), across
  // their whole footprint (phase-41). Re-derived rather than reusing the
  // validated list, so occupancy can never disagree with the definition.
  for (const covered of footprintTiles(tile, footprintOf(definition.value)) ?? [tile]) {
    setBlocked(world.tiles, covered, true);
  }

  if (definition.value.storageSlots !== undefined) {
    world.buildingStorage.set(id, createContainer(definition.value.storageSlots));
  }

  // A building is a factory because a recipe NAMES it (ADR-035 §1) — there is
  // no flag to read. Its two containers go in `world.factories`, deliberately
  // NOT in `buildingStorage`: that map is what `selectStorageTarget` scans, so
  // a mill listed there would have workers deposit whatever they were carrying
  // into its input buffer and starve the recipe (ADR-035 §2).
  if (isFactoryKind(world.recipeRegistry, buildingId)) {
    const slots = definition.value.factorySlots ?? DEFAULT_FACTORY_SLOTS;
    world.factories.set(id, createFactoryState(slots.input, slots.output));
  }
  return ok();
}

/**
 * Checks a building sale is legal. Rejects: unknown building, or a storing
 * building whose container still holds goods (never destroy value — the goods
 * wait, exactly like a blocked harvest, ADR-011 §7).
 */
export function validateSellBuilding(world: CommandWorld, building: BuildingId): ValidationResult {
  const placed = world.buildings.get(building);
  if (placed === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such building', { building }));
  }

  // Only a building on OWNED land is the player's to sell. Every farm
  // building stands on owned tiles, so this restricts nothing that was
  // possible — it closes the town's buildings to the refund path, which is
  // what makes `foundTown`'s guard sound (ADR-030 §3).
  if (!isOwned(world.tiles, placed.tile)) {
    return err(appError(ErrorCode.TileNotOwned, 'not the player’s building to sell', { building }));
  }

  const storage = world.buildingStorage.get(building);
  if (storage !== undefined && containerTotal(storage) > 0) {
    return err(appError(ErrorCode.InvalidIntent, 'building storage is not empty', { building }));
  }

  // A factory's two containers are the same promise as a shed's one: goods
  // wait, they are never destroyed (ADR-011 §7). A mill mid-craft is the case
  // a player would actually hit, and selling it out from under a running
  // craft is exactly the value destruction `GAME_DESIGN.md` §12 rule 4 forbids.
  const factory = world.factories.get(building);
  if (factory !== undefined && containerTotal(factory.input) + containerTotal(factory.output) > 0) {
    return err(appError(ErrorCode.InvalidIntent, 'factory still holds goods', { building }));
  }

  return ok();
}

/**
 * Sells a building for 50% of its cost (§5.2): refunds the wallet, unblocks
 * the tile, and removes the building and its (empty) container.
 */
export function sellBuilding(world: CommandWorld, building: BuildingId): Result<void> {
  const validation = validateSellBuilding(world, building);
  if (!validation.ok) return validation;

  const placed = world.buildings.get(building);
  const definition =
    placed === undefined ? undefined : world.buildingRegistry.get(placed.buildingId);
  if (placed === undefined || definition === undefined || !definition.ok) {
    // Unreachable — validated above; handled over asserted (`CODE_STYLE.md` §1.2).
    return err(appError(ErrorCode.InvalidIntent, 'no such building', { building }));
  }

  const refund = addCoins(world.wallet, Math.floor(definition.value.cost * 0.5));
  if (!refund.ok) return refund; // unreachable — floor of a positive cost is a valid amount

  world.buildings.delete(building);
  world.buildingStorage.delete(building);
  world.factories.delete(building);

  // Clear this building's whole footprint, then put back any tile another
  // building still stands on (phase-41). Footprints can overlap in a save
  // written before v0.5 gave buildings a size — ADR-042 §4 keeps such a save
  // loadable rather than repairing it — and selling one of the pair must not
  // punch a walkable hole through the other.
  const cleared = footprintTiles(placed.tile, footprintOf(definition.value)) ?? [placed.tile];
  for (const covered of cleared) setBlocked(world.tiles, covered, false);

  const stillCovered = new Set<number>();
  for (const other of world.buildings.values()) {
    const otherDefinition = world.buildingRegistry.get(other.buildingId);
    if (!otherDefinition.ok) continue;
    for (const covered of footprintTiles(other.tile, footprintOf(otherDefinition.value)) ?? []) {
      stillCovered.add(covered);
    }
  }
  for (const covered of cleared) {
    if (stillCovered.has(covered)) setBlocked(world.tiles, covered, true);
  }
  return ok();
}

/** Parses a raw command field into a tile index (untrusted input, ADR-010 §5). */
function toTile(tile: number): Result<TileIndex> {
  if (!isValidIndex(tile)) {
    return err(appError(ErrorCode.TileOutOfBounds, 'tile index is outside the world', { tile }));
  }
  return ok(asTileIndex(tile));
}

/** Parses a raw command field into a content id. */
function toBuildingId(buildingId: string): Result<ContentId> {
  if (!isContentId(buildingId)) {
    return err(appError(ErrorCode.UnknownContent, 'malformed building id', { buildingId }));
  }
  return ok(asContentId(buildingId));
}

/** Parses a raw command field into a building id (untrusted input, ADR-010 §5). */
function toPlacedBuildingId(building: number): Result<BuildingId> {
  if (!Number.isSafeInteger(building) || building < 1) {
    return err(appError(ErrorCode.InvalidIntent, 'malformed building id', { building }));
  }
  return ok(asBuildingId(building));
}

export function registerBuildingCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('placeBuilding', {
    validate: (world, command) => {
      const tile = toTile(command.tile);
      if (!tile.ok) return tile;
      const buildingId = toBuildingId(command.buildingId);
      return buildingId.ok ? validatePlacement(world, tile.value, buildingId.value) : buildingId;
    },
    execute: (context, command) => {
      const tile = toTile(command.tile);
      if (!tile.ok) return tile;
      const buildingId = toBuildingId(command.buildingId);
      return buildingId.ok
        ? placeBuilding(context.world, tile.value, buildingId.value)
        : buildingId;
    },
  });

  dispatcher.register('sellBuilding', {
    validate: (world, command) => {
      const building = toPlacedBuildingId(command.building);
      return building.ok ? validateSellBuilding(world, building.value) : building;
    },
    execute: (context, command) => {
      const building = toPlacedBuildingId(command.building);
      return building.ok ? sellBuilding(context.world, building.value) : building;
    },
  });
}
