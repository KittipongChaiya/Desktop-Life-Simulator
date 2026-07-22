/**
 * Building commands. Phase-05, ADR-011, GAME_DESIGN.md §5.2.
 *
 * `placeBuilding` is the only building command in v0.1. It validates the tile
 * (owned, walkable, empty), records the building, and — the load-bearing part —
 * marks the tile `blocked` so it leaves the walkability model correct for
 * pathfinding without pathfinding ever inspecting buildings (ADR-011). A storing
 * building gets a container in the side-table.
 *
 * Cost is not charged: there is no wallet until phase-06. Selling a building and
 * the other three buildings arrive then too.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isValidIndex } from '../../shared/geometry';
import {
  asContentId,
  asTileIndex,
  isContentId,
  type ContentId,
  type TileIndex,
} from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { createContainer } from '../world/container';
import { getKind, isBlocked, isOwned, setBlocked } from '../world/tile-grid';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/**
 * Checks a placement is legal.
 *
 * Rejects: unknown building, tile outside the owned plot, non-walkable terrain
 * (water/stone), a tile already holding a building, or a tile with a crop.
 */
export function validatePlacement(
  world: CommandWorld,
  tile: TileIndex,
  buildingId: ContentId,
): ValidationResult {
  const definition = world.buildingRegistry.get(buildingId);
  if (!definition.ok) return err(definition.error);

  if (!isOwned(world.tiles, tile)) {
    return err(appError(ErrorCode.TileNotOwned, 'tile is outside the owned plot', { tile }));
  }

  const kind = world.tileKinds.byIndex(getKind(world.tiles, tile));
  if (kind === undefined || !kind.walkable) {
    return err(appError(ErrorCode.TileWrongKind, 'building needs walkable land', { tile }));
  }

  if (isBlocked(world.tiles, tile)) {
    return err(appError(ErrorCode.TileWrongKind, 'tile already has a building', { tile }));
  }

  if (world.crops.has(tile)) {
    return err(appError(ErrorCode.TileWrongKind, 'tile has a crop', { tile }));
  }

  return ok();
}

/**
 * Places a building: records it, blocks its tile, and — if it stores — opens a
 * container for it in the side-table (ADR-011).
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

  const id = world.ids.allocateBuilding();
  world.buildings.set(id, { id, tile, buildingId });
  // Buildings contribute to walkability in the tile model (ADR-011).
  setBlocked(world.tiles, tile, true);

  if (definition.value.storageSlots !== undefined) {
    world.buildingStorage.set(id, createContainer(definition.value.storageSlots));
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
}
