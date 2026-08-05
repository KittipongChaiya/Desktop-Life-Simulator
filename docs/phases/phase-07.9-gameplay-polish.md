# Phase 07.9 — Gameplay Polish

> **Delivers:** Two gameplay adjustments before v0.1 closes — crop growth rebalanced, and harvesting returns a tile to bare ground.
> **Governing decisions:** none new. Bound by ADR-007 (deterministic ticks), ADR-008 (events), ADR-009 (derived world state), ADR-010 (commands), ADR-012 (foundation freeze).
> **Hard constraint:** no new systems, no new save format, no economy change, no worker-AI change, no renderer-architecture change.

---

## Why these two

Both are things the vertical slice showed and no test could: the farm ran too fast to watch, and a farm at rest was a field of tilled squares nobody had chosen to till.

Neither is a feature. Task 1 is four numbers in a content table; task 2 is one assignment and one event inside a handler that already existed. The value of writing them down is the reasoning that decided the SHAPE — which is where a polish pass usually damages an architecture.

---

## Task 1 — Growth duration

**Every crop's growth time doubled** (`GAME_DESIGN.md` §3.1):

| ID             | Was              | Now                | Coins/sec/tile    |
| -------------- | ---------------- | ------------------ | ----------------- |
| `core:turnip`  | 900 t (45 s)     | 1,800 t (90 s)     | 0.156 → **0.078** |
| `core:wheat`   | 2,400 t (120 s)  | 4,800 t (240 s)    | 0.183 → **0.092** |
| `core:carrot`  | 4,800 t (240 s)  | 9,600 t (480 s)    | 0.229 → **0.115** |
| `core:pumpkin` | 12,000 t (600 s) | 24,000 t (1,200 s) | 0.283 → **0.142** |

**Why uniform.** The obvious alternative — stretch the slow crops further than the fast ones, so patience pays even better — was rejected. §3.2's inversion is the single most important balance decision in v0.1, and it is expressed as a RATIO between the ends of the table. A uniform multiplier divides every rate by the same 0.5 and leaves that ratio at 1.82×, so the rebalance moves how long the game takes without touching what the game rewards. A non-uniform stretch would have been an economy change wearing a timing change's clothes.

**Why a data edit and nothing else.** Durations already live in `CropDefinition.growthTicks`, authored in seconds (ADR-004 §5, ADR-007 §7). No constant was introduced and no multiplier was threaded through the registry: a `GROWTH_PACE` factor would put the real duration in two places and make the §3.1 table something you compute rather than read.

**Why no save migration.** A crop instance stores `plantedTick` and derives everything else (ADR-009 §2). An existing save's standing crops simply take the new time; nothing in the file changed meaning.

The tick literals that had accumulated in tests (`2400` for wheat, `900` for turnip) were the real hazard here — a rebalance turns them into silent tests of an immature crop. They now read their durations from the definitions, and `src/sim/content/crops.test.ts` pins the §3.1 table itself so the document and the code cannot drift apart quietly.

---

## Task 2 — Harvest returns the tile to bare ground

```
grass ──till──► tilled ──plant──► seed ──► sprout ──► growing ──► mature
  ▲                                                                 │
  └─────────────────────────── harvest ◄────────────────────────────┘
```

### Where the mutation lives

Inside `harvestCrop`, the existing command handler, beside `world.crops.delete(tile)`.

The alternative — a second `untillTile` command dispatched by the harvest — was rejected. Commands execute at a tick boundary (ADR-010 §3), so a self-dispatched follow-up would leave one tick in which the tile is crop-less and still tilled: a state a worker can plan against, a snapshot can project, and a replay can land differently on. Harvest-and-revert is ONE transition; the handler is where a transition belongs.

Nothing else writes it. The renderer never touches `tilledAt`; the devtools reach the world only through commands (ADR-018 §10).

### Why a new event

`tileUntilled`, carrying only the tile — the mirror of `tileTilled`, and it exists for the mirror reason: `tilledAt` reaches no snapshot slice, so without an event the composition root never learns the terrain chunk went stale and the tilled sprite outlives the crop that stood in it.

Reusing `cropHarvested` for the invalidation was rejected: it would put the rule "a harvest reverts the tile" inside the renderer, where it would keep being true by coincidence. The simulation states what happened; the renderer reacts. It carries no tick, because `TileTilled`'s tick reports what `tilledAt` now holds and here that value is zero by definition — and the devtools ring already stamps every observation with the tick it arrived on.

The event is observed by the event monitor (`OBSERVED_EVENTS`) and consumed by exactly one subscriber, which invalidates the tile's chunk. No sound and no particles: the harvest already has both, and the ground reverting is its consequence, not a second thing the player did.

### Automation

A worker's priority list already ends in **till** (`GAME_DESIGN.md` §4.4), so a reverted tile is simply the next thing to do. The cycle gains one 30-tick action and no new task kind, no new state, and no new code — proven by a one-tile farm whose whole event history over a growth cycle is `harvested → untilled → tilled → planted`.

Offline progress had to be told, though. `catch-up.ts` charges a fixed handling cost per harvest-and-replant cycle, and that constant is only correct while it sits ABOVE what real workers pay — the round-down rule (`SAVE_FORMAT.md` §6) as a constant. The extra till pushed the real cost from ~60–130 ticks to ~90–160, so the constant moved 150 → 200. The fast-check property that compares catch-up against the real simulation on byte-identical clones is what would have caught the omission; it was raised deliberately rather than waiting to be caught. Tiles the model harvests out are untilled there too, so a return from a gap shows a state the live game could have reached.

---

## What did NOT change

- **Save format.** Growth still derives from `plantedTick`; `tilledAt` was already in the grid (`SAVE_FORMAT.md` §2). No schema version, no migration.
- **Economy.** Prices, seed costs, yields, multiplier bands, building costs — untouched.
- **Worker AI.** No change to task selection, priority, claiming, energy, or pathing.
- **Renderer architecture.** One new subscriber on an existing seam; no change to chunking, layering, or the snapshot contract.
- **Tilled decay.** `GAME_DESIGN.md` §2.2 specified a 6,000-idle-tick revert that was never built (phase-03 acceptance 10, still unchecked). It is not built here either, and the row now records the rule that ships: a timer would punish the player who prepared ground and then went away, which is the one thing `VISION.md` §2.2 rules out. Reverting on harvest only ever follows a reward.

---

## Acceptance

| #   | Criterion                                                                 | How                                                                 |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Crops take noticeably longer, all four stages visible for real spans      | `src/sim/content/crops.test.ts`                                     |
| 2   | The §3.1 table and the code agree, tick for tick                          | `src/sim/content/crops.test.ts`                                     |
| 3   | Longer crops stay strictly better coins/sec, ratio unchanged              | `tests/economy-longrun.test.ts`                                     |
| 4   | Growth stays deterministic and exact across an offline gap                | `src/sim/commands/crop-commands.test.ts`                            |
| 5   | Harvest clears the tilling and publishes `tileUntilled` after the harvest | `src/sim/commands/crop-commands.test.ts`                            |
| 6   | A harvested tile must be tilled again before it can be planted            | `src/sim/commands/crop-commands.test.ts`                            |
| 7   | The harvested tile renders as bare ground, not tilled soil                | `tests/farming-visual.test.ts` + regenerated reference frame        |
| 8   | Workers close the longer loop unaided and never jam                       | `src/sim/systems/worker.test.ts`, `tests/worker-longrun.test.ts`    |
| 9   | Save/load round-trips the reverted tile state                             | `tests/save-round-trip.test.ts`, `tests/save-compatibility.test.ts` |
| 10  | Catch-up still never over-credits, at every n                             | `tests/catch-up.test.ts`                                            |
| 11  | The 8-hour unattended farm still earns and never jams                     | `tests/economy-longrun.test.ts`                                     |

---

## Files changed

| File                                     | Change                                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| `src/sim/content/crops.ts`               | Four durations doubled; the rebalance recorded                |
| `src/sim/commands/crop-commands.ts`      | `harvestCrop` clears `tilledAt` and publishes `tileUntilled`  |
| `src/sim/events/types.ts`                | `TileUntilled` added to the event map                         |
| `src/renderer/bootstrap/start.tsx`       | Subscriber: invalidate the reverted tile's chunk              |
| `src/devtools/events/observer.ts`        | `tileUntilled` observed by the event monitor                  |
| `src/persistence/catch-up.ts`            | Handling constant 150 → 200; harvested-out tiles untilled     |
| `docs/GAME_DESIGN.md`                    | §2.2 revert rule, §3.1 table, §3.2 rates, new §3.6            |
| `docs/fixes/phase-03-visible-farming.md` | Supersession note on the inverted assertion                   |
| `docs/CHANGELOG.md`                      | Unreleased → Changed                                          |
| Tests                                    | See Acceptance; tick literals replaced with derived durations |
