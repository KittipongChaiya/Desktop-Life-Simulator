# Phase 07.8 — Developer Tools

> **Delivers:** A professional in-game developer toolkit — inspectors, monitors, visualisers, time controls, spawn tools, recording.
> **Governing decision:** **ADR-018** (developer tooling). Bound by ADR-001, ADR-005, ADR-008, ADR-010, ADR-017.
> **Hard constraint:** **No gameplay change, no simulation change, no save-format change.** Everything is `FEATURE_DEBUG`-only and compiled out of production.

---

## What already exists

Phase-01.5 built more of this than the brief assumes, and 07.7M added to it. Surveyed before planning, because building a parallel toolkit beside a working one is the mistake this project has now made three times with art and once with CSS.

| Brief asks for           | Already exists                                                                                 | Gap                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| §1 Debug overlay, F3     | `ui/DebugOverlay.tsx`, `metrics/registry.ts`, F3 toggle                                        | 7 of 15 values missing                           |
| §2/§3 Inspectors         | `inspector/registry.ts` (provider pattern, `InspectTarget`, `field()`), `ui/Inspector.tsx`, F4 | no world-tile provider; no pinning               |
| §8 Performance panel     | `metrics/histogram.ts` (p50/p95/p99, 07.7M), `profiler/profiler.ts`, heap metric               | no graphs, no 60 s history                       |
| §9 Time controls         | `SimulationControl`: `pause`, `resume`, `step(count)`, `tick`, `ups`, `fps`, `frameTimeMs`     | **speed scale is not exposed** (the loop has it) |
| §13 Metrics API          | `metrics/registry.ts` — typed, pull-based, read-only                                           | satisfied; extend, do not replace                |
| §12 Recording            | —                                                                                              | none                                             |
| §4/§5 Monitors           | `events.pending()`, `events.subscriberCount()`, `dispatcher.pending()`                         | no UI, no history buffer                         |
| §6/§7 Path & chunk debug | `terrain-chunks.ts` tracker, `astar.ts`                                                        | no visualisation                                 |

**Roughly 40% of the brief is already built.** This phase extends it under ADR-018; it does not start again.

---

## Milestones

Ordered so each depends only on those above it, and so the read-only work lands before the first tool that writes.

| #     | Milestone                   | Delivers                                                                                    | Status        |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| 07.8a | Overlay completion (§1)     | The 7 missing values, through the existing registry                                         | **Delivered** |
| 07.8b | Metrics API hardening (§13) | Typed groups, ordering, and the read-only contract asserted                                 | **Delivered** |
| 07.8c | World inspector (§2)        | Tile provider — coords, state, owner, crop, stage, occupant, path cost — plus pinning       | Pending       |
| 07.8d | Entity inspector (§3)       | Worker provider — FSM state, task, energy, carrying, destination, path length               | Pending       |
| 07.8e | Event monitor (§4)          | Bounded ring of observed events with filters; **subscribe only** (ADR-018 §10)              | Pending       |
| 07.8f | Command monitor (§5)        | Queue depth, outcomes, durations, validation results                                        | Pending       |
| 07.8g | Time controls (§9)          | Expose scale on `SimulationControl`; pause/resume/step/1–16× through the existing scheduler | Pending       |
| 07.8h | Performance panel (§8)      | Change-driven graphs over a 60 s ring                                                       | Pending       |
| 07.8i | Chunk debug (§7)            | Borders, dirty set, redraw counts                                                           | Pending       |
| 07.8j | Pathfinding debug (§6)      | Path, open/closed sets, cost heatmap — opt-in                                               | Pending       |
| 07.8k | Spawn tools (§10)           | Every mutation dispatched as a command (ADR-018 §3)                                         | Pending       |
| 07.8l | Screenshot mode (§11)       | Hide all debug chrome                                                                       | Pending       |
| 07.8m | Recording (§12)             | Observe commands, events, performance; export JSON                                          | Pending       |
| 07.8n | Panel UX (§14)              | Resize, dock, search, filter, remembered layout                                             | Pending       |
| 07.8o | Close-out                   | Budgets re-measured, docs synced, acceptance audit                                          | Pending       |

**07.8k is deliberately late.** It is the first tool that writes, and ADR-018 §3 is the rule most likely to be broken by a shortcut — it lands after the read-only surface is settled, not while it is in flux.

---

## Acceptance criteria

| #   | Criterion                               | How it is proven                                                                       |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Gameplay unchanged                      | Determinism properties; save round-trip; no `src/sim` diff outside read-only accessors |
| 2   | Determinism preserved                   | Same seed + commands → byte-identical world; no `world.rng` consumption                |
| 3   | `FEATURE_DEBUG=false` removes all tools | `tests/devtools-excluded-from-production.test.ts`, marker list extended per tool       |
| 4   | No production bundle increase           | Bundle size compared against the pre-phase build                                       |
| 5   | All mutations use the dispatcher        | Every spawn tool submits through the player source; no store writes in `src/devtools`  |
| 6   | No boundary violations                  | `check:boundaries`, `check:cycles`                                                     |
| 7   | Overlay disabled = zero idle frames     | `render-budget.spec.ts` "a static world draws no frames", unchanged                    |
| 8   | Debug rendering never affects gameplay  | Criterion 2 plus boundary enforcement                                                  |
| 9   | Panels update only on snapshot changes  | Change-driven subscription, not per-frame polling; asserted per panel                  |
| 10  | All tests pass                          | Full gate run                                                                          |

---

## Status

### 07.8a — Overlay completion · Delivered

The seven values the brief names that the overlay did not show: **Visible Sprites, Active Workers, Active Crops, Containers, Buildings, Event Queue Size, Command Queue Size**.

All seven were already reachable read-only — `events.pending()`, `dispatcher.pending()`, and the snapshot slices — so this is registration, not plumbing. Every one is a **pull**: a function the registry calls when a panel asks (ADR-018 §9). None caches, none mutates, and none is a live reference a panel could write through.

**Read from snapshots, not stores.** Worker, crop, and building counts come from the published slices rather than `world.workers` and friends, so the overlay sees exactly what the renderer sees and cannot observe a half-stepped world mid-tick (ADR-005 §2). Container count is the one exception and says so: containers are not projected, so it reads the store's size — a count, never its contents.

Registered under the existing `MetricGroup`s in one place, so the panel needed no change at all.

Gates: typecheck · lint · boundaries · cycles clean. Unit **102 files / 1,306 tests**.

**Criterion 4 is met in substance and missed by 178 bytes, stated exactly.**

The production bundle went from 1,624,295 to 1,624,473 bytes. Zero debug markers appear in it — `Visible sprites`, `Event queue`, `Command queue` and the console label are all absent — so no _tooling_ shipped. The 178 bytes are `WorldView.visibleSpriteCount()`, a read-only accessor on the renderer itself.

The first attempt at this measurement blamed the accessor bag, and folding it behind `FEATURE_DEBUG` (which it now is, correctly — an object literal at the call site is constructed whatever `mountDevTools` does with it) changed nothing. The accessor is the whole of it.

Two defensible positions, and the reason for choosing the second:

- Gate the accessor too, and hit zero. But `visibleTileCount()` and `lastChunkRedraws()` **already ship** in production for exactly the same reason, so gating this one would make the view's introspection API inconsistent with itself.
- Accept 178 bytes as renderer introspection rather than debug code, matching the existing precedent.

The second is taken. Recorded here rather than rounded to "no increase", because a criterion worded _no increase_ that quietly means _no meaningful increase_ stops being a criterion. If exact-zero is required, the fix is to gate all three accessors together — a deliberate change to the view's API, not something to slip into a tooling phase.

### 07.8b — Metrics API hardening · Delivered

§13 was already satisfied in shape — typed, grouped, pull-based, read-only — so this hardened the contract rather than rebuilding it (AI_RULES Rule 1). Three defects, all of them reachable by what the rest of this phase is about to do to the registry, plus the contract ADR-018 §9 states but nothing enforced.

**A stale unregister removed a live metric.** `register()` returned a closure that deleted by id. Unregister `fps`, let something else register `fps`, then call the first closure late — and it deleted the second registration. Harmless while every metric was registered once at boot, which is every registration that exists today. Not harmless from 07.8c on, where panels register and unregister as they mount. The closure now removes **its own** registration and no other.

**A failed batch registered part of itself.** `registerAll` registered as it walked, so a collision half-way through threw with the earlier metrics registered _and their undo functions discarded_ — the throw replaces the return value, so nothing could ever remove them. The batch is now validated whole, including duplicates within itself, before anything is registered.

**An unranked group sorted to the front.** Group order was a list searched with `indexOf`, and `indexOf` returns −1 for a group nobody remembered to add — so a new `MetricGroup` would sort silently ahead of Performance. It is a `Record<MetricGroup, number>` now, which makes a missing rank a compile error. This is the one item here with no present-day symptom: the list was complete, and the change is the guarantee, not a fix.

**And the read-only contract, asserted rather than declared.** `readonly` is a compile-time claim a panel can ignore at runtime, so samples and the sample list are frozen. Sampling also snapshots the registration set _before_ calling any provider: which metrics a sample contains is now decided by the caller, and a provider that registers during its own read — a §9 violation, but one this should survive — can no longer appear in the sample it is corrupting.

Deliberately **not** built: a numeric channel for 07.8h's graphs. It has no consumer yet, and Rule 5 is explicit about abstracting in anticipation. 07.8h adds what 07.8h needs.

Gates: typecheck · lint · boundaries · cycles clean. Unit **102 files / 1,314 tests** (+8). E2E 38 passed, 4 skipped — including criterion 7, a static world still draws no frames.

**Criterion 4: zero.** Production main chunk 1,624,473 bytes — the 07.8a figure, unchanged. Everything here is inside `src/devtools`, which does not ship.

### Remaining

07.8c–07.8o, in the order above.
