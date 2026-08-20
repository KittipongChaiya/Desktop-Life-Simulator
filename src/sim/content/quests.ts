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

/**
 * The authored chains — one per resident. Phase-58, ADR-046 R-06.
 *
 * ## Why these exist alongside `RESIDENT_CHAINS`
 *
 * The chains above are produced by `RESIDENTS.map()`: one template, two steps,
 * thresholds 1 and 3, with a name substituted in. That is a formula, not
 * content. It gave every resident an identical relationship with the player and
 * gave the player no reason to prefer one neighbour's board notice to another's
 * — four people who all want exactly three of anything are one person.
 *
 * These four are written rather than generated, and they differ in the three
 * things a `QuestChain` actually has: how long they run, how the rewards are
 * shaped, and what the steps say. The template chains are KEPT — ADR-046 §3
 * forbids removing content, every save holding a partly-finished Errands chain
 * would orphan it, and they still serve as the short introduction that the
 * longer chain sits behind.
 *
 * ## They span days, and that is the point
 *
 * ADR-034 §5 sizes quest rewards BELOW contract premiums: quests season the
 * contract loop and must not replace it. That constraint is what makes a long
 * chain the right shape — a fifth step at 25 fulfilled contracts is not a
 * bigger prize, it is a reason the notice board still has something to say to a
 * player on their second day, which is the criterion v0.6 exists to make
 * askable (`PLAN.md` §2.2).
 *
 * Rewards therefore stay flat-ish per step and the LENGTH carries the
 * progression. A chain that scaled its coins with its thresholds would quietly
 * become the best income in the game by its last step.
 *
 * **The first draft of these chains did exactly that** — Edwin's last step paid
 * 900 — and `quests.test.ts` caught it on the ceiling ADR-034 §5 put there:
 * every reward at or below 400. The paragraph above was already written when
 * the numbers broke it, which is a fair argument for pinning a constraint in a
 * test rather than in a sentence.
 */
const AUTHORED_CHAINS: readonly QuestChain[] = [
  {
    // Marla asks for volume and keeps asking. The longest chain, the smallest
    // steps — she is the neighbour who is never quite finished.
    id: asContentId('core:quest_marla_standing'),
    displayName: 'Marla’s Standing Order',
    counter: { kind: 'requester', requester: asContentId('core:resident_marla') },
    steps: [
      { threshold: 2, rewardCoins: 70, objective: 'Fill two of Marla’s orders' },
      { threshold: 6, rewardCoins: 110, objective: 'Fill six — she has started expecting it' },
      { threshold: 12, rewardCoins: 150, objective: 'Twelve. Marla stops writing them down' },
      { threshold: 20, rewardCoins: 190, objective: 'Twenty, and she asks after your farm' },
      { threshold: 32, rewardCoins: 230, objective: 'Thirty-two. You are her supplier now' },
    ],
  },
  {
    // Tobin's chain is short and steep: three steps, the largest per-step
    // rewards, done well before Marla's. He pays for urgency, not loyalty.
    id: asContentId('core:quest_tobin_commission'),
    displayName: 'Tobin’s Commission',
    counter: { kind: 'requester', requester: asContentId('core:resident_tobin') },
    steps: [
      { threshold: 3, rewardCoins: 180, objective: 'Deliver three orders for Tobin' },
      { threshold: 9, rewardCoins: 260, objective: 'Nine, before he asks twice' },
      { threshold: 18, rewardCoins: 340, objective: 'Eighteen. Tobin recommends you' },
    ],
  },
  {
    // Prue's thresholds sit ON the standing tiers (3 and 10, ADR-034 §1), the
    // same trick `GOOD_NEIGHBOUR` uses: her chain celebrates the milestones the
    // gates open at, so two systems tell one story instead of two.
    id: asContentId('core:quest_prue_count'),
    displayName: 'Prue Keeps Count',
    counter: { kind: 'requester', requester: asContentId('core:resident_prue') },
    steps: [
      { threshold: 3, rewardCoins: 120, objective: 'Three for Prue — she notices the third' },
      { threshold: 10, rewardCoins: 200, objective: 'Ten. Prue tells the others' },
      { threshold: 24, rewardCoins: 300, objective: 'Twenty-four, and she stops counting' },
    ],
  },
  {
    // Edwin's chain is the long tail: the highest thresholds in the game,
    // reached by a player who is still here weeks later. Its last step is
    // deliberately beyond what a first session can touch.
    id: asContentId('core:quest_edwin_account'),
    displayName: 'Edwin’s Long Account',
    counter: { kind: 'requester', requester: asContentId('core:resident_edwin') },
    steps: [
      { threshold: 4, rewardCoins: 150, objective: 'Four orders for Edwin' },
      { threshold: 14, rewardCoins: 220, objective: 'Fourteen — he opens an account for you' },
      { threshold: 30, rewardCoins: 290, objective: 'Thirty, settled in full' },
      { threshold: 50, rewardCoins: 360, objective: 'Fifty. Edwin writes your name in the ledger' },
    ],
  },
];

export const QUEST_CHAINS: readonly QuestChain[] = [
  GOOD_NEIGHBOUR,
  ...RESIDENT_CHAINS,
  ...AUTHORED_CHAINS,
];
