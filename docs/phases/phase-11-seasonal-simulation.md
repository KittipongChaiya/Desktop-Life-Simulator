# Phase 11 — Seasonal Simulation

> **Delivers:** the calendar starts mattering — through opportunity, never through loss.
> **Governing decisions:** ADR-021 (seasonal simulation), ADR-020 (the calendar it derives from), ADR-009 §2 (why growth rate is absent), ADR-013 §4 (the price pipeline), ADR-027 (save evolution).
> **Schema:** v3 → v4.
> **Status:** **In progress.** Boundary 1 landed.

---

## Commit boundaries

`ROADMAP.md` §7 sets three: derivation, registry, and migration; plantability and worker/seed-bin interaction; the price modifier and presentation.

| Order | Boundary                                                       | Commit |
| ----- | -------------------------------------------------------------- | ------ |
| 1     | `seasonFor`, the season registry, and schema v4                | _this_ |
| 2     | Plantability, and workers/seed bin skipping without blocking   | —      |
| 3     | The seasonal price modifier, `seasonChanged`, and presentation | —      |

---

## Decisions worth carrying forward

### A migration may not read a live registry

The obvious `v3 → v4` asks `createInstalledRegistries()` what the seasons are and writes that. It was written that way first, and it is wrong in a way that would not have shown up for a long time: **a migration must be a pure function of the document.** Reading installed content means the same save migrates to two different worlds on two machines — one with a season mod, one without — and the golden fixture meant to catch that would itself vary by environment.

So the four seasons that shipped are a frozen literal in the migration, duplicated from `plugins/core` on purpose, and they stay there forever even after core grows a fifth. The link describes what a v3 world **was**.

The mutation control makes the point better than the comment does: reordering `coreSeasons()` fails the registry test and leaves the migration test untouched. That is the immunity the duplication buys.

### This synthesises where `v1 → v2` refused to

Phase 09 recorded that `world.sources` migrates to the **empty** manifest rather than a synthesised `core` entry, because a v1 save carried no record of its sources and any manifest would have been a claim about history nobody made.

This link does the opposite, and the distinction is worth stating so the two do not look inconsistent. A v3 save carries no seasons because **seasons did not exist yet** — every v3 world ran under exactly one implicit year, the shipped one. Writing it down states that; it does not guess it. The test for "does this migration invent something" is whether the value was ever ambiguous, not whether it was ever written.

### Registration order is the year, and there is no `order` field

A `SeasonDefinition` carries an id and a display name. Adding `order: number` would create a second ordering that could disagree with the first. This is `tile-kinds.ts`'s rule wearing different clothes — and it carries the same warning: appending is safe, reordering is not.

The consequence is milder here than for tile kinds, and deliberately so. A tile kind's index becomes a **byte in every save**, so reordering reinterprets existing grids. A season's order is copied into `world.seasons` at creation, so reordering cannot touch an existing world — it only gives every NEW world a different year from every world made before it. Still bad, still silent, but recoverable.

### `daysPerSeason` is 7, and the number is not arbitrary

A day is 24,000 ticks — twenty real minutes. Seven days is two hours twenty per season, so a four-season year is nine hours twenty: just over the working day `VISION.md` §2.1 says this window sits beside. A player who leaves it running for a day sees a whole year.

The check that matters is against crop times rather than clocks: `core:pumpkin` matures in exactly one day (`GAME_DESIGN.md` §3.1), so a season holds seven of them end to end. That is what makes an out-of-season restriction a choice rather than a lockout — the thing ADR-021 §3 is built to guarantee.

### The 10b lesson applied before it could bite

Phase 10b's offline-exactness test passed for weeks against a `deserialize` that dropped `ticksPerDay` entirely, because it was built on a default-length day and the fallback supplied the very value it asserted.

So this boundary's round-trip test builds a world with **3 days a season and a two-season year** — values no default could produce. Removing either field from `deserialize` fails it. The rule, stated in phase-10's doc and now used: **a persisted constant tested at its default is not tested at all.**

---

## Acceptance

- [ ] A crop planted in season and left standing across a boundary matures normally, with a world byte-identical to one where the boundary did not fall — boundary 2
- [ ] A farm with only out-of-season seeds keeps its workers working and resumes planting when the season turns, unattended — boundary 2
- [ ] Effective prices stay inside the product of the declared bands, every season — boundary 3
- [ ] Catch-up never over-credits across one or several boundaries — boundary 2
- [x] `v3 → v4` migrates every fixture with zero repairs — `tests/migration-v3-to-v4.test.ts`
