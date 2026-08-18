/**
 * Route and haul commands. Phase-26 — ADR-036, ADR-010, ADR-011 §6.
 *
 * Four commands. Two are the player declaring intent (`addRoute`,
 * `removeRoute`); two are a worker acting on it (`haulPickup`, `haulDeliver`),
 * submitted through the same dispatcher the player uses — a worker has no
 * privileged write path (ADR-010 §6).
 *
 * The two haul commands are the endpoints of ADR-011 §6's rule: **the carrier
 * moves and the resource transfers at the endpoints.** Nothing here moves a
 * worker; movement is the movement system's, and these two are the moments
 * ownership changes.
 *
 * Both are ordinary conserving transfers — `transfer` removes exactly what it
 * adds — so no new conservation boundary is introduced and the property tests
 * that already exist cover them.
 */

import { appError, ErrorCode } from '../../shared/errors';
import {
  asBuildingId,
  asContentId,
  isContentId,
  type BuildingId,
  type ContentId,
  type WorkerId,
} from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';
import { containerCount, transfer } from '../world/container';
import { giveTo, takeFrom } from '../world/endpoints';
import { asRouteId, type RouteId } from '../world/route';

import type { CommandDispatcher } from './dispatcher';
import type { CommandWorld, ValidationResult } from './types';

function stackSizeOf(world: CommandWorld, item: ContentId): number {
  const definition = world.itemRegistry.get(item);
  return definition.ok ? definition.value.stackSize : 1;
}

/**
 * Checks a route may be declared.
 *
 * A route to itself is refused: it would be a worker walking to a building,
 * taking goods out of one container and putting them into another container of
 * the same building forever. Legal by every other rule here, and obviously not
 * what anybody meant.
 */
export function validateAddRoute(
  world: CommandWorld,
  from: BuildingId,
  to: BuildingId,
  item: ContentId,
): ValidationResult {
  if (from === to) {
    return err(appError(ErrorCode.InvalidIntent, 'a route must have two ends', { from }));
  }
  if (!world.buildings.has(from)) {
    return err(appError(ErrorCode.InvalidIntent, 'no such source building', { from }));
  }
  if (!world.buildings.has(to)) {
    return err(appError(ErrorCode.InvalidIntent, 'no such destination building', { to }));
  }
  if (!world.itemRegistry.has(item)) {
    return err(appError(ErrorCode.UnknownContent, 'unknown item', { item }));
  }
  // An endpoint that offers no container can never serve the route. Refused
  // here, where the player is told, rather than silently never running — which
  // to a player is a route that does nothing.
  if (takeFrom(world, from) === null) {
    return err(appError(ErrorCode.InvalidIntent, 'nothing can be taken from there', { from }));
  }
  if (giveTo(world, to) === null) {
    return err(appError(ErrorCode.InvalidIntent, 'nothing can be given there', { to }));
  }
  return ok();
}

export function addRoute(
  world: CommandWorld,
  from: BuildingId,
  to: BuildingId,
  item: ContentId,
): Result<void> {
  const validation = validateAddRoute(world, from, to, item);
  if (!validation.ok) return validation;

  const id = asRouteId(world.ids.allocate('route'));
  world.routes.set(id, { id, from, to, item });
  return ok();
}

/**
 * Removes a route.
 *
 * Workers part-way through it are NOT interrupted here, and that is deliberate:
 * a carried load whose route vanished is handled by discovery answering null,
 * after which the ordinary deposit path puts the goods into storage. Cancelling
 * mid-journey from this side would have to decide where the goods go, which is
 * a decision the worker is already able to make for itself.
 */
export function removeRoute(world: CommandWorld, route: RouteId): Result<void> {
  if (!world.routes.has(route)) {
    return err(appError(ErrorCode.InvalidIntent, 'no such route', { route }));
  }
  world.routes.delete(route);
  return ok();
}

/** Checks a pickup can happen: the worker is at the source and goods are there. */
export function validateHaulPickup(
  world: CommandWorld,
  worker: WorkerId,
  route: RouteId,
): ValidationResult {
  const hauler = world.workers.get(worker);
  if (hauler === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker }));
  }
  const declared = world.routes.get(route);
  if (declared === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such route', { route }));
  }
  const from = takeFrom(world, declared.from);
  if (from === null) {
    return err(appError(ErrorCode.InvalidIntent, 'the source is gone', { route }));
  }
  if (containerCount(from, declared.item) <= 0) {
    return err(appError(ErrorCode.InvalidIntent, 'nothing left to collect', { route }));
  }
  return ok();
}

/**
 * Collects up to a worker's remaining capacity from the route's source.
 *
 * Takes what is THERE rather than what was claimed: between claiming and
 * arriving, a factory may have consumed some of it. Moving less is correct and
 * the worker delivers what it got; failing the whole haul because the number
 * changed would strand a chain over an ordinary race.
 */
export function haulPickup(world: CommandWorld, worker: WorkerId, route: RouteId): Result<void> {
  const validation = validateHaulPickup(world, worker, route);
  if (!validation.ok) return validation;

  const hauler = world.workers.get(worker);
  const declared = world.routes.get(route);
  if (hauler === undefined || declared === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker or route', { worker, route }));
  }
  const from = takeFrom(world, declared.from);
  if (from === null) {
    return err(appError(ErrorCode.InvalidIntent, 'the source is gone', { route }));
  }

  const moved = transfer(
    from,
    hauler.carrying,
    declared.item,
    containerCount(from, declared.item),
    stackSizeOf(world, declared.item),
  );
  // Nothing moved: the hold was full or the goods went. Leaving `hauling` unset
  // keeps the worker free to do something else rather than walking a delivery
  // leg with an empty hold.
  if (moved.moved <= 0) {
    return err(appError(ErrorCode.InvalidIntent, 'collected nothing', { route }));
  }

  hauler.hauling = route;
  return ok();
}

/**
 * Delivers a hauled load into the route's destination.
 *
 * `hauling` is cleared whatever happens — including a destination that has
 * filled since the claim. The undelivered remainder stays in the hold and the
 * worker's ordinary deposit path puts it in storage: goods are never destroyed
 * (ADR-011 §7), and a worker is never left permanently bound to a route it
 * cannot complete, which would be the jam ADR-036 §5 exists to prevent.
 */
export function haulDeliver(world: CommandWorld, worker: WorkerId, route: RouteId): Result<void> {
  const hauler = world.workers.get(worker);
  if (hauler === undefined) {
    return err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker }));
  }

  const declared = world.routes.get(route);
  const to = declared === undefined ? null : giveTo(world, declared.to);
  if (declared === undefined || to === null) {
    hauler.hauling = null; // the route or its destination vanished mid-journey
    return err(appError(ErrorCode.InvalidIntent, 'the destination is gone', { route }));
  }

  transfer(
    hauler.carrying,
    to,
    declared.item,
    containerCount(hauler.carrying, declared.item),
    stackSizeOf(world, declared.item),
  );

  hauler.hauling = null;
  return ok();
}

/** Parses a raw building field (untrusted input, ADR-010 §5). */
function toBuilding(building: number): Result<BuildingId> {
  if (!Number.isSafeInteger(building) || building < 1) {
    return err(appError(ErrorCode.InvalidIntent, 'malformed building id', { building }));
  }
  return ok(asBuildingId(building));
}

function toItem(item: string): Result<ContentId> {
  if (!isContentId(item)) {
    return err(appError(ErrorCode.UnknownContent, 'malformed item id', { item }));
  }
  return ok(asContentId(item));
}

function toRoute(route: number): Result<RouteId> {
  if (!Number.isSafeInteger(route) || route < 1) {
    return err(appError(ErrorCode.InvalidIntent, 'malformed route id', { route }));
  }
  return ok(asRouteId(route));
}

export function registerHaulCommands(dispatcher: CommandDispatcher): void {
  dispatcher.register('addRoute', {
    validate: (world, command) => {
      const from = toBuilding(command.from);
      if (!from.ok) return from;
      const to = toBuilding(command.to);
      if (!to.ok) return to;
      const item = toItem(command.item);
      return item.ok ? validateAddRoute(world, from.value, to.value, item.value) : item;
    },
    execute: (context, command) => {
      const from = toBuilding(command.from);
      if (!from.ok) return from;
      const to = toBuilding(command.to);
      if (!to.ok) return to;
      const item = toItem(command.item);
      return item.ok ? addRoute(context.world, from.value, to.value, item.value) : item;
    },
  });

  dispatcher.register('removeRoute', {
    validate: (world, command) => {
      const route = toRoute(command.route);
      if (!route.ok) return route;
      return world.routes.has(route.value)
        ? ok()
        : err(appError(ErrorCode.InvalidIntent, 'no such route', { route: command.route }));
    },
    execute: (context, command) => {
      const route = toRoute(command.route);
      return route.ok ? removeRoute(context.world, route.value) : route;
    },
  });

  dispatcher.register('haulPickup', {
    validate: (world, command) => {
      const route = toRoute(command.route);
      if (!route.ok) return route;
      return validateHaulPickup(world, command.worker as WorkerId, route.value);
    },
    execute: (context, command) => {
      const route = toRoute(command.route);
      return route.ok ? haulPickup(context.world, command.worker as WorkerId, route.value) : route;
    },
  });

  dispatcher.register('haulDeliver', {
    validate: (world, command) => {
      const route = toRoute(command.route);
      if (!route.ok) return route;
      return world.workers.has(command.worker as WorkerId)
        ? ok()
        : err(appError(ErrorCode.InvalidIntent, 'no such worker', { worker: command.worker }));
    },
    execute: (context, command) => {
      const route = toRoute(command.route);
      return route.ok ? haulDeliver(context.world, command.worker as WorkerId, route.value) : route;
    },
  });
}
