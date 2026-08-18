# ADR-039: The Renderer's Boundary, and Not Threading the Simulation

**Status:** Accepted — v0.4 Phase 29.
**Date:** 2026-08-18
**Phase:** v0.4 Phase 29 (Simulation Threading) — the phase ADR-003 sequenced here so the version's own load would exist to test its trigger against.
**Bound by (not re-litigated):** ADR-003 (§2 pre-commits the migration trigger and the alternatives); ADR-005 §2 (the snapshot is the sim→view boundary); ADR-001 (render on demand); ADR-007 (determinism); `PERFORMANCE.md` §9 (measurement methodology).

---

## Context

ADR-003 chose a single-threaded simulation on the renderer process, and — the
part that matters here — **pre-committed the condition for changing its mind**,
so that a future session would not have to argue it:

> **Migration trigger (stated in advance so a future session doesn't have to
> argue it):** move the simulation to a worker when a p99 tick exceeds 3 ms, or
> when tick execution measurably delays frame presentation.

`PLAN.md` §5.1 then sequenced this phase **last** in v0.4, with the reason
written down: the trigger needs a load to be tested against, and the load is
everything the version adds. That load now exists — factories, a routed chain,
the wilds, expeditions, contracts — so the measurement can finally be taken
rather than estimated.

This ADR records the measurement, the decision it forces, and the work that is
worth doing whether or not the trigger fires.

---

## Decision

**The trigger is not met, so the simulation stays on the main thread. What ships
instead is the boundary the migration would have needed: the renderer's access
to the simulation is narrowed to a named interface, and the two mutable reads
that were not going through the snapshot now do.**

---

### 1. The measurement

`docs/perf/phase-29-v04-tick.json`, taken in the **running app** — not headless
— on a save the game could genuinely have written: a 36-crop farm, six hands,
thirteen buildings, a three-step chain with **both links routed**, a forager
working the wilds, a hand away on an expedition, and contracts on the docket.
Expanded, every motion class on, the debug overlay open — the same maximum
presentation load criterion 12 uses.

| Statistic | Measured     | Trigger  |
| --------- | ------------ | -------- |
| p50       | 0.200 ms     | —        |
| p95       | 0.300 ms     | —        |
| **p99**   | **0.500 ms** | **3 ms** |
| mean      | 0.192 ms     | —        |
| max       | 7.000 ms     | —        |
| samples   | 1,269        | > 500    |
| FPS       | 94           | —        |

**Re-measured twice more since, on the phase's own shipped code and again at
the RC: p99 lands at 0.4–0.5 ms every time, max 6.9–8.0 ms, FPS 93–94.**
`PERFORMANCE.md` §17 carries all three runs, because a single sample is not a
number — and the decision below rests on the range rather than on the row above
it.

**The p99 is six times inside the trigger.** The second clause — _tick execution
measurably delaying frame presentation_ — is not met either: the renderer held
94 FPS through the run, with the simulation ticking at 20 Hz on the same thread.

**The max is 7 ms and that is stated rather than buried.** One sample in 1,269
crossed the p99 budget by a factor of two. That is a garbage-collection pause or
a scheduling hiccup, not a tick that does more work — the p95 and p99 sit at 0.3
and 0.5 ms, so the distribution is not approaching the budget from below; it has
one outlier a long way from the body. The trigger is written on the p99 for
exactly this reason, and a single outlier is not evidence of a trend. It is
worth re-reading at the RC.

### 2. So: no worker thread, and the reason is not "later"

ADR-003 §2's alternative D is not deferred out of reluctance. It is **not
justified by any number this project has**: the simulation costs a fifth of a
millisecond per tick under the heaviest load the game can currently reach, and
moving it across a thread boundary would buy nothing measurable while costing
structured-clone traffic on every snapshot, a message protocol, and a second
place determinism can drift.

**The trigger stands unchanged for v0.5.** It is not raised, softened, or
re-scoped, and the number above is recorded so the next measurement has
something to compare against rather than an impression.

### 3. What DOES ship: the boundary is named and enforced

The migration's real cost was never `src/sim`, which is already pure and
already projects a snapshot. It is the RENDERER, which reaches into the live
world for things the snapshot does not carry. `world-view.ts` took a `World`
and read from it in twenty places.

So `WorldViewOptions.world` is now a **`WorldRenderSource`** — an interface that
names every field the renderer is allowed to touch, in three groups, each with a
stated reason for being there:

- **Immutable setup**: the seed and the content registries. Fixed for the
  world's lifetime, so a threaded build would pass them once at construction.
  These are not the problem and are not pretended to be.
- **The snapshot**: the sanctioned boundary (ADR-005 §2).
- **The tile grid**: the one genuinely mutable structure the renderer reads
  directly, every frame, for terrain baking, decor and node placement, and
  culling.

`World` satisfies the interface structurally, so nothing at the call site
changed — but **adding a twenty-first direct read is now a visible act**: it
requires widening a named interface with a comment saying why, rather than
reaching through a `World` that offers everything.

That is the whole of what this phase can honestly claim. Naming a boundary is
not severing it, and this ADR does not say otherwise.

### 4. And two mutable reads move onto the snapshot, because they were cheap

- **`isRaining(world)`** → `TimeView.raining`. The time slice already carries
  the weather kind and republishes on weather-period boundaries, so a boolean
  beside it costs no additional republish at all.
- **`world.economy.expansionsPurchased`** → the `economy` slice, which already
  carried it. The renderer was reading the live value for no reason.

Both were live reads of state that changes during a tick, which is the class
the snapshot exists to eliminate. What remains outside it is the tile grid, and
that is now the only thing.

### 5. What a threaded build would still have to solve

Written down here so the next session inherits the problem statement rather
than rediscovering it:

**The tile grid.** 7,168 tiles across five parallel arrays, read every time a
terrain chunk is re-baked and every time decor or nodes are re-planned. A
worker-thread build needs either a renderer-side copy kept in step by
invalidation messages, or `SharedArrayBuffer` — which Electron permits and
which would make the grid genuinely shared rather than copied.

Nothing else in `WorldRenderSource` is mutable. That is the point of naming it:
the migration's scope is now one field long.

---

## Consequences

**Good**

- The trigger has an answer with a file behind it, under the load it was
  written for, in the process it was written about.
- The renderer's reach into the simulation is enumerable, and growing it is
  deliberate rather than incidental.
- Two live reads became snapshot reads at no cost.
- A future migration's scope is one sentence: the tile grid.

**Bad, and accepted**

- **A named boundary is not an enforced one at runtime.** `World` still
  satisfies `WorldRenderSource` structurally, so a renderer author who wants a
  field can widen the interface in a line. That is the intended friction — it
  makes the act visible in review — and it is not a wall.
- **Phase 29 delivers less than its title.** "Simulation Threading" is what the
  roadmap called it; what shipped is a measurement that says not to, and the
  preparation that survives either answer.

**Risky**

- **The 7 ms max.** If it becomes a pattern rather than an outlier, the second
  clause of the trigger — frame presentation — is the one that would catch it,
  and FPS is measured alongside the tick for exactly that reason.

---

## Revisit if

- A p99 tick exceeds 3 ms on any measured scenario → ADR-003 §2's alternative D,
  unchanged.
- Frame presentation is measurably delayed by tick execution → same.
- The renderer needs a mutable simulation structure the snapshot cannot carry →
  that is a boundary decision, and it belongs in a successor to this ADR rather
  than in a widened interface.
