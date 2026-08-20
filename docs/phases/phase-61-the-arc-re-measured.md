# Phase 61 — The Arc, Re-measured

> **Delivers:** the progression arc measured against every crop a new farm can
> plant, a defect found in the measuring instrument, a soft-lock found in the
> product, and **no balance change** — because the measurement did not ask for
> one.
> **Governing decisions:** ADR-044 (the arc is measured, not tuned); ADR-046 §4
> (balance authority delegated for v0.6, on evidence); ADR-040 (evidence
> classes).
> **Schema:** none.
> **Status:** **Complete.**

---

## The question

v0.6 added eight crops, seven recipes, three buildings and three destinations.
The arc had been timed once, at phase 31, with turnips — and turnips were the
only crop a new farm could plant, because the other three were seasonal and the
model starts in spring.

**Spring now holds six crops**, and each is a different opening. A perfect
player picks the best one available, so the arc's real bound is the fastest of
the six, not the turnip's. Measuring one crop and calling it the arc was correct
when there was one; it had become a sample.

## The answer

| Opening    | hire | shed | bin | **stage 4** |
| ---------- | ---- | ---- | --- | ----------- |
| pea        | 1m   | 3m   | 5m  | **10m**     |
| turnip     | 2m   | 5m   | 6m  | **11m**     |
| strawberry | 5m   | 5m   | 7m  | **11m**     |
| leek       | 4m   | 7m   | 7m  | **11m**     |
| flax       | 9m   | 9m   | 13m | **13m**     |
| wheat      | 7m   | 11m  | 14m | **17m**     |

Floor 5 minutes, ceiling 4 hours. Every opening clears both.

**The arc did not move.** The fastest opening a perfect player has in v0.6 (pea,
10m) is one minute quicker than the turnip line phase 31 measured at ~12m. Eight
crops, four production chains and three new buildings changed the bound by about
8%.

**So no balance was changed.** ADR-046 §4 grants the authority and ADR-044 sets
the standard: a change needs a measurement it is responding to. This measurement
asks for nothing. Recording that is the deliverable — a tuning pass that tunes
because it is a tuning pass is how a stable economy gets destabilised.

## Two defects, and they are in different places

### The instrument was lying, and it lied in the most convincing direction

The first run reported `core:strawberry — NEVER, peak 100 coins`. Read plainly,
that says a crop shipped four hours earlier is unplayable.

It is not. Run without the model's building policy, the same strawberry farm
earns **66,720 coins across the same four hours**. Two things were wrong with the
model, and both had been there since phase 31:

**It spent past the price of a seed.** The policy bought the moment it could
afford the price. On a strawberry farm it bought the seed bin down to **4 coins
while holding no crops and no seeds** — and a strawberry seed costs 8. From
there `affordable` is `floor(4 / 8)`, which is zero: nothing planted, nothing
harvested, nothing earned, for the remaining three and a half hours. The file's
own header says the policy is "what a well-informed player does", and spending
past the price of a seed is not that.

Turnip and pea never hit it because their seeds cost 5 and 3 — the same
bankruptcy leaves them able to buy. **The bug needed a crop with an expensive
seed to become visible, and for six versions there was none.**

**`peakCoins` was sampled where the purse is always empty.** It read
immediately after `stepSimulationBy`, which is the one moment in the cycle when
the previous iteration has just sold everything and spent it. Every failing run
therefore reported `peak 100` — the starting float — including runs that had
demonstrably held over a thousand coins to buy a seed bin. The tell was flax,
which reached stage 4 at 13m and also reported `peak 100`; a diagnostic that
prints the same number whatever happened is worse than none, because it gets
quoted.

Both are fixed in the model. The building policy now keeps a seed reserve when
the farm is empty, and peak is sampled after the buying.

### The product has a state it cannot leave, and that is NOT fixed

The model's bankruptcy is a real one. **Nothing in the game refuses a purchase
that leaves the player with no crops, no seeds, and less than one seed's worth
of coins** — and from there the farm has no way to earn. Planting needs a seed,
a seed needs coins, coins need a harvest.

For a game whose entire promise is that you can walk away and come back to
something better, a state that never recovers while it runs is worse than an
ordinary bad move. Every other mistake in this design costs time. This one costs
the save.

**It is recorded, not patched.** Every plausible fix — a purchase that refuses
itself, a minimum balance, a free-seed grant, a worker who can earn without
capital — is a system, and ADR-046 §1 binds v0.6 to content. Inventing a safety
net in the last hours of a content pass is how a version acquires a mechanic
nobody designed. `GAME_DESIGN.md` §6.4a carries it, with three candidate fixes
ranked by how little they change.

**Reachability by a real player is UNMEASURED.** It needs somebody to spend to
the floor at the wrong moment; the shop makes that possible rather than likely.
What is certain is that the state exists, that nothing warns about it, and that
it does not recover on its own.

## A note on how the failing test was written

The first version of this case looped over the crops and asserted inside the
loop. It reported strawberry and hid the other five, which is the opposite of
what a balance measurement is for. It now runs every crop, prints the table
either way, and asserts afterwards — so a red run and a green run produce the
same artefact, and the artefact is the point.
