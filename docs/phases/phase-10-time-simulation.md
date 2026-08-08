# Phase 10 — Time Simulation

> **Delivers:** the world has a day. Nothing depends on it yet, and that is deliberate.
> **Governing decisions:** ADR-020 (time simulation), ADR-027 (save evolution), ADR-005 (slice republishing), ADR-017 (animation leases).
> **Schema:** v2 → v3.
> **Status:** **Delivered.** All three boundaries landed. One deliberate omission is named below.

---

## Commit boundaries

`ROADMAP.md` §6 sets three: the clock derivations and the migration; the event and slice; the lighting layer and transitions.

| Order | Boundary                                                    | Commit    |
| ----- | ----------------------------------------------------------- | --------- |
| 1a    | `dayFor`, `timeOfDayFor`, `phaseFor` — pure, no new system  | `8319c62` |
| 1b    | Schema v3: the day length and phase set frozen per world    | `80d10e1` |
| 2     | The `time` slice, and a status-bar readout that consumes it | _this_    |
| 3     | Layer 5, phase → tint as content, finite transitions        | _this_    |

Boundary 1 was split in two because the derivations are pure functions with no persisted consequence, while freezing `ticksPerDay` is a schema bump under `SAVE_FORMAT.md` §9's full checklist. Landing them together would have put a golden fixture and a migration in the same commit as the arithmetic they are unrelated to.

---

## `dayPhaseChanged` was never built

`ROADMAP.md` §6 lists the event under boundary 2. It is in neither boundary, and this is the reason (`PLAN.md` §9.1).

`src/sim/events/types.ts` opens with the rule the file exists to enforce:

> ONLY events with a real producer AND a real consumer today.

ADR-020 §3 names the event's consumer exactly once — **the lighting view** — and requires it to obey ADR-008's producer-and-consumer rule from its first commit. So boundary 2 could not add it: the only thing that would subscribe did not exist yet. That was recorded at the time as a deferral with a live possibility that the event was not needed at all.

**Boundary 3 settled it: it is not.** The lighting view reads the `time` slice, exactly as `crop-view.ts` reads the crops slice. Two things make the slice the better primitive rather than merely a sufficient one:

- **A save resuming mid-day publishes; it does not fire.** Load a world at dusk and the slice's first projection tells the lighting view it is dusk. No phase _changed_, so an event-driven view would hold its default tint until the next boundary — potentially hours of play under the wrong light.
- **The event would carry nothing the slice lacks.** `{ from, to }` is derivable: a view that knows its current tint knows what it is transitioning from.

`tileTilled` earns its place as an event because `tilledAt` reaches no slice and projecting the whole grid to catch one byte would cost more per tick than the redraw costs once. Nothing equivalent is true here — the phase _is_ published.

**ADR-020 §3 now carries the amendment**, rather than the repository quietly disagreeing with its own decision record. The rule that ruled the event out is the one the ADR itself stated; it was applied, not waived.

## Decisions worth carrying forward

### Layer 5 was claimed the way layer 4 was

Reserved empty by ADR-001 in phase-02, filled in phase-10c by the feature that needed it, with **no re-layering migration** — the same payoff `layers.ts` already recorded for layer 4 and the harvest burst. That is the entire return on reserving a layer nobody could use for eight phases.

The tint is a plain alpha-filled rectangle rather than a blend mode or filter, because ADR-001 §Fallback's canvas backend has neither. The degraded path gets a dimmer night rather than no night.

### The lighting view is TESTED, not excluded from coverage

Every other `*-view.ts` in this repo is a host binding: excluded from the measured set, with its logic extracted to a sibling and its behaviour detected by an e2e spec. This one follows half that pattern — `lighting-state.ts` holds the arithmetic and the transition lifetime — and then breaks the other half on purpose.

Pixi's `Graphics` builds geometry without a renderer, so the binding constructs headless. That was worth checking rather than assuming, because it changes what can be proven: the view's test runs against the **real** `createDirtyGate`, so `animationCount()` is the number the render loop consults and the number the debug overlay prints as `0 anim`. `TESTING.md` §4.2's criterion is that a file leaves the measured set only if it is a host binding **and** a named test exercises it. This one can be exercised directly, so it stays in.

### The idle acceptance is a unit test, and that is the stronger option

ADR-020 §Validation asks for zero `requestAnimationFrame` callbacks across a phase boundary. A boundary is 6,000 ticks away — **five real minutes** at 20 Hz — so an e2e assertion would either idle for five minutes or need a fast-forward hook the harness does not have and that this phase has no other reason to build.

The unit test drives ten seconds of frames past a settled transition and asserts the gate never goes dirty and holds no lease. Mutating `lease.sync(running)` to `lease.sync(true)` fails six tests. Recorded in `PERFORMANCE.md` §4.2 alongside the e2e invariants, so the row is not mistaken for an untested claim.

### A third party still cannot supply a tint

ADR-020 §4 says the phase→tint mapping is content data "so a content source can supply its own without touching engine code". Half of that shipped: the mapping IS content, and `plugins/core` registers it through the public API with no privileged path. But `definitions.ts` refuses the `phaseTints` key, so in practice only `core` can register one.

The blocker is not plumbing, it is a missing rule. **A world has one dawn.** Two sources both defining a dawn tint need a precedence rule, and every candidate is unattractive: alphabetical by source id decides the look of the game by name; load order makes it depend on install sequence; refusing both leaves a world with no night. Per-source configuration would answer it properly, and was already declined once in phase 09 for having no consumer.

So the gap is left open and named rather than closed with an invented rule (`AI_RULES.md` §1.5). It is the natural first user of per-source configuration when that arrives.

### The projection carries no `timeOfDay`, and that is the design

A `timeOfDay` field would be correct, one line, and free to compute — and would republish the slice on every one of a day's 24,000 ticks. ADR-005 §2 names that a defect outright. The published shape is `{ day, phase }` and nothing else, which is the same move `CropStage` makes: four states, so a day dirties the lighting layer four times instead of continuously.

The mutation control for this was worth running: adding a `tick` field to `TimeView` and comparing it in `timeEquals` failed five tests, including both republish counters. The rule is enforced, not merely documented.

### `time` is its own slice rather than a field on `status`

`StatusSlice` republishes once a second, because it carries uptime. A day readout folded into it would re-render 86,400 times a day to show a number that changes once. Slices exist so a component subscribes only to what it reads (ADR-005 §2); this is that rule applied at the only moment it can be — before the field exists.

### The republish guarantee is asserted on both sides of the boundary

Two tests, deliberately not one:

- `src/sim/snapshot/time-slice.test.ts` steps the real tick loop through a full day and asserts the slice version advanced by exactly four. It cannot see React.
- `src/renderer/app/hud/DayReadout.test.tsx` counts Profiler commits over the same day and asserts exactly four. It cannot see the slice version.

A defect in the subscription or the throttle would pass the first and fail the second. The day is delivered in hundredths so the store's coalescing can never merge two phase changes into one notification — otherwise a passing count would prove nothing.

### A frozen constant can only be tested with a non-default value

The offline-exactness test round-trips a world through a save and asserts the phase survives. Written with a default-length day it passed while `deserialize` dropped `ticksPerDay` entirely — the fallback supplied exactly the value the test was checking for. Built with a 9,000-tick day it fails, which the mutation control confirmed.

This generalises to every world constant ADR-027's remaining links add (`daysPerSeason`, the weather period): **a persisted constant tested at its default is not tested at all.**

### The day is one-based on screen and zero-based in the tick

`dayFor` counts from zero because the tick is the source of truth and `floor(0 / n)` is 0. The readout adds one, because no player has ever spent a "day 0" on a farm. The conversion lives in the component, with the phase→label mapping, on the presentation side of ADR-020 §4.

---

## Acceptance

- [x] `phaseFor` covers every phase exactly once per day, in order, with no gap — boundary 1a
- [x] The `time` slice republishes exactly once per phase boundary over a full day on a static farm — asserted in the sim and in React
- [x] Zero `requestAnimationFrame` callbacks over 10 s with a static world, including across a phase boundary once the transition ends — `lighting-view.test.ts`, against the real dirty gate
- [x] Loading a save and advancing past an 8-hour gap yields the same day and phase as running the ticks — a derivation of `tick`, which catch-up already advances
- [x] `world.rng` is byte-identical to a run without the clock in play — the derivations consume no RNG; the 100k-tick determinism test runs with them in place
- [x] `v2 → v3` migrates both fixtures with zero repairs — boundary 1b
