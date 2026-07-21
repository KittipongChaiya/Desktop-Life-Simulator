# Phase 01.6 — Architecture Hardening

> **Delivers:** A single authoritative time source, three architecture-review fixes, and a recorded decision to defer the event bus.
> **Constraint:** No gameplay changes, no visual changes, no new features, no regressions.

---

## Scope Correction

The hardening request targeted five areas. An audit before starting found that **three targeted code that does not exist yet, and one was already complete**:

| Requested                                                              | Actual state at audit                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event bus — replace direct cross-system calls                          | **One system exists** (`snapshotSystem`). Zero cross-system calls. `HarvestCompleted`/`InventoryChanged`/`SaveRequested`/`WorkerStateChanged` have no producers _and_ no consumers — harvest is phase-03, inventory phase-05, workers phase-04, save phase-07. |
| GameClock — replace `Date.now()`/`performance.now()` in the simulation | **Zero occurrences in `src/sim`.** Already banned by `AI_RULES.md` §2.1, lint-enforced, and covered by a test.                                                                                                                                                 |
| Asset registry — no raw filenames in gameplay code                     | **Already delivered** by ADR-006: generated `manifest.ts`, typed `Sprites`/`SpriteKey`. Zero `.png` references in `src/`.                                                                                                                                      |
| Move gameplay constants into data                                      | `src/sim/content/` does not exist (phase-03). No crops, workers, inventory, or economy.                                                                                                                                                                        |
| Architecture review                                                    | Actionable — see §2.                                                                                                                                                                                                                                           |

Building the missing pieces anyway would have meant creating events with no producers and clock fields with no defined semantics — the placeholder pattern `AI_RULES.md` §1.6 forbids, and which the request itself rules out (_"do not introduce speculative abstractions"_).

**One requirement was actively harmful as written.** Moving `TICKS_PER_SECOND` into data would contradict ADR-007 §7 (frozen once content ships) _and_ break the constant folding phase-01.5 relies on for dead-code elimination.

---

## 1. GameClock

`src/sim/time/game-clock.ts`. Pure, no wall-clock, no RNG.

Justified by duplication that existed at audit time — `tick / TICKS_PER_SECOND` computed independently in two production sites — not by anticipated need.

| Migration                              | From                                  | To                          |
| -------------------------------------- | ------------------------------------- | --------------------------- |
| `src/sim/snapshot/slices.ts:41`        | `Math.floor(tick / TICKS_PER_SECOND)` | `ticksToWholeSeconds(tick)` |
| `src/devtools/console/builtins.ts:173` | `ticks / TICKS_PER_SECOND`            | `ticksToSeconds(ticks)`     |

**Rendering timing stays independent.** The render loop measures real elapsed milliseconds to drive interpolation (ADR-007 §5) — a presentation concern that must not route through simulation time.

### Extension points

Future phases extend this module rather than reimplementing conversion. Recorded here rather than as TODOs in code:

| Extension        | Blocked on                                                                                                 | How to add                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game days        | A day needs a defined length in ticks — a design decision owned by the system introducing day/night (v0.2) | Add `TICKS_PER_DAY`; derive `gameDay` from it                                                                                                                                     |
| Seasons          | Game days                                                                                                  | Build on `gameDay`; season length in days                                                                                                                                         |
| Offline catch-up | phase-07                                                                                                   | `msToTicks` already provides the conversion and already rounds down. The 8-hour cap and per-system accuracy contracts belong in `src/persistence` (`SAVE_FORMAT.md` §6), not here |

`msToTicks` rounds **down** and clamps negative, zero, and non-finite input to zero. Both behaviors are pinned by tests because phase-07 depends on them: over-crediting elapsed time is the failure mode that matters, and a backwards clock must never rewind the world.

---

## 2. Architecture Review Findings

All three were found mechanically, and all three were silent — every gate passed while they were present.

### 2.1 Game code depended on the debug layer

`src/renderer/bootstrap/game-loop.ts` imported `SimulationControl` from `src/devtools/`. Type-only, therefore erased at build time and invisible at runtime — but still a compile-time edge from game code into debug infrastructure, contradicting phase-01.5 deliverable 8.

**Fixed:** the contract moved to `src/shared/simulation-control.ts`. Bootstrap implements it, devtools consumes it, neither depends on the other.

### 2.2 The cycle checker was blind to type-only imports

`dependency-cruiser` ran without `tsPreCompilationDeps`, so it never followed `import type`. Two interface-only modules were reported as orphans, and — more seriously — any cycle running through a type import would have gone undetected.

**Fixed:** `tsPreCompilationDeps: true`. Visible dependencies rose from **102 to 120**; 18 edges had been invisible to cycle detection.

### 2.3 The renderer entry point is unconstrained

`src/renderer/main.tsx` matches no boundary element pattern, so the linter permits it to import anything. Verified by adding `import { app } from 'electron'` — no boundary error was reported.

**Partially fixed.** Devtools mounting moved to `src/renderer/bootstrap/devtools-mount.ts`, so entry-point code is minimal and everything real lives in a linted layer.

**Still open:** the hole itself. Closing it requires an `eslint.config.js` element covering the renderer entry, which is a protected file. See §5.

---

## 3. Event Bus — Deferred to Phase-03

Not built. It has no producer and no consumer today, and designing an event API against imagined use cases is the most reliable way to get the shape wrong.

The architectural documentation stands unchanged: `ARCHITECTURE.md` §3.5 specifies the design (typed, queued during the tick, flushed by `eventFlushSystem`, never dispatched mid-system) and §8 lists it as a v0.1 extension point.

**Phase-03 introduces the first real flow** — `cropHarvested`, produced by `harvestSystem` and consumed by inventory — and builds the bus against it.

---

## 4. Confirmation of Unchanged Behavior

| Check                              | Result                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unit + integration                 | 153 passed (14 new clock tests)                                                                            |
| E2E                                | 8 passed                                                                                                   |
| Production build excludes devtools | Still passing after the mount refactor                                                                     |
| Devtools live check                | F3 overlay opens; `time` → `game time 00:00:03 / ticks 76 @ 20 Hz`; `version` → correct flags              |
| Status bar                         | `00:04` — same format and derivation as before                                                             |
| Gameplay                           | No gameplay exists yet to change. No system was added, removed, or reordered; `TICK_SYSTEMS` is unchanged. |

---

## 5. Open Item — CLOSED in phase-01.7

The renderer entry hole (§2.3) was closed by `docs/phases/phase-01.7-entry-boundary.md`, which also uncovered a larger problem: path-aliased imports were bypassing every layer check project-wide.
