/**
 * Feedback effects — the state, with no Pixi in it. Phase-07.5b.
 *
 * Every effect this game has is a SHORT, TRIGGERED acknowledgement: something
 * happened, and the world says so for a few hundred milliseconds. None of them
 * loop, because the phase's first decision was that a companion's world at
 * rest stays at rest (`docs/phases/phase-07.5-vertical-slice.md`).
 *
 * That is why this module exists separately from the view: the part worth
 * testing is when an effect is alive, how far through it is, and — the part
 * that actually threatens the overlay — that the queue reliably becomes EMPTY.
 * An effect that never expires holds the dirty gate's animation lease forever,
 * which looks exactly like normal operation while costing a frame every frame
 * (`dirty-gate.ts`: "the fragile half").
 *
 * Time is passed in, never read. The queue is pure.
 */

import type { TileIndex } from '../../shared/ids';

export const EffectKind = {
  /** A harvest. Particles scattering from the tile. */
  Burst: 'burst',
  /** A confirmation ring — a building placed, a worker selected. */
  Ring: 'ring',
  /** Turned earth — tilling, and a worker's footfall on dry ground. 07.7b. */
  Dust: 'dust',
  /** Disturbed foliage — a crop harvested, a bush brushed past. 07.7b. */
  Leaves: 'leaves',
  /** A crop reaching a new growth stage; anything that became ready. 07.7b. */
  Sparkle: 'sparkle',
  /** Coins scattering at the point of sale — the burst, not the readout. 07.7b. */
  CoinBurst: 'coin-burst',
  /** Water — the well, and a watering can when one exists. 07.7b. */
  Splash: 'splash',
} as const;

export type EffectKind = (typeof EffectKind)[keyof typeof EffectKind];

/**
 * How long each kind lives, in real milliseconds.
 *
 * Short on purpose. These are acknowledgements, not animations: long enough to
 * catch peripherally, over before they can be watched. `GAME_DESIGN.md` §10.1
 * rule 4 — the player is reading this while doing something else.
 */
export const EFFECT_DURATION_MS: Readonly<Record<EffectKind, number>> = {
  [EffectKind.Burst]: 420,
  [EffectKind.Ring]: 320,
  // The 07.7b additions. All inside the same envelope as the two above, for
  // the same reason: an acknowledgement the player catches peripherally and
  // that is gone before it can be studied. Dust is the shortest — it is the
  // most frequent, firing on every till and every footfall, so it has to be
  // the least insistent.
  [EffectKind.Dust]: 300,
  [EffectKind.Leaves]: 460,
  [EffectKind.Sparkle]: 380,
  [EffectKind.CoinBurst]: 440,
  [EffectKind.Splash]: 360,
};

/**
 * The most effects that may be alive at once.
 *
 * A mature farm can harvest several crops on a single tick, and an offline
 * catch-up can credit hundreds at the load boundary. Without a cap the queue
 * would spawn one per harvest and the overlay would flash like an alarm — the
 * same failure the audio bus coalesces away. Oldest are dropped first: the
 * newest event is the one the player is most likely watching.
 */
export const MAX_CONCURRENT_EFFECTS = 12;

/** An effect the view should draw, with its progress through its lifetime. */
export interface ActiveEffect {
  readonly kind: EffectKind;
  readonly tile: TileIndex;
  /** 0 at spawn, approaching 1 at expiry. */
  readonly progress: number;
}

export interface EffectQueue {
  /** Records an effect. Time is the caller's — this module reads no clock. */
  spawn(kind: EffectKind, tile: TileIndex, nowMs: number): void;
  /** Everything alive at `nowMs`, oldest first. Expiry happens here. */
  activeAt(nowMs: number): readonly ActiveEffect[];
  /** True when nothing is alive — the view drops its animation lease on this. */
  isEmpty(nowMs: number): boolean;
  /** Drops everything. For teardown, where a held lease would outlive the view. */
  clear(): void;
}

interface Entry {
  readonly kind: EffectKind;
  readonly tile: TileIndex;
  readonly startedAtMs: number;
}

export function createEffectQueue(): EffectQueue {
  let entries: Entry[] = [];

  const survivors = (nowMs: number): Entry[] =>
    entries.filter((entry) => nowMs - entry.startedAtMs < EFFECT_DURATION_MS[entry.kind]);

  return {
    spawn(kind, tile, nowMs) {
      entries = survivors(nowMs);
      entries.push({ kind, tile, startedAtMs: nowMs });
      // Drop from the front: the oldest effect is the one furthest through its
      // life and the least likely to be under the player's eye.
      if (entries.length > MAX_CONCURRENT_EFFECTS) {
        entries = entries.slice(entries.length - MAX_CONCURRENT_EFFECTS);
      }
    },

    activeAt(nowMs) {
      entries = survivors(nowMs);
      return entries.map((entry) => ({
        kind: entry.kind,
        tile: entry.tile,
        // Clamped because a frame can land late; progress past 1 would let the
        // view draw a fade that has already finished.
        progress: Math.min(
          1,
          Math.max(0, (nowMs - entry.startedAtMs) / EFFECT_DURATION_MS[entry.kind]),
        ),
      }));
    },

    isEmpty(nowMs) {
      entries = survivors(nowMs);
      return entries.length === 0;
    },

    clear() {
      entries = [];
    },
  };
}
