# ADR-024: Worker Scheduling Architecture

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phase 14
**Bound by (not re-litigated):** ADR-010 (commands are the only write path; worker AI gets no privileged API — §6); ADR-007 §1 and §4 (fixed tick, declared order, no clock); ADR-004 (plain records in typed stores; composition where variation is real); ADR-014 §4 (application preferences are never save data); ADR-020 (the derived clock a shift would read); `GAME_DESIGN.md` §4.2 (**a worker never deadlocks** — a hard product requirement); `VISION.md` §2.2 (reward absence); ADR-012.

---

## Context

v0.1's worker AI works and is the emotional core of the game (`PLAN.md` §2.1, phase-04). It selects work through a fixed sequence of priority bands in `src/sim/ai/worker-tasks.ts`, refreshed on an idle re-plan cadence, and it dispatches ordinary commands like any other source (ADR-010 §6).

`PLAN.md` §3 lists v0.2's milestone as _"worker priorities: player-configurable task priority"_ — reorder the bands, expose the order. That is a two-day feature and it is the wrong thing to build, because the roadmap does not stop at ordering:

| Concept             | Asks                                        | A reordered band list answers |
| ------------------- | ------------------------------------------- | ----------------------------- |
| Priorities          | _which_ work first                          | Yes                           |
| Work zones          | _where_ this worker may work                | No                            |
| Permissions         | _what kinds_ of work this worker may do     | No                            |
| Roles               | a named bundle of the above                 | No                            |
| Shift scheduling    | _when_ this worker works (ADR-020's phases) | No                            |
| Emergency overrides | _drop everything and do this_               | No                            |

Five of six need a dimension a priority list does not have. Building the list first means every one of them arrives as a special case bolted onto an ordering, and the sixth — emergency override — arrives as a bypass, which is how a worker AI acquires the privileged path ADR-010 §6 exists to forbid.

The cost of getting this wrong is unusually high because worker behaviour is the most visible thing in the game and the thing an idle player is trusting while away. A scheduling bug does not throw; it produces a farm that quietly does less than it should.

---

## Decision

**Worker work selection is a three-stage pipeline: discover candidate tasks, filter them through a composable set of declared constraints, then select deterministically. Every future scheduling concept is a new constraint kind, not a new stage and not a new code path. The schedule is simulation state.**

### 1. Three stages, and only three

```
   discover                filter                    select
┌──────────────┐      ┌───────────────┐        ┌────────────────┐
│ what work    │ ───► │ which of it   │ ─────► │ which one now  │
│ exists       │      │ THIS worker   │        │ (deterministic)│
│              │      │ may do NOW    │        │                │
└──────────────┘      └───────────────┘        └────────────────┘
   world state          constraint set             ordering
```

**Discovery** enumerates candidate tasks from world state. It is what `worker-tasks.ts` does today and it does not change. It knows nothing about who will do the work.

**Filtering** applies a set of **constraints**, each answering one yes/no question about a `(worker, task)` pair. This is the stage that did not exist, and it is where every concept in §Context's table lands.

**Selection** orders the survivors and takes the first. Ordering is where _priority_ lives — one input among the stage's inputs, not the architecture.

The separation is the decision. Today's fixed bands collapse all three into one function, which is why they cannot express "where" or "when".

### 2. Every scheduling concept is a constraint

| Concept             | Constraint kind                                           | Arrives as                           |
| ------------------- | --------------------------------------------------------- | ------------------------------------ |
| Work zones          | Is the task's tile inside this worker's zone?             | A tile-set constraint                |
| Permissions         | Is this task kind permitted to this worker?               | A task-kind constraint               |
| Roles               | A named, reusable constraint bundle                       | Content data (ADR-019 §3)            |
| Shifts              | Is the current day phase in this worker's shift?          | A constraint reading ADR-020's phase |
| Emergency overrides | A constraint set that temporarily replaces the active one | §5                                   |
| Priorities          | **Not a constraint** — an input to selection              | §3                                   |

> **A new scheduling concept that cannot be expressed as a constraint or an ordering input requires a successor ADR.** That bound is what makes the claim "extensible without redesign" checkable rather than aspirational.

Constraints are **declared data where practical** (goal 1) — a zone is a tile set, a permission is a task-kind set, a shift is a phase set — evaluated by engine code that owns their semantics. This is the same split ADR-013 §4 uses for price modifiers, where the pipeline is engine and each modifier is data, and it is what lets a content source ship a role without shipping code.

**Constraint evaluation order is declared, once, in one place** — the ADR-007 §4 rule applied one level down. Constraints are pure predicates so order cannot change the outcome, but a declared order keeps short-circuiting deterministic and keeps profiles comparable.

### 3. Priority is an ordering input, not a filter

A priority reorders; it never excludes. Keeping it out of the filter stage is what prevents the most likely failure: a player who deprioritises a task kind to last should still see it done when nothing else remains, not see it silently never done.

Selection composes ordering inputs — the worker's priority ordering first, then existing tie-breakers (distance, task age) — and remains fully deterministic, because ADR-007's determinism test covers it and a scheduler that reorders by anything unstable would fail that test rather than merely misbehave.

### 4. The schedule is simulation state

> **A worker's constraint set, role, zone, permissions, shift, and priority ordering are saved with the world and changed only through commands.**

This is not the ADR-014 §4 preference boundary; it is its other side. Opacity changes what the player _sees_. A work zone changes what the _world does_ — two players with one seed and different schedules have different farms. Putting a schedule in `settings.json` would make the simulation depend on a file the save system may never touch, and determinism and replay would both be gone.

Consequences that follow, each already governed by an existing ADR:

- Changing a schedule is a **command** (ADR-010) — validated, rejectable, queued, applied on a tick boundary, and in the replay stream like any player action.
- Schedules **persist** and are part of the authoritative-state set (ADR-015 §6). ADR-027 owns the bump.
- The schedule is **not** a snapshot slice's authority — views read a projection of it, as with everything else.

### 5. Emergency overrides swap the constraint set; they never bypass it

An override is a temporary, recorded replacement of a worker's active constraint set — nothing more.

It is emphatically **not** a fast path that skips filtering. A bypass would be a second work-selection path, which is ADR-010 §6's failure mode with a different name: automation reaching a state the ordinary path cannot express, and a replay that no longer reproduces. An override that expresses "drop everything and haul" is a constraint set that permits only hauling, applied by a command, recorded in the save, and lifted by another command.

### 6. Deadlock is impossible by construction, not by care

`GAME_DESIGN.md` §4.2 makes "a worker never deadlocks" a hard product requirement, and a constraint system is the most plausible way in this project's history to violate it: a zone with no work, a shift that never opens, a permission set that excludes everything available.

Three rules, each a test:

1. **An empty survivor set means idle, never stalled.** A worker with no permitted work idles gracefully and re-plans on the existing cadence (phase-06b's `replanTick`). It never blocks, never holds a claim, never waits on a condition.
2. **A re-plan is scheduled unconditionally.** The band reopens the moment the world or the schedule changes — the same mechanism that already handles "no seeds" and, under ADR-021 §4, "out of season".
3. **No constraint may be permanent-by-construction.** A constraint whose predicate can never become true for any world state is a content defect and is rejected at registration, not discovered by a player whose farm stopped.

Rule 3 is the one worth stating explicitly, because a shift constraint referencing a day phase that a world's phase set does not contain is exactly that defect, and it would present as workers who simply never work.

### 7. Offline catch-up honours the schedule conservatively

`SAVE_FORMAT.md` §6.4's worker catch-up is statistical, rounds down at every step, and is proven never to over-credit.

Schedules add a bound in the same direction: **catch-up may credit only work the schedule would have permitted.** A gap spanning a shift boundary is evaluated per segment; where the model cannot be certain, it credits nothing. Zones bound the available work set exactly as inventory capacity already does. The existing never-over property test — real simulation versus catch-up on byte-identical clones — is the mechanism, extended, not relaxed.

---

## Alternatives Considered

### A. Ship a reorderable priority list, as `PLAN.md` §3 describes

- **For:** small, obvious, and delivers the stated milestone.
- **Against:** it answers one of six roadmap concepts and makes the other five special cases. Emergency override in particular has no honest expression in an ordering, so it would arrive as a bypass.
- **Rejected because:** the pipeline costs one extra stage now and prevents five retrofits later — the same trade ADR-011 made for containers ahead of inventory.

### B. A general rules engine or behaviour tree for worker AI

- **For:** maximum expressiveness; every future concept fits.
- **Rejected because:** it is speculative generality of the kind `AI_RULES.md` §1.5 forbids, it makes worker behaviour hard to reason about and harder to test deterministically, and it invites plugin-authored logic that ADR-019 §4 deliberately does not admit at API v1. Three named stages with a closed constraint vocabulary is the smallest thing that covers the roadmap.

### C. Schedules as application preferences in `settings.json`

- **For:** no schema change, no migration, instant to build.
- **Rejected because:** §4. It makes the simulation depend on a file outside the save, so a save no longer determines a world — forfeiting determinism, replay, and round-trip correctness for a migration's worth of convenience.

### D. Per-task-kind global toggles instead of per-worker constraints

- **For:** a much smaller surface; one setting affects the whole farm.
- **Rejected because:** it cannot express the thing that makes scheduling interesting — _this_ worker in _that_ field — and roles, zones, and shifts are all per-worker by nature. It is also strictly less than the pipeline, not simpler than it.

---

## Tradeoffs Accepted

| We accept                                          | To gain                                           | Mitigation                                                   |
| -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| A three-stage pipeline where one function sufficed | Five roadmap concepts land as data, not redesigns | Discovery is unchanged; only the filter stage is new         |
| Schedules enter the save                           | Determinism, replay, and round-trip survive       | One additive field set; ADR-027's bump; catch-up bound in §7 |
| A closed constraint vocabulary                     | Deterministic, testable, plugin-safe scheduling   | Growth is a new constraint kind, reviewed like content       |
| Catch-up gets more conservative                    | It still never over-credits                       | The existing never-over property test is extended            |

---

## Consequences

### Immediate (Phase 14 implements)

- `src/sim/ai/` gains the filter stage and a constraint vocabulary; discovery and the dispatch path are untouched.
- Per-worker schedule state joins the `Worker` record and the authoritative-state set (ADR-015 §6); ADR-027 owns the bump.
- Schedule changes become commands with typed rejections.
- Roles register as content, with `plugins/core/` supplying the defaults through the public API (ADR-019 §2).
- A worker panel surface for priority and zone; presentation only, dispatching commands.

### Ongoing (binding on every future session)

- **A scheduling concept is a constraint or an ordering input.** Anything else needs a successor ADR.
- **Never give an override a bypass.** It swaps the constraint set.
- **Never put schedule state in `settings.json`.**
- **Never let a constraint be unsatisfiable by construction** — rejected at registration.
- Worker AI still dispatches ordinary commands and has no privileged write path (ADR-010 §6).

### Validation

- **No-deadlock:** a farm whose every worker is fully constrained out of all available work keeps re-planning and resumes the instant a constraint or the world changes. Extends the existing FSM deadlock suite.
- **Determinism:** identical seed, command stream, and schedules produce byte-identical state over 100k ticks, including selection order.
- **Priority is not a filter:** a task kind ordered last is still performed when nothing else is available.
- **Unsatisfiable constraint:** rejected at registration with a typed error; never reaches a worker.
- **Round-trip:** schedules survive save → load → save byte-identically; a loaded world continues identically to one that never saved (ADR-015 §6).
- **Catch-up:** never-over holds across shift and zone boundaries.

### Revisit if

- A constraint needs to be probabilistic → it must draw from `world.rng`, and the ordering consequences need stating; prefer a deterministic tie-break.
- Constraint evaluation shows up in a profile → the re-plan cadence already bounds it (phase-06b); cache per re-plan, never in world state.

---

## Related

| Document                    | Relationship                                                       |
| --------------------------- | ------------------------------------------------------------------ |
| ADR-010 §6                  | Workers dispatch ordinary commands — no privileged path            |
| ADR-020                     | The day phase a shift constraint reads                             |
| ADR-021 §4                  | Seasons must not deadlock a worker — the same rule, same mechanism |
| ADR-019 §3                  | Roles and constraint bundles as registered content                 |
| ADR-027                     | The schema bump carrying schedule state                            |
| `GAME_DESIGN.md` §4.2, §4.4 | The deadlock requirement and the existing claim mechanism          |
| `SAVE_FORMAT.md` §6.4       | The catch-up model §7 constrains further                           |
