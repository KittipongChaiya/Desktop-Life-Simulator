# Phase 02.5 — Engine Foundations

> **Delivers:** The reusable primitives every gameplay system will depend on.
> **Constraint:** Foundation only. No farming, no crops, no workers, no inventory, no rendering changes.

---

## Scope Corrections

Three conflicts with accepted decisions were resolved before implementation.

### ADR numbering

The brief requested `ADR-006-event-system` and `ADR-007-simulation-loop`. **Both numbers were taken** — asset pipeline and simulation tick, each Accepted, implemented, and cited across the codebase. ADRs are append-only (`AI_RULES.md` §5.2).

The event system is **ADR-008**. The simulation-loop topics were **added to ADR-007** rather than written as a second ADR, because every requested topic already existed there: fixed timestep, FPS independence, render-on-demand relationship, game clock, offline progression, determinism, multiplayer implications. A second document would have created two sources of truth on one decision, which `AI_RULES.md` §5.3 calls a defect.

ADR-007 gained §4a (scheduler), §4b (pause/resume), §4c (time scaling).

### EntityRegistry is an ID allocator

ADR-004 explicitly rejected "uniform generic entity bags" as a design that discards type safety where correctness matters most. A generic register/lookup container would have been that decision reversed by accident.

`src/sim/entities/id-allocator.ts` allocates IDs and nothing else. Each system keeps its own typed store. Recorded in ADR-004 so a future phase does not reintroduce the bag through the back door.

### Scheduler preserves declared order

`TICK_SYSTEMS` already existed as ordered data. A registration-order scheduler would have made tick order emergent from import order — precisely what ADR-007 §4 forbids.

The scheduler associates systems with **named phases**; `PHASE_ORDER` remains the authoritative sequence.

---

## Delivered

| Component         | Location                              | Notes                                  |
| ----------------- | ------------------------------------- | -------------------------------------- |
| Event bus         | `src/sim/events/bus.ts`               | Queue-and-flush, per-world, no globals |
| Event definitions | `src/sim/events/types.ts`             | `appStarted`, `simulationTick` only    |
| Scheduler         | `src/sim/systems/scheduler.ts`        | 6 phases, fail-fast validation         |
| ID allocator      | `src/sim/entities/id-allocator.ts`    | Monotonic, serializable, never reused  |
| Time scaling      | `src/renderer/bootstrap/game-loop.ts` | Scales tick COUNT, never `TICK_MS`     |

`WorldLoaded` / `WorldSaved` are **not** defined. They arrive in phase-07 with the save system, where they gain real publishers, subscribers, and tests — the same principle that kept `spawn`/`money` out of the phase-01.5 console.

---

## Testing

49 new tests. Every property the brief named:

| Requirement                      | Verified by                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| Deterministic tick order         | Phase order holds regardless of registration order               |
| Publish order                    | Events dispatch in publish order                                 |
| Unsubscribe safety               | Twice, never-subscribed, and from inside a live dispatch         |
| Duplicate subscription rejection | Same handler subscribed 3× fires once                            |
| Scheduler ordering               | `snapshot` last, `eventFlush` before it, `tickEvent` before that |
| Paused simulation                | No advance while paused; resume does not replay the gap          |
| Time scaling                     | 4×-for-1s reaches the same RNG state as 1×-for-4s                |
| Stable entity IDs                | Monotonic, never reused, round-trips through JSON                |

Plus **FPS independence**: 30 fps and 144 fps produce an identical tick count over the same wall-clock span — the clearest available statement that simulation does not depend on rendering.

---

## Layering

The brief's `Renderer → Presentation → Simulation → Domain` was **not** adopted as vocabulary. The project's enforced graph already satisfies the intent, is linter-checked, and is proven by deliberate-violation tests:

```
entry → bootstrap → {ui, render, devtools, persistence} → sim → shared
```

`sim` is the domain; `ui` and `render` are presentation. Renaming would churn the linter config, the boundary tests, and every document — to restate a guarantee that already holds. "Rendering never knows gameplay" and "gameplay never knows Pixi" are both mechanically enforced today, and a game system importing `devtools` or `pixi.js` is a build failure.

---

## Why these foundations reduce future technical debt

**The event bus removes a quadratic.** Without it, each new system wires directly into the ones it affects: harvest→inventory, inventory→economy, economy→UI. By v1.0 that is dozens of edges nobody planned, each pinning two systems to each other's shapes and each one a reason a test needs a mock. Publishing facts keeps the graph flat, and the cost is paid once.

**Phase-based scheduling makes tick order reviewable.** A registration-ordered scheduler hides ordering inside import statements, where reordering an import silently changes behaviour and no test catches it. `PHASE_ORDER` is one array a reviewer reads in five seconds — and `tickOrder()` makes it assertable.

**ID allocation centralizes a decision that is expensive to change late.** IDs must be unique, stable across saves, deterministic, and never recycled. Discovering that after three systems have each invented their own scheme means a save migration and a hunt for every stale reference.

**Time scaling built correctly now avoids a determinism bug later.** The obvious implementation — stretch the tick duration — would silently corrupt every authored duration and every stored `lastTick`, and the damage would only surface in offline progress weeks later. Multiplying tick _count_ is the version that preserves ADR-007 §7, and it is much harder to retrofit than to do first.
