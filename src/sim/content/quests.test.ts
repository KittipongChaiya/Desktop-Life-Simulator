/**
 * The quest chains as content. Phase-22 — ADR-034 §4, §5.
 *
 * What the data must hold: ids unique, thresholds strictly increasing so the
 * watermark can only walk forward, rewards positive and below the smallest
 * contract premium a step's own deliveries would have earned — quests season
 * the contract loop, never replace it.
 */

import { describe, expect, it } from 'vitest';

import { QUEST_CHAINS } from './quests';
import { RESIDENTS } from './residents';

describe('the chains', () => {
  it('every chain id is unique and namespaced', () => {
    const ids = QUEST_CHAINS.map((chain) => chain.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('core:quest_')).toBe(true);
  });

  it('thresholds rise strictly, so the watermark can only walk forward', () => {
    for (const chain of QUEST_CHAINS) {
      expect(chain.steps.length).toBeGreaterThan(0);
      for (let i = 1; i < chain.steps.length; i += 1) {
        expect(chain.steps[i]!.threshold).toBeGreaterThan(chain.steps[i - 1]!.threshold);
      }
    }
  });

  it('rewards are positive integers, sized below contract money (ADR-034 §5)', () => {
    for (const chain of QUEST_CHAINS) {
      for (const step of chain.steps) {
        expect(Number.isInteger(step.rewardCoins)).toBe(true);
        expect(step.rewardCoins).toBeGreaterThan(0);
        expect(step.rewardCoins).toBeLessThanOrEqual(400);
        expect(step.objective.length).toBeGreaterThan(0);
      }
    }
  });

  it('every villager has a chain, and every requester is a real resident', () => {
    const residentIds = new Set<string>(RESIDENTS.map((resident) => resident.id));
    const requesterChains = QUEST_CHAINS.filter((chain) => chain.counter.kind === 'requester');
    expect(requesterChains).toHaveLength(RESIDENTS.length);
    for (const chain of requesterChains) {
      if (chain.counter.kind === 'requester') {
        expect(residentIds.has(chain.counter.requester)).toBe(true);
      }
    }
  });
});
