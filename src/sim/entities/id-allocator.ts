/**
 * Deterministic entity ID allocation. ADR-004 §Consequences.
 *
 * THIS IS AN ID ALLOCATOR, NOT AN ENTITY REGISTRY.
 *
 * It allocates and tracks globally unique, serializable identifiers. It does
 * NOT store entities. Each system owns its own typed store — `crops` keyed by
 * tile, `workers` keyed by `WorkerId` — exactly as ADR-004 decided, having
 * explicitly rejected "uniform generic entity bags" as a design that discards
 * type safety in the one module where correctness matters most.
 *
 * If a future change makes this hold entity data, that is the generic bag
 * ADR-004 rejected arriving through the back door. Store entities in their
 * system's typed store instead.
 *
 * DETERMINISM. IDs are a monotonic counter, never random and never derived from
 * a clock. Two runs from the same seed with the same intents allocate the same
 * IDs in the same order — required by ADR-007, and by save round-tripping,
 * which restores the counter rather than recomputing it.
 */

import { asBuildingId, asWorkerId, type BuildingId, type WorkerId } from '../../shared/ids';

/** Independent counters, so adding workers never shifts building IDs. */
export const EntityKind = {
  Worker: 'worker',
  Building: 'building',
} as const;

export type EntityKind = (typeof EntityKind)[keyof typeof EntityKind];

/** Serializable allocator state. Persisted verbatim (SAVE_FORMAT.md §2). */
export type IdAllocatorState = Readonly<Record<EntityKind, number>>;

export interface IdAllocator {
  /** Next ID for a kind. Never reused, even after the entity is removed. */
  allocate(kind: EntityKind): number;
  allocateWorker(): WorkerId;
  allocateBuilding(): BuildingId;
  /** True if this allocator has issued the ID. */
  isAllocated(kind: EntityKind, id: number): boolean;
  /** Count issued for a kind. Diagnostics and tests. */
  issued(kind: EntityKind): number;
  /** Captures state for serialization. */
  getState(): IdAllocatorState;
  /** Restores state, resuming allocation without reissuing IDs. */
  setState(state: IdAllocatorState): void;
}

/**
 * IDs start at 1.
 *
 * Zero is reserved as "no entity", so a zeroed struct or a missing field never
 * reads as a valid reference.
 */
const FIRST_ID = 1;

export function createIdAllocator(): IdAllocator {
  const next: Record<EntityKind, number> = {
    [EntityKind.Worker]: FIRST_ID,
    [EntityKind.Building]: FIRST_ID,
  };

  const allocate = (kind: EntityKind): number => {
    const id = next[kind];
    next[kind] = id + 1;
    return id;
  };

  return {
    allocate,
    allocateWorker: () => asWorkerId(allocate(EntityKind.Worker)),
    allocateBuilding: () => asBuildingId(allocate(EntityKind.Building)),

    // IDs are never recycled: a stale reference to a removed entity must not
    // silently resolve to a different one that reused its number.
    isAllocated: (kind, id) => Number.isInteger(id) && id >= FIRST_ID && id < next[kind],

    issued: (kind) => next[kind] - FIRST_ID,

    getState: () => ({ ...next }),

    setState(state) {
      for (const kind of Object.values(EntityKind)) {
        const value = state[kind];
        // A restored counter below FIRST_ID would reissue IDs that already
        // exist in the save.
        next[kind] = Number.isInteger(value) && value >= FIRST_ID ? value : FIRST_ID;
      }
    },
  };
}
