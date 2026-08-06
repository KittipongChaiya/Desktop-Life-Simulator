# ADR-021: Seasonal Simulation

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phase 11
**Bound by (not re-litigated):** ADR-020 (the calendar seasons derive from); ADR-009 §2 (growth is a pure function of elapsed ticks; any variable rate must preserve derivability); ADR-013 §4 (prices are a content base under a bounded, declared modifier pipeline — new pricing features are new modifiers, never new pipelines); ADR-004 §5 (definitions are data); `VISION.md` §2.2 (reward absence, never punish it); ADR-012 (the freeze this is authored under).

---

## Context

Seasons are the first system in v0.2 whose whole purpose is to make gameplay vary over time, which makes them the first real opportunity to break two guarantees at once.

v0.1 anticipated them. `CropDefinition` already carries a `seasons: readonly string[]` field, added in phase-03 with a comment that says exactly why:

> Declared now because it is DATA, not behaviour — v0.2 seasons read it without changing the definition shape. An empty array is the honest v0.1 answer, not a placeholder.

So the content shape needs no change and no migration. What needs deciding is **what a season is allowed to affect**, and the answer is constrained from two directions.

**From ADR-009 §2.** Growth is derived from `tick − plantedTick`, and that derivation is why offline growth is exact and needs no catch-up. Any seasonal effect on _growth rate_ re-opens that, and the ADR names in advance the only two designs that would preserve exactness.

**From `VISION.md` §2.2.** Crops do not wither. A season system that kills out-of-season crops punishes the player who left the game running, which is the player this product exists for. Seasonal pressure has to come from opportunity, never from loss.

---

## Decision

**A season is derived from the day. It exposes exactly three declared modifier surfaces — plantability, harvest yield, and price — each evaluated at a discrete moment so nothing accumulates. Seasons never damage, never destroy, and never block a worker.**

### 1. The season is derived, like the day

```
season = seasonFor(day)        // day comes from ADR-020's clock
```

`daysPerSeason` and the ordered season list are world constants fixed at creation, for ADR-020 §2's reason: changing them on a live world silently renumbers its past. There is no `seasonSystem`, no `world.season` field, and no catch-up — the tick is the accumulator, as it is for the day and for crop growth.

Seasons are **content**, registered like any other definition (ADR-019 §3), so a content source can ship its own set. The engine holds the cycle, not the names.

### 2. Three modifier surfaces, and no others

Each is evaluated at a single discrete moment. That is the property that keeps them out of ADR-009 §2's way — none of them integrates over time, so none of them can accumulate.

| Surface           | Evaluated                            | Mechanism                                                                     |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| **Plantability**  | At plant time, in command validation | A typed rejection, exactly like the existing missing-seed rejection           |
| **Harvest yield** | At harvest time, once                | A bounded declared multiplier on the definition's `harvestYield`              |
| **Price**         | At sale time                         | A new modifier in ADR-013 §4's existing bounded pipeline — not a new pipeline |

**Growth rate is deliberately absent from this table.** If seasonal growth is ever wanted it uses ADR-022's derived-rate mechanism, which preserves exactness, and it arrives with that mechanism rather than beside it. Reverting to an accumulator would re-open a frozen ADR and reintroduce an offline error budget the project deleted on purpose.

**Every modifier is bounded and declared**, inheriting ADR-013 §4's predictability guarantee verbatim: a player who knows the base value always knows the worst and best case. Cozy is a bound, not a vibe.

### 3. Out-of-season crops grow. They never die

A crop planted in its season and still standing when the season turns **continues to maturity, unchanged**.

This is not a softening; it is the load-bearing product constraint. `VISION.md` §2.2 — _"Crops do not wither from neglect. Growth completes and waits"_ — was written about neglect, and an absent player whose field died to a calendar has been punished for absence by a different name. Seasonal pressure lives entirely in what you may _start_, never in what you _lose_.

It also keeps ADR-009's derivation intact: a standing crop's maturity still depends only on `tick − plantedTick`.

### 4. Seasons never block a worker

Worker task selection already gates the plant band on seed availability and moves to the next band when nothing is sowable — phase-06b built that so _"the band reopens the moment seeds arrive (never jams)."_

Out-of-season is the same shape and takes the same path: an unplantable tile is skipped, the worker proceeds to other work, and the band reopens when the season turns. The seed bin's replant memory (`GAME_DESIGN.md` §5) records what _was_ planted; when that crop is out of season the bin falls through to its existing "nothing sowable — skip the tile" branch.

> **A season may never be the reason a worker has nothing to do and stops.** `GAME_DESIGN.md` §4.2 makes "a worker never deadlocks" a hard product requirement, and a calendar is a novel way to violate it.

### 5. Offline catch-up stays conservative

`SAVE_FORMAT.md` §6.4's worker catch-up credits replanting only through the seed bin, rounds down at every step, and is proven never to over-credit.

Seasons add one bound to that model: **catch-up may not credit a plant the real simulation would have rejected.** A gap spanning a season boundary is evaluated against the season in force for each segment, and where the model cannot be certain it credits nothing. The existing property test — catch-up compared against the real simulation on byte-identical clones, asserting never-over — extends to cover season-crossing gaps and is the mechanism, not a promise.

### 6. Presentation reacts; it does not decide

A season change publishes `seasonChanged` (ADR-008, producer and consumer in the same commit) and appears in the `time` slice beside the day and phase.

Terrain palette shifts, seasonal decoration, and audio beds are views of that fact. They hold no authority, and no gameplay outcome may depend on any of them — the ADR-020 §4 rule, restated because a seasonal repaint is a tempting place to hang a rule.

---

## Alternatives Considered

### A. Seasons modulate growth rate

- **For:** the most intuitive seasonal effect; "things grow slower in winter" needs no explanation.
- **Against:** it re-opens ADR-009 §2 and reintroduces the offline error budget deleted in phase-03. Done naively it is an accumulator, which is the specific design that ADR forbids.
- **Deferred, not rejected:** ADR-022 specifies a derived-rate mechanism that would make it exact. It arrives with that mechanism or not at all.

### B. Out-of-season crops wither or yield nothing

- **For:** real seasonal stakes; the standard farming-sim behaviour.
- **Rejected because:** `VISION.md` §2.2 and §2.1. This game is left running unattended for days by design, so a withering rule punishes precisely its intended use. `CONTENT_RULES.md`'s prohibition on punished absence would reject it at the feature gate regardless.

### C. Store the current season on `World`

- **For:** one field read instead of a derivation.
- **Rejected because:** it is a second source of truth for something the tick already determines, and it adds a save field, a migration, and a value that can disagree with the day it came from — ADR-009 §Alternatives C, in a calendar.

### D. Seasons as engine constants rather than content

- **Rejected because:** goal 1 and ADR-019 §3. A four-season year is a content decision; the _cycle_ is the engine's. Hardcoding the names would make a content source unable to ship a two-season world, for no saving.

---

## Tradeoffs Accepted

| We accept                                         | To gain                                        | Mitigation                                                     |
| ------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| No seasonal growth-rate variation in v0.2         | Offline growth stays exact                     | ADR-022's derived mechanism is specified and available         |
| Seasonal pressure is opportunity-only             | Absence is never punished                      | Plantability and price still make the calendar matter          |
| `daysPerSeason` is frozen per world               | A content update never renumbers a past season | Defaults may change freely for new worlds                      |
| Catch-up gets more conservative across boundaries | It still never over-credits                    | The existing never-over property test is extended, not relaxed |

---

## Consequences

### Immediate (Phase 11 implements)

- `seasonFor(day)` joins the clock as a pure function; the season list and `daysPerSeason` join the world's creation constants (ADR-027's bump).
- A season content registry, with `plugins/core/` registering the default set through the public API (ADR-019 §2).
- `CropDefinition.seasons` is honoured — plant validation gains a typed out-of-season rejection alongside the existing missing-seed one.
- A seasonal price modifier is declared in ADR-013 §4's pipeline, with its band stated.
- `seasonChanged` joins `SimEventMap`; the `time` slice carries the season.

### Ongoing

- **Never let a season destroy player value** — no withering, no spoilage, no seasonal loss. This is constitutional, not a tuning choice.
- **Never let a season deadlock a worker.**
- **Never store the season.**
- A new seasonal effect is a new _declared, bounded_ modifier on one of §2's three surfaces, or it needs a successor ADR.

### Validation

- **Derivation test:** the season cycle over several years is exact and gap-free, and matches the day derivation.
- **No-wither test:** a crop planted in season and left standing across a season boundary matures normally, with a byte-identical world to one where the boundary did not fall.
- **No-deadlock test:** a farm whose entire seed stock is out of season keeps its workers working; when the season turns, planting resumes without intervention.
- **Catch-up:** the never-over property test extended to gaps spanning one and several season boundaries.
- **Price bounds:** the effective price stays inside the product of the declared bands (ADR-013 §4), across every season.

### Revisit if

- Seasonal growth-rate variation becomes a requirement → adopt ADR-022's derived-rate mechanism; do not introduce an accumulator.
- Seasons need to affect a fourth surface → successor ADR. Three declared surfaces is the bound.

---

## Related

| Document              | Relationship                                                      |
| --------------------- | ----------------------------------------------------------------- |
| ADR-020               | The calendar this derives from                                    |
| ADR-009 §2            | The exactness constraint that keeps growth rate out of §2's table |
| ADR-013 §4            | The price pipeline the seasonal modifier joins                    |
| ADR-022               | The derived-rate mechanism seasonal growth would use              |
| `VISION.md` §2.2      | Why nothing withers                                               |
| `SAVE_FORMAT.md` §6.4 | The worker catch-up model this constrains further                 |
