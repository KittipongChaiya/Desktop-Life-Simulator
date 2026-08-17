/**
 * The quest chains. Phase-22 — ADR-034 §4, §5.
 *
 * Content, like the residents: declared data the systems read, never state.
 * A chain is an ordered list of steps, each a threshold over one of the
 * contract counters — the town-wide fulfilled count, or one resident's. No
 * deadlines, no failure, no branching: presence advances a chain, absence
 * pauses it (`VISION.md` §2.2).
 *
 * Rewards are declared coins, sized BELOW contract premiums — quests season
 * the contract loop, they must not replace it (ADR-034 §5). No reward
 * grants standing, items, or unlocks: gating is standing's job, so the
 * player has exactly one progression axis to reason about.
 *
 * The town chain's later thresholds deliberately sit on the standing tiers
 * (3 and 10, ADR-034 §1) — the chain celebrates the same milestones the
 * gates open at, so the two systems tell one story.
 */

import { asContentId, type ContentId } from '../../shared/ids';
import type { QuestCounter } from '../world/quests';

import { RESIDENTS } from './residents';

export interface QuestStep {
  /** The counter value that completes this step. Strictly increasing. */
  readonly threshold: number;
  readonly rewardCoins: number;
  /** The ask, worded for the notice board. */
  readonly objective: string;
}

export interface QuestChain {
  readonly id: ContentId;
  readonly displayName: string;
  readonly counter: QuestCounter;
  readonly steps: readonly QuestStep[];
}

/** The town-wide chain: thresholds 1, then the two standing tiers. */
const GOOD_NEIGHBOUR: QuestChain = {
  id: asContentId('core:quest_good_neighbour'),
  displayName: 'A Good Neighbour',
  counter: { kind: 'fulfilled' },
  steps: [
    { threshold: 1, rewardCoins: 60, objective: 'Deliver your first contract' },
    { threshold: 3, rewardCoins: 150, objective: 'Deliver 3 contracts' },
    { threshold: 10, rewardCoins: 400, objective: 'Deliver 10 contracts' },
  ],
};

/** One short chain per villager, names kept in step with the canon roster. */
const RESIDENT_CHAINS: readonly QuestChain[] = RESIDENTS.map((resident) => ({
  id: asContentId(resident.id.replace(':resident_', ':quest_')),
  displayName: `${resident.displayName}’s Errands`,
  counter: { kind: 'requester', requester: resident.id },
  steps: [
    {
      threshold: 1,
      rewardCoins: 40,
      objective: `Deliver a contract for ${resident.displayName}`,
    },
    {
      threshold: 3,
      rewardCoins: 120,
      objective: `Deliver 3 contracts for ${resident.displayName}`,
    },
  ],
}));

export const QUEST_CHAINS: readonly QuestChain[] = [GOOD_NEIGHBOUR, ...RESIDENT_CHAINS];
