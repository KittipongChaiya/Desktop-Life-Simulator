# ADR-009: Derived Tile State and Stateless Crop Growth

|                   |                                                  |
| ----------------- | ------------------------------------------------ |
| **Status**        | Accepted                                         |
| **Date**          | 2026-07-21                                       |
| **Deciders**      | Project owner, lead architect                    |
| **Supersedes**    | —                                                |
| **Superseded by** | Amends `GAME_DESIGN.md` §3.4 (see §Consequences) |

---

## Context

Phase-03 introduces the first gameplay domain: tiles that can be tilled and planted, and crops that grow. Most of it is already decided — ADR-004 fixed data-oriented stores and the definition/instance split, ADR-007 fixed determinism, and the tile grid exists.

Two decisions are **not** covered by existing ADRs, and both become irreversible the moment a save file exists:

1. **How tile state is represented.** The roadmap adds tilled soil, water, fertilizer, paths, buildings, and decorations. A tile is going to accumulate qualities indefinitely.
2. **How crop growth is stored.** Either the crop accumulates progress each tick, or its progress is computed from when it was planted.

An ADR is written here because both choices are expensive to reverse — not because new files appeared.

---

## Decision

### 1. Tile state is DERIVED from orthogonal stored fields, never stored as a status enum

The grid stores independent facts:

```
kind      Uint8      terrain kind index    (grass / water / stone)
owned     bitfield   inside the player's plot
tilledAt  Uint32     tick tilled, or 0
moisture  Uint8      0-100
```

`TileState` — `Empty`, `Tilled`, `Planted`, `Growing`, `HarvestReady` — is **computed** from those fields plus the crop store. It is never written down.

**Why not a stored enum.** `Planted`, `Growing`, and `HarvestReady` are all "there is a crop here, at some maturity". Storing them duplicates information the crop already carries, which means two sources of truth that can disagree — and they _will_ disagree, because a migration or a repair path will update one and not the other. `SAVE_FORMAT.md` §2.2 already bans persisting derived state for exactly this reason.

**Why not one enum per combination.** That is the explosion the brief warns about: adding fertilizer to a system with 5 states does not add 1 state, it multiplies them (`TilledFertilized`, `PlantedFertilized`, …). Orthogonal fields add one field.

**How future qualities land:** a new independent field, or a new sparse side-table keyed by tile. Never a new member of a combined enum.

| Future        | Added as                                          |
| ------------- | ------------------------------------------------- |
| Fertilizer    | `fertilizedUntil: Uint32` field, or sparse table  |
| Roads / paths | new `kind` registration — already data (phase-02) |
| Buildings     | sparse `Map<TileIndex, Building>`, like crops     |
| Decorations   | sparse side-table                                 |

### 2. Crop growth is a PURE FUNCTION of elapsed ticks

```
elapsed = world.tick - crop.plantedTick
stage   = stageFor(definition, elapsed)
```

A crop instance stores `cropId`, `tile`, and `plantedTick`. It stores **no progress counter**.

**This amends `GAME_DESIGN.md` §3.4**, which specified accumulating growth on the grounds that moisture makes the rate variable and a derived value could not represent it. Phase-03's brief removes that premise: growth depends only on tick, definition, and planted tick — no weather, no fertilizer, no randomness.

**The consequence is large and good: offline progress becomes exact.**

`SAVE_FORMAT.md` §6.3 budgets growth catch-up at "≤5% over-credit" because an accumulating counter has to be reconstructed across a gap whose moisture history is unknown. With growth derived from `plantedTick`, there is nothing to catch up: loading a save from eight hours ago and advancing `world.tick` produces exactly the state the crop would have had. No `catchUp` implementation, no accuracy contract, no error to bound.

It is also strictly less save state — one fewer mutable field per crop, and one fewer thing a migration can corrupt.

**If moisture-modulated growth returns** (v0.2 weather), it must not reintroduce an accumulator. The options that preserve exactness are a rate-change _log_ keyed by tick, or recomputing from a piecewise-constant rate history. Reverting to an accumulator would re-open this ADR and re-introduce the offline error budget.

### 3. Chunks are a RENDERING concept and stay out of the domain

The brief lists `Chunk` under the world model. It is deliberately **not** added there.

Chunks exist in `src/renderer/render/terrain-chunks.ts` as a draw-call optimization (ADR-001 §Terrain): 16×16 tiles cached into one texture. The simulation has no use for them — it indexes tiles directly, and a chunk boundary has no gameplay meaning.

Putting chunks in the domain would make a rendering optimization part of the saved world, so changing chunk size later would become a save migration.

---

## Alternatives Considered

### A. Stored `TileState` enum

- **For:** one field to read; state is explicit rather than computed.
- **Rejected because:** it duplicates crop presence and maturity, giving two sources of truth that drift, and it multiplies rather than adds when a new quality appears.

### B. Accumulating growth counter (the original `GAME_DESIGN.md` §3.4 design)

- **For:** supports a variable growth rate directly; the value is just there.
- **Against:** requires an offline catch-up path with a bounded error budget, adds a mutable field per crop that migrations can corrupt, and makes "what will this crop be at tick N" unanswerable without replaying.
- **Rejected because:** the premise that justified it — variable rate from moisture — is out of scope by this phase's brief. Exactness beats the flexibility we are not currently using.

### C. Storing the computed stage alongside `plantedTick`

- **Rejected because:** it is derived state persisted (`SAVE_FORMAT.md` §2.2). It buys a saved `Math.floor` and costs a value that can contradict the tick it came from.

### D. Chunks in the domain model

- **Rejected because:** §3 — it would make a render-side constant part of the save format.

---

## Tradeoffs Accepted

| We accept                                        | To gain                                          | Mitigation                                                                      |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Stage is computed on every read                  | One source of truth; exact offline progress      | Integer arithmetic on a handful of fields; the snapshot caches per-tick results |
| Variable growth rate needs a new mechanism later | No accumulator, no catch-up, no error budget     | §2 names the two designs that preserve exactness                                |
| `TileState` cannot be indexed directly           | Orthogonal qualities compose without multiplying | Systems query the fields they care about, which is what they want anyway        |

---

## Consequences

### Immediate

- `Crop` stores `cropId`, `tile`, `plantedTick` — nothing else.
- `tileStateAt(world, tile)` derives status; nothing writes a status field.
- **`SAVE_FORMAT.md` §6.3's growth catch-up row is obsolete.** Growth is exact.
- **`GAME_DESIGN.md` §3.4 is amended.** The moisture multiplier is deferred with it.

### Ongoing

- Never persist a tile's status or a crop's stage.
- A new tile quality is a new field or side-table, never a new enum member.
- Any future variable growth rate must preserve derivability from `plantedTick`.

### Revisit if

- Per-crop growth genuinely must vary at runtime → design a rate history, not an accumulator.
- Deriving stage shows up in a profile → cache in the snapshot slice, not in world state.
