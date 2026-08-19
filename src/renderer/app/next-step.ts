/**
 * "What now?" — the next thing worth doing. Phase-49.
 *
 * The game never tells a player what to do next. That is fine for the person
 * who built it and hostile to everyone else: a farm with money in the bank, an
 * empty field and no workers looks exactly like a farm that is finished.
 * `VISION.md` wants somebody to leave this open for hours, and nobody leaves
 * open a thing they have run out of ideas for.
 *
 * ## Derived, never stored
 *
 * Every rule below is a question asked of the snapshot the HUD already has.
 * There is no objective state, no progress record, no save change and nothing
 * to migrate — which is the same argument ADR-009 §1 makes for tilled soil and
 * ADR-042 §3 makes for footprints, in the one place where the alternative is
 * genuinely tempting. A stored quest list would be a second source of truth for
 * facts the world already answers, and it would go stale the moment a player
 * did something the list did not expect.
 *
 * ## One suggestion, not a checklist
 *
 * ADR-034 §7 ruled out a quest journal window and it was right to: the board
 * carries the town's asks, and a second list competing with it would split
 * where a player looks. **This is the amendment, and it is deliberately
 * smaller than what §7 forbade** — a single line, computed from state, that
 * says the most useful next thing. No window, no log, no ticking objectives.
 *
 * ## The order is the design
 *
 * Rules are checked in order and the first match wins, so the list reads as a
 * priority: unblock what is stuck, then take money that is sitting on the
 * table, then grow. A player drowning in full storage does not need to be told
 * to plant more.
 */

/** What the HUD already knows, narrowed to what these rules read. */
export interface NextStepInput {
  readonly coins: number;
  readonly workerCount: number;
  readonly hireCost: number;
  /** Slots used and total across the player's bags and every shed. */
  readonly usedSlots: number;
  readonly capacity: number;
  readonly cropCount: number;
  readonly buildingCount: number;
  /**
   * Board offers the player can ACTUALLY FULFIL right now — the item is in
   * stock and there is enough of it.
   *
   * Not "offers that exist". The first version counted those, and a brand-new
   * farm with an empty inventory was told "the notice board is asking for
   * something you can deliver", which was simply false. Advice that cannot be
   * followed is worse than silence: it teaches a player that the hint line
   * does not know what it is talking about, and after that they stop reading
   * it.
   */
  readonly deliverableOffers: number;
  /** Whether the player holds seed of any kind. */
  readonly hasSeed: boolean;
  /** Harvested goods in stock — anything that is not seed. */
  readonly sellableGoods: number;
}

export interface NextStep {
  /** A stable id, so a test names a rule rather than matching prose. */
  readonly id: string;
  /** One short sentence, in the second person. */
  readonly text: string;
}

/**
 * The rules, in priority order.
 *
 * Each is a plain predicate over the input. Kept as data rather than a chain of
 * `if`s so the ORDER is visible in one place and a new rule cannot accidentally
 * be added above "storage is full" without somebody noticing.
 */
const RULES: readonly {
  readonly id: string;
  readonly text: string;
  readonly when: (state: NextStepInput) => boolean;
}[] = [
  {
    // Nothing else matters while there is nowhere to put anything: a full farm
    // stops harvesting, and every other suggestion would be advice to make it
    // worse.
    id: 'storage-full',
    text: 'Storage is full — sell at the market stall or build a shed.',
    when: (state) => state.capacity > 0 && state.usedSlots >= state.capacity,
  },
  {
    // The emotional core of the arc (`VISION.md` §6.3), and the one step a new
    // player most often does not realise is available.
    id: 'hire-first-worker',
    text: 'You can afford a worker — hire one and the farm runs itself.',
    when: (state) => state.workerCount === 0 && state.coins >= state.hireCost,
  },
  {
    id: 'deliver-offer',
    text: 'The notice board is asking for something you can deliver.',
    when: (state) => state.deliverableOffers > 0,
  },
  {
    id: 'buy-seed',
    text: 'Buy seed from the shop, then till a patch and plant it.',
    when: (state) => !state.hasSeed && state.cropCount === 0,
  },
  {
    id: 'plant-something',
    text: 'Nothing is growing — till a patch and plant your seed.',
    when: (state) => state.cropCount === 0,
  },
  {
    // THE STEP THAT CLOSES THE LOOP. A first-time player can reach a shed full
    // of turnips and no idea that money comes from the stall, because nothing
    // in the game has ever mentioned it.
    id: 'sell-harvest',
    text: 'You have a harvest to sell — the market stall turns it into coins.',
    when: (state) => state.sellableGoods > 0 && state.coins < state.hireCost,
  },
  {
    id: 'build-storage',
    text: 'A storage shed gives your workers somewhere to put the harvest.',
    when: (state) => state.buildingCount === 0 && state.coins >= 200,
  },
  {
    id: 'hire-another',
    text: 'Another pair of hands would work the land faster.',
    when: (state) => state.coins >= state.hireCost * 2,
  },
  {
    // REASSURANCE, and only for a farm that is plainly new. Silence is right
    // for a going concern — it means "nothing needs you" — but to somebody who
    // has just planted their first row and has no workers, silence reads as
    // "you have done something wrong". This is the last rule for that reason:
    // anything actionable outranks being told to wait.
    id: 'wait-for-growth',
    text: 'Your crops are growing. Harvest them when they ripen, then sell at the stall.',
    when: (state) => state.cropCount > 0 && state.workerCount === 0,
  },
];

/**
 * The most useful next thing, or `null` when the farm is simply ticking along.
 *
 * NULL IS A REAL ANSWER and not a failure. A player mid-flow with crops
 * growing, storage half full and workers busy does not need advice, and a line
 * that always says something becomes a line nobody reads.
 */
export function nextStep(state: NextStepInput): NextStep | null {
  for (const rule of RULES) {
    if (rule.when(state)) return { id: rule.id, text: rule.text };
  }
  return null;
}
