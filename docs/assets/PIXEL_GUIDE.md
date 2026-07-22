# PIXEL_GUIDE

> **Status:** Authoritative for sprite dimensions and pivots.
> **Owns:** Canvas sizes per asset category, footprints, pivot/anchor conventions, and per-category outline application.
> **Does not own:** The base tile size, resolution variants, and pixel-art rendering rules (`ASSETS.md §2, §8`); the animation format and tick timing (`ASSETS.md §7`); the colour values (`COLOR_PALETTE.md`); render layer order (`ARCHITECTURE.md §5`).

This document answers one question for every asset a future session generates: **how big is the canvas, and where does the art sit inside it.** Everything else technical about a sprite is owned elsewhere and cross-referenced below — this file does not restate it.

---

## 1. The grid is 32

The base tile is **32 × 32 logical pixels**, authored at 1× and provided at 2× for high-DPI (`ASSETS.md §2`). Every size in this document is a relation to that 32 px grid unit. This file does **not** redefine the tile size or the rendering rules that keep it crisp (nearest-neighbour, no antialias, camera pixel-snap — `ASSETS.md §8`); it builds the sprite-sizing system on top of them.

> **G = 32 px** (one grid unit) is used throughout as shorthand.

---

## 2. Canvas sizes by category

Author each category on the canvas below. The canvas may be larger than the visible art — transparent padding is normal and expected (§4). "Footprint" is how many tiles the object occupies in world logic, which is not always its visual height.

| Category                        | Canvas (1×)  | Footprint | Pivot / anchor          | Notes                                        |
| ------------------------------- | ------------ | --------- | ----------------------- | -------------------------------------------- |
| Terrain tile                    | 32 × 32 (1G) | 1 tile    | Top-left `(0,0)`        | Fills the cell edge to edge; no outline (§5) |
| Crop (all growth stages)        | 32 × 32 (1G) | 1 tile    | Bottom-center `(0.5,1)` | Every stage shares one canvas; grows upward  |
| Ground prop / small object      | 32 × 32 (1G) | 1 tile    | Bottom-center `(0.5,1)` | Rocks, stumps, flowers, path decals          |
| Character — worker / villager   | 32 × 48      | 1 tile    | Bottom-center `(0.5,1)` | ~1.5 tiles tall; figure ≈ 16–18 px wide      |
| Character — player              | 32 × 48      | 1 tile    | Bottom-center `(0.5,1)` | Same rig as workers (`CHARACTER_BIBLE.md`)   |
| Animal — small (chicken)        | 32 × 32 (1G) | 1 tile    | Bottom-center `(0.5,1)` | Future (v0.2+)                               |
| Animal — large (cow)            | 64 × 48      | 2 tiles   | Bottom-center `(0.5,1)` | Future                                       |
| Tree / tall foliage             | 64 × 96      | 1 tile    | Bottom-center `(0.5,1)` | Canopy overhangs; only the trunk cell blocks |
| Building — small (storage shed) | 32 × 32 (1G) | 1 × 1     | Base-aligned (§3)       | Current v0.1 case                            |
| Building — medium               | 64 × 64      | 2 × 2     | Base-aligned (§3)       | Shop, workshop (phase-06+)                   |
| Building — large                | 96 × 96      | 3 × 2     | Base-aligned (§3)       | Barn, market hall (future)                   |
| Portrait                        | 64 × 64      | —         | Center `(0.5,0.5)`      | NPC/merchant dialogue (v0.3)                 |
| UI icon — small                 | 16 × 16      | —         | Center                  | Item/resource icons (`ASSETS.md §3`)         |
| UI icon — large                 | 24 × 24      | —         | Center                  | Toolbar/skill icons (`ASSETS.md §3`)         |

**Sizes are targets, freely swappable.** Nothing in `src/` references a sprite by dimension or coordinate (`ASSETS.md §7.3`, §5). The current placeholder worker frames are **16 × 16** — an interim size the production 32 × 48 target replaces by dropping in same-named PNGs and packing (`ASSETS.md §7.3`). Growing a canvas is a no-code change; only the pivot must be preserved (§3).

---

## 3. Pivot & anchor conventions (grounded in the renderer)

The pivot is the one piece of a sprite's geometry the renderer depends on, so it is fixed, not stylistic.

- **Entities depth-sort by their feet.** Characters and animals pivot **bottom-center `(0.5, 1)`**, placed at tile-center-x / tile-bottom-y. This is exactly what `src/renderer/render/worker-view.ts` does (`anchor.set(0.5, 1)`, `x = position.x + TILE_SIZE/2`). Production art must keep the figure's feet at the canvas's bottom-center.
- **Tiles and single-cell objects origin top-left `(0, 0)`** on their grid cell — as `src/renderer/render/building-view.ts` places the 1×1 shed (`x = col*TILE_SIZE, y = row*TILE_SIZE`).
- **Base-aligned buildings/trees:** taller-than-one-tile art extends **upward** from its footprint's front (bottom) row; the footprint's bottom edge aligns to the anchor cell so the object y-sorts correctly in the objects layer (phase-05 rendered sheds in the y-sorted `objects` layer). A tree's canopy overhangs tiles it does not occupy; only its base cell is `blocked`.

`TECHNICAL_ASSET_SPEC.md` (phase-05.5f) routes any deeper pivot/metadata question back to this section rather than restating it.

---

## 4. Transparency, padding & safe area

- **RGBA with a hard alpha edge.** Pixels are fully opaque or fully transparent along the silhouette — no soft/feathered alpha, which reads as blur and defeats the outline (`STYLE_LOCK.md R-02`).
- **Keep a 1 px safe margin** inside the canvas on every side; art must not touch the canvas edge (the packer adds its own 2 px atlas padding + 1 px extrusion — `ASSETS.md §4.1` — but a touch-the-edge sprite can still clip in-world).
- **Canvas ≥ art.** A 32 × 48 character on a 32 × 32 tile is correct; the extra height is transparent headroom, not a footprint.

---

## 5. Outline rules

Outlines are structural to the style, not decoration.

| Rule             | Value                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Colour           | `#3A3640` — the one Outline colour (`COLOR_PALETTE.md §2`). Never black.                   |
| Weight           | **Exactly 1 px** at 1×, everywhere. Never 2 px, never variable (`STYLE_LOCK.md R-04`).     |
| Entities/objects | **Full 1 px outline** around the silhouette (`ASSETS.md §2`).                              |
| Terrain tiles    | **No outline** — tiles butt seamlessly; an outline would grid the ground (`ASSETS.md §2`). |
| Interior lines   | Soft Ink `#4A4557`, used sparingly for internal separation, never a second silhouette.     |

---

## 6. Perspective

**Top-down with a slight 3/4 tilt on objects and entities** (`ASSETS.md §2`). This file does not re-own that decision; it states the two consequences for authoring:

- Ground (tiles, soil, paths, water) is drawn **flat, straight top-down** — no visible side faces.
- Objects that stand up (characters, trees, buildings, props) show a **shallow front face and a hint of top**, lit from the upper-left (§7). Never a true isometric 45° — mixing top-down ground with isometric objects is forbidden (`STYLE_LOCK.md R-05`).

---

## 7. Light direction

One global light, **upper-left**, soft. Highlights fall on top and upper-left faces; shadows on lower-right, using each ramp's shadow step (`COLOR_PALETTE.md §3`). A single consistent light direction across all art is what makes independently-authored sprites share a world (`STYLE_LOCK.md R-06`). Contact shadow: a small, soft, semi-transparent ellipse under standing objects — never a hard drop shadow.

---

## 8. Animation frame recommendations

The animation **format, tick timing, and manifest** are owned by `ASSETS.md §7` (frame-based, `frameTicks` in simulation ticks, typed `Animations` manifest). This section owns only the **creative frame-count recommendations** per action; `ANIMATION_GUIDE.md` (phase-05.5c) expands the full per-action feel.

| Action            | Frames (recommended) | Loop | Feel                                  |
| ----------------- | -------------------- | ---- | ------------------------------------- |
| Idle              | 1–2                  | yes  | Nearly still; a gentle breath at most |
| Walk (per dir)    | 4                    | yes  | Legible gait (placeholder uses 4)     |
| Harvest / till    | 4–6                  | no   | A clear wind-up and follow-through    |
| Crop growth stage | 4–6 stages (not fps) | n/a  | Discrete stages, not a tween          |

At 20 Hz, `frameTicks: 4` ≈ 5 fps — the placeholder gait's cadence (`ASSETS.md §7`). Keep animation frame counts small: every playing animation has a CPU cost under render-on-demand (`ASSETS.md §7.1`, `PERFORMANCE.md`).

---

## 9. Related documents

| Document                     | Relationship                                             |
| ---------------------------- | -------------------------------------------------------- |
| `ASSETS.md §2, §7, §8`       | Tile size, resolution, animation format, rendering rules |
| `COLOR_PALETTE.md`           | The colours these sizes and outlines carry               |
| `STYLE_LOCK.md`              | The immutable rules this guide's numbers feed            |
| `ARCHITECTURE.md §5`         | Render layer order the pivots sort within                |
| `CHARACTER_BIBLE.md` (05.5b) | Proportions within the character canvas                  |
| `ANIMATION_GUIDE.md` (05.5c) | Full per-action animation feel                           |
