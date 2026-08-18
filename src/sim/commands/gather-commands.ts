/**
 * The gather command. Phase-27 — ADR-037 §4, ADR-011 §4.
 *
 * Working a node is a declared SOURCE: quantity enters the world here, exactly
 * as it does at a crop harvest, and lands straight in the actor's carry hold
 * (ADR-011 §5 — never a world entity to be walked to and picked up). It reaches
 * storage through the deposit path that already exists, so nothing new touches
 * conservation.
 *
 * Two failures are refused rather than half-applied:
 *
 * - **A node that is not ready.** Regrowth is derived, so "not ready" is a
 *   comparison the command re-runs at execution time — the world can change
 *   between a worker deciding and arriving, and a second worker may have
 *   reached it first.
 * - **A hold with no room.** The yield stays in the ground rather than being
 *   silently dropped (ADR-011 §7). The node is NOT marked worked, so nothing
 *   is lost and the worker simply tries again with a lighter hold.
 */

import { WILDS_MIN_X } from '../../shared/constants';
import { appError, ErrorCode } from '../../shared/errors';
import { isValidIndex, toPosition } from '../../shared/geometry';
import { asTileIndex, type TileIndex, type WorkerId } from '../../shared/ids';
import { err, ok, unwrap, type Result } from '../../shared/result';
import { isNodeReady, nodeAt } from '../content/resource-nodes';
import { acceptable, addItems } from '../world/container';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

/** Checks a node can be worked right now by this worker. */
export function validateGatherNode(
  world: CommandWorld,
  worker: WorkerId,
  tile: TileIndex,
): ValidationResult {
  const gatherer = world.workers.get(worker);
  if (gatherer === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker }));
  }

  // THE REGION CHECK, and it belongs here rather than in `nodeAt`.
  //
  // `nodeAt` is a pure hash over (seed, tile) and answers for ANY tile —
  // ADR-037 §5 says so deliberately, because the region boundary is geometry
  // and duplicating it inside the hash would be a second place it is defined.
  // The consequence is that the caller owns the check, and the command
  // boundary is the caller that faces untrusted input (ADR-010 §5).
  //
  // Found by a test: without this, `nodeAt` reports a node on farm tiles too,
  // and a worker could have "gathered" the middle of the plot.
  if (unwrap(toPosition(tile)).x < WILDS_MIN_X) {
    return err(appError(ErrorCode.InvalidIntent, 'that tile is not in the wilds', { tile }));
  }

  const node = nodeAt(world.resourceNodeRegistry, world.seed, tile);
  if (node === null) {
    return err(appError(ErrorCode.InvalidIntent, 'nothing to gather here', { tile }));
  }
  if (!isNodeReady(node, world.harvestedAt.get(tile), world.tick)) {
    return err(appError(ErrorCode.InvalidIntent, 'this node has not regrown', { tile }));
  }

  // Every yield must fit, or none is taken — the same all-or-nothing rule a
  // craft follows (ADR-035 Rule A). A half-taken node would have to decide
  // whether it counts as worked, and either answer is wrong.
  for (const stack of node.yields) {
    const definition = world.itemRegistry.get(stack.item);
    const stackSize = definition.ok ? definition.value.stackSize : 1;
    if (acceptable(gatherer.carrying, stack.item, stackSize) < stack.quantity) {
      return err(
        appError(ErrorCode.InvalidIntent, 'the hold cannot take this yield', {
          tile,
          item: stack.item,
        }),
      );
    }
  }

  return ok();
}

/**
 * Works the node: its yield enters the world in the actor's hold, and the tile
 * is stamped with the tick so regrowth can be derived from it.
 */
export function gatherNode(world: CommandWorld, worker: WorkerId, tile: TileIndex): Result<void> {
  const validation = validateGatherNode(world, worker, tile);
  if (!validation.ok) return validation;

  const gatherer = world.workers.get(worker);
  const node = nodeAt(world.resourceNodeRegistry, world.seed, tile);
  if (gatherer === undefined || node === null) {
    // Unreachable — validated above; handled over asserted (`CODE_STYLE.md` §1.2).
    return err(appError(ErrorCode.InvalidIntent, 'nothing to gather here', { tile }));
  }

  for (const stack of node.yields) {
    const definition = world.itemRegistry.get(stack.item);
    const stackSize = definition.ok ? definition.value.stackSize : 1;
    addItems(gatherer.carrying, stack.item, stack.quantity, stackSize);
  }

  world.harvestedAt.set(tile, world.tick);
  return ok();
}

/**
 * Drops entries whose node has regrown.
 *
 * `harvestedAt` is the wilds' only stored state, and without this it would grow
 * by one entry per gather for ever — a map that scales with PLAYTIME rather
 * than world size, which `SAVE_FORMAT.md` §3.4 names as the hazard. An expired
 * entry carries no information: absent and long-past mean the same thing to
 * `isNodeReady`.
 */
export function pruneHarvested(world: CommandWorld): void {
  for (const [tile, at] of world.harvestedAt) {
    const node = nodeAt(world.resourceNodeRegistry, world.seed, tile);
    // A tile whose kind vanished (an uninstalled source) is pruned too: it can
    // never be gathered again, so the entry is dead weight.
    if (node === null || isNodeReady(node, at, world.tick)) world.harvestedAt.delete(tile);
  }
}

/** Parses a raw tile field (untrusted input, ADR-010 §5). */
function toTile(tile: number): Result<TileIndex> {
  if (!isValidIndex(tile)) {
    return err(appError(ErrorCode.TileOutOfBounds, 'tile index is outside the world', { tile }));
  }
  return ok(asTileIndex(tile));
}

export function registerGatherCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('gatherNode', {
    validate: (world, command) => {
      const tile = toTile(command.tile);
      return tile.ok ? validateGatherNode(world, command.worker as WorkerId, tile.value) : tile;
    },
    execute: (context, command) => {
      const tile = toTile(command.tile);
      return tile.ok ? gatherNode(context.world, command.worker as WorkerId, tile.value) : tile;
    },
  });
}
