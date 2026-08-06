# ADR-022: Weather Simulation

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phase 12
**Bound by (not re-litigated):** ADR-009 §2 (growth derives from `plantedTick`; if moisture-modulated growth returns in v0.2 weather it **must not** reintroduce an accumulator — the named alternatives are a rate-change log keyed by tick, or recomputation from a piecewise-constant rate history); ADR-020 (the derived clock); ADR-021 (the derived season); ADR-007 §1 (tick-only time, seeded RNG); ADR-017 §1–§2 (the animation lease; ambient motion's four conditions); ADR-001 §1 (render-on-demand); ADR-012 (the freeze this is authored under).

---

## Context

ADR-009 §2 wrote this ADR's hardest requirement three phases before there was a weather system to apply it to:

> **If moisture-modulated growth returns** (v0.2 weather), it must not reintroduce an accumulator. The options that preserve exactness are a rate-change _log_ keyed by tick, or recomputing from a piecewise-constant rate history. Reverting to an accumulator would re-open this ADR and re-introduce the offline error budget.

Two things about the shipped code sharpen it.

**`tiles.moisture` exists, is persisted, and is read by nothing.** It is declared in `tile-grid.ts`, serialized, validated, and decoded on load — and no system, command, or view consumes it. The watering-can tool is deliberately absent, with a comment in `renderer/app/tools.ts` saying so: _"a tool that... is deliberately absent while moisture is deferred."_ So v0.2 does not inherit a working moisture model; it inherits an empty `Uint8Array` in the save format, shaped like the accumulator ADR-009 forbids.

**There is no growth system to modify.** `TICK_SYSTEMS` has no growth entry, with a comment stating why: _"Crop growth needs no system: maturity is derived from `tick − plantedTick`."_ Any weather effect on growth must therefore fit a derivation, not a loop — the architecture has no loop to hook.

The design risk this ADR exists to close is the obvious implementation: a `weatherSystem` that rolls a die each tick, mutates a `world.weather` field, sprays moisture across the grid, and grows crops slower. Every one of those four steps is a defect — a die roll per tick that must be replayed, a field that must be migrated and caught up, a per-tile write in a hot loop, and an accumulator.

---

## Decision

**Weather is derived, not simulated. It is a pure function of the world seed, a weather period index, and the season — so it has no state, no system, no save field, and no catch-up. Weather modifies existing systems through declared modifiers; it never runs a loop of its own, and it never creates a parallel simulation.**

### 1. Weather is a pure function

```
period  = floor(tick / ticksPerWeatherPeriod)
weather = weatherFor(seed, period, seasonFor(dayFor(period)))
```

The generator is a deterministic hash over its inputs, not a draw from `world.rng`. That distinction is the whole design:

| Consequence                          | Why it follows                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| **`world.rng` is untouched**         | Consuming the stream would desynchronise a saved game — ADR-017 §5's rule, at world scale |
| **No save field, no migration**      | There is nothing to persist                                                               |
| **Offline is exact**                 | Advancing `world.tick` past a gap _is_ the catch-up (ADR-007 §6)                          |
| **Weather is queryable at any tick** | Past and future weather are computable, which §3 depends on                               |
| **Determinism is structural**        | A hash of stored inputs cannot diverge                                                    |

Weather **patterns** — that rain persists rather than flickering, that storms are rare, that a season biases its mix — come from the generator's shape over consecutive periods and from the season input, not from stored continuity. Period length is a world constant fixed at creation, for ADR-020 §2's reason.

Weather kinds are **content** (ADR-019 §3), registered like crops. The engine owns the derivation and the modifier vocabulary; a content source owns which kinds exist, their weights per season, and their declared modifier values.

### 2. Weather is a modifier, never a loop

> **No weather system performs gameplay.** Weather is state that existing systems read. Rain does not run a watering system; it changes what the watering-derived value _is_.

This is the principle stated as a rule with a detector: **if a tick-ordered entry has to be added to `TICK_SYSTEMS` for weather to have an effect, the design is wrong.** Weather's effect is expressed as declared modifiers that existing derivations and validations consult:

| Weather concept | Modifies                                       | Through                      |
| --------------- | ---------------------------------------------- | ---------------------------- |
| Rain            | Tile wetness                                   | §3's derivation — no writes  |
| Wind            | Presentation, and any declared worker modifier | The same modifier vocabulary |
| Storm           | A declared, bounded modifier set               | Same                         |
| Any future kind | The declared vocabulary                        | Same — never a new system    |

A weather kind is a bag of declared modifier values. Adding one is a content change, which is goal 1 and goal 9 satisfied at the same time.

### 3. Wetness is derived, and `moisture` is replaced

The dead `moisture: Uint8Array` is **removed** and replaced by a recorded fact, mirroring the two facts the grid already stores well:

```
tilledAt   Uint32   tick tilled, or 0        (exists, works)
plantedTick         on the crop instance     (exists, works)
wateredAt  Uint32   tick last watered, or 0  (replaces moisture)
```

Wetness at any tick is then a pure function of a stored fact and derived rainfall:

```
wetness(tile, tick) = f( wateredAt[tile], rainfall over [wateredAt[tile], tick] )
```

and rainfall over any span is computable exactly, because §1 makes weather a function of the period index. The span decomposes into whole weather periods whose values are known — **a piecewise-constant rate history that never had to be stored**, which is the second of the two mechanisms ADR-009 §2 named, obtained for free.

This removes an accumulator-shaped field from the save rather than adding one, and it gives `wateredAt` the same shape as `tilledAt`, so the grid stays a set of orthogonal recorded facts (ADR-009 §1) rather than growing a mutable simulation variable.

### 4. Weather-modulated growth: the mechanism is fixed, the shipping is a phase decision

Because §1 and §3 make both weather and wetness exactly computable at any tick, growth can be modulated **without an accumulator and without an error budget**:

```
progress(crop, tick) = ∫ rate( wetness(tile, t) ) dt   over [plantedTick, tick]
```

evaluated as a finite sum over whole weather periods plus two partial ones. Exact, closed-form, bounded by the number of periods elapsed, and reducing to `tick − plantedTick` when the rate is constant — so ADR-009's current behaviour is the special case, not a thing being replaced.

**This ADR fixes the mechanism. Whether Phase 12 ships growth modulation is that phase's scope decision**, and it is gated on one thing: `AI_RULES.md` §1.6 forbids unreachable code, so wetness must gain a real consumer in the same phase that gives it a producer, or neither ships. Shipping rain that writes a value nothing reads would recreate exactly the dead-state problem §Context describes, one version later.

### 5. Rain is a convenience, never a requirement

Whatever wetness affects, the ceiling is this: **a dry farm must remain fully playable and fully profitable.** Rain may accelerate; drought may not stall.

`VISION.md` §2.2 forbids punishing absence, and weather is the purest form of a thing the player cannot control and cannot be present for. A drought that halts a farm punishes a player for a hash of a number they never saw. Weather's job is to make the world feel alive, not to gate it — the same call ADR-021 §3 makes for seasons, for the same reason.

### 6. Presentation reacts, and obeys ADR-017 exactly

Layer 4 (`effects`) was reserved by ADR-001 and claimed by phase-07.5b's feedback effects. Weather visuals join it under the existing rules, with no new mechanism:

- **Rain, snow, and wind particles are ambient** by ADR-017 §2's definition — they do not end. They therefore inherit all four conditions unchanged: off by default, never while collapsed, never in work mode, and **surrendered when the pointer has been idle past `AMBIENT_IDLE_TIMEOUT_MS`**. A player watching the farm sees rain; a player who alt-tabbed sees a still world and the frame loop stops.
- **A weather _change_ is finite** — the transition takes a lease and releases it, like a day-phase transition (ADR-020 §3).
- **Everything is pooled** with a fixed ceiling, allocating nothing after construction (ADR-017 §4).
- **All variation is derived, never rolled** (ADR-017 §5) — a raindrop's position hashes presentation inputs and never touches `world.rng`.

No amendment to ADR-017 is required. Weather is the case that model was built for.

---

## Alternatives Considered

### A. Stateful weather advanced by a `weatherSystem` drawing from `world.rng`

- **For:** the conventional shape, and the one ADR-015's own worked migration example sketches (`world.weather` with `sinceTick`).
- **Against:** a save field, a migration, a catch-up contract, an RNG stream the renderer must never disturb, and a per-tick system doing work on a farm where weather changes a few times an hour. It also makes past weather unknowable, which forecloses §3 and §4 entirely.
- **Rejected because:** every cost is real and the derived form has none of them. (ADR-015's example was illustrating _migration shape_, not deciding weather's design.)

### B. Keep `moisture` as a mutable per-tile accumulator that rain increments

- **For:** it is already in the save format and needs no migration.
- **Rejected because:** it is precisely the accumulator ADR-009 §2 forbids, it makes growth non-derivable, it reintroduces an offline error budget, and it means a per-tile write across the whole grid on rainy ticks — an unbounded hot-loop cost on the one system that currently costs nothing.

### C. Weather as a global multiplier with no spatial variation and no tile state

- **For:** the simplest thing that could work; no grid changes at all.
- **Against:** it cannot express a watered tile beside a dry one, so the watering action can never return, and `GAME_DESIGN.md` §3.4's deferred moisture design stays deferred forever.
- **Rejected because:** §3's `wateredAt` costs one `Uint32Array` — the same shape as `tilledAt` — and buys back a whole deferred mechanic.

### D. Weather that damages crops, floods tiles, or blocks work

- **Rejected because:** §5 and `VISION.md` §2.2. It is also the shape `CONTENT_RULES.md` §3's gate exists to catch: a mechanic whose entire interaction with the player is loss, arriving while they are away.

### E. Real local weather from an online service

- **Rejected outright.** It requires network access (`connect-src 'self'` forbids it), destroys determinism, and makes a player's save unreproducible on any other machine or day. Named only because it is a recurring suggestion for desktop companions.

---

## Tradeoffs Accepted

| We accept                                      | To gain                                                      | Mitigation                                                           |
| ---------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Weather cannot react to player action          | No state, no migration, exact offline, no RNG consumption    | Nothing in the roadmap asks it to; a reactive event is a modifier    |
| Growth progress becomes a sum over periods     | Modulated growth stays exact — no accumulator, no error band | Bounded by elapsed periods; reduces to subtraction when rate is flat |
| A save-format field is removed, not just added | Dead accumulator-shaped state leaves the format              | ADR-027's migration drops `moisture` and defaults `wateredAt`        |
| Rain visuals are off by default                | The idle invariant holds for a fresh install                 | ADR-017 §2's conditions, unmodified                                  |

---

## Consequences

### Immediate (Phase 12 implements)

- `weatherFor(seed, period, season)` as a pure function; `ticksPerWeatherPeriod` joins the world's creation constants.
- Weather kinds become registered content, with `plugins/core/` supplying the default set through the public API.
- The grid's `moisture` is replaced by `wateredAt` under ADR-027's migration; `SAVE_FORMAT.md` §2 is updated in the same commit.
- `weatherChanged` joins `SimEventMap` with a producer and a consumer.
- Layer 4 gains weather particles under ADR-017 §2's four conditions; `PERFORMANCE.md` §4.2 gains the matching idle case.
- Wetness gains a real consumer in this phase, or rain does not ship (§4).

### Ongoing (binding on every future session)

- **Never add a weather system to `TICK_SYSTEMS`.** Weather is derived and read; the moment it needs a tick slot, §2 has been violated.
- **Never draw weather from `world.rng`.**
- **Never store wetness.** Store the watering fact; derive the value.
- **Never let weather destroy value or stall a farm** (§5).
- A new weather effect is a new declared modifier, never a new system.

### Validation

- **Determinism:** two runs from one seed produce identical weather at every period, and `world.rng` is byte-identical to a run with weather disabled — the ADR-017 §5 guard, at world scale.
- **Derivation:** weather queried for a past period equals what was observed live at that period.
- **Offline exactness:** load a save, advance past an 8-hour gap, and the world is byte-identical to one that ran the ticks — including every crop's progress under §4's sum.
- **Rate-history equivalence:** with a constant rate, §4's sum equals `tick − plantedTick` exactly, so ADR-009's shipped behaviour is preserved as the special case.
- **Idle invariant:** rain visuals on, pointer idle past the timeout → zero `requestAnimationFrame` callbacks.
- **Playability floor:** a farm that never sees rain across a long run still completes its loop and earns (§5), asserted by the long-run test.

### Revisit if

- Weather genuinely must respond to a player action → model the action as a recorded fact the derivation reads, exactly as `wateredAt` is. Do not add weather state.
- The per-period sum in §4 shows up in a profile → cache it in the snapshot slice, never in world state (ADR-009 §Revisit, verbatim).

---

## Related

| Document                  | Relationship                                                               |
| ------------------------- | -------------------------------------------------------------------------- |
| ADR-009 §2                | The constraint this ADR was written to satisfy, and the mechanism it names |
| ADR-020, ADR-021          | The derived clock and season this derivation reads                         |
| ADR-017 §1, §2, §4, §5    | The motion, pooling, and derived-randomness rules weather visuals inherit  |
| ADR-027                   | The migration replacing `moisture` with `wateredAt`                        |
| `GAME_DESIGN.md` §3.4     | The moisture design deferred by ADR-009, and what §3 makes reachable again |
| `SAVE_FORMAT.md` §2, §6.3 | The grid schema, and the growth row that stays "exact by construction"     |
