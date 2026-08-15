# ADR-031: Residents

**Status:** Accepted — v0.3 Phase 19.
**Date:** 2026-08-15
**Phase:** v0.3 Phase 19 (NPCs) — the village phase-18 built gains its people.
**Bound by (not re-litigated):** ADR-030 (town land is never ownable, so town ground never changes); ADR-009 §2 (derive from the tick wherever derivation is exact); ADR-022 §1 (the precedent: a hash of stored inputs, never a draw from `world.rng`); ADR-004 (whatever is entity state is plain data in stores); ADR-005 §2 (slices republish only on change); ADR-007 (determinism); `VISION.md` §2.2 (reward absence, never punish it); ADR-017/PERFORMANCE.md §14 (the phase-17 finding: entity cost must be budgeted against expanded-and-unattended).

---

## Context

Phase 19 delivers `PLAN.md` §4's first v0.3 criterion: _"NPCs follow
believable daily schedules."_ Four cottages stand around a plaza with a well,
a notice board, a castle, and a road — and nobody lives there.

The roadmap's dependency note predicted the implementation: _"worker state
machine generalizes to any actor."_ Examining what a resident actually needs
shows the prediction reached for the wrong precedent. A worker's day is
**contingent** — which tile is ripe, which shed has room, how much energy
remains — so a worker must be stateful: five FSM states, a claimed task, an
energy meter, a carry-hold, all serialized, all migrated, all credited by
offline catch-up under a provably-conservative model that took phase-07d a
property-test bloodbath to get right.

A resident's day is **not contingent on anything that changes.** Where they
live is content (phase-18's layout table). When they wake is a function of the
day phase, which is a function of the tick (ADR-020). Where they go is a
choice among a handful of town places, and town ground can never change —
no tile east of the farm region is ownable, placeable, or tillable, by
ADR-030 §1's construction. Every input to a resident's position is either
content, the seed, or the tick.

This project has a name for that situation. The weather is not a system; it is
a hash (ADR-022). The day is not a system; it is a derivation (ADR-020).
Growth is not an accumulator; it is `tick − plantedTick` (ADR-009). The rule
those three bought — **exact offline behaviour with no catch-up code, no save
fields, no migration, and no determinism surface** — is available here, and
generalizing the worker FSM would decline it in exchange for a second copy of
the most expensive machinery in the codebase.

---

## Decision

**A resident is derived, like the weather. The entire population — names,
homes, costumes — is core content; a resident's activity, route, and position
at any tick are pure functions of `(content, seed, tick)`. Nothing about a
resident is stored in the save, so the schema stays at v7, offline behaviour
is exact by construction, and a loaded world's residents are simply
wherever the clock says they are.**

### 1. The population is content

Four residents, a fixed table beside the town layout (`ADR-030 §4`'s
pattern): a name, a home cottage, a costume, a personality stagger. No
registry until a second content source wants to add a resident — the same
deferral ADR-016 §4 applied to ambient audio, for the same reason: a
capability nothing exercises is a claim, not a feature.

Their names become canon on first appearance (`LORE_BIBLE.md` §17 rule 2)
and are recorded there.

### 2. The day is an itinerary, derived

```
wake  = dawnStart + stagger(seed, resident, day)
then: walk to a derived stop, dwell a derived while, repeat
dusk:  walk home, go indoors
night: indoors (not rendered, not projected — the town sleeps)
```

Stops are drawn from the town's places — the well, the plaza, the notice
board, the castle walk, another cottage's door — chosen by `mix32` hashing
of `(seed, resident, day, step)`, **never** `world.rng`: ADR-022 §1's rule
verbatim, because a world that computes its residents must not diverge from
one that does not, and because a hash is queryable at any tick, past or
future, which is what makes offline exactness free.

The itinerary for `(resident, day)` is generated lazily and memoised. The
memo is a pure-function cache, not state — it lives beside the derivation,
never on the `World`, and never in the save.

### 3. Residents walk town ground only, on their own pathfinder

Resident routes run on a **static** walkability view: town-region tiles
(`x ≥ TOWN_MIN_X`), town buildings as permanent obstacles, path tiles at the
same 7-tick stride workers enjoy and grass at 10. The farm's A* is not
reused, deliberately: `findPath(world, …)` reads live blocked bits, and a
route that could dip one tile into farm land would make a resident's derived
position depend on where the player last placed a shed — a mutable input
smuggled into a pure function. The town pathfinder takes no world at all,
so its routes are constants of the content and cacheable forever.

Residents do not block tiles, claim nothing, and collide with nothing —
a worker walks through a resident exactly as workers walk through each
other. Interaction between residents and the farm economy arrives with
contracts (phase 20) and lives in contract state, not resident state.

### 4. The boundary is a slice, like everything else

A `residents` snapshot slice projects id, name, tile, target tile, move
fraction, facing, and activity — derived at projection time, published only
on change (ADR-005 §2). At night the slice is empty and publishes nothing:
the sleeping town costs zero — projection, republish, and render all quiet.

The renderer draws residents from the slice on the y-sorted objects layer
with the worker view's interpolation and walk-cycle machinery. Villagers
share the one character rig (`CHARACTER_BIBLE.md` §14 rule 2: costumes
differ, the body never does) as scripted costume variants.

### 5. What this deliberately is not

- **Not reactive.** A derived resident cannot flee, follow, or greet. v0.3
  needs routine, not response; the day a resident must react to the player,
  that resident's state graduates into stores with a schema bump — scope
  moving later, on evidence (`PLAN.md` §9.2).
- **Not the merchant.** The recurring friendly face the player trades with
  (`LORE_BIBLE.md` §10) belongs to the market phases.
- **Not a crowd.** Four residents, matching four doors. The entity-budget
  criterion (`PLAN.md` §4) is re-measured at close against the phase-17/18
  baseline before anyone considers more.

---

## Consequences

**Bought:** zero save-format impact (schema stays v7 — the plan's sketch of
"schema v8" is not needed and this ADR records why); zero catch-up model and
therefore zero conservative-crediting proofs; exact offline behaviour — leave
for three hours and every resident is precisely where their day says, not
frozen where you left them, which is `VISION.md` §2.2's promise arriving as
people; determinism untouched (no rng consumption, asserted by the ADR-022
§1-style stream test).

**Paid:** residents cannot respond to anything that is not content, seed, or
tick. The conversion cost if a later phase needs stateful residents is one
schema bump then — against five saved fields, a migration, and a catch-up
model **now** for a capability no v0.3 phase uses.

**Watched:** projection now does per-tick derivation work. The itinerary memo
bounds it (routes computed once per resident-day), and the phase closes by
re-running criterion 12 with the population awake — the number the phase-17
baseline exists to defend.
