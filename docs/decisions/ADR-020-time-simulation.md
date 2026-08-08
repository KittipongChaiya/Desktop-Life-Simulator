# ADR-020: Time Simulation and the Day Cycle

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phase 10
**Bound by (not re-litigated):** ADR-007 §1 (time inside the simulation is the tick counter and nothing else; no clock reads), §7 (`TICKS_PER_SECOND` is effectively frozen once content ships); ADR-009 §2 (derive, never accumulate); ADR-005 §2 (a slice that republishes every tick is a defect); ADR-017 §2 (motion is finite or ambient, and ambient has four conditions); ADR-012 (the freeze this is authored under).
**Amends:** ADR-001 — layer 5 (`lighting`) is claimed, and §1's render-on-demand gate is preserved by §3 of this ADR rather than excepted. ADR-001 is otherwise unchanged.

---

## Context

`world.tick` is the only notion of time the simulation has (ADR-007 §1), and `src/sim/time/game-clock.ts` is the authoritative conversion between ticks and human time. `ARCHITECTURE.md` §3.4a records that game days and seasons were left as documented extension points _"rather than stubbed, because each needs semantics that only its owning system can define."_ This ADR defines those semantics.

The v0.2 theme is a world that changes on its own, and a day cycle is the smallest version of that: light moves, and eventually NPCs (v0.3) have somewhere to be. Two things make it non-trivial here.

**A day/night tint is ambient motion.** ADR-017 §2 classifies motion as finite (takes a lease, ends, releases) or ambient (never ends, so it is bounded by four conditions). A tint that interpolates continuously toward the next phase never ends — it would hold `requestAnimationFrame` open for the life of the session on a window `VISION.md` §2.1 says sits at the bottom of the player's screen for eight hours. It would also republish a lighting slice every tick, which ADR-005 §2 names a defect outright.

**A calendar is the easiest place in this project to accidentally store derived state.** The tempting shape is `world.timeOfDay`, advanced each tick. That is an accumulator, and ADR-009 §2 already paid for the alternative once: because a crop stores `plantedTick` rather than progress, offline growth needs no catch-up, no accuracy contract, and no error budget. Time deserves the same treatment, and gets it more cheaply, because a tick counter is _already_ the accumulator.

---

## Decision

**The calendar is derived from `world.tick`. It adds no mutable state, no system, and no catch-up. The day is divided into a small number of named phases, and the simulation publishes the phase — never a continuous fraction — so a day costs a handful of slice republishes rather than 20 per second.**

### 1. The calendar is a pure function of the tick

```
day        = floor(tick / ticksPerDay)
timeOfDay  = tick % ticksPerDay
phase      = phaseFor(timeOfDay)          // a named state, not a number
```

`game-clock.ts` gains these derivations and nothing else. There is no `timeSystem` in `TICK_SYSTEMS`, for the same reason there is no `growthSystem`: advancing the tick _is_ advancing the clock, so there is nothing for a system to do.

Consequences that fall out for free, each one a cost ADR-009 §2 already showed is worth avoiding:

| Property              | Why                                                              |
| --------------------- | ---------------------------------------------------------------- |
| No new save field     | The tick is already persisted                                    |
| No migration          | Nothing was added to the world's shape                           |
| Offline time is exact | Advancing `world.tick` past a gap _is_ the catch-up (ADR-007 §6) |
| No accuracy contract  | There is no approximation to bound                               |
| Determinism unchanged | A derivation reads no clock and no generator                     |

### 2. `ticksPerDay` is a world constant, fixed at creation

The day's length is data — but it is **world state, written at world creation and never changed for that world**, not a live content value.

A derived calendar has no history to corrupt, which is exactly why this rule is needed: change `ticksPerDay` on an existing world and _every past day silently renumbers_. A player on day 40 becomes a player on day 13. Freezing it per world means a content update or a rebalance can change the default for new worlds without rewriting anyone's past.

This is the ADR-007 §7 lesson (`TICKS_PER_SECOND` is immutable once content ships) applied one level up, and it is cheap now and impossible later.

### 3. Day phases are quantized states, and that is what preserves render-on-demand

The day is divided into a small, named, ordered set of phases — dawn, day, dusk, night as the initial set, extensible as data.

> **The simulation publishes a phase. It never publishes a fraction of a day.**

This is the same move `CropStage` makes and for the same reason: `src/sim/content/crops.ts` divides growth into four stages _"so a growing crop dirties the scene four times over its life instead of every tick (ADR-001 §1)."_ A four-phase day dirties the lighting layer four times per day. A continuous one dirties it 1,728,000 times.

**Transitions are the renderer's, and they are finite.** When the phase changes, the renderer may animate from the old tint to the new one over a bounded duration, holding an ADR-017 §1 animation lease for exactly that long and releasing it. A finite transition is free at idle by construction — no phase change, no lease, no frame — so ADR-001 §1's invariant is preserved rather than excepted. This ADR requires no amendment to ADR-017 §2 for that reason: nothing here is ambient.

**A phase change is an event** (`dayPhaseChanged`), published by the tick's `postUpdate` and consumed by the lighting view. It obeys ADR-008's producer-and-consumer rule from its first commit.

> **Amended in phase-10c: the event was never built, and should not be.** Its
> only named consumer is the lighting view, and by the time that view existed
> the `time` snapshot slice already delivered the phase to it — through the same
> republish-on-change path every other view uses. Two things settle it. **A save
> resuming mid-day publishes but does not fire:** load a world at dusk and the
> slice's first projection says "dusk", whereas an event-driven view would sit
> at its default tint until the next boundary, possibly hours later. And the
> event would carry nothing the slice lacks — a view that knows its current tint
> knows what it is transitioning from.
>
> `tileTilled` earns its place as an event because `tilledAt` reaches no slice.
> Nothing equivalent is true here: the phase _is_ published. Adding the event
> anyway would be a producer with no subscriber, which `src/sim/events/types.ts`
> exists to prevent. The rule this ADR stated — producer and consumer in the
> same commit — is what ruled the event out; it was applied, not waived.

### 4. Lighting is presentation, and holds no authority

Layer 5 was reserved by ADR-001 and has been empty since phase-02. It is claimed here.

- The simulation publishes the phase. It knows nothing about tint, colour, or opacity.
- The renderer maps phase → visual treatment. That mapping is content data (ADR-019 §3), so a content source can supply its own without touching engine code.
- **No simulation system may read lighting**, and no gameplay outcome may depend on a tint. If a future feature needs "it is dark", it reads the _phase_, which is simulation state.

### 5. Time is a read-only input to gameplay, not a driver of it

Systems may read the derived phase. Nothing in v0.2 makes gameplay _depend_ on it — no crop stops growing at night, no worker refuses to work in the dark.

That is a deliberate product constraint, not an oversight. `VISION.md` §2.2 forbids punishing absence, and a night that halts production would punish exactly the player who leaves the game running overnight — the player this product is for. Time-gated behaviour arrives, if it ever does, with the tier that needs it (v0.3 NPC schedules) and passes `CONTENT_RULES.md` §3's gate then.

### 6. Extension points, declared not stubbed

| Future need                       | Reads                              | Adds                            |
| --------------------------------- | ---------------------------------- | ------------------------------- |
| Seasons (ADR-021)                 | `day`, derived from the same clock | Nothing to this ADR             |
| Weather periods (ADR-022)         | `tick`, bucketed into periods      | Nothing to this ADR             |
| NPC schedules (v0.3)              | `phase`                            | Their own systems               |
| Worker shift scheduling (ADR-024) | `phase`                            | Schedule state, not clock state |
| A content-defined phase set       | The phase table as content data    | A registry entry                |

Every one of these reads the clock. None of them writes it, because there is nothing to write.

---

## Alternatives Considered

### A. A `timeSystem` advancing `world.timeOfDay` each tick

- **For:** the conventional shape; "the day advances" is a thing a system does.
- **Against:** it is an accumulator. It adds a save field, a migration, a catch-up contract, and a value that can contradict the tick it was derived from — every cost ADR-009 §2 enumerated and refused for crops.
- **Rejected because:** the tick counter is already the accumulator, and a second one is a second source of truth.

### B. A continuous `timeOfDay` fraction published to views

- **For:** the renderer could interpolate smoothly with no transition logic.
- **Rejected because:** ADR-005 §2 — a slice republishing every tick is a defect — and ADR-001 §1, because a smoothly-lerping tint never stops requesting frames. It converts the product's one hard constraint into a gradient.

### C. Ambient lighting drift under ADR-017 §2's four conditions

- **For:** honest about being ambient, and the machinery exists.
- **Against:** ADR-017's conditions mean the light would freeze whenever the pointer went idle and jump on return — worse than a quantized change, and it spends the ambient-motion budget on something a four-step ladder delivers for free.
- **Rejected because:** quantization makes the exception unnecessary. The best use of an escape hatch is not needing it.

### D. Real-world clock as the day cycle

- **For:** the overlay's night matches the player's night, which is genuinely appealing for a desktop companion.
- **Rejected because:** ADR-007 §1 forbids clock reads in `src/sim` at compile configuration, and the reason is not stylistic — a world driven by wall time cannot be replayed, cannot round-trip, and desynchronises across a timezone change. A _presentation_ tint keyed to the player's local time is permitted, because presentation may read real time (ADR-017 §3); it is simply not the game's day.

---

## Tradeoffs Accepted

| We accept                                | To gain                                        | Mitigation                                                    |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| Light changes in steps, not continuously | Render-on-demand survives without an exception | A finite transition animates each step; four leases per day   |
| `ticksPerDay` is frozen per world        | A content update never renumbers a past day    | Defaults may change freely for new worlds                     |
| Time drives no gameplay in v0.2          | Absence is never punished (`VISION.md` §2.2)   | v0.3 adds schedules through the gate, not by inheritance      |
| A four-phase day is coarse               | Zero new state, zero migration, exact offline  | The phase set is content data and may be refined without code |

---

## Consequences

### Immediate (Phase 10 implements)

- `game-clock.ts` gains `dayFor`, `timeOfDayFor`, and `phaseFor` as pure functions. No new system, no new store.
- `ticksPerDay` joins the world's creation-time constants and the save document (ADR-027's bump).
- `dayPhaseChanged` joins `SimEventMap` with a producer and a consumer in the same commit (ADR-008 §Ongoing).
- A `time` snapshot slice publishes `{ day, phase }` and republishes only when one changes.
- Layer 5 is claimed; the phase → tint mapping is registered content.

### Ongoing

- **Never store a derived time value.** Day, time of day, and phase are computed.
- **Never publish a continuous time fraction to a view.**
- **Never make a gameplay outcome depend on lighting.** Depend on the phase.
- A new time-derived concept is a new pure function on the clock, not a new field on `World`.

### Validation

- **Derivation test:** `phaseFor` over a full day covers every phase exactly once, in order, with no gap.
- **Republish test:** over a full simulated day with a static farm, the `time` slice republishes exactly once per phase boundary.
- **Idle invariant:** `PERFORMANCE.md` §4.2's zero-rAF assertion holds across a phase boundary once the transition's lease is released.
- **Offline exactness:** loading a save and advancing `world.tick` past an 8-hour gap yields the same day and phase as running the ticks.
- **Determinism:** unchanged — a derivation consumes no RNG, asserted by the existing 100k-tick test with the clock in play.

### Revisit if

- A gameplay system genuinely needs sub-phase time resolution → give _that system_ a finer derivation from the same tick; do not make the published phase continuous.
- The phase set needs to vary by season → it is content data already; register a second table, do not add state.

---

## Related

| Document                | Relationship                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| ADR-009 §2              | The derive-never-accumulate precedent this applies to time         |
| ADR-001                 | Layer 5 claimed; §1's gate preserved by quantization, not excepted |
| ADR-017 §1, §2          | The lease discipline transitions obey; why nothing here is ambient |
| ADR-021, ADR-022        | Seasons and weather periods derive from this clock                 |
| ADR-027                 | The schema bump carrying `ticksPerDay`                             |
| `ARCHITECTURE.md` §3.4a | The extension point this ADR fills                                 |
