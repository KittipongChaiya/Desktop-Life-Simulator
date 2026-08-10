# Phase 14 — Worker Scheduling

> **Delivers:** the player directs the farm — and the architecture accepts zones, roles, shifts, permissions and overrides later without being redesigned.
> **Governing decisions:** ADR-024 (scheduling), ADR-010 (commands are the only write path), ADR-019 §3 (roles as content), ADR-027 (save evolution).
> **Schema:** v5 → v6.
> **Status:** **In progress.** Boundaries 1 and 2 landed.

---

## Commit boundaries

`ROADMAP.md` §10 sets four: the pipeline and constraint vocabulary; schedule state, commands, and migration; roles as content; the panel.

| Order | Boundary                                               | Commit |
| ----- | ------------------------------------------------------ | ------ |
| 1     | The three-stage pipeline and the constraint vocabulary | _this_ |
| 2     | Schedule state on the worker, commands, schema v6      | —      |
| 3     | Roles as registered content                            | —      |
| 4     | The worker panel surface                               | —      |

---

## Decisions worth carrying forward

### The migration is one decision: `{}`, not `{ taskKinds: [] }`

Absent means unconstrained; empty means constrained to nothing. A v5 worker could do anything, anywhere, at any hour, so the empty record states that exactly — and `{ taskKinds: [] }` would have **silently idled every worker on every existing save**. The whole link is that one choice, and the test asserts it directly rather than asserting the field exists.

The codec carries the distinction too: absent fields stay absent through serialize and hydrate, which is why the round-trip test uses a NON-DEFAULT schedule — a worker with `{}` round-trips correctly even if the codec drops the field entirely, the phase-10b lesson. The zone is sorted on write, because a `Set` has insertion order and the bytes must not.

`exactOptionalPropertyTypes` rejected the conditional-spread hydration, and it was right to: the distinction it protects is exactly the one this vocabulary rests on, so the schedule is built by assignment and `undefined` is never written.

### The dependency checker caught a real cycle

Putting `WorkerSchedule` in `constraints.ts` and importing it into `worker.ts` made the state depend on its own evaluators, and `worker.ts` importing `UNCONSTRAINED` back closed the loop. Both the type and its neutral value now live beside `Worker`, and `constraints.ts` re-exports them — so callers still reach the vocabulary through one module while the dependency runs one way.

Worth recording because the fix is not cosmetic: the schedule is worker STATE and the predicates over it are AI, and the cycle was that distinction being blurred.

### The filter stage is the whole decision

Discovery and selection both already existed — `worker-tasks.ts` enumerates candidates and picks the nearest, in fixed bands. What did not exist is the stage between them, and its absence is precisely why the bands cannot express _where_ or _when_.

Adding it is a small diff and a large claim: **every future scheduling concept is a new constraint, not a new stage and not a new code path.** Zones are a tile set, permissions a task-kind set, shifts a phase set, roles a named bundle of those, an emergency override a set that temporarily replaces the active one. ADR-024 §2 makes the bound explicit — a concept that fits neither a constraint nor an ordering input needs a successor ADR — which is what turns "extensible without redesign" into something a reviewer can check.

### Absent is unconstrained; empty is impossible

Every field on a `WorkerSchedule` is optional, and the distinction is load-bearing rather than stylistic. **"No zone" is a worker who may work anywhere. "An empty zone" is a worker who may work nowhere.** Conflating them silently idles a farm, and idling a farm silently is the failure mode `GAME_DESIGN.md` §4.2 exists to forbid.

Both states are legal and both are tested. The empty ones are exactly the case ADR-024 §6's no-deadlock rules are written for: a fully constrained-out worker must keep re-planning and resume the instant a constraint or the world changes, which is asserted from both directions — schedule changes with the world untouched, and world changes with the schedule untouched.

### Priority reorders; it never excludes

ADR-024 §3 is a rule about a specific failure: a player who sends tilling to last should see it done when nothing else remains, not discover months later that it is never done at all. So priority lives in **selection**, not in the filter, and `allowsWork` cannot see it.

Two consequences fall out. A kind the priority list does not mention sorts **after** the ones it does rather than being dropped, so a partial ordering is legal and every kind stays reachable. And the reorder is by index rather than by comparator over the original array, so it is stable across engines — an unstable sort here would fail the 100k-tick determinism test rather than merely misbehave.

The mutation control is the one that matters: making an unmentioned kind sort first (the natural `indexOf` slip, which returns −1) fails two tests, one in the vocabulary and one against a real world.

### The schedule parameter is optional, and that is what kept the change contained

`selectTask` takes a schedule defaulting to unconstrained, so every existing caller behaves exactly as it did and the seventeen existing AI tests did not change. This is the phase-13b lesson reused: an optional addition is how a stage gets inserted into a shipped pipeline without a migration of call sites.

It also means boundary 2 has one job — supplying the schedule from world state — rather than two.

### A test that proved the wrong thing

The "resumes when the world changes" case first put its zone on tile (40, 40), which is outside the owned 8×8 plot. Discovery only enumerates **owned** tiles, so the zone was empty for a reason that had nothing to do with scheduling, and the test would have passed against a filter stage that did nothing at all. Rewritten onto an owned tile whose available work genuinely appears.

---

## Acceptance

- [x] A farm whose worker is fully constrained out of all work keeps re-planning and resumes the instant a constraint or the world changes — `tests/worker-scheduling.test.ts`, both directions
- [x] A task kind ordered last is still performed when nothing else is available — same file
- [ ] Identical seed, command stream, and schedules produce byte-identical state over 100k ticks — boundary 2, once schedules are world state
- [ ] An unsatisfiable constraint is rejected at registration and never reaches a worker — boundary 3, with roles
- [x] Schedules survive save → load → save byte-identically — `tests/migration-v5-to-v6.test.ts`, at NON-DEFAULT values
- [ ] Catch-up never over-credits across shift and zone boundaries — boundary 2
- [x] `v5 → v6` migrates every fixture with zero repairs — same file
