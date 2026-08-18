# Phase 26 — Logistics & Reservation

> **Delivers:** goods move between buildings without the player carrying them,
> and v0.4's headline criterion becomes an executable test.
> **Governing decisions:** ADR-036 (**amended during implementation** — see
> below); ADR-035 (factories stay endpoints); ADR-011 §6, §7; ADR-010; ADR-024.
> **Schema:** **v12** — routes, the route id counter, per-worker haul state.
> **Status:** **Complete.**

---

## Criterion 1 is now a test, not a claim

`tests/chain-longrun.test.ts` builds shed → mill → kitchen, routes both links,
hires five workers, and runs **576,000 real ticks** with nobody touching
anything. Three claims about that one run:

| Claim                      | How it is asserted                                                        |
| -------------------------- | ------------------------------------------------------------------------- |
| Still producing at the END | bread count in the final quarter exceeds the three-quarter mark           |
| Never over-reserves        | at every sample, claims ≤ what the source holds                           |
| Conserves value            | 1 wheat / 2 per flour / 4 per bread, invariant within one in-flight craft |

**Passes in 266 s.** The first claim is the one that matters: a chain that
wedged after ten minutes would satisfy any total-output assertion and fail
this. That is the stall/jam distinction ADR-035 Rule E draws, made executable.

## The amendment: reservations are derived

ADR-036 §4 specified a reservation _record_ owned by a task, and §5 defence 3 a
per-tick sweep to catch leaks. Implementation found a stronger form: a worker
holding a `Haul` task for route R has, by that fact alone, claimed goods at R's
source; a worker whose `hauling` is R has claimed space at R's destination.

Nothing is recorded, so **nothing can leak**. Release on every exit path
becomes structural rather than disciplined, and the sweep is **withdrawn** —
a sweep over derived state can only ever find nothing, and keeping it would
imply a leak class that no longer exists. Reservations also survive save/load
for free, because tasks already do.

The ADR carries this as a written amendment rather than a silent divergence.

## Factories stayed endpoints

`world/endpoints.ts` answers two questions — what may be taken from a building,
what may be given to it — and knows nothing about factories, recipes or
crafting. The asymmetry is the content: a factory offers its **output** and
accepts into its **input**. With one container a hauler would take back the
flour it just delivered, which is a loop rather than a chain.

Nothing about logistics lives inside the factory model, and a future wagon or
chest answers the same two questions.

## What the end-to-end tests found that unit tests could not

- **Tilling outranked hauling**, so on a farm with any untilled ground — which
  is every farm — hauls never ran at all. Priority now follows ADR-036 §3.
- **A haul targeted the building's own tile**, which is `blocked` and therefore
  unpathable. It targets a walkable neighbour now.
- **The deposit path would have stolen a haul.** A ten-item load is
  indistinguishable from a full harvest hold, and the ordinary deposit would
  have put it in the nearest shed — silently undoing the haul while the chain
  appeared to work. Guarded, and tested.

## Two over-credits the property test caught

Wiring offline production surfaced **two** violations of the round-down rule,
both the 09c shape and both invisible without a property comparing against the
real simulation:

1. An idle factory cannot start until the first tick **inside** a gap.
2. A craft must complete **strictly inside** it.

The example tests that encoded the old boundaries were corrected to match the
simulation, not the other way round.

## Offline chains: the honest position

Routes make a factory's inputs change during a gap, so phase-25's exact model
no longer describes reality. Nothing models hauling offline: a factory
finishes only what was staged in its input when the player left.

That is **conservative, not wrong** — it under-credits, which is the one
direction `GAME_DESIGN.md` §9.2 permits. The cost is stated rather than hidden:
a player who leaves a chain running for eight hours is credited the buffers,
not the chain. **`PLAN.md` §5 criterion 4 is therefore PARTIAL, not PASS.**

## Suites at close

2,907 unit tests across 227 files; lint, typecheck, boundaries and cycles
clean; the 8-hour acceptance test green.

## Deliberately not in this phase

Route filters, priorities, thresholds and rates (ADR-036 §2 — added when a
chain demonstrably needs one); a route-building UI; cross-region logistics
(phase 27's question); and any offline model of hauling.
