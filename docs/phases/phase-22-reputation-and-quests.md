# Phase 22 — Reputation & Quests

> **Delivers:** standing with the town, and the first objectives that
> outlast a single deal. Three tiers read from the counters phase-20 saved
> for exactly this; a four-slot board whose later slots open to a proven
> name; five content-declared quest chains that pay for the milestones the
> counters record.
> **Governing decisions:** ADR-034; ADR-032 §6 (the counters were reserved);
> ADR-022/031/033 (the derivation discipline); `VISION.md` §2.2.
> **Schema:** **v10** — one link: an offer-id re-key, and two empty stores.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                             | Commit    |
| ----- | ---------------------------------------------------- | --------- |
| 1     | ADR-034, before anything moved                       | `8f5c7f9` |
| 2     | Standing, the gated board, schema v10                | `9a6207e` |
| 3     | The quest chains, their step, their event, their HUD | `8887845` |
| 4     | The live pass as a permanent e2e, and what it caught | `16c64b4` |
| 5     | This close                                           | _this_    |

## The load-bearing decision

The roadmap sketched reputation as new state. Examining what it needs
showed most of it is not — ADR-031's finding, repeated: the save already
carries the history (`contractStats.fulfilled`, recorded since v8 with the
written intent that phase-22 would read it), so **standing is a reading,
never a stored score**. Three tiers, two thresholds, one counter, and
deliberately fulfilled-only: a missed contract already costs its premium,
and standing that decayed while away would punish absence. The player's
whole rule is one sentence — every delivery raises your name, and nothing
lowers it.

What genuinely is state is small and precisely bounded: a per-chain
high-water mark of quest steps already **paid** (coins granted once must
stay granted once, and the wallet does not remember why it grew), plus the
per-requester counter the resident chains read. Schema v10 carries both,
empty, and re-keys offer identity from `day × 2 + slot` to `day × 4 + slot`
for the wider board — frozen terms untouched, and the v9 golden fixture
deliberately carries an open and a fulfilled contract so the re-key cannot
pass vacuously (the v6→v7 lesson, applied).

## What standing gates

The board derives four slots tier-blind; the gate holds at the command
boundary. Slots 0–1 are phase-20's open board, slot 2 opens to a Friend
(3 delivered), slot 3 — a **grand order**, 400–900 coins of base value —
to a Pillar (10). Locked slots are visible with who they are for, which is
the progression made legible on paper. Tiers unlock more and bigger deals,
**never better prices**: the premium band is untouched, so both memorizable
price rules survive the phase.

## Quests: thresholds over counters

Five chains as content, the residents' pattern: A Good Neighbour (steps at
1, 3, and 10 deliveries — deliberately the standing tiers, so the chain
celebrates what the gates open) and a short errand chain per villager. No
deadlines, no failure, no branching; rewards are declared coins sized below
contract premiums. The quest step runs after the contract sweep, pays newly
crossed steps, and publishes `questCompleted` to real consumers — the coin
celebration at the notice board, and the devtools ring. A migrated save is
paid what its recorded history earned on the first live tick, deliberately:
the counters were honest, so the reward is.

## Verified live, and what the pass caught — again

The live pass is now a **permanent spec** (`tests/e2e/board.spec.ts`): a
crafted save one delivery short of Friend — built by the real serializer
from a found seed whose day-0 board asks for turnips — launches, and the
third delivery happens on screen. Watched, all at once: the exact coin
delta (frozen reward + 150 + 40, nothing else), the standing line stepping
to Friend, the third slot's lock opening **without a reload**, the
delivered receipt, and the milestones advancing.

Three phases running, the screenshot pass found what the unit suites could
not: a long request sentence pushed its row's trailing label against the
panel edge (flex `min-width: auto`). Two lines of CSS, and a reminder that
layout has no unit tests.

Also fixed en route: the panel's full-docket notice counted store size
while the validator counted OPEN contracts, so a delivered receipt riding
to its deadline wrongly disabled Accept — a v9 leftover, caught by reading
the two ends side by side, now pinned by a regression test.

## Suites at close

2,727 unit tests; the full e2e suite including the new board spec;
typecheck; lint; the production-build gate.

## Deliberately not in this phase

Negative standing or decay, per-resident affinity, dialogue, a quest
journal window, quest deadlines or failure, reputation-priced goods, and
any new sale channel. Reputation touches exactly one thing — the board —
and quests touch exactly one wallet.
