# Phase 10 — Time Simulation

> **Delivers:** the world has a day. Nothing depends on it yet, and that is deliberate.
> **Governing decisions:** ADR-020 (time simulation), ADR-027 (save evolution), ADR-005 (slice republishing), ADR-017 (animation leases).
> **Schema:** v2 → v3.
> **Status:** **In progress.** Boundaries 1 and 2 landed; boundary 3 (lighting) remains.

---

## Commit boundaries

`ROADMAP.md` §6 sets three: the clock derivations and the migration; the event and slice; the lighting layer and transitions.

| Order | Boundary                                                    | Commit    |
| ----- | ----------------------------------------------------------- | --------- |
| 1a    | `dayFor`, `timeOfDayFor`, `phaseFor` — pure, no new system  | `8319c62` |
| 1b    | Schema v3: the day length and phase set frozen per world    | `80d10e1` |
| 2     | The `time` slice, and a status-bar readout that consumes it | _this_    |
| 3     | Layer 5, phase → tint as content, finite transitions        | —         |

Boundary 1 was split in two because the derivations are pure functions with no persisted consequence, while freezing `ticksPerDay` is a schema bump under `SAVE_FORMAT.md` §9's full checklist. Landing them together would have put a golden fixture and a migration in the same commit as the arithmetic they are unrelated to.

---

## `dayPhaseChanged` is not in boundary 2

`ROADMAP.md` §6 lists the event under boundary 2. It is not here, and this is the reason (`PLAN.md` §9.1).

`src/sim/events/types.ts` opens with the rule the file exists to enforce:

> ONLY events with a real producer AND a real consumer today.

ADR-020 §3 names the event's consumer exactly once, and it is **the lighting view** — which is boundary 3. The same sentence requires the event to obey "ADR-008's producer-and-consumer rule from its first commit", so landing it now, one boundary ahead of the only thing that subscribes to it, is precisely what that clause forbids. It ships in boundary 3 or not at all.

**And "not at all" is a live possibility worth stating before boundary 3 starts.** Views in this codebase are driven by slice republication, not by event subscription — `crop-view.ts` reconciles when the crops slice changes and marks the gate dirty, and a lighting view can read `time` the same way. Two concrete points favour the slice:

- **A save resuming mid-day publishes; it does not fire.** Load a world at dusk and the slice's first projection tells the lighting view it is dusk. No phase _changed_, so an event-driven view would have no initial tint and would sit at its default until the next boundary — potentially hours of play.
- **The event would carry nothing the slice lacks.** `{ from, to }` is derivable: a view that knows its current tint knows what it is transitioning from.

`tileTilled` earns its place as an event because `tilledAt` reaches no slice and projecting the whole grid to catch one byte would cost more per tick than the redraw costs once. Nothing equivalent is true here — the phase _is_ published.

If boundary 3 confirms this, ADR-020 §3's event clause needs a recorded amendment rather than a silent omission.

---

## Decisions worth carrying forward

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
- [ ] Zero `requestAnimationFrame` callbacks over 10 s with a static world, including across a phase boundary once the transition ends — boundary 3
- [x] Loading a save and advancing past an 8-hour gap yields the same day and phase as running the ticks — a derivation of `tick`, which catch-up already advances
- [x] `world.rng` is byte-identical to a run without the clock in play — the derivations consume no RNG; the 100k-tick determinism test runs with them in place
- [x] `v2 → v3` migrates both fixtures with zero repairs — boundary 1b
