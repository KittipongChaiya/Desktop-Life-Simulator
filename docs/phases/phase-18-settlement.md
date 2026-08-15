# Phase 18 — Settlement

> **Delivers:** a place, before people. The world widens one chunk column east (ADR-030), every existing save re-lays through schema v7 with nothing moved, and a village stands on the new land: four cottages, a well, a notice board, a castle, and the paths between them.
> **Governing decisions:** ADR-030 (all four sections); ADR-004 §5 (town buildings are ordinary definitions); ADR-015 (the migration's discipline); `WORLD_BIBLE.md` §Village (the look).
> **Schema:** **v6 → v7** — the chain's first relayout.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                                          | Commit    |
| ----- | ----------------------------------------------------------------- | --------- |
| 1     | ADR-030, before a tile moved                                      | `b66e0bf` |
| 2     | The grid at 80×64 + the v7 migration, one green suite             | `cf0fa8a` |
| 3     | The village founded: content, world-gen, guards, scripted sprites | `bbce77c` |
| 4     | The trigger fix, the castle, the measurements, and this close     | _this_    |

The grid change and the migration land together deliberately — `SAVE_FORMAT.md`
§10 requires the schema bump in one commit, and a widened grid with un-remapped
saves is a broken build in between.

## What stands, and where

The eastern 16×64 band (x ∈ [64, 80)) is town land: never ownable, never
farmable, reachable on foot. On it, from a fixed layout table in core content
(no RNG — every world gets the same village, because the village is canon):

- **Four cottages** around a 7×7 plaza — phase-19's residents each get a door.
- **The well** at the plaza's centre.
- **The notice board** beside the road entrance — phase-20's contracts hang here.
- **The castle** north of the plaza with its own walk — the owner's addition
  (2026-08-15), the village landmark: the game's tallest stone silhouette, held
  cozy per _"nothing threatens home"_.
- **A road** west toward the farm, which phase-19's walkers inherit.

All sprites are scripted painters in `generate-world-art.mjs` under the
standing-object grammar, like every building before them (`GENERATION.md`).

## Decisions worth carrying forward

### The migration moves shape; construction moves content

`v6 → v7` re-lays four dense arrays and remaps every stored tile index by pure
arithmetic — a thing at (x, y) before is at (x, y) after — and adds **nothing**.
The town arrives by `foundTown(world)`: one idempotent code path, run by
`createWorld` for a new world and by hydration (after restore, so ids never
collide) for a loaded one. A v0.2 farm gains its neighbours on first load; a
v0.3 save keeps exactly what it has. The guard — "no town buildings means the
save predates the town" — is **enforced**, not assumed: `placeBuilding` refuses
`playerPlaceable: false` definitions, and `sellBuilding` refuses any building
on unowned land, which closed a real hole (the well was refundable to anyone
who asked, before).

### The repair pass learned one exception, narrowly

§5.2's "building on unowned ground" anomaly log now excludes the town region
and only the town region — unowned ground east of `FARM_SIZE` is a building's
normal address (ADR-030 §1). Unowned **farm** ground still logs.

### A world announcing itself is not a transaction

The first full e2e run failed four save specs, and the failure was this phase
teaching an old subscriber something new: the major-transaction watcher took
its baseline from the store **before the first pump**, so the village's six
(now seven) buildings arrived as an apparent purchase and fired a save seconds
into every fresh launch. The watcher now baselines on the world's first
delivery — nothing can be bought before the first pump, so nothing is lost —
and the regression is pinned by a test named for it.

### An absence measurement needs an absent human

Criterion 12 failed once tonight with the bed still sounding after the away
wait — and the cause was not code: this suite runs on a desktop somebody may
actually be using, and a real mouse crossing the window during the "nobody
watching" wait touches presence, which is the feature **working**. The
criterion now counts pointer events through its away window, reports the count
in the evidence file, and skips the surrender assertion as environment-blocked
when it is nonzero — criterion 11's invalid-first-soak lesson, in reverse.

## Measured against the phase-17 baseline

`PLAN.md` §4: _"profile before adding more."_ Criterion 12 re-run on the
80×64 world with the full village standing and everything on at once —
reference farm, rain, lighting, audio, all motion:

| Statistic | Phase-17 (64×64, no town) | Phase-18 (80×64 + village) | Budget |
| --------- | ------------------------- | -------------------------- | ------ |
| p99 tick  | 0.5 ms                    | **0.4 ms**                 | < 3 ms |
| mean tick | 0.168 ms                  | 0.153 ms                   | —      |
| surrender | bed off on idle           | bed off on idle            | —      |

The widening and the village cost nothing the instrument can see. The two
readings differ by less than the clock's 0.1 ms coarsening — the honest claim
is "unchanged", not "faster". Evidence: `docs/perf/criterion-12-combined.json`.

## Verified in the running app

A debug build was launched, panned east, and screenshotted: the plaza's paths,
the well, the notice board, the cottages, and the castle with its walk all
render from the ordinary building pipeline — no renderer changes were needed,
which is ADR-004 §5 paying out (a town building is a definition, an instance,
and a blocked tile, so the existing view already knew how to draw one).
Full suites green at close: 2,600+ unit tests, the e2e suite, typecheck, lint,
boundaries, cycles.

## Deliberately not in this phase

Residents (phase 19, with the NPC ADR), notice-board behaviour (phase 20),
market stalls in the plaza (phase 21), and any door that opens. The village is
a place; phases 19–22 give it a life.
