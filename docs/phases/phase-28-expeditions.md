# Phase 28 — World Map & Expeditions

> **Delivers:** somewhere the farm can reach that nobody can walk to; workers
> sent away and brought back; and the panel that makes the map a place rather
> than a menu.
> **Governing decisions:** ADR-038 (written here); ADR-037 (the derived model
> this reuses); ADR-034 (standing gates the map); ADR-011 §4, §7; ADR-010 §6;
> ADR-005 §2; `GAME_DESIGN.md` §9.2 (credit less, never more).
> **Schema:** **v14** — the expedition table, empty.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                              | Commit    |
| ----- | ----------------------------------------------------- | --------- |
| 1     | ADR-038, before anything moved                        | `a4cd3d4` |
| 2     | The simulation: content, commands, system, schema v14 | `e166ab9` |
| 3     | The map panel, and three defects only the app showed  | `0cdf1c2` |

---

## The load-bearing decision: the map is a list, not more grid

The obvious reading of _world map_ is more tiles. The grid is already 112 × 64
after two relayout migrations, each of which re-encoded four dense arrays and
remapped every stored index, and a third would be the most expensive possible
way to express **far away** — which `travelTicks` expresses in one integer.

The cost is stated rather than glossed: **you never see the place.** A
destination is a name, an icon, and what comes back. That is a real loss
against a rendered region, and it is accepted because the alternative buys a
migration and a screen of art to say one number.

## Only the departure is stored

`{ worker, destination, departedTick }`. The return tick, the haul, and the
time remaining are all arithmetic on it.

**This is ADR-037's model applied to time instead of space**, and it buys the
same thing. An expedition is by construction the longest-running thing in the
game, so it is the mechanic most likely to complete while the player is at
work — which makes it the biggest threat to v0.4's _"offline catch-up remains
accurate"_ criterion. Derived, it is not a threat at all: _has this returned by
tick T_ is a comparison. Rolled on arrival, the roll would have to happen
inside catch-up, and a catch-up that performs draws can drift from a live run.

There is a test that runs one world through every tick of a trip and jumps
another straight over the gap, and asserts the farm ends up holding the same
goods.

## The rate rule is a test, and the anchor was measured before it was chosen

The real cost of an expedition is the **worker**. Supplies are a declared sink
and they are not the lever; a hand on a trip is a hand not harvesting for its
whole duration.

`tests/expedition-rate.test.ts` computes each destination's haul value per tick
of worker time and asserts it inside half-to-double a forager's. Above the
ceiling, the correct play is to send everyone away and let the farm rot; below
the floor, nobody goes.

**Farming was the obvious anchor and is wrong.** Measured: a 24-tile wheat farm
with three hands earns **0.0033 coins per worker-tick** over 200,000 ticks —
twenty times below a forager's rate at base price, because the farm's coin
figure is dominated by the sale multiplier decaying under its own volume
(ADR-013). Anchoring there would have made the test a measure of the market
rather than of the mechanic. Gathering is the comparable mechanic, and base
price is the stable unit, since the decay applies to both sides and cancels.

**And the rule then chose the content.** A worker carries twenty items, so wood
at 8 and stone at 14 cap a full pack at a few hundred coins — a wood-and-stone
destination would have to be under two minutes away to pay its rate, which is a
walk, not an expedition. The hauls are the scarce goods instead: ore and wild
produce. The wilds already supply wood and stone, and a destination competing
with the band next door would be somewhere with no reason to exist.

That is also the phase's answer to the infinite-money question: every coin an
expedition produces is an item that entered at a declared source and leaves
through the ordinary channel, at the ordinary decaying multiplier, against the
ordinary demand. Nothing about an expedition touches price.

## Two structural guarantees the carry cap forced

`isReachableDestination` refuses a destination whose **biggest possible** haul
cannot fit an empty hold, and the send command refuses a worker who is still
carrying. Together they make _the haul always fits_ a property rather than a
runtime hope — ADR-011 §7 forbids silently discarding a conserved quantity, and
there is no third option once a return has more than the hold can take.

## What the live pass found — four defects, in one sitting

The fourth phase running that a screenshot has caught what a green suite did
not, and this time it caught the most.

**Send was enabled with nothing to outfit the trip.** Click, `MissingItem`,
nothing happens, no explanation — on a fresh world with 100 coins and no seed,
which is the first thing a new player would try.

**And the supplies check read `world.inventory` alone.** That is the phase-06
defect exactly, one system later: a player who had built a shed — which the
game actively encourages — would find Send silently refused because their seed
had been tidied away. `commerce-commands.ts` already carries the fix and the
warning in its own header. Supplies now check and drain through
`heldForSale`/`sellableContainers`, the same helpers selling and contract
delivery use.

**The hire price dropped when a worker went away.** `hireWorker` charges
`hireCost(world.workers.size)`, which counts everyone; the panel priced off the
workers slice, which by this phase's own design excludes anyone away. So
sending a hand out quoted a cheaper hire than the command charges and enabled a
button the validator refuses. The status bar also read **"0 workers"** with a
hand out at the delta — which is not a display quibble; it reads as a worker
lost.

That one is the transferable lesson: **a decision that makes something
invisible has to be followed to every place that was counting it.** ADR-038 §2
removes away workers from the slice on purpose, and every consumer of that
count was silently wrong until someone looked.

**And the status bar wrapped**, because the Map toggle was the element that
pushed the row past its width at 1400px.

## The third over-credit in `catchUpFactories`

Two things came out of reading catch-up against this phase.

**A worker who is away was still counted as farm labour.** `catchUpWorld` reads
`world.workers.size`, which includes anyone on a trip, so the model credited a
harvest nobody performed. Everyone currently away is now excluded for the whole
gap — under-crediting one who would have come home part-way through, which is
the safe direction and the same round-down every other line there takes.

**And the never-over property found a genuine over-credit that phase 26
shipped.** The model advanced crafts at a cadence of `craftTicks`; the
simulation runs them at **`craftTicks + 1`**, because a factory that completes
on tick T is idle on T and cannot restart until T + 1 — the same off-by-one as
the first start, at every restart. Measured rather than reasoned: a live mill
completes at 1201, 2402, 3603, 4804, a constant 1,201 gap for a 1,200-tick
recipe.

This is the **third** over-credit that one function has had, and the way it
survived is the thing worth recording: **the property fails on about one run in
three, so a green run was never evidence.** It was green through the whole of
phase 26. The two counterexamples are now pinned as deterministic examples
alongside the property, and the example test that asserted five crafts in
`craftTicks × 5 + 2` was corrected — it had been pinning the model's answer
rather than the game's, and now asserts against a live run.

## Profiling

Headless, 200,000 ticks, three hands, twenty-four crops in the ground, seed
4242 — a **real** v0.4 farm rather than phase 27's empty one:

| Crew     | mean      | p50    | p95    | p99        | max    |
| -------- | --------- | ------ | ------ | ---------- | ------ |
| All home | 0.3920 ms | 0.3863 | 0.4349 | **0.5261** | 0.7663 |
| One away | 0.4255 ms | 0.4012 | 0.5581 | **0.8359** | 0.9281 |

**PASS** — p99 **0.53 ms** against ADR-003 §2's 3 ms trigger, roughly six times
inside it.

Two honest notes. This is an order of magnitude above phase 27's 0.048 ms, and
that is the CROPS, not the expeditions: phase 27's world had none, so its
number measured an idle farm. And **the second row is not a clean comparison** —
the delta trip is 3,600 ticks, so the hand is home for 98% of the run, and the
difference between the two rows is run-to-run noise rather than a measured cost
of being away. The row is kept because deleting an inconclusive measurement is
how a phase ends up reporting only its flattering ones.

Recorded in `PERFORMANCE.md` §16, which phase 29 reads.

## Suites at close

3,080 tests across 239 files. Lint clean at `--max-warnings 0`; all three
typechecks clean. The full migration chain v1 → v14 passes, and the v13 golden
fixture carries crops, buildings, workers, a route, a live haul and a worked
wild tile through the new link.

## Deliberately not in this phase

- **Parties.** One worker per expedition; a party is a scheduling feature with
  no consumer.
- **Danger, injury, or anything that fights back.** Out of scope for v0.4 by
  the owner's standing constraint, and §4's no-failure rule refuses it anyway.
- **Choosing what to bring.** A loadout is a decision with no consequence until
  outcomes vary by input.
- **A rendered map screen.** Travel is a readout, not an animation.
- **A recall.** Supplies are spent at departure, so a cancellable trip would be
  a free option on an outcome the hash has already decided.
- **Mentioning a returning hand in the return summary.** The trip resolves on
  the first live tick after a gap rather than inside catch-up, so the summary
  does not see it. The goods arrive; the sentence does not. Recorded here
  rather than fixed, because the summary's shape is catch-up's and this is not.
