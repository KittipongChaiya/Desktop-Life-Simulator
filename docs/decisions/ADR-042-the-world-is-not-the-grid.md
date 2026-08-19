# ADR-042: The World Is Not The Grid

**Status:** Accepted — v0.5 Phase 40.
**Date:** 2026-08-19
**Phase:** v0.5 Phase 40 (Ground truth: depth and anchors) — the foundation phases 41–47 build on.
**Supersedes nothing. Amends:** ADR-001 §Layers (one y-sorted world layer instead of two), and extends `BuildingDefinition` (ADR-011's content model) with a footprint.
**Bound by (not re-litigated):** ADR-041 (the cozy pass — palette, outlines, pipeline, all retained); ADR-007 §5 (the renderer never writes to the simulation); ADR-009 §1 (derive, don't store); `VISION.md` §2.1 (the overlay must not intrude); ADR-006 §4 (sprite keys come from the manifest).

---

## Context

The owner's judgement after looking at the running game, and it is a sharper
diagnosis than the one ADR-041 acted on:

> The current game still visually behaves like _a simulation grid with sprites
> placed inside cells_, while the target is _a cozy pixel-art world that happens
> to use a grid internally_.

ADR-041 raised the craft of individual sprites and was right to. It could not
fix this, because this is not an asset problem. **Every object in the world is
one tile, and the renderer says so.**

### The measurement that decides the shape of the fix

The overlay is **1920×220** (`OVERLAY_HEIGHT_EXPANDED`), and the status bar
takes roughly the top 48 px. The world viewport is therefore about **172 px
tall — 5.4 tiles at zoom 1**.

That number rules out the obvious fix. Camera zoom is integer 1–3 and defaults
to 1; raising it to 2 leaves **2.7 tiles of visible height**, so a
three-tile-tall building could not fit on screen at all. Zooming in makes the
world emptier, not fuller, in a strip this short.

**So scale must come from FOOTPRINT, not from ZOOM.** A 3×3 house at zoom 1 is
96 px — 56% of the world viewport's height, against 19% for the 32 px sprite it
replaces. Three times the presence, with no change to the window the player
gave us. Zoom stays at 1 and stays the player's control.

### What is actually in the way

| Fact                                                                            | Consequence                                                                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `BuildingDefinition` has no footprint                                           | Every building is 1×1. A "big building" cannot be expressed at all.                                                                     |
| Buildings are anchored top-left; workers and decor bottom-centre; crops centred | A sprite taller than its tile grows DOWNWARD into its neighbour.                                                                        |
| `objects` and `entities` are separate y-sorted layers                           | A worker can never be occluded by a tree, because entities always draw above objects — cross-layer depth is impossible by construction. |
| Buildings and crops set `zIndex` in TILE ROWS; workers set it in PIXELS         | Even in one layer they could not sort against each other.                                                                               |

The last two are why this is an ADR and not a patch: they are the reason the
world reads as cells. Objects cannot overlap, so nothing has depth, so
everything looks like it is sitting in a box.

---

## Decision

**The simulation grid stays exactly as it is. The renderer stops assuming the
grid is what the player sees.**

### 1. One world depth space

`objects` and `entities` merge into a single y-sorted layer. Buildings, crops,
decor, resource nodes, workers, residents and the player all sort against each
other by one number.

**That number is the object's BASE in world pixels** — the y coordinate where it
meets the ground. Not its tile row, not its sprite top. Two things at the same
base are the same distance from the camera whatever their height, which is what
makes a worker pass behind a tree trunk and in front of the next one.

`terrain`, `terrainOverlay`, `effects`, `lighting` and `worldUi` are unchanged.
The brief's nine conceptual layers are already expressible: what it calls
ground, transitions and decoration are terrain and its overlay; buildings,
nature and characters are the one sorted world layer, which is the point.

### 2. One anchor convention: objects stand on their base

Every world sprite is anchored **bottom-centre on the tile it logically
occupies**, so a sprite may be any size and grows UPWARD, away from the ground.
Workers and decor already do this and do not change. Buildings and crops move to
it.

This is what lets a 96 px building live on a 32 px tile without owning three
tiles of simulation, and it is why the anchor and the footprint are separate
decisions rather than one.

### 3. Footprint is content, and it is DERIVED, never stored

`BuildingDefinition` gains an optional footprint in tiles. Absent means 1×1, so
every existing definition and every existing save keeps working.

**No save format change.** A save records which building is on which tile; the
footprint comes from the registry at load time, exactly as the sprite does. A
footprint written into a save would be a second source of truth for a fact
content already owns, and ADR-009 §1 has settled that argument twice already.

**Three footprints, not one**, and conflating them is the mistake this ADR
exists to prevent:

| Footprint       | Owned by   | Answers                                                 |
| --------------- | ---------- | ------------------------------------------------------- |
| **Logical**     | simulation | which tiles the building occupies and blocks            |
| **Visual**      | renderer   | how big the sprite is; may exceed the logical footprint |
| **Interaction** | both       | which tile a click resolves to — the origin             |

A roof may overhang tiles nobody owns. A canopy may cover a worker who is
walking on open ground. Neither is a simulation fact.

### 4. The legacy-overlap problem is handled, not hoped about

Growing a footprint can make two buildings that were legally placed one tile
apart in an old save overlap. This is the one place where a visual change can
corrupt a simulation, so it is decided here rather than discovered later:

**Loading never fails and never moves a building.** Occupancy is recomputed from
the registry on load; where two buildings would claim a tile, the first placed
keeps it and the later one simply occupies less. The building still exists,
still works, still stores what it stored. Overlapping art is a cosmetic wart on
one old save; a load that throws, or that silently deletes a player's mill, is
not acceptable at any visual benefit.

### 5. What this does NOT license

- **No pathfinding rewrite.** A multi-tile building blocks more tiles; A\* is
  unchanged and does not know why.
- **No free placement.** Buildings still sit on tiles, still snap, still have an
  origin.
- **No new gameplay.** Footprint costs the player nothing new — no larger plots
  are required, no prices change. If it starts to, that is scope creep wearing a
  visual hat.
- **No idle-cost regression.** ADR-041 §5 stands: one y-sorted layer sorts the
  same sprites the two sorted separately, and the sort only runs on a dirty
  frame.

---

## Consequences

**Good**

- Objects can overlap, so the world gains depth — which is the single largest
  contributor to "grid" versus "place".
- Buildings can be as large as they should be without the overlay growing.
- One anchor rule instead of three, so the next asset cannot get it wrong.

**Bad, and accepted**

- Every building sprite is redrawn, because a 32 px sprite stretched to 96 px is
  exactly the "blurry mismatched scale" the brief forbids.
- Placement validation gets more complex: it must check a rectangle rather than
  a tile, and report _why_ a placement failed.

**Risky**

- **Sorting bugs are invisible to unit tests and obvious to players.** A wrong
  base makes a worker walk through a wall. Mitigated by testing the ordering
  function directly, and by the phase-39 live screenshot gate.
- **The 172 px viewport is unforgiving.** A four-tile building occupies 128 px
  of 172. Phase 42 picks footprints against that number, not against the
  brief's illustrative examples, which assume a taller window.

## Revisit if

- The overlay gains a taller mode → the footprint ceiling rises with it, and
  §1's zoom reasoning should be re-derived rather than assumed.
- Multi-tile buildings ever need to block tiles they do not visually cover →
  that is a gameplay change and belongs to a gameplay ADR.
