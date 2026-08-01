/**
 * Floating numbers — the state, with no Pixi in it. Phase-07.7c, ADR-017 §4.
 *
 * The "+12" that rises off a tile when something is earned. Structurally a
 * pool like `particle-pool.ts` — fixed capacity, pre-allocated, oldest
 * recycled, reusable views — but with two differences that stop it sharing
 * that implementation:
 *
 * 1. It carries a STRING, which no typed array can hold. The text is formatted
 *    ONCE at emission and stored, so a frame reads it rather than building it.
 *    Formatting per frame would allocate a string per number per frame, which
 *    is the same defect the pool exists to avoid, one level down.
 * 2. Numbers must not overlap. Particles scatter for texture; these scatter so
 *    two simultaneous earnings stay separately READABLE, which is a different
 *    requirement and a much narrower drift.
 *
 * The capacity is deliberately far smaller than the particle pool's. Particles
 * are texture and read fine in dozens; numbers are text, and a screen with
 * twenty of them is noise rather than feedback (`GAME_DESIGN.md` §10.1 rule 4 —
 * the player is reading this while doing something else).
 *
 * Time is passed in, never read. The pool is pure.
 */

import type { TileIndex } from '../../shared/ids';

import { derivedRange } from './presentation-rng';

/** What a number represents. Drives its tint in the view, nothing else. */
export const FloatingKind = {
  /** Coins earned — a sale, manual or automatic. */
  Coins: 'coins',
  /** Items gained — a harvest reaching storage. */
  Item: 'item',
  /**
   * Experience. Declared because the brief names it (§5) and the SHAPE is
   * free; there is no XP system, and this phase adds none. It is here so that
   * the milestone which introduces one changes a call site, not this module.
   */
  Xp: 'xp',
} as const;

export type FloatingKind = (typeof FloatingKind)[keyof typeof FloatingKind];

/** How long a number stays on screen, in real milliseconds. */
export const FLOATING_DURATION_MS = 900;

/**
 * How many may be alive at once.
 *
 * A mature farm sells several stacks in a tick and an offline catch-up credits
 * many at the load boundary. Beyond this the oldest are recycled — which at
 * this duration the player cannot follow anyway.
 */
export const FLOATING_POOL_CAPACITY = 16;

/** Sideways drift, in tile-widths, so two numbers on one tile stay readable. */
const DRIFT = 0.3;

/** One live number. Reused between frames — never retained by a caller. */
export interface FloatingNumberView {
  kind: FloatingKind;
  tile: TileIndex;
  /** Formatted once at emission, e.g. `+12`. */
  text: string;
  /** Horizontal offset from the tile origin, in tile-widths. */
  driftX: number;
  /** 0 at emission, approaching 1 at expiry. */
  progress: number;
}

export interface FloatingNumberPool {
  /** Fixed at construction and never changed. */
  readonly capacity: number;
  /**
   * Raises a number over a tile. Recycles the oldest slot when full.
   *
   * A non-positive amount is ignored: "+0" is not feedback, and a negative
   * would need a different visual language this phase does not define.
   */
  emit(kind: FloatingKind, tile: TileIndex, amount: number, nowMs: number): void;
  /**
   * Everything alive at `nowMs`.
   *
   * The SAME array of the SAME view objects on every call — read it, draw it,
   * forget it (see `particle-pool.ts` for why this breaks house style).
   */
  activeAt(nowMs: number): readonly FloatingNumberView[];
  /** True when nothing is alive — the view drops its animation lease on this. */
  isEmpty(nowMs: number): boolean;
  /** Drops everything. For teardown, where a held lease would outlive the view. */
  clear(): void;
}

export function createFloatingNumberPool(): FloatingNumberPool {
  const kinds: FloatingKind[] = new Array<FloatingKind>(FLOATING_POOL_CAPACITY);
  const texts: string[] = new Array<string>(FLOATING_POOL_CAPACITY).fill('');
  const tiles = new Int32Array(FLOATING_POOL_CAPACITY);
  const startedAt = new Float64Array(FLOATING_POOL_CAPACITY);
  const drifts = new Float32Array(FLOATING_POOL_CAPACITY);
  const sequence = new Float64Array(FLOATING_POOL_CAPACITY);
  const occupied = new Uint8Array(FLOATING_POOL_CAPACITY);

  const views: FloatingNumberView[] = Array.from({ length: FLOATING_POOL_CAPACITY }, () => ({
    kind: FloatingKind.Coins,
    tile: 0 as TileIndex,
    text: '',
    driftX: 0,
    progress: 0,
  }));
  const result: FloatingNumberView[] = [];

  let nextSequence = 0;

  const isAlive = (slot: number, nowMs: number): boolean =>
    occupied[slot] !== 0 && nowMs - (startedAt[slot] ?? 0) < FLOATING_DURATION_MS;

  const claimSlot = (nowMs: number): number => {
    let oldest = 0;
    let oldestSequence = Number.POSITIVE_INFINITY;

    for (let slot = 0; slot < FLOATING_POOL_CAPACITY; slot += 1) {
      if (!isAlive(slot, nowMs)) return slot;
      const order = sequence[slot] ?? 0;
      if (order < oldestSequence) {
        oldestSequence = order;
        oldest = slot;
      }
    }
    return oldest;
  };

  return {
    capacity: FLOATING_POOL_CAPACITY,

    emit(kind, tile, amount, nowMs) {
      if (!Number.isFinite(amount) || amount <= 0) return;

      const slot = claimSlot(nowMs);
      kinds[slot] = kind;
      tiles[slot] = tile;
      // Formatted here, once, and never again — see the header.
      texts[slot] = `+${String(Math.floor(amount))}`;
      startedAt[slot] = nowMs;
      drifts[slot] = derivedRange(-DRIFT, DRIFT, tile, Math.trunc(nowMs));
      sequence[slot] = nextSequence;
      occupied[slot] = 1;
      nextSequence += 1;
    },

    activeAt(nowMs) {
      result.length = 0;
      for (let slot = 0; slot < FLOATING_POOL_CAPACITY; slot += 1) {
        if (!isAlive(slot, nowMs)) {
          occupied[slot] = 0;
          continue;
        }
        const kind = kinds[slot];
        const view = views[slot];
        if (kind === undefined || view === undefined) continue;

        view.kind = kind;
        view.tile = (tiles[slot] ?? 0) as TileIndex;
        view.text = texts[slot] ?? '';
        view.driftX = drifts[slot] ?? 0;
        // Clamped because a frame can land late; progress past 1 would let the
        // view draw a fade that has already finished.
        view.progress = Math.min(
          1,
          Math.max(0, (nowMs - (startedAt[slot] ?? 0)) / FLOATING_DURATION_MS),
        );
        result.push(view);
      }
      return result;
    },

    isEmpty(nowMs) {
      for (let slot = 0; slot < FLOATING_POOL_CAPACITY; slot += 1) {
        if (isAlive(slot, nowMs)) return false;
        occupied[slot] = 0;
      }
      return true;
    },

    clear() {
      occupied.fill(0);
      startedAt.fill(0);
      result.length = 0;
    },
  };
}
