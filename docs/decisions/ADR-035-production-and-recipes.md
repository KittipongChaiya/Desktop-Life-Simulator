# ADR-035: Production and Recipes

**Status:** Accepted — v0.4 Phase 24 (recorded), Phase 25 (implemented).
**Date:** 2026-08-18
**Phase:** v0.4 Phase 24 (the v0.4 baseline) — the model phase 25 builds and phases 26–28 extend.
**Bound by (not re-litigated):** ADR-011 (resources are conserved quantities in owner-tagged containers; craft output is a declared source and craft input a declared sink, §4; reservation is defined and deferred, §8); ADR-004 (§2 stores of plain data, §4 side-tables over optional fields, §5 definitions are content and instances reference them); ADR-010 (commands are the only write path); ADR-007 (§4 order is data, §7 integers only); ADR-008 (no event without a producer and a consumer); ADR-009 (derive what can be derived); ADR-019/ADR-026 (content enters through the public API under a namespace); `VISION.md` §2.2 (reward absence, never punish it).

---

## Context

v0.4's theme is reach, and its first milestone is the one every other
milestone feeds: **buildings that take items in and turn them into other
items**, and recipes that let those buildings chain — raw crop to processed
good to something better again (`PLAN.md` §5).

Almost nothing about this needs new primitives, and that is the finding worth
recording. ADR-011 wrote the model down two versions early: §4 already names
_"craft output"_ as a declared **source** and _"craft input"_ as a declared
**sink**, and §Impact already assigns v0.4 the sentence _"crafting is source
(output) + sink (input) over containers."_ `GAME_DESIGN.md` §11 says the same
from the design side: _"Factory (v0.4) — buildings that consume and produce
items — building + inventory model supports it."_ A factory is therefore not
a new kind of thing. It is a building, with containers, moving quantities
across boundaries the resource model already declared.

What genuinely needs deciding is smaller and sharper than "how does crafting
work", and it is all about **failure**:

1. What a recipe is, and who owns the relationship between a recipe and the
   building that runs it — because that is what decides whether a plugin can
   add a recipe to a first-party mill.
2. How much of a factory is stored versus derived, since v0.3 proved five
   times over that the derived answer is the cheaper one.
3. **What happens when production cannot proceed** — the output is full, the
   inputs are wrong, the recipe changed mid-craft. v0.4's headline success
   criterion is _"a production chain runs unattended for 8 hours without
   jamming,"_ and a jam is not a bug that shows up in a unit test. It is a
   farm that quietly stopped while the player was at work, which is the exact
   thing `VISION.md` §2.2 forbids. The jam rules are the substance of this
   ADR, and they are stated before any factory exists precisely because they
   are the part that cannot be retrofitted.

---

## Decision

**A recipe is content that names the building kind able to run it. A factory
is a building with a selected recipe, a start tick, and two containers — one
for what comes in, one for what is ready to leave — held in a side-table
keyed by building id. A craft consumes its inputs in one step and produces
its outputs in one step, and it consumes nothing unless every output is
already known to fit. A factory that cannot proceed is idle, never broken:
it backs off and resumes the moment conditions allow. Nothing in this model
knows what a "chain" is.**

### 1. The recipe names the building, not the other way round

```ts
export interface RecipeDefinition {
  readonly id: ContentId;
  /** The building KIND that can run this. A `ContentId`, never an instance. */
  readonly building: ContentId;
  readonly inputs: readonly ItemStack[];
  readonly outputs: readonly ItemStack[];
  /** Ticks one craft takes. Integer (ADR-007 §7). */
  readonly craftTicks: number;
}
```

The direction is the whole point. If a `BuildingDefinition` carried a list of
recipes, adding a recipe to the first-party mill would mean **editing
first-party content** — which a plugin cannot do, and which ADR-019 exists to
make unnecessary. With the recipe naming its building, a content pack adds
`thirdparty:grind_barley` targeting `core:mill` and the mill gains it with no
core edit at all. The set of recipes a building can run becomes a query over
the registry, which is precisely the shape a plugin extends.

This is the same asymmetry crops already have: a crop names the season it
grows in; a season does not enumerate its crops.

A building becomes a factory by being named by at least one recipe. There is
no `isFactory` flag and no `FactoryBuildingDefinition` subclass — ADR-004 §4's
rule, and ADR-030 §4 already refused the identical temptation for town
buildings: _"what makes a building 'town' is where it stands."_ What makes a
building a factory is that a recipe names it.

### 2. A factory's state is a side-table, and it is four fields

```ts
export interface FactoryState {
  /** The recipe the player selected, or null. Never inferred — see §5. */
  recipeId: ContentId | null;
  /** Tick the current craft began, or null when nothing is running. */
  startedTick: number | null;
  /** What has been delivered for the recipe to consume. */
  input: Container;
  /** What is finished and waiting to be taken away. */
  output: Container;
  /** Earliest tick to re-examine after finding no work (§6). */
  replanTick: number;
}
```

Held as `world.factories: Map<BuildingId, FactoryState>` — a side-table, so a
rest hut pays nothing for machinery it does not have (ADR-004 §4, exactly as
`buildingStorage` already works).

**Two containers, not one, and this is a correctness requirement rather than
tidiness.** With a single container a produced output is indistinguishable
from an undelivered input, so a mill that turns wheat into flour would offer
its own flour back to the next craft as though it were an ingredient, and a
recipe whose output is also an input would consume itself. Two containers make
"what came in" and "what is ready to leave" structurally distinct, which also
gives logistics (ADR-036) two unambiguous endpoints instead of one ambiguous
one.

**A factory's containers are deliberately NOT in `world.buildingStorage`.**
That map is general storage, and `selectStorageTarget` picks the nearest
building with space, blind to kind — so putting a mill's input buffer there
would have workers deposit whatever they were carrying into it. A mill's input
buffer filling with turnips is not a colourful edge case: it is a jam, with
no slots left for the wheat the recipe needs and no error anywhere to explain
it. A factory is reached only by an explicit route (ADR-036) or a deliberate
player transfer. `storage-target.ts` anticipated this in its own header —
_"future strategies (priority sheds, capacity balancing, **item filters,
logistics routing**) replace this function alone"_ — and this ADR takes it up
on the offer.

### 3. Progress is derived from one number

A running craft stores `startedTick` and nothing else. Completion is
`startedTick + craftTicks`, and remaining time is arithmetic on the current
tick — the same shape as `plantedTick` for crops (ADR-009 §2) and
`harvestedAt` for everything v0.4 adds after this. There is no `progress`
field, because a progress field is an accumulator that must be advanced,
serialized, and kept from drifting, and this one never has to be.

The honest limit, stated here rather than discovered in phase 26: **a chain
cannot be derived across a long absence the way a crop can.** A crop's
maturity depends only on when it was planted; a factory's tenth craft depends
on whether the ninth had inputs, which depends on what upstream produced,
which depends on its own inputs. Offline catch-up for production is therefore
a **model**, not a derivation, and it is bound by `GAME_DESIGN.md` §9.2's
round-down rule like every other model: where it cannot be certain, it credits
nothing. The catch-up work lands with its consumer in phases 25 and 26; what
this ADR fixes is that the _stored_ state stays one tick number, so the model
has the smallest possible surface to be wrong about.

### 4. The jam rules

These four are the reason this ADR exists, and each is stated as a rule the
implementation may not weaken.

**Rule A — nothing is consumed until every output is known to fit.** Before a
craft begins, the output container is asked whether it can accept every output
stack in full. If it cannot, the craft does not start and the inputs are
untouched. The alternative — consume now, discover later — either destroys the
player's goods (forbidden outright: ADR-011 §7, a full destination blocks and
never discards) or leaves a craft permanently mid-flight with its inputs gone.

**Rule B — a blocked factory is idle, never broken.** There is no jammed state,
no error flag, and no operator intervention. A factory with no recipe, missing
inputs, or a full output is simply a factory with nothing to do this tick, and
it resumes the moment that stops being true. This is `WorkerState.Idle`'s rule
one system over — _"a worker NEVER deadlocks... no state can leave `Idle`
unreachable"_ — and it is a product rule before it is a technical one, because
the failure it prevents is a player returning after eight hours to a farm that
stopped for a reason it never showed them.

**Rule C — a craft is atomic at both ends.** Inputs leave in one step, outputs
arrive in one step, and no intermediate state exists in which some inputs have
been consumed. This is ADR-010 §2's "a command never partially applies" applied
to the one operation that crosses two containers and two conservation
boundaries at once.

**Rule D — conservation needs a second, wider net, or it silently stops
meaning anything.** ADR-011's conservation property is the most valuable test
in the resource half of this project. But the test that implements it today
(`container.test.ts`, "conservation (crit 9)") is a property over **`transfer`
alone** — an arbitrary sequence of moves between three containers, asserting
total quantity is invariant after every one. Crafting never calls `transfer`.
It removes at one boundary and adds at another, so that test would go on
passing, unchanged and fully green, over any quantity bug crafting can
introduce.

Phase 25 therefore owes a **second** property, at the world level rather than
the container level: across an arbitrary command stream including crafts,

```
Σ(all containers) + Σ(sinks) − Σ(sources) is invariant
```

with craft inputs counted as sinks and craft outputs as sources. The existing
test is not extended — it is correct about what it covers — it is joined. A
conservation test that does not know about crafting is not a weaker test; it
is a test that is silent exactly where the new risk is.

**Rule E — a full output blocks upstream, and that is correct.** When a
kitchen stops taking flour, the mill's output fills, the mill stops, and its
input backs up. The chain stalls from the front, no goods are lost, and it
drains itself the moment the kitchen has room. This is the desired behaviour
and not a jam: a jam is a chain that stays stopped after the condition clears.
The 8-hour test in phase 26 asserts exactly that distinction — stalls are
permitted, and a stall that outlives its cause is a failure.

### 5. The recipe is chosen, never inferred

A factory runs the recipe the player selected, through a command. It does not
look at what is in its input buffer and decide.

Inference is the tempting version and it is wrong for a reason that only shows
up later: a stray delivery would silently change what the building makes, so a
mill that had been producing flour for six hours would start producing
something else because one wrong stack arrived, and nothing on screen would
explain it. Explicit selection also means an empty factory has a legible
answer to "what is this for" before anything is delivered to it.

Changing the recipe while a craft is running **cancels that craft and returns
its inputs**. It does not silently finish the old one, and it does not destroy
goods — the return is a transfer, so conservation holds and Rule C is intact.

### 6. An idle factory backs off

A factory that finds nothing to do sets `replanTick` a fixed number of ticks
ahead and is skipped until then, rather than re-testing its recipe every tick.

This is `Worker.replanTick` (`GAME_DESIGN.md` §4.2) with the same rationale in
the same words: sustained no-work is a **normal regime**, not an error, and a
farm with many idle factories re-deriving their conditions twenty times a
second would spend the idle-CPU budget on discovering that nothing changed.
The cost is bounded staleness — a factory can sit briefly idle after its
inputs arrive — which is the same trade already accepted for workers, and it
is invisible against craft times measured in hundreds of ticks.

### 7. Nothing here knows what a chain is

There is no production line, no chain entity, no graph, and no topological
anything in this model. A chain is an emergent property of one recipe's output
being another recipe's input, and the only machinery that makes it _run_ is
something moving items from one factory's output to the next factory's input —
which is logistics, decided separately in ADR-036 and built in phase 26.

Stated explicitly because the pressure to build a `ProductionChain` type will
be real and will look reasonable: it would be the speculative generality
`AI_RULES.md` §1.5 forbids, it would duplicate information already implied by
the recipes, and it would immediately need to be kept in sync with them.

### 8. Events

Two, and both get a producer and a consumer in phase 25 or they do not ship
(ADR-008 §Ongoing):

| Event            | Fired when                    | First consumer                       |
| ---------------- | ----------------------------- | ------------------------------------ |
| `craftStarted`   | inputs consumed, timer begins | the factory panel; the devtools ring |
| `craftCompleted` | outputs land in the output    | feedback effects; the devtools ring  |

`craftBlocked` is deliberately **not** in this table. A blocked factory is an
ordinary condition that occurs constantly (Rule B), an event for it would fire
continuously on a healthy farm, and there is no consumer that wants it. The
factory panel reads the condition from the snapshot, which is where a queryable
state belongs.

### 9. What this ADR does not decide

- **Logistics, routes, and reservation.** ADR-036, phase 26. This ADR
  deliberately leaves a factory unable to feed itself, so that the thing which
  feeds it is designed once, on purpose, rather than as a mill's private
  convenience.
- **Which recipes exist, and their balance.** Content (`plugins/core`). Phase
  25 ships wheat → flour → bread to prove a chain three steps deep is real;
  the numbers are provisional and rebalanced as data, per `GAME_DESIGN.md` §12.
- **The offline model for chains.** Bound above by §3 and the round-down rule;
  written where its consumer is.
- **The factory UI.** Presentation, phase 25.

---

## Consequences

**Immediate (phase 25 implements, this ADR governs)**

- A `RecipeDefinition` type, its registry, and a `recipes` field on
  `ContentBundle` — the same door crops and buildings already come through.
- `world.factories`, a side-table; two containers per factory; four fields of
  state, one of them a tick.
- `productionSystem` in `TICK_SYSTEMS`, registered into the existing
  **`economy` phase** ("economy and inventory settlement", `PHASE_ORDER`) and
  **first within it** — after `worker`/`movement` in the `workers` phase, so a
  delivery made this tick is visible to this tick's craft, and ahead of
  `economySystem`, so a completed craft is visible to the same tick's market
  sweep. No new phase: `PHASE_ORDER`'s own comment makes adding one _"a
  deliberate, reviewable act"_, and production is inventory settlement, which
  is what the `economy` phase already means. Order is data (ADR-007 §4) and
  this placement is the data.
- Commands for selecting a recipe and for transferring into and out of a
  factory. No system writes a container directly (ADR-010 §1).
- The conservation property test extended to craft boundaries, in the same
  commit — Rule D.
- Schema v11: the factory side-table, with a golden fixture at v10 that
  **carries a running factory**, not an empty one. An empty fixture once made
  a migration test pass vacuously (the v6→v7 lesson) and that trap is designed
  against now.
- Runner time allowances raised in the same commit that adds the tick system —
  v0.3's recorded lesson, applied on schedule rather than after a red run.

**Ongoing**

- **A new recipe is data.** No code, no migration, no core edit.
- **A new factory kind is a building definition plus a recipe naming it.**
- **A factory's containers are never a general deposit target.** Anything that
  reaches into `world.factories` from the storage-selection path is
  reintroducing the turnips-in-the-mill jam §2 exists to prevent.
- **No craft consumes before its outputs are known to fit** (Rule A), and no
  craft partially applies (Rule C).
- **Every conservation-touching addition updates the conservation test.**

**Validation**

- **Conservation across crafting:** over an arbitrary command stream including
  crafts, total quantity is invariant once craft sources and sinks are
  accounted. Property test (`fast-check`), extending ADR-011's.
- **No-loss under a full output:** a craft attempted into a full output leaves
  both containers byte-identical, and completes normally once space appears.
- **Determinism:** identical command streams produce identical factory state
  after N ticks, including which factory crafted in which order.
- **The stall/jam distinction:** a chain stalled by a full downstream resumes
  without intervention once the downstream drains — the 8-hour long-run in
  phase 26 is the acceptance form of this.
- **Save round-trip:** a factory mid-craft round-trips to the same craft with
  the same completion tick.

**Revisit if**

- **A recipe needs more than one building kind** → the recipe's `building`
  becomes a list; nothing else changes. Not built now because no content wants
  it (`AI_RULES.md` §1.5).
- **Craft outputs need to vary** (quality, byproducts by chance) → that is
  real variation and ADR-004 §4 already dictates the answer: a side-table over
  the items that need it, never a field on every stack. Note that any RNG in a
  craft consumes the world stream and must be ordered deterministically.
- **Per-tick factory cost becomes measurable** → the back-off in §6 is the
  first lever; a dirty-set of factories needing examination is the second. The
  model does not change.
