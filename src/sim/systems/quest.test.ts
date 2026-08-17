/**
 * The quest step. Phase-22 — ADR-034 §4.
 *
 * What the watermark must hold: a crossed step pays exactly once ever, several
 * steps cross at once when the counters already earned them (the migrated-save
 * credit), resident chains read their own counter, and the fact publishes.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { QUEST_CHAINS } from '../content/quests';
import { RESIDENTS } from '../content/residents';
import { stepsPaid } from '../world/quests';
import { createWorld, type World } from '../world/world';

import { questSystem } from './quest';

const TOWN_CHAIN = 'core:quest_good_neighbour';

function paidEvents(world: World): { chain: string; step: number; rewardCoins: number }[] {
  const seen: { chain: string; step: number; rewardCoins: number }[] = [];
  world.events.subscribe('questCompleted', (event) => seen.push({ ...event }));
  return seen;
}

describe('questSystem', () => {
  it('a fresh world pays nothing, forever', () => {
    const world = createWorld(42);
    const before = world.wallet.coins;
    for (let i = 0; i < 50; i += 1) questSystem(world);
    expect(world.wallet.coins).toBe(before);
    expect(world.quests.size).toBe(0);
  });

  it('pays a crossed step once, and never again on later ticks', () => {
    const world = createWorld(42);
    const seen = paidEvents(world);
    world.contractStats.fulfilled = 1;

    const before = world.wallet.coins;
    questSystem(world);
    expect(world.wallet.coins).toBe(before + 60);
    expect(stepsPaid(world.quests, TOWN_CHAIN)).toBe(1);

    for (let i = 0; i < 20; i += 1) questSystem(world);
    expect(world.wallet.coins).toBe(before + 60);

    world.events.flush();
    expect(seen).toEqual([{ chain: TOWN_CHAIN, step: 1, rewardCoins: 60 }]);
  });

  it('pays every step history already earned at once — the migrated-save credit', () => {
    const world = createWorld(42);
    world.contractStats.fulfilled = 10;

    const before = world.wallet.coins;
    questSystem(world);

    // All three town-chain steps: 60 + 150 + 400.
    expect(world.wallet.coins).toBe(before + 610);
    expect(stepsPaid(world.quests, TOWN_CHAIN)).toBe(3);
  });

  it('a resident chain reads its own counter, not the town-wide one', () => {
    const world = createWorld(42);
    const marla = RESIDENTS[0]!.id;
    world.contractStats.fulfilled = 1;
    world.contractStats.byRequester[marla] = 1;

    const before = world.wallet.coins;
    questSystem(world);

    // Town step 1 (60) plus Marla's step 1 (40); no other resident moves.
    expect(world.wallet.coins).toBe(before + 100);
    expect(stepsPaid(world.quests, `core:quest_${RESIDENTS[0]!.id.split('_')[1] ?? ''}`)).toBe(1);
  });

  it('a restored watermark blocks re-payment even with the counters high', () => {
    const world = createWorld(42);
    world.contractStats.fulfilled = 10;
    // As a load would: the save says every town step was already paid.
    world.quests.set(TOWN_CHAIN, 3);

    const before = world.wallet.coins;
    questSystem(world);
    expect(world.wallet.coins).toBe(before);
  });

  it('is deterministic and consumes no RNG', () => {
    const world = createWorld(7);
    world.contractStats.fulfilled = 4;
    const rng = world.rng.getState();
    questSystem(world);
    expect(world.rng.getState()).toEqual(rng);
  });

  it('every declared chain can complete, and the total payout is declared', () => {
    const world = createWorld(42);
    world.contractStats.fulfilled = 1_000;
    for (const resident of RESIDENTS) world.contractStats.byRequester[resident.id] = 1_000;

    const before = world.wallet.coins;
    questSystem(world);

    const total = QUEST_CHAINS.flatMap((chain) => chain.steps).reduce(
      (sum, step) => sum + step.rewardCoins,
      0,
    );
    expect(world.wallet.coins).toBe(before + total);
    for (const chain of QUEST_CHAINS) {
      expect(stepsPaid(world.quests, chain.id)).toBe(chain.steps.length);
    }
  });
});
