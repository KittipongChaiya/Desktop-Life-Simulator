/**
 * The effect queue. Phase-07.5b.
 *
 * The property that matters most is not that effects appear — it is that they
 * RELIABLY STOP. The view holds the dirty gate's animation lease while the
 * queue is non-empty, and a lease that is never released costs a frame every
 * frame, forever, while looking exactly like normal operation (ADR-001 §1).
 */

import { describe, expect, it } from 'vitest';

import { asTileIndex } from '../../shared/ids';

import {
  createEffectQueue,
  EFFECT_DURATION_MS,
  EffectKind,
  MAX_CONCURRENT_EFFECTS,
} from './effect-state';

const TILE = asTileIndex(100);
const OTHER = asTileIndex(200);

describe('lifetime', () => {
  it('is alive from its spawn instant', () => {
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Burst, TILE, 1_000);

    expect(queue.activeAt(1_000)).toEqual([{ kind: EffectKind.Burst, tile: TILE, progress: 0 }]);
  });

  it('reports progress across its lifetime', () => {
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Burst, TILE, 1_000);

    const half = EFFECT_DURATION_MS[EffectKind.Burst] / 2;
    expect(queue.activeAt(1_000 + half)[0]?.progress).toBeCloseTo(0.5, 5);
  });

  it('EXPIRES — the property the overlay depends on', () => {
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Burst, TILE, 1_000);

    expect(queue.isEmpty(1_000)).toBe(false);
    expect(queue.isEmpty(1_000 + EFFECT_DURATION_MS[EffectKind.Burst])).toBe(true);
    expect(queue.activeAt(1_000 + EFFECT_DURATION_MS[EffectKind.Burst])).toEqual([]);
  });

  it('each kind expires on its own clock', () => {
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Ring, TILE, 0);
    queue.spawn(EffectKind.Burst, OTHER, 0);

    // The ring is the shorter of the two, so there is a window where only the
    // burst survives — proving expiry is per-entry, not a shared timer.
    const between = EFFECT_DURATION_MS[EffectKind.Ring] + 1;
    expect(EFFECT_DURATION_MS[EffectKind.Ring]).toBeLessThan(EFFECT_DURATION_MS[EffectKind.Burst]);

    const active = queue.activeAt(between);
    expect(active).toHaveLength(1);
    expect(active[0]?.kind).toBe(EffectKind.Burst);
  });

  it('never reports progress past 1, however late the frame lands', () => {
    // A frame can arrive long after an effect should have ended — a stalled
    // tab, a hitch. The view must never be handed a fade that already finished.
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Burst, TILE, 0);

    for (const active of queue.activeAt(EFFECT_DURATION_MS[EffectKind.Burst] - 1)) {
      expect(active.progress).toBeLessThanOrEqual(1);
    }
  });

  it('a queue that was never used is empty', () => {
    expect(createEffectQueue().isEmpty(0)).toBe(true);
  });
});

describe('the concurrency cap', () => {
  it('never holds more than the cap, however many arrive at once', () => {
    // The real case: an offline catch-up credits hundreds of harvests at the
    // load boundary. Uncapped, the overlay would flash like an alarm.
    const queue = createEffectQueue();
    for (let i = 0; i < MAX_CONCURRENT_EFFECTS * 10; i += 1) {
      queue.spawn(EffectKind.Burst, asTileIndex(i), 0);
    }

    expect(queue.activeAt(0)).toHaveLength(MAX_CONCURRENT_EFFECTS);
  });

  it('drops the OLDEST — the newest event is the one being watched', () => {
    const queue = createEffectQueue();
    for (let i = 0; i < MAX_CONCURRENT_EFFECTS + 1; i += 1) {
      queue.spawn(EffectKind.Burst, asTileIndex(i), 0);
    }

    const tiles = queue.activeAt(0).map((effect) => effect.tile);
    expect(tiles).not.toContain(asTileIndex(0)); // the first one spawned
    expect(tiles).toContain(asTileIndex(MAX_CONCURRENT_EFFECTS)); // the last
  });

  it('capping still expires — a full queue empties on its own', () => {
    const queue = createEffectQueue();
    for (let i = 0; i < MAX_CONCURRENT_EFFECTS * 3; i += 1) {
      queue.spawn(EffectKind.Burst, asTileIndex(i), 0);
    }

    expect(queue.isEmpty(EFFECT_DURATION_MS[EffectKind.Burst])).toBe(true);
  });
});

describe('ordering and teardown', () => {
  it('reports oldest first, so newer effects draw over older ones', () => {
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Burst, TILE, 0);
    queue.spawn(EffectKind.Burst, OTHER, 10);

    expect(queue.activeAt(20).map((effect) => effect.tile)).toEqual([TILE, OTHER]);
  });

  it('clear() empties immediately — teardown must not leave a lease held', () => {
    const queue = createEffectQueue();
    queue.spawn(EffectKind.Burst, TILE, 0);

    queue.clear();

    expect(queue.isEmpty(0)).toBe(true);
  });
});
