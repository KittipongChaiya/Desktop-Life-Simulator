/**
 * Particle pool tests. Phase-07.7b, ADR-017 §4.
 *
 * Three properties carry this module, and all three are about what does NOT
 * happen: the pool never grows, it never allocates after construction, and it
 * reliably becomes empty. The last is the one that threatens the overlay — a
 * particle that never expires holds the dirty gate's animation lease forever,
 * which looks exactly like normal operation while costing a frame every frame.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';

import { EffectKind, EFFECT_DURATION_MS } from './effect-state';
import { createParticlePool, PARTICLE_POOL_CAPACITY } from './particle-pool';

const TILE = toIndexUnchecked(30, 30);
const OTHER = toIndexUnchecked(31, 30);
const DUST_MS = EFFECT_DURATION_MS[EffectKind.Dust];

describe('emitting', () => {
  it('starts empty', () => {
    const pool = createParticlePool();
    expect(pool.isEmpty(0)).toBe(true);
    expect(pool.activeAt(0)).toHaveLength(0);
  });

  it('produces the requested number of particles', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 6);

    expect(pool.activeAt(0)).toHaveLength(6);
    expect(pool.isEmpty(0)).toBe(false);
  });

  it('scatters them — particles from one emit do not stack on one point', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 8);

    const offsets = new Set(
      pool.activeAt(0).map((p) => `${String(p.offsetX)},${String(p.offsetY)}`),
    );
    expect(offsets.size).toBeGreaterThan(1);
  });

  it('scatters identically for the same trigger — derived, never rolled', () => {
    // ADR-017 §5: the same harvest scatters the same way on a replay, on a
    // reload, and on another machine.
    const read = (): string => {
      const pool = createParticlePool();
      pool.emit(EffectKind.Leaves, TILE, 1000, 6);
      return JSON.stringify(pool.activeAt(1000).map((p) => [p.offsetX, p.offsetY]));
    };

    expect(read()).toBe(read());
  });

  it('scatters differently on a different tile', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 4);
    const first = JSON.stringify(pool.activeAt(0).map((p) => p.offsetX));

    const other = createParticlePool();
    other.emit(EffectKind.Dust, OTHER, 0, 4);
    expect(JSON.stringify(other.activeAt(0).map((p) => p.offsetX))).not.toBe(first);
  });

  it('ignores a non-positive count rather than misbehaving', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 0);
    pool.emit(EffectKind.Dust, TILE, 0, -5);

    expect(pool.isEmpty(0)).toBe(true);
  });
});

describe('expiry — the lease depends on this', () => {
  it('reports progress across the lifetime', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 1);

    expect(pool.activeAt(0)[0]?.progress).toBeCloseTo(0, 5);
    expect(pool.activeAt(DUST_MS / 2)[0]?.progress).toBeCloseTo(0.5, 5);
  });

  it('becomes empty once the lifetime has passed', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 10);

    expect(pool.isEmpty(DUST_MS - 1)).toBe(false);
    expect(pool.isEmpty(DUST_MS)).toBe(true);
    expect(pool.activeAt(DUST_MS)).toHaveLength(0);
  });

  it('empties even when emits overlap continuously', () => {
    // The realistic failure: a steady stream of effects keeps SOMETHING alive
    // at all times, and the pool must still drain the moment they stop.
    const pool = createParticlePool();
    for (let t = 0; t < 2000; t += 50) pool.emit(EffectKind.Dust, TILE, t, 3);

    expect(pool.isEmpty(2000 + DUST_MS)).toBe(true);
  });

  it('honours each kind’s own duration', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 1);
    pool.emit(EffectKind.Leaves, TILE, 0, 1);

    // Leaves outlive dust, so at dust's expiry exactly one remains.
    expect(pool.activeAt(DUST_MS)).toHaveLength(1);
    expect(pool.activeAt(DUST_MS)[0]?.kind).toBe(EffectKind.Leaves);
  });

  it('clear() drops everything, so teardown cannot leak a lease', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 10);
    pool.clear();

    expect(pool.isEmpty(0)).toBe(true);
  });
});

describe('pooling — ADR-017 §4', () => {
  it('never exceeds its capacity, however much is emitted', () => {
    const pool = createParticlePool();
    for (let i = 0; i < 100; i += 1) pool.emit(EffectKind.Dust, TILE, 0, 50);

    expect(pool.activeAt(0).length).toBeLessThanOrEqual(PARTICLE_POOL_CAPACITY);
  });

  it('recycles the OLDEST when full, keeping what the player just caused', () => {
    // Oldest-first, per effect-state.ts's 07.5b reasoning: the oldest particle
    // is furthest through its life and least likely to be under the eye.
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, PARTICLE_POOL_CAPACITY);
    pool.emit(EffectKind.Sparkle, OTHER, 10, 4);

    const kinds = pool.activeAt(10).map((p) => p.kind);
    expect(kinds.filter((k) => k === EffectKind.Sparkle)).toHaveLength(4);
    expect(kinds).toHaveLength(PARTICLE_POOL_CAPACITY);
  });

  it('returns the same array instance every call — no per-frame allocation', () => {
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, 4);

    expect(pool.activeAt(0)).toBe(pool.activeAt(0));
    pool.emit(EffectKind.Leaves, TILE, 0, 4);
    expect(pool.activeAt(0)).toBe(pool.activeAt(0));
  });

  it('reuses the same view objects rather than minting new ones', () => {
    // The actual pooling assertion: after thousands of emits, no view object
    // outside the original pre-allocated set has ever been handed out.
    const pool = createParticlePool();
    pool.emit(EffectKind.Dust, TILE, 0, PARTICLE_POOL_CAPACITY);
    const original = new Set<unknown>(pool.activeAt(0));

    for (let t = 1; t < 3000; t += 7) pool.emit(EffectKind.Sparkle, TILE, t, 5);

    for (const view of pool.activeAt(3000)) expect(original.has(view)).toBe(true);
    expect(original.size).toBe(PARTICLE_POOL_CAPACITY);
  });

  it('reports a fixed capacity that never moves', () => {
    const pool = createParticlePool();
    expect(pool.capacity).toBe(PARTICLE_POOL_CAPACITY);

    for (let i = 0; i < 50; i += 1) pool.emit(EffectKind.CoinBurst, TILE, i, 30);
    expect(pool.capacity).toBe(PARTICLE_POOL_CAPACITY);
  });
});
