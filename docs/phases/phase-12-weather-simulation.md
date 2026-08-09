# Phase 12 — Weather Simulation

> **Delivers:** weather that is derived rather than simulated, exact offline, and costs nothing when nobody is watching.
> **Governing decisions:** ADR-022 (weather), ADR-009 §2 (derive, never accumulate), ADR-017 §5 (derived variation, never rolled), ADR-021 (the seasons weather is biased by), ADR-027 (save evolution).
> **Schema:** v4 → v5, and the first **removal**.
> **Status:** **In progress.** Boundary 1 landed.

---

## Commit boundaries

`ROADMAP.md` §8 sets four: the derivation and weather content; the migration and derived wetness; the wetness consumer; presentation.

| Order | Boundary                                                         | Commit |
| ----- | ---------------------------------------------------------------- | ------ |
| 1     | `weatherFor`, weather kinds as content, the period constant      | _this_ |
| 2     | Schema v5 — `moisture` out, `wateredAt` in — and derived wetness | —      |
| 3     | A real consumer for wetness, or rain does not ship               | —      |
| 4     | Layer 4 particles under ADR-017 §2's four conditions             | —      |

---

## Decisions worth carrying forward

### The hash moved to `shared/`, and that was not tidying

`renderer/render/decor.ts` has had a four-line integer hash since v0.1, written for ADR-017 §5 — _"all variation is derived, never rolled"_. Weather needs the identical primitive for the identical reason at world scale (ADR-022 §1).

Copying it would have been smaller. It would also have been two functions that must agree forever, in a codebase where one of them is described as _"any well-mixed integer hash would do"_ — an invitation to improve it. Changing either copy silently changes every derived value in every world, past and future. `shared/hash.ts` has one, and `decor.ts` now aliases it; the decor tests pin placement and still pass, so no existing world's trees moved.

### The RNG guard is a test, not a comment

The rule is that a world showing weather must be byte-identical to one that does not. That is easy to state and easy to break later by reaching for `world.rng` because it is right there.

So `weather.test.ts` runs 500 derivations between two identical RNG streams and asserts the stream is untouched. It fails the moment anyone draws from the world generator, which a comment never would.

### Persistence comes from the period's LENGTH

Each period's weather is drawn independently, so rain lasts exactly one period. The period is therefore the only thing stopping it flickering, and at 6,000 ticks — five real minutes, a quarter-day — it reads as weather rather than as a bug.

ADR-022 §1 leaves room for richer shape _"over consecutive periods"_, and the signature already takes everything such a generator needs: past weather is computable, so `period - 1` is free. Nothing has to change to add hysteresis later, so nothing does it now (`AI_RULES.md` §1.5).

### Weather kinds are NOT frozen into the save, and seasons are

This is a deliberate inconsistency with `world.seasons`, and worth stating because it looks like an oversight.

A world freezes its season list because a season is part of the player's recorded past: change the list and day 40 belonged to a different season than it did yesterday. Weather has no such record — nobody writes down that it rained on day 3 — so ADR-027's v5 field set adds the period constant and nothing else, and this phase follows it.

The consequence is real and bounded: installing a weather mod changes what it rained last Tuesday, which changes any wetness derived from that rainfall (phase-12b). That is tolerable **only** because ADR-022 §5 makes rain a convenience and never a requirement. If a future feature makes wetness load-bearing, the kind list has to be frozen too, and that is a schema bump plus a successor decision — not something to discover then.

### Only `rainfall` is in the modifier vocabulary

ADR-022 §2's table anticipates wind and storm modifiers. One ships, because one has a derivation to modify. A weather kind carrying a `windSpeed` nothing reads would be the dead-state problem that ADR was written about — `grid.moisture`, one version later — and this phase is the one removing that field.

### Two kinds, not four

Clear and rain. Snow and storms are in the ADR's prose and are not here: snow raises a question this phase cannot answer (does it water a crop?), and a storm is a bag of modifiers that do not exist yet. Two kinds is enough for a seasonal pattern a player can notice — summer is the driest season, and the test pins that rather than the exact weights.

---

## Acceptance

- [x] Weather queried for a past period equals what was observed live at that period — `src/sim/time/weather.test.ts`, 200 periods walked forward then re-queried
- [x] `world.rng` is byte-identical with and without weather over a long run — asserted against two live streams
- [ ] With a constant rate, growth progress equals `tick − plantedTick` exactly — boundary 2
- [ ] Load + advance past an 8-hour gap is byte-identical to running the ticks, including crop progress — boundary 2
- [ ] Weather visuals on, pointer idle past the timeout → zero `requestAnimationFrame` callbacks — boundary 4
- [ ] A farm that never sees rain completes its loop and earns across a long run — boundary 3
- [ ] `v4 → v5` migrates every fixture, dropping `moisture` and defaulting `wateredAt`, with zero repairs — boundary 2
