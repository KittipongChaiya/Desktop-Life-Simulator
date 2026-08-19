/**
 * The "what now?" line. Phase-49 — amends ADR-034 §7.
 *
 * One sentence in the status bar saying the most useful next thing, or nothing
 * at all when the farm is simply ticking along. The rules live in
 * `next-step.ts`; this component's whole job is to read the slices the HUD
 * already subscribes to and hand them over.
 *
 * ## Why this is not the quest journal §7 ruled out
 *
 * ADR-034 §7 says "no dialogue, no quest journal window — the board panel
 * carries the chains", and that judgement stands: a second LIST competing with
 * the board would split where a player looks. This is deliberately smaller
 * than what it forbade. No window, no log, no ticking objectives, nothing to
 * dismiss, nothing stored. A line that disappears when there is nothing to say.
 *
 * ## It renders nothing rather than something reassuring
 *
 * Returning `null` is the common case and the point. A hint that is always
 * present becomes furniture, and furniture is not read — so the moment it does
 * appear has to mean something.
 */

import { hireCost } from '../../../sim/commands/worker-commands';
import { useSlice } from '../hooks/use-slice';
import { nextStep } from '../next-step';

import styles from './StatusBar.module.css';

export function NextStep(): React.JSX.Element | null {
  const workers = useSlice('workers');
  const wallet = useSlice('wallet');
  const inventory = useSlice('inventory');
  const crops = useSlice('crops');
  const buildings = useSlice('buildings');
  const contracts = useSlice('contracts');

  const step = nextStep({
    coins: wallet.coins,
    workerCount: workers.length,
    // Priced off the same counter the command charges (`hireCost` counts the
    // workers), so the hint never offers a hire the player cannot afford —
    // the bug the worker panel already found once on the running app.
    hireCost: hireCost(workers.length),
    usedSlots: inventory.usedSlots,
    capacity: inventory.capacity,
    cropCount: crops.length,
    buildingCount: buildings.length,
    // Only offers the player can actually fulfil. Counting every posted offer
    // told a farm with an empty inventory that the board wanted something it
    // could deliver, which was false on the first launch of the running game.
    deliverableOffers: contracts.offers.filter((offer) =>
      inventory.stacks.some(
        (stack) => stack.item === offer.item && stack.quantity >= offer.quantity,
      ),
    ).length,
    hasSeed: inventory.stacks.some((stack) => stack.item.endsWith('_seed')),
    sellableGoods: inventory.stacks
      .filter((stack) => !stack.item.endsWith('_seed'))
      .reduce((total, stack) => total + stack.quantity, 0),
  });

  if (step === null) return null;

  return (
    <span className={styles['muted']} data-testid="next-step" title="What to do next">
      {step.text}
    </span>
  );
}
