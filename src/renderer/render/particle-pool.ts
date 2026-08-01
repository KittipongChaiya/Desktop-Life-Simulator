/**
 * The particle pool — the state, with no Pixi in it. Phase-07.7b, ADR-017 §4.
 *
 * `effect-state.ts` tracks EFFECTS (something happened, here, for this long).
 * This tracks the individual PARTICLES an effect throws off, which is a
 * different problem: there are an order of magnitude more of them, they are
 * created in bursts, and they are touched every frame while alive.
 *
 * FIXED CAPACITY, PRE-ALLOCATED, NEVER GROWN. Everything is laid out at
 * construction — parallel typed arrays for the state, and one reusable view
 * object per slot — so a frame at maximum density allocates nothing at all. A
 * dropped particle is invisible; a GC pause on an overlay the player left
 * running for eight hours is not (`PERFORMANCE.md` §4).
 *
 * The parallel-array layout is the same instinct `tile-grid.ts` follows and for
 * the same reason: the data is dense, uniform, and hot.
 *
 * ONE DELIBERATE BREAK WITH HOUSE STYLE. `activeAt` returns the same array of
 * the same view objects on every call, mutated in place. Everywhere else in
 * this codebase a projection returns fresh immutable data — but those are the
 * sim→view boundary, where fresh objects are what stop a mutable simulation
 * reference escaping. This is inside the renderer's per-frame path, where
 * ADR-017 §4 requires the opposite. **Callers must not retain a view across
 * frames.** Read it, draw it, forget it.
 *
 * Time is passed in, never read. The pool is pure.
 */

import type { TileIndex } from '../../shared/ids';

import { EFFECT_DURATION_MS, type EffectKind } from './effect-state';
import { derivedRange } from './presentation-rng';

/**
 * How many particles may be alive at once, across every effect.
 *
 * Sized for the worst honest case rather than the average: an offline
 * catch-up can credit hundreds of harvests at the load boundary, and a mature
 * farm harvests several crops on a single tick. Beyond this the oldest are
 * recycled, which at these durations the player cannot see.
 */
export const PARTICLE_POOL_CAPACITY = 192;

/** How far a particle may drift from its tile's origin, in tile-widths. */
const SCATTER = 0.42;

/** One live particle. Reused between frames — never retained by a caller. */
export interface ParticleView {
  kind: EffectKind;
  tile: TileIndex;
  /** Horizontal offset from the tile origin, in tile-widths. */
  offsetX: number;
  /** Vertical offset from the tile origin, in tile-widths. */
  offsetY: number;
  /** 0 at emission, approaching 1 at expiry. */
  progress: number;
}

export interface ParticlePool {
  /** Fixed at construction and never changed. */
  readonly capacity: number;
  /**
   * Emits `count` particles at a tile. Recycles the oldest slots when full.
   *
   * Scatter is DERIVED from the tile, the emission time, and the particle's
   * index (ADR-017 §5) — never rolled, so the same trigger scatters the same
   * way on a replay and on another machine.
   */
  emit(kind: EffectKind, tile: TileIndex, nowMs: number, count: number): void;
  /**
   * Everything alive at `nowMs`, in slot order (see the note in the body).
   *
   * The SAME array of the SAME view objects on every call — see the header.
   */
  activeAt(nowMs: number): readonly ParticleView[];
  /** True when nothing is alive — the view drops its animation lease on this. */
  isEmpty(nowMs: number): boolean;
  /** Drops everything. For teardown, where a held lease would outlive the view. */
  clear(): void;
}

export function createParticlePool(): ParticlePool {
  // Slot state, parallel and pre-allocated.
  const kinds: EffectKind[] = new Array<EffectKind>(PARTICLE_POOL_CAPACITY);
  const tiles = new Int32Array(PARTICLE_POOL_CAPACITY);
  const startedAt = new Float64Array(PARTICLE_POOL_CAPACITY);
  const offsetsX = new Float32Array(PARTICLE_POOL_CAPACITY);
  const offsetsY = new Float32Array(PARTICLE_POOL_CAPACITY);
  /** Emission order, so "oldest" survives slots being recycled out of order. */
  const sequence = new Float64Array(PARTICLE_POOL_CAPACITY);
  const occupied = new Uint8Array(PARTICLE_POOL_CAPACITY);

  /** One reusable view per slot, and one reusable result array. */
  const views: ParticleView[] = Array.from({ length: PARTICLE_POOL_CAPACITY }, () => ({
    kind: '' as EffectKind,
    tile: 0 as TileIndex,
    offsetX: 0,
    offsetY: 0,
    progress: 0,
  }));
  const result: ParticleView[] = [];

  let nextSequence = 0;

  const isAlive = (slot: number, nowMs: number): boolean => {
    if (occupied[slot] === 0) return false;
    const kind = kinds[slot];
    if (kind === undefined) return false;
    return nowMs - (startedAt[slot] ?? 0) < EFFECT_DURATION_MS[kind];
  };

  /** A free slot, or the one holding the oldest particle. Never allocates. */
  const claimSlot = (nowMs: number): number => {
    let oldest = 0;
    let oldestSequence = Number.POSITIVE_INFINITY;

    for (let slot = 0; slot < PARTICLE_POOL_CAPACITY; slot += 1) {
      if (!isAlive(slot, nowMs)) return slot; // free, or expired and reusable
      const order = sequence[slot] ?? 0;
      if (order < oldestSequence) {
        oldestSequence = order;
        oldest = slot;
      }
    }
    return oldest;
  };

  return {
    capacity: PARTICLE_POOL_CAPACITY,

    emit(kind, tile, nowMs, count) {
      for (let i = 0; i < count; i += 1) {
        const slot = claimSlot(nowMs);
        // Two independent draws per particle, separated by a large stride so
        // x and y do not correlate into a diagonal line.
        const seed = tile + i * 7919;
        kinds[slot] = kind;
        tiles[slot] = tile;
        startedAt[slot] = nowMs;
        offsetsX[slot] = derivedRange(-SCATTER, SCATTER, seed, Math.trunc(nowMs));
        offsetsY[slot] = derivedRange(-SCATTER, SCATTER, seed + 104_729, Math.trunc(nowMs));
        sequence[slot] = nextSequence;
        occupied[slot] = 1;
        nextSequence += 1;
      }
    },

    activeAt(nowMs) {
      result.length = 0;
      for (let slot = 0; slot < PARTICLE_POOL_CAPACITY; slot += 1) {
        if (!isAlive(slot, nowMs)) {
          occupied[slot] = 0;
          continue;
        }
        const kind = kinds[slot];
        if (kind === undefined) continue;

        const view = views[slot];
        if (view === undefined) continue;

        view.kind = kind;
        view.tile = (tiles[slot] ?? 0) as TileIndex;
        view.offsetX = offsetsX[slot] ?? 0;
        view.offsetY = offsetsY[slot] ?? 0;
        // Clamped because a frame can land late; progress past 1 would let the
        // view draw a fade that has already finished.
        view.progress = Math.min(
          1,
          Math.max(0, (nowMs - (startedAt[slot] ?? 0)) / EFFECT_DURATION_MS[kind]),
        );
        result.push(view);
      }
      // SLOT order, not emission order — and deliberately unsorted. Effects are
      // distinct things whose order the player can read, so `EffectQueue`
      // sorts; particles are interchangeable specks in one layer, so sorting
      // them would buy nothing and cost an O(n log n) pass every frame.
      return result;
    },

    isEmpty(nowMs) {
      for (let slot = 0; slot < PARTICLE_POOL_CAPACITY; slot += 1) {
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
