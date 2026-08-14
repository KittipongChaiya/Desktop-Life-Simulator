# Phase 14 — Worker Scheduling

> **Delivers:** the player directs the farm — and the architecture accepts zones, roles, shifts, permissions and overrides later without being redesigned.
> **Governing decisions:** ADR-024 (scheduling), ADR-010 (commands are the only write path), ADR-019 §3 (roles as content), ADR-027 (save evolution).
> **Schema:** v5 → v6.
> **Status:** **Complete.** Four boundaries plus the catch-up bound, all landed. The record below said "boundaries 1 and 2" until the phase-15 close-out noticed it; the code had been finished for some time and nothing was watching the document.

---

## Commit boundaries

`ROADMAP.md` §10 sets four: the pipeline and constraint vocabulary; schedule state, commands, and migration; roles as content; the panel.

| Order | Boundary                                                 | Commit    |
| ----- | -------------------------------------------------------- | --------- |
| 1     | The three-stage pipeline and the constraint vocabulary   | `2a90abd` |
| 2     | Schedule state on the worker, commands, schema v6        | `f85252c` |
| 3     | Roles as registered content                              | `e555202` |
| 4     | The worker panel surface                                 | `9fbe34d` |
| 5     | Catch-up bounded to schedule-legal work, and determinism | `da3d594` |

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

### A criterion nobody ticked is a criterion nobody read

Three acceptance boxes sat unticked while the work that satisfies them had been merged for some time, and the phase's own status line still said "boundaries 1 and 2 landed". None of that was visible from inside the phase: the tests were green, the commits were descriptive, and the only thing wrong was the record.

Two of the three were simply met. The third was not, and **the discrepancy was measurable the moment anyone looked**: the criterion says byte-identical over 100k ticks and the test ran 60,000. The commit that wrote it says 60,000 plainly, so nothing was hidden — it was never reconciled with the sentence it was supposed to satisfy. Raised to 100,000, which costs 24 seconds.

The lesson is not "tick the boxes". It is that an unticked box and a green test look identical to a passing suite, so nothing fails while the two disagree.

### The over-credit the zone case could not expose

`anyWorkerMayWork` evaluated `phaseFor(world.tick)` — **one phase** — and applied the answer to a catch-up window of up to eight hours. A crew on shift for a single phase was credited every cycle across the whole window, which is exactly the over-credit ADR-024 §4 forbids.

It survived four tests because all four constrained by **zone or task kind**, and neither changes with the clock. Evaluating those once is correct, so the tests were right about what they tested and silent about what they did not.

Worth recording: **the correct shape was already in the same function.** `plantableThroughout` asks `seasonsBetween` for every season a window touches and requires the crop to be plantable in all of them. The shift case needed the identical treatment and did not get it, so `phasesBetween` is now its counterpart, deliberately named to match.

"Throughout" is asked **per worker**, not per phase: crediting a cycle needs one worker who could have done it for the whole window, not a relay of workers who each could have done part. The model never decided which worker did a cycle, so it may not assume a handover.

The fix is conservative — a crew on shift for part of a window is credited nothing rather than a share — and that is acceptable today for a specific reason: **no shipped role declares a shift.** The field exists on `RoleDefinition` and `isSatisfiableRole` validates it, and core's three roles constrain task kinds only. So the fix bounds a future shift correctly and changes nothing a player can currently reach. Crediting a proportional share is the better answer when a role does declare one, and it is a change to make with that role in hand rather than in advance.

---

## Acceptance

- [x] A farm whose worker is fully constrained out of all work keeps re-planning and resumes the instant a constraint or the world changes — `tests/worker-scheduling.test.ts`, both directions
- [x] A task kind ordered last is still performed when nothing else is available — same file
- [x] Identical seed, command stream, and schedules produce byte-identical state over 100k ticks — `tests/schedule-determinism.test.ts`. **It ran 60,000 until the verification pass**, which is a different claim from the one this criterion makes; the gap survived because the box sat unticked while the test sat green, so neither looked wrong on its own
- [x] An unsatisfiable constraint is rejected at registration and never reaches a worker — `tests/roles.test.ts`: a role permitting no task kinds, a role on shift for no phase, and the API refusing the bundle so it never reaches a worker
- [x] Schedules survive save → load → save byte-identically — `tests/migration-v5-to-v6.test.ts`, at NON-DEFAULT values
- [x] Catch-up never over-credits across shift and zone boundaries — `tests/schedule-determinism.test.ts`. **The shift half was broken and the tests could not see it**: `anyWorkerMayWork` asked `phaseFor(world.tick)` — one phase, applied to a window of up to eight hours — so a crew on shift for one phase in four was credited exactly what an unconstrained crew earned. Zone coverage hid it, because a zone does not change with the clock and evaluating it once is correct
- [x] `v5 → v6` migrates every fixture with zero repairs — same file
