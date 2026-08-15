# Phase 19 — Residents

> **Delivers:** the village's people. Marla, Tobin, Prue, and Edwin live in phase-18's four cottages, wake staggered through dawn, spend the day among the well, the plaza, the notice board, the castle walk, and each other's doors, and are indoors by night — `PLAN.md` §4's first v0.3 criterion, _"NPCs follow believable daily schedules."_
> **Governing decisions:** ADR-031 (residents are derived); ADR-030 (the ground they walk); ADR-022 §1 (the hash-not-draw discipline they inherit); `CHARACTER_BIBLE.md` §14 rule 2 (one rig, many costumes).
> **Schema:** **none — deliberately.** The roadmap sketched "schema v8" for NPCs; ADR-031 records why no save field is needed at all.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                                  | Commit    |
| ----- | --------------------------------------------------------- | --------- |
| 1     | ADR-031, before a resident existed                        | `85001ae` |
| 2     | The population: content, derivation, slice, art, renderer | `370a90a` |
| 3     | The measurements and this close                           | _this_    |

## The decision that shaped everything

The roadmap predicted _"worker FSM generalizes to any actor."_ It does — and
using it would have been wrong. A worker is stateful because farm work is
contingent: which tile is ripe, which shed has room, how tired the worker is.
A resident's day is contingent on **nothing that changes**: home is content,
wake time is the day phase, destinations are a hash over town places, and
town ground can never change (ADR-030 §1). Every input is content, seed, or
tick — which is the weather's situation (ADR-022), not the worker's.

So residents are **derived**. What that bought, concretely:

- **No save fields, no migration, no schema bump.** A v0.2 save and a v0.3
  save carry identical worlds; the village's life is computed, not stored.
- **No catch-up model.** Phase-07d's worker catch-up needed a
  provably-conservative crediting model and a property-test campaign.
  Residents get offline exactness free: return after three hours and
  everyone is precisely where their day says — `VISION.md` §2.2's promise
  arriving as people, at zero code.
- **No determinism surface.** Stops come from `mix32`, never `world.rng` — a
  500-projection stream test pins that a world computing its residents is
  byte-identical to one that never asked.

The price is stated in ADR-031 §5: a derived resident cannot react. v0.3
needs routine, not response; the day one must react, that resident's state
graduates into stores with a schema bump then — scope moving later, on
evidence.

## How a day works

An itinerary of legs — indoors, walk, dwell — generated per `(resident, day)`
and memoised. Wake lands 30 s–2.5 min into dawn (staggered per resident per
day, so the village never marches out in step); the day is a hash-drawn
sequence of stops with 30–90 s dwells; heading home lands early in dusk; the
night is indoors. Routes come from a dedicated **static town pathfinder** —
deliberately not the farm's A*, which reads live blocked bits: a route that
could dip into farm land would smuggle the player's sheds into a pure
function. Town routes read content only, so they are constants of the build.

The properties are pinned by 17 derivation tests: every tick of every day
answers (total), night is indoors and noon is out, movement is
tile-adjacent (no teleports), two days differ, two seeds differ, and every
route stays on town ground.

## The boundary and the renderer

A `residents` slice projects the derivation — empty at night, so the
sleeping town publishes nothing, draws nothing, and costs nothing. The
renderer shares the worker view's interpolation maths (the parameter type
widened to `MovingView` rather than copied) and holds one animation lease
per walking villager, released on stop, cull, removal, and destroy — pinned
against the real dirty gate exactly as rain and lighting are.

Villagers are two scripted costume variants on the one character rig: the
tunic became a costume parameter (townsfolk cloth in Parchment and
stone-grey), and villagers get no hat, no apron, no scarf — those tells
belong to the worker and the player. Idle and walk sets only: villagers do
not work the ground, so no harvest swing exists to misuse.

## Names became canon

`LORE_BIBLE.md` §17 rule 2: what a session writes down binds later ones.
Marla (north-west, often at the well), Tobin (north-east, fond of the castle
walk), Prue (south-west), and Edwin (south-east, the elder) are recorded
there. `GAME_DESIGN.md` §2.4 was amended honestly: nothing on the FARM
depends on the time of day — and since this phase, the town does, on its own
side of the line: a resident's schedule gates nothing the player earns.

## Measured against the baseline

Criterion 12, re-run with the population awake on the reference farm under
rain, lighting, audio, and all motion at once:

| Statistic | Phase-18 (village, empty) | Phase-19 (village, inhabited) | Budget |
| --------- | ------------------------- | ----------------------------- | ------ |
| p99 tick  | 0.4 ms                    | **0.4 ms**                    | < 3 ms |
| surrender | bed off on idle           | bed off on idle               | —      |

The population costs nothing the p99 can see. The single-tick max moved
(2.2 → 6.1 ms, one outlier in ~1,900 samples — the first tick of a day
generating four itineraries at once is the likely culprit) and is noted
rather than hidden; the tail the budget is written against is unchanged.
Evidence: `docs/perf/criterion-12-combined.json`.

## Verified in the running app

A planted noon save shows villagers at the notice board, beside the well,
and crossing the plaza, walk cycles running, y-sorted correctly against the
buildings. Full suites green at close.

## Deliberately not in this phase

Talking to a resident, resident portraits, the merchant, and anything a
resident reacts to. The notice board is still furniture — phase 20 makes it
ask you for things, which is the heart of the version.
