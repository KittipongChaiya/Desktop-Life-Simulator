# Phase 29 — Simulation Threading (CONDITIONAL)

> **Delivers:** the measurement ADR-003 §2 asked for, the decision it forces,
> and the preparation that survives either answer.
> **Governing decisions:** ADR-039 (written here); ADR-003 §2 (the
> pre-committed trigger); ADR-005 §2 (the snapshot is the boundary).
> **Schema:** none.
> **Status:** **Complete — the trigger is NOT met, so the migration does not
> happen. The number is recorded either way, which was the phase's actual
> deliverable.**

---

## Commit boundaries

| Order | Boundary                                         | Commit    |
| ----- | ------------------------------------------------ | --------- |
| 1     | ADR-039, the measurement, and the named boundary | `532aa6b` |

---

## The phase existed to answer one question

ADR-003 chose a single-threaded simulation on the renderer process and — the
part that made this phase possible — **pre-committed the condition for changing
its mind**, in writing, two versions early:

> move the simulation to a worker when a p99 tick exceeds 3 ms, or when tick
> execution measurably delays frame presentation.

`PLAN.md` §5.1 then sequenced the phase **last** in v0.4, with the reason
stated: a trigger needs a load to be tested against, and the load is everything
the version adds.

That is worth naming as a practice rather than a detail. **The decision was not
argued in this phase; it was measured.** A session that had to relitigate
"should we thread the simulation?" would have spent its time on opinion, and
the ADR that would have come out of it would have been an opinion too.

## The answer

Taken in the running app, on a save the game could genuinely have written — 36
crops, six hands, thirteen buildings, a three-step chain with **both links
routed**, a forager working the wilds, a hand away on an expedition, contracts
on the docket — under criterion 12's full presentation load:

| Statistic | Measured     | Trigger  |
| --------- | ------------ | -------- |
| p50       | 0.200 ms     | —        |
| p95       | 0.300 ms     | —        |
| **p99**   | **0.400 ms** | **3 ms** |
| mean      | 0.187 ms     | —        |
| max       | 6.900 ms     | —        |
| samples   | 1,272        | > 500    |
| FPS       | 93.1         | —        |

**NOT MET**, roughly seven times inside. The second clause fails too: 93 FPS
with the simulation ticking at 20 Hz on the same thread.

**Headless would have given the wrong answer to the right question.**
`PERFORMANCE.md` §16 has 0.53 ms from a Node run, and the frame-presentation
clause only exists where a renderer and a simulation share a thread — which is
what this build does and a headless run cannot be.

**The 6.9 ms max is recorded rather than buried.** One sample in 1,272, with
p95 and p99 at 0.3 and 0.4 — a body a long way from its outlier, which is what
a GC pause looks like rather than a tick that does more work. FPS is measured
beside the tick so that if the outliers ever became a pattern, the second
clause would catch them.

## So the migration does not happen, and not as a deferral

ADR-003 §2's alternative D is **not justified by any number this project has**.
The simulation costs a fifth of a millisecond per tick under the heaviest load
the game can currently reach; a thread boundary would buy nothing measurable
while costing structured-clone traffic on every snapshot, a message protocol,
and a second place determinism can drift.

**The trigger stands unchanged for v0.5** — not raised, not softened, not
re-scoped.

## What shipped instead: the dependency, named

The migration's real cost was never `src/sim`, which is already pure and
already projects a snapshot. It is the **renderer**, which reached into the
live world for what the snapshot did not carry: `world-view.ts` took a `World`
and read from it in twenty places, so _what does the renderer depend on?_ had
no answer shorter than reading every line of the file.

`WorldRenderSource` names all of it, in three groups with a reason each:

- **Immutable setup** — the seed and the content registries. Fixed for the
  world's lifetime, so a threaded build passes them once at construction. These
  are not the problem, and the interface does not pretend they are.
- **The snapshot** — the sanctioned boundary.
- **The tile grid** — the one genuinely mutable structure read directly, and
  therefore the migration's whole remaining scope. One field, with the two
  options a future session would choose between written at it: a renderer-side
  copy kept in step by invalidation, or `SharedArrayBuffer`.

Two live reads moved onto the snapshot because they were cheap: `isRaining`
became `TimeView.raining` (a boolean beside the id it derives from, costing no
republish because it cannot change unless the weather does), and
`expansionsPurchased` came from the economy slice, which had carried it since
phase-06d while the renderer read the live value for no reason.

## A type is not a test

`World` still satisfies `WorldRenderSource` structurally, so widening the
interface is one line. **That is intended friction, not a wall**, and ADR-039
says so in its own Consequences rather than claiming a severance it did not
perform.

`tests/renderer-world-boundary.test.ts` is the other half. It reads the
**source**, so a render-layer file that imports `World` fails a test whose name
says what it is, and the field list is pinned so growing it is a deliberate
edit in two places rather than a line nobody notices. Mutation-verified.

## The phase delivered less than its title, and that is the honest report

The roadmap called this "Simulation Threading". What shipped is a measurement
saying not to thread, and the preparation that survives either answer. Naming
that plainly is better than finding work to justify the title — and the
measurement itself was the deliverable `PLAN.md` §5.1 asked for: _"the RC
records the measured number either way."_

## Suites at close

3,088 tests across 240 files. Lint clean at `--max-warnings 0`; all three
typechecks clean.

## Deliberately not in this phase

- **The worker thread.** The trigger decides, and it said no.
- **A `SharedArrayBuffer` tile grid.** It is the answer to a question nobody
  has yet asked with a number.
- **Removing the renderer's `World` at the composition root.** `world-mount`,
  `game-loop` and `start.tsx` build the world, so they hold one by definition.
  The boundary ADR-039 draws is around the views that DRAW.
