# Phase 27 — The Wilds & Resources

> **Delivers:** a third region of the map with things worth going to get, the
> workers who go and get them, and — after the first live look — a wilderness
> you can actually see.
> **Governing decisions:** ADR-037 (**amended twice during implementation**,
> both times by measurement); ADR-005 §2 (a slice that republishes every tick
> is a defect); ADR-024 (gathering is a band, not a system); ADR-011 §4
> (working a node is a declared source); ADR-017 §12 (render on demand);
> ADR-015 (append-only migrations).
> **Schema:** **v13** — the grid widens to 112×64 and `harvestedAt` arrives.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                                  | Commit    |
| ----- | --------------------------------------------------------- | --------- |
| 1     | ADR-037, before anything moved                            | `446ab16` |
| 2     | Node content, the derived hash, and the region test       | `4995a6d` |
| 3     | The wider world and its migration link                    | `a3af385` |
| 4     | Gathering: the band, the command, and the forager         | `4035aaf` |
| 5     | The node layer, the wild ground, and what looking changed | `692daab` |

---

## The load-bearing decision: nothing about the wilds is stored

The wilds are ~2,000 tiles. Storing what stands on each of them would have cost
the save a collection larger than everything else in it put together, needed a
migration link, and needed an offline catch-up model for regrowth.

`nodeAt(registry, seed, tile)` is a pure hash instead. The whole wilderness
costs **zero bytes**, and it is exact after any absence, because _"is this node
available at tick T"_ is arithmetic rather than a simulation to catch up.

The hash consumes **no RNG draw**, and that is the part worth restating.
`world.rng` is a stream whose position is part of the save (ADR-007), so
drawing from it here would make what grows in the wilds depend on how many
other things had happened first — two worlds with one seed would diverge on the
first weather roll. A hash of the inputs has no position and cannot drift.

The stated price, accepted in the ADR: installing a content pack that adds a
node kind re-rolls what grows where, exactly as adding a weather kind changes
what it rained last Tuesday.

**The one stored thing is `harvestedAt`** — tile → the tick its node was worked
— and it is pruned the moment a node regrows, because absent and long-past mean
the same thing to the readiness test. Without that, it would be the one
collection in the save that grows with **playtime** rather than world size,
which `SAVE_FORMAT.md` §3.4 names as the hazard. Measured over 120,000 ticks
with three foragers it settles at **132 entries**.

## The ADR was wrong twice about priority, and measurement said so both times

§4 originally placed gathering **above plant and till**, reasoning that a rock
outranks ground that will still be there tomorrow. It reads well and it was
wrong: `dry-farm` earned **zero** over a long run and 28 catch-up assertions
failed. The farm had stopped. The wilds start thirty-plus tiles out, so a trip
costs a long walk each way, and a worker who chose one did almost nothing else.

**Distance is part of a band's priority and it is invisible in the reasoning.**

Last-resort ordering fixed the earnings and not the shape. A worker who reaches
the wilds is gone for minutes, so one quiet moment on the farm cost a hand for a
long time, and `worker.test.ts`'s _"returns to Idle and waits when no task is
available"_ became false — there is always a rock somewhere.

So **gathering is opt-in, and it is the only band that is.** Everywhere else in
ADR-024's model an absent `taskKinds` means unconstrained; gathering requires
the worker's schedule to name it, and `plugins/core` ships `core:forager` as
that opt-in.

The parallel is the argument. Hauling does not happen until the player declares
a ROUTE; gathering does not happen until the player says which workers are for
it. Both are long-distance work, and **neither should start merely because
nobody said no.**

## The wilds were invisible, and every test was green

This is the finding of the phase.

Gathering worked. The hash placed nodes, `validateGatherNode` accepted them,
`gatherNode` yielded into the carry hold, the forager walked out and came back
with wood, the deposit path put it in the shed. **2,937 tests passed and nothing
drew a single node.** Thirty-two columns of blank grass with a mechanic running
behind them that no player could ever have found.

That is the phase-25 defect — art with no code path to it, invisible behind a
green suite — one phase later and worse, because a building you cannot see is
at least a building you chose to place. This was content the game generated,
running a system the player paid a worker for.

The gate that should have caught it was `tests/sprite-keys.test.ts`, written in
phase 25 for exactly this class of bug. It missed because it only knew about
**registries** — buildings, crops, tile kinds — and the two things it could not
see were the resource-node registry (new) and the sprites that belong to no
definition at all (`terrain:tilled`, `terrain:wild`). Both are covered now, and
both assertions were mutation-verified.

**The gate you wrote for last phase's bug does not automatically cover this
phase's version of it.**

## What the node layer is, and what it deliberately does not publish

Positions never cross the snapshot boundary. They are `nodeAt`, and the
renderer holds the seed, so publishing four hundred fixed positions on every
launch would be shipping a derivable fact across a boundary that exists for the
underivable ones.

The `wilds` slice carries **which nodes have been worked**, and nothing else.

It publishes a **boolean, never a countdown.** A projection carrying "ticks
until regrown" would differ on every tick of every regrow period and republish
20 times a second for the whole of one — the defect ADR-005 §2 names, and the
same trap `crops-slice.ts` documents for growth. Worked-or-not changes twice per
node per cycle. There is a test that steps a full regrow period and asserts
zero republishes.

A worked node is drawn **faded and small, not hidden**. Two states, no
in-between: scaling a stump smoothly back to a tree over a fifteen-minute
regrow would be lovely and would also write to four hundred sprites on every
frame of it, holding the frame loop open on a window that sits on a desktop for
eight hours (ADR-017 §12). And hiding it outright is worse than either — an
empty tile says _nothing ever grew here_, so a player who felled a stand would
believe they had exhausted it for good.

## Two things only the screenshots could have said

**Decor no longer draws a tree or a rock anywhere in the world.** `decor.ts`
scatters cosmetic props the simulation knows nothing about — a worker walks
straight through a bush — and two of them were `buildings:tree` and
`buildings:rock`, the exact sprites the timber and stone nodes use. Excluding
the wilds from that scan was the first fix, and the live view showed why it was
not enough: identical trees either side of the boundary with a shade of ground
between them.

The rule is now one a player can learn without being told — **a tree or a rock
is something you can work; everything else is scenery** — and the countryside
keeps its prop density in flowers and bushes. Meadow near the farm, forest in
the wilds. That reads as geography rather than as a rule, and it says where the
gathering is.

**The densities were cut by a third**, 0.21 to 0.135. A tile density is not a
visual density: the tree sprite's crown overflows its tile and closes the gaps
either side, so one tile in five rendered as a solid wall of canopy with a
worker lost among the trunks — and watching the little people work is the whole
of `VISION.md` §1. ADR-037 §5 already had the right rule written down (_"a band
packed with nodes is a maze rather than a wilderness"_); the number serving it
was wrong, and only looking could say so.

## Three defects the tests found on the way

**`validateGatherNode` had no region check.** `nodeAt` answers for _any_ tile by
design — the boundary is geometry, and duplicating it inside the hash would be a
second definition — so a node appeared to exist on farm tiles and could have
been worked in the middle of the plot.

**`projectWilds` had the same hole**, which made it the third caller needing the
boundary. Three inline `x >= WILDS_MIN_X` comparisons is the shape a boundary
bug arrives in, so it is now one named predicate: `isInWilds`.

**`selectGather` skipped ADR-024's filter stage entirely.** §4 promised
gathering inherits zones, shifts, and roles "with no code here"; it did not, so
a role that excluded gathering would have been ignored — the very inheritance
the ADR claimed. Zone and shift apply now.

## The ore vein needed two attempts

The first was `rock`'s rounded boulder with gold flecks. At gameplay scale it
read as a plain grey rock — the phase-25 mill/kitchen mistake repeated one phase
later, on surface detail instead of silhouette. It is angular crystal shards
now, jagged where rock is smooth, and it is legible in the screenshots at zoom.

Also shipped: `item_ore`, and `item_flour`/`item_bread`, which closes the art
gap phase 25 recorded.

## Profiling

Headless, 120,000 ticks, three workers, same seed — a farm crew against a
forager crew:

| Crew    | mean      | p50    | p95    | p99        | max    |
| ------- | --------- | ------ | ------ | ---------- | ------ |
| Farm    | 0.0341 ms | 0.0329 | 0.0433 | **0.0663** | 0.2116 |
| Forager | 0.0317 ms | 0.0310 | 0.0408 | **0.0477** | 0.6564 |

Both roughly **fifty times inside** the 3 ms p99 budget, and the forager crew is
marginally _cheaper_ — foragers spend most of their time walking, which costs
less than the full-farm harvest scan a farmhand runs. The wild scan is bounded
to the band and runs only on a replan, and only when every nearer band came back
empty.

This is a simulation measurement, taken headless. The renderer's side of the
phase — ~276 static sprites in one atlas and one batch — is phase 30's to
measure under the full RC gate set, and phase 29's to weigh against ADR-003 §2.

## Suites at close

2,990 tests across 234 files. Lint clean at `--max-warnings 0`; all three
typechecks clean. The full migration chain v1 → v13 passes, including the
second relayout.

## Deliberately not in this phase

- **Tools and tool tiers.** A gather is a worker at a tile for a duration.
- **Node depletion.** Regrowth is a timer, not a budget; nothing runs out.
- **Wild terrain that blocks.** Every wild tile is walkable, so no node can
  become unreachable and no crew can be fenced out of the far side.
- **Combat, monsters, and anything that fights back.** Out of scope for v0.4 by
  the owner's standing constraint.
