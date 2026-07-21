# Phase 02 — Tile World

> **Delivers:** A rendered, pannable tile grid with render-on-demand and full teardown on collapse.
> **Runnable at completion:** A 64×64 farm plot is visible in the overlay, pans smoothly, costs zero frames when static, and releases all GPU resources when collapsed.

---

## Objectives

1. Bootstrap PixiJS with the three binding constraints from ADR-001.
2. Build the tile grid as flat typed arrays — the storage shape all later phases index into.
3. Implement terrain chunking so a static farm costs a handful of draw calls.
4. **Prove render-on-demand works before any content exists to complicate it.**
5. Implement the Canvas 2D fallback backend.

### Why render-on-demand comes first

ADR-001 accepts PixiJS *conditionally*, on the mandatory render-on-demand constraint. Implementing the dirty gate before the first sprite is drawn means it is never retrofitted around existing animation code — which is how it would decay.

The idle-frame test built here is the enforcement mechanism for the entire rendering decision.

---

## Deliverables

### Tile grid (sim)
- [ ] `src/sim/world/tile-grid.ts` — parallel flat typed arrays (`ADR-004` §2)
  - `kind: Uint8Array`, `owned` bitfield, `tilledAt: Uint32Array`, `moisture: Uint8Array`
- [ ] Index↔coord helpers with bounds checking
- [ ] `core:grass`, `core:water`, `core:stone` registered via the tile-kind registry
- [ ] 64×64 world; 8×8 owned starting plot centered (`GAME_DESIGN.md` §2.1)
- [ ] Walkability query used later by pathing

### PixiJS bootstrap
- [ ] `Application.init()` with `autoStart: false`, `antialias: false`, `powerPreference: 'low-power'`
- [ ] `SCALE_MODES.NEAREST` globally (`ASSETS.md` §8)
- [ ] The seven named layer containers in fixed order (`ARCHITECTURE.md` §5) — layers 4 and 5 created and empty
- [ ] Atlas loading via the generated manifest — **no string-literal paths**
- [ ] WebGPU → WebGL2 → Canvas 2D capability detection, logged at startup

### Render-on-demand — the core deliverable
- [ ] `sceneDirty` flag set by snapshot diffing
- [ ] `animatingEntityCount` with paired increment/decrement
- [ ] `requestAnimationFrame` **not scheduled** when neither holds
- [ ] Render gate integrated with the accumulator loop (ticks do not force frames)

### Terrain chunking
- [ ] 16×16-tile `RenderTexture` chunks
- [ ] A chunk re-renders only when a contained tile changes
- [ ] Off-screen chunk culling
- [ ] Static 64×64 farm renders as ~16 quads

### Camera
- [ ] Horizontal pan by drag and by scroll
- [ ] Clamped to world bounds
- [ ] **Snaps to whole device pixels** (`ASSETS.md` §8)
- [ ] Integer zoom levels only (1×, 2×, 3×)
- [ ] World↔screen coordinate conversion, published in the snapshot for UI positioning

### Collapse teardown
- [ ] Collapsing **destroys the Pixi application entirely**, releasing the GPU context (ADR-001 §2)
- [ ] Expanding re-initializes from world state
- [ ] No retained references after teardown — verified by heap snapshot

### Interpolation
- [ ] Render receives `alpha ∈ [0,1)` from the accumulator (ADR-007 §5)
- [ ] Interpolation helper ready for phase-04 movement
- [ ] **Interpolated values never re-enter the simulation**

### Fallback backend
- [ ] `src/renderer/render/fallback/canvas2d.ts` behind the same renderer interface
- [ ] Renders layers 0–3 and 6 only (ADR-001 §Fallback Scope)
- [ ] Player informed once that they are in degraded mode

### Art
- [ ] Grass, water, stone, and tilled-soil tiles at 32×32 in the shared palette
- [ ] Packed into the `terrain` atlas; attribution recorded

---

## Out of Scope

- Crops, growth, or any farming *(phase-03)*
- Workers, entities, or movement *(phase-04)*
- Inventory or buildings *(phase-05, 06)*
- Particles, weather, or lighting — **layers 4–5 stay empty** *(v0.2)*
- Vertical panning — the overlay is 220 px tall; the world fits vertically
- Tile editing by the player *(phase-03 adds tilling)*
- Minimap *(v0.4)*

---

## Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | A 64×64 grid renders with correct tile art | Manual + E2E screenshot |
| 2 | The 8×8 owned plot is visually distinct | Manual |
| 3 | Camera pans smoothly, clamped at bounds | Manual |
| 4 | No shimmering while panning (pixel snapping works) | Manual |
| 5 | **Zero `requestAnimationFrame` callbacks over 10 s with a static world** | E2E — `idle-cost.spec.ts` |
| 6 | Changing one tile marks the scene dirty exactly once | Unit test |
| 7 | Changing one tile re-renders exactly one terrain chunk | Unit test |
| 8 | Static farm renders in **under 30 draw calls** | Measured, Pixi devtools |
| 9 | Texture memory within `PERFORMANCE.md` §6 | Measured |
| 10 | Collapse destroys the Pixi app; GPU memory released | Heap snapshot |
| 11 | Expand re-initializes correctly and repeatedly | Manual, 20 cycles |
| 12 | Expand under 300 ms; collapse under 100 ms | Measured |
| 13 | Expanded idle CPU within `PERFORMANCE.md` §4 | Measured, 5 min |
| 14 | Expanded RSS within `PERFORMANCE.md` §5 | Measured |
| 15 | Frame time under 16 ms while panning | Measured |
| 16 | Forcing fallback renders layers 0–3 and 6 | Manual, forced |
| 17 | No texture referenced by string literal | Lint |
| 18 | 20 collapse/expand cycles leak no memory | Heap diff |

**Criteria 5 and 8 are the phase.** Criterion 5 enforces ADR-001's render-on-demand constraint; criterion 8 is the direct measurement of whether atlasing delivers batching (ADR-006 §3). If draw calls are in the hundreds, textures are not batching and the reason for choosing PixiJS has evaporated.

**Criterion 18** — the collapse/expand cycle is the most likely leak source in the project, because it repeatedly creates and destroys GPU resources.

---

## Testing Checklist

### Automated
- [ ] Grid: index↔coord round-trip across all 4,096 tiles
- [ ] Grid: out-of-bounds returns an explicit error, never `undefined` silently
- [ ] Grid: typed arrays sized correctly; defaults correct
- [ ] Dirty gate: one change → one dirty mark
- [ ] Dirty gate: no change → no frame scheduled
- [ ] Chunking: single-tile change re-renders one chunk
- [ ] Chunking: off-screen chunks culled
- [ ] Camera: clamping at all four bounds
- [ ] Camera: world↔screen conversion round-trips
- [ ] Interpolation: correct positions across alpha 0→1
- [ ] Animation counter: increment always paired with decrement
- [ ] Teardown: no retained Pixi references after destroy
- [ ] E2E: zero idle frames (5)
- [ ] E2E: screenshot comparison of the rendered grid

### Manual
- [ ] Pan for 60 s — no shimmer, no stutter, no drift
- [ ] Collapse/expand 20 times — no leak, no corruption
- [ ] Force the Canvas 2D fallback; confirm scope and the degraded-mode notice
- [ ] Verify draw calls and texture memory in Pixi devtools
- [ ] Measure all `PERFORMANCE.md` budgets and record them here

---

## Future Dependencies

| Deliverable | Depended on by |
|---|---|
| Tile grid typed arrays | 03 (tilling, moisture), 04 (walkability), 07 (serialization) |
| Layer containers | 03 (crops → `objects`), 04 (workers → `entities`), v0.2 (4–5) |
| Render-on-demand gate | **03–06** — every visual addition must respect it |
| Terrain chunking | 03 — tilling changes tiles and must not re-render everything |
| Camera + coordinate conversion | 03 (click-to-tile), 04 (following workers), UI positioning |
| Interpolation | 04 — smooth worker movement is its first consumer |
| Collapse teardown | Every later phase inherits the idle-cost win |
| Atlas loading | 03, 04, 05, 06 |

---

## Notes

**Build the dirty gate before the first sprite.** ADR-001 §Consequences is explicit: retrofitting it is how the decision decays.

**Do not put anything in layers 4 or 5.** They exist so v0.2 does not require a re-layering migration. Populating them now would be scope inflation (`AI_RULES.md` §8).

Measure draw calls early and often. If chunking is not working, it is far cheaper to find out with three tile types than with a farm full of crops and workers.
