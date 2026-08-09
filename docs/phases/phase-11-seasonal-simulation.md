# Phase 11 — Seasonal Simulation

> **Delivers:** the calendar starts mattering — through opportunity, never through loss.
> **Governing decisions:** ADR-021 (seasonal simulation), ADR-020 (the calendar it derives from), ADR-009 §2 (why growth rate is absent), ADR-013 §4 (the price pipeline), ADR-027 (save evolution).
> **Schema:** v3 → v4.
> **Status:** **Delivered.** All three boundaries landed. What was deliberately left out is named below.

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

### `seasonChanged` was not built either, and ADR-021 §6 says so now

The same finding as phase 10's, reached the same way. Every consumer ADR-021 §6 names — terrain palette, seasonal decoration, audio beds — is presentation, and presentation here is driven by slice republication, not event subscription. The season rides in the `time` slice and the terrain reads it there.

The decisive argument is the one that settled `dayPhaseChanged`: **a save resuming in autumn publishes but does not fire.** The slice's first projection says "autumn" and the ground is painted correctly; an event-driven view would hold spring's colour for up to two hours twenty of play.

Two amendments in two phases is a pattern rather than a coincidence. The v0.2 architecture pass specified an event beside a slice in both ADR-020 and ADR-021, and in both cases the slice turned out to be the whole mechanism. Phase 12's weather ADR should be read with that in mind before its event is built.

### The season rides in the `time` slice rather than a slice of its own

A slice exists so a consumer does not re-render on changes it does not read. The season changes **once a week of game time** against the phase's four times a day, so putting it in the existing slice adds no republish anyone pays for. A `season` slice would be a second subscription to save nothing.

It did cost one thing, and it is worth recording: the slice's seeded value now carries an **empty** season list, because `createSnapshotState` has no world to ask which seasons it runs on. So the first tick corrects it — one republish at world start, the same one-time correction `inventory` and `wallet` already document. Two republish-counting tests had to settle a tick before counting, which is the convention `StatusBar.test.tsx` already used.

### Ground and light are two surfaces, so neither needs a composition rule

The season tints the **terrain**; the phase tints the **scene** (layer 5). Had both gone to layer 5 they would have needed a rule for how two tints combine, and every such rule is a decision someone has to remember. Keeping them on different surfaces means the answer is just "both apply", which is also what they mean physically.

The tint is set on the chunk **sprites**, never baked into their cached textures. Baking would invalidate every chunk four times a year, which is the single thing `terrain-renderer.ts` exists to avoid. A chunk created after a season change arrives already tinted, so scrolling onto new ground cannot show last season's colour.

### The seasonal price band never exceeds 1.00, and that is not a style choice

ADR-013 §4 makes the base price the ceiling — _"prices recover to the memorized value"_ — so a seasonal **premium** would break the one number a player is allowed to memorize. The modifier is therefore a discount: **[0.90, 1.00]**, giving an effective price in [0.45, 1.00] of base once multiplied with the sale multiplier's [0.50, 1.00].

**There is a real tension here and it should be stated rather than smoothed over.** Any modifier that is not identically 1.00 reduces someone's income, and `VISION.md` §2.2 forbids punishing absence. The case that could suffer is a crop maturing after its season turned while the player was away. Three things bound it:

- A player selling through a market stall never meets it. Produce is sold as it is harvested, in the season it grew in.
- It is reachable by **holding stock across a boundary**, which is a choice, not an absence.
- Ten percent is enough to notice in a ledger and far too little to make being away a mistake.

If playtesting shows otherwise, the fix is to raise the floor to 1.00 — the band is one constant and the bounds test states it.

### The modifier reads the crop that YIELDS an item, not an id that matches it

Core names produce after its crop (`core:wheat` the item comes from `core:wheat` the crop), and reading that convention would have been one line shorter. It is a convention of `plugins/core`, not a rule any third-party source agreed to: a source shipping `mod:melon` yielding `mod:melon_flesh` would have got no seasonal price at all, silently and forever. The lookup goes through `harvestYield`.

Seeds get no seasonal modifier. A seed's price is what a crop costs to **start**, and that is already gated by plantability — discounting it too would be the same rule charged twice.

### The out-of-season worker path is reachable ONLY through the seed bin

Writing the no-deadlock test surfaced something the ADR does not say and the code does not make obvious: **without a seed bin, a worker can never be blocked by a season.**

`plantCropFor` offers exactly two crops — the tile's remembered crop, which requires a bin, and `WORKER_DEFAULT_CROP`, which is the turnip. The turnip is year-round. So the only route by which a worker ever asks to sow a seasonal crop is the bin's memory, which is precisely the path ADR-021 §4 describes and the only one that can close.

My first version of the no-deadlock test did not know this. It stocked a farm with pumpkin seeds only, removed the turnips, and expected a plant task in autumn — and got `till`, because with no bin the worker only ever considers turnips and there were none. **The test was wrong, not the code.** The corrected fixture places a bin, remembers wheat on the tile, and stocks wheat alone, which is the real shape of "a farm whose entire stock is out of season".

### The turnip is year-round, and that is structural

`core:turnip` is `WORKER_DEFAULT_CROP`. Give it a season and a farm without a seed bin has nothing to plant for a whole season — two hours twenty of real time with workers tilling ground they cannot sow. That is a worker idled by the calendar, which ADR-021 §4 forbids.

So its empty `seasons` list is load-bearing rather than a tuning choice, and the comment in `plugins/core/content.ts` says so. The other three crops carry real seasons, which is what makes the feature reach a player at all: with every crop year-round the entire plantability path would be unreachable code (`AI_RULES.md` §1.6).

### Catch-up refuses the whole gap, not the legal part of it

ADR-021 §5's rule is _"where the model cannot be certain it credits nothing."_ Applied here: if a gap touched **any** season the crop cannot be sown in, no replant is credited for that tile — not even for the stretch that was in season.

A finer model would segment the gap and credit each legal stretch. It would also have to decide what a worker was doing at each boundary, and every wrong guess lands on the side that credits work the real simulation would have refused. That is the exact shape of the phase-09 over-credit, which took an unseeded property test months to find. Under-crediting a returning player is the cheaper error.

The property test that guards it is the existing never-over one, extended rather than replaced — plus a paired direct assertion: wheat crossing summer→autumn credits **zero** replants, and a turnip crossing the same boundary credits some. Without the control the rule would be indistinguishable from "no replants across any boundary".

### The runner's budget is a design constraint, and I walked into the trap

The season-crossing property test reached for `OFFLINE_CAP_TICKS` first — eight hours, 576,000 ticks, three runs. It passed `npm test` in about two minutes and then stalled `npm run test:coverage` past ten.

The note directly above it in the same file says why, and was written in phase-07e after exactly this failure: _"V8 coverage instrumentation costs roughly 3.5×, which is how this passed `npm test` and failed `npm run test:coverage` unnoticed."_ I added a heavy case a few lines below a warning about adding heavy cases.

Cut to two seasons and change — three boundaries, one arbitrary farm — which proves the same property: 143 s → 112 s for the file. **Three boundaries prove what seven would.** The two direct assertions carry the semantics and step nothing at all.

### One pre-existing test needed changing, and only its setup

`crop-commands.test.ts` planted a pumpkin at tick 0 to prove offline growth across an eight-hour gap. Day 0 is spring, and pumpkin is now autumn/winter, so the plant was refused and the test failed on its harvest.

The test is about a **gap**, not about the calendar, so the fix moves the world into autumn before planting and keeps the longest crop — the property under test is untouched, and the assertion is now stronger for asserting the plant succeeded rather than assuming it. No assertion was weakened or removed (`TESTING.md` §6.4).

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

- [x] A crop planted in season and left standing across a boundary matures normally, with a world byte-identical to one where the boundary did not fall — `tests/seasons.test.ts`
- [x] A farm with only out-of-season seeds keeps its workers working and resumes planting when the season turns, unattended — `tests/seasons.test.ts`
- [x] Effective prices stay inside the product of the declared bands, every season — `tests/season-pricing.test.ts`, exhaustive over every item in every season at both extremes
- [x] Catch-up never over-credits across one or several boundaries — `tests/catch-up.test.ts`, the never-over property extended to boundary-spanning gaps
- [x] `v3 → v4` migrates every fixture with zero repairs — `tests/migration-v3-to-v4.test.ts`

---

## Left out, deliberately

| Item                                | Why                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seasonal harvest-yield modifier** | ADR-021 §2 declares three modifier surfaces and this phase built two. A yield multiplier is the one that most directly reduces what a player gets for work already done, and `VISION.md` §2.2 makes that the hardest to justify. It needs a design decision, not an implementation |
| **Seasonal decoration**             | Decor is planned from the owned plot and replanned when it expands. Making it seasonal means a second trigger and a per-season decor table — a content kind this phase did not need                                                                                                |
| **Seasonal audio beds**             | Phase 13 owns the bus, the mixer, and the first ambient bed (ADR-016, ADR-023). A seasonal bed before there is a bed is nothing                                                                                                                                                    |
| **`displayName` reaching the HUD**  | The readout capitalises the id's name part, which is right for every shipped season and worse than it should be for `mod:the_long_dark`. Closing it means routing `displayName` through the slice — a change to the slice's shape, not to the component                            |

The first is the only one with product consequences, and it is named here rather than left implicit so that "phase 11 shipped two of three declared surfaces" is on the record.
