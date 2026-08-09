# Phase 12 — Weather Simulation

> **Delivers:** weather that is derived rather than simulated, exact offline, and costs nothing when nobody is watching.
> **Governing decisions:** ADR-022 (weather), ADR-009 §2 (derive, never accumulate), ADR-017 §5 (derived variation, never rolled), ADR-021 (the seasons weather is biased by), ADR-027 (save evolution).
> **Schema:** v4 → v5, and the first **removal**.
> **Status:** **Delivered.** All four boundaries landed.

---

## Commit boundaries

`ROADMAP.md` §8 sets four: the derivation and weather content; the migration and derived wetness; the wetness consumer; presentation.

| Order | Boundary                                                         | Commit |
| ----- | ---------------------------------------------------------------- | ------ |
| 1     | `weatherFor`, weather kinds as content, the period constant      | _this_ |
| 2     | Schema v5 — `moisture` out, `wateredAt` in — and derived wetness | _this_ |
| 3     | A real consumer for wetness, or rain does not ship               | —      |
| 4     | Layer 4 particles under ADR-017 §2's four conditions             | —      |

---

## Decisions worth carrying forward

### Rain added no mechanism, which was the point

ADR-022 §6 says weather visuals _"join it under the existing rules, with no new mechanism"_, and that held literally. Rain asks the **same** `ambientAllowed` the swaying decor asks, in the same frame, and syncs a lease from the same boolean it draws on. All four of ADR-017 §2's conditions therefore apply without being re-stated: off by default and never in work mode arrive resolved in that flag, never-while-collapsed is structural because collapsing destroys the renderer, and the idle surrender is presence's job.

Because the lease and the drawing come from one boolean, they cannot disagree — which is the whole reason the acceptance holds rather than being carefully maintained. Mutating `raining && ambient` to `raining` fails three tests.

### `weatherChanged` was not built — the third amendment of its kind

ADR-020 §3, ADR-021 §6, and now ADR-022 §6. Three phases, three events specified beside a slice, three times the slice turned out to be the whole mechanism. The deciding argument is identical each time: **a save resuming during a downpour publishes but does not fire**, so an event-driven view would show clear skies until the next period.

At this point it is a pattern worth naming rather than three coincidences: in this codebase presentation is driven by slice republication, and an event earns its place only when the fact it carries reaches no slice — which is what `tileTilled` has and none of these three did.

### Weather in the `time` slice cost the republish counters their isolation

Weather changes about four times a day, the same order as the phase, so it adds no republish anyone pays for. It does mean the phase-10 republish counters were suddenly counting phase changes **plus** weather changes and calling the total "phase boundaries".

Both now build their world with a weather period longer than the run. That keeps each test about the one thing it names — and is a smaller intervention than making the counters weather-aware, which would have made them agree with whatever the code did.

### `isRaining` reads the declared rainfall, not a list of ids

The renderer could have asked "is the weather `core:rain`". It asks the registry whether the current kind's **declared** `rainfall` is above zero — the same number growth reads. A content source shipping `mod:drizzle` gets rain drawn without touching engine code, which is ADR-022 §2's modifier vocabulary doing its job rather than being described.

### Phase-12b's wetness model was wrong, and this phase found it

Boundary 2 shipped `wetness = rainfall since wateredAt − drying × elapsed`. It is wrong in a way that only appears after hours: `wateredAt` is 0 on an untouched tile, so the span ran from the world's first tick and rain integrated **forever**. With core content raining about a third of the time, accumulation outruns drying and every tile saturates at the cap and stays there — permanently wet.

That is an accumulator wearing a derivation's clothes, in the phase whose whole purpose was removing an accumulator-shaped field. It was found by building the consumer: a rate that is wet everywhere, always, is not a modifier.

The fix is a bounded **window** rather than a decay rate. Rain leaves the window as time passes, so there is nothing to accumulate and no cap to lean on. It also bounds the cost — two or three periods however long the world has run.

### A silent zero, caught by four tests failing the same way

`growthProgress` guarded its period length with `if (length <= 0) return to - from`. `undefined <= 0` is **false**, so a source missing the field fell through to a loop bounded by `NaN`, which runs zero times — reporting a crop that never grows.

Four tests failed with crops frozen at stage 0, which is what made it obvious; a single failure would have looked like a timing shift. The guard now tests finiteness. Worth recording because the failure mode is the worst available here: a silent zero stops the game rather than degrading it, and the surrounding code has no way to notice.

### Age and growth are different numbers now

The tile inspector reported one number and used it for age, stage and maturity. Once rain accelerates growth those diverge — a crop can be 1,000 ticks old with 1,250 ticks of progress — so it reports both. Showing only one would make the other look broken to whoever next debugs a stage boundary.

### Rain accelerates and drought never stalls, which is why nothing needed rebalancing

The rate is 1 when dry and 1.25 when wet, **never below 1**. So a dry world grows at exactly the speed it grew at before this phase existed, and every crop time in `GAME_DESIGN.md` §3.1 is still true as written. That is not caution: ADR-022 §5 makes it the ceiling, because weather is the purest form of a thing the player cannot control and cannot be present for. A drought that slowed a farm would punish someone for a hash of a number they never saw.

Five tests fail if the dry rate drops below 1, confirmed by mutation.

### The dry-farm test was wrong twice, and both mistakes are worth keeping

First attempt: doctor the weather registry and hand back a **spread copy** of the world. `createWorld` binds its command dispatcher to the object it returns, so every command executed against the original while the test inspected the copy — and the farm looked stalled when it had never been asked to do anything. **A spread copy of a `World` is not a `World`.**

Second attempt: the rebuilt version asserts its own dryness, and the assertion immediately failed — the seed it used rains. That is the test working: a dry-farm test that quietly runs against a rainy world proves nothing, and this one cannot.

### The removal was safe because the field carried no information

`SAVE_FORMAT.md` §11.2 predicted this link and set the test: `grid.moisture` was persisted from v1, serialized, validated, and **read by nothing**. So this dropped an array of zeros rather than discarding player value.

That distinction is the whole rule for a removal, and §11.2 already warns that the next one will not have it. Worth restating here because this one went so smoothly that it could be mistaken for a template: a field somebody reads needs a successor decision, not a migration.

The replacement is a different **shape**, not a rename. `moisture` was a 0–100 level — an accumulator, the exact thing ADR-009 §2 spent phase-03 removing from crops. `wateredAt` is a recorded tick with `tilledAt`'s shape, so wetness is derived and nothing accumulates.

### The migration sizes `wateredAt` from the DOCUMENT

`new Uint32Array(width * height)` reads the width and height out of the save being migrated, not from `WORLD_WIDTH`. A migration describes the save it was handed; if the world size ever changes, an old save must not be retro-resized into a different farm. Pinned by a test that migrates a doctored 4×4 grid and expects 16 words, and confirmed by mutation.

### A latent weakness in an existing test, surfaced rather than introduced

`save-fixtures.test.ts`'s "continues deterministically after loading" hydrated the **raw** fixture document without migrating it. That worked for four schema versions because every field the older versions lacked happened to be one hydration defaulted — until `wateredAt`, which is decoded rather than defaulted, and it threw.

The test now migrates first, which is what the real load path does (`readSavesForLoad` → migrate → validate → hydrate) and what the sibling test three lines above already did. Hydrating an unmigrated document is not a path the game can take.

This is worth recording because the failure looked like the migration breaking an old save, and it was not: it was a test asserting a path that does not exist.

### The three earlier migration tests now exempt `grid`

Each asserts "keeps every field it already had", which a chain containing a removal cannot claim in general. They skip `grid` and point at `migration-v4-to-v5.test.ts`, which checks the grid field by field — `moisture` gone, `wateredAt` present and correctly sized, everything else byte-for-byte.

### Wetness costs periods, not ticks

The eight-hour offline cap is 576,000 ticks and **96 weather periods**. `rainfallOver` sums one term per period plus two partials, so the offline case is a 96-term sum rather than a 576,000-step loop — which is what makes ADR-022 §3's decomposition worth having rather than merely correct.

The property that guards it is **additivity across an arbitrary split**: rainfall over `[0, n)` must equal rainfall over `[0, k)` plus `[k, n)` for every `k`, including ones that land mid-period. If that failed, a tile's wetness would depend on when the player happened to save.

### The constant-rate reduction is asserted, not argued

ADR-022 §4 claims the modulated integral reduces to `tick − plantedTick` when the rate is constant, so ADR-009's shipped behaviour is the special case rather than something replaced. With a single always-on weather kind the rate is constant by construction, and `rainfallOver` returns exactly `to − from` over every span tested. That is the reduction, executed.

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
- [x] With a constant rate, rainfall over a span equals the span exactly — `src/sim/time/wetness.test.ts`. Growth MODULATION itself is boundary 3's decision
- [x] Growth is a derivation with no state between calls, so advancing past a gap needs no catch-up — `src/sim/time/growth.test.ts`
- [x] Weather visuals on, pointer idle past the timeout → zero `requestAnimationFrame` callbacks — `src/renderer/render/rain-view.test.ts`, against the real dirty gate
- [x] A farm that never sees rain completes its loop and earns across a long run — `tests/dry-farm.test.ts`
- [x] `v4 → v5` migrates every fixture, dropping `moisture` and defaulting `wateredAt`, with zero repairs — `tests/migration-v4-to-v5.test.ts`
