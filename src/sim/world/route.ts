/**
 * Routes — standing instructions to move one item between two buildings.
 * Phase-26, ADR-036 §2.
 *
 * A route is the PLAYER's, never inferred. A system that guessed routes from
 * recipes would move goods nobody asked to move, and the first surprising
 * delivery would be unexplainable.
 *
 * Deliberately four fields. A filter, a priority, a rate limit and a threshold
 * are each a real want and each can be added as a field later; shipping them
 * before a single chain has run would be the speculative generality
 * `AI_RULES.md` §1.5 forbids (ADR-036 §2).
 */

import type { BuildingId, ContentId } from '../../shared/ids';

/** A branded route id — monotonic, never reused (ADR-004). */
export type RouteId = number & { readonly __brand: 'RouteId' };

export const asRouteId = (value: number): RouteId => value as RouteId;

export interface Route {
  readonly id: RouteId;
  /** Where goods are taken FROM. Its factory output, or its storage. */
  readonly from: BuildingId;
  /** Where goods are taken TO. Its factory input, or its storage. */
  readonly to: BuildingId;
  readonly item: ContentId;
}

/** Sparse store keyed by route id, in insertion order. */
export type RouteStore = Map<RouteId, Route>;

export function createRouteStore(): RouteStore {
  return new Map();
}

/** Routes in ascending id order — the deterministic scan order. */
export function routesInOrder(routes: RouteStore): readonly Route[] {
  return [...routes.values()].sort((a, b) => a.id - b.id);
}
