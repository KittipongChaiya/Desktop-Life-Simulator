# ADR-030: Settlement and the World Extension

**Status:** Accepted — v0.3 Phase 18.
**Date:** 2026-08-15
**Phase:** v0.3 Phase 18 (Settlement) — the spatial foundation for phases 19–22 (NPCs, contracts, market, reputation).
**Bound by (not re-litigated):** ADR-004 (entities are stores of plain data; definitions are content); ADR-009 (state is recorded facts, derived where possible); ADR-015 (migration governance — linear chain, pure links, non-destructive); ADR-019/ADR-026 (content enters through the public API under a namespace; the engine does not know which content exists); ADR-002/ADR-027 (save evolution); `VISION.md` §2.2 (reward absence, never punish it); `PLAN.md` §9.2 (scope moves later, never earlier).

---

## Context

v0.3's theme is a town next to the farm: a place with buildings and, from
phase 19, residents. The first question is not what the town contains — it is
**where the town physically is**, and every later v0.3 system inherits the
answer. NPCs walk between home and the farm (phase 19); deliveries walk to a
notice board (phase 20); reputation gates access to town services (phase 22).
All of that wants the town and the farm in **one pathable space**.

The constraint is that the existing space is spoken for. The grid is 64×64
(`GAME_DESIGN.md` §2.1), and land expansion is a shipped v0.1 promise: the
plot grows by rings from 8×8 and is capped only by the grid itself —
`expandLand` refuses the 29th expansion because 66 > 64, a behaviour pinned
by test. Any tile the town occupied inside the current grid is a tile some
player's farm is entitled to buy. Placing the town there means either
colliding with a maximal farm or quietly shrinking a shipped promise, and
`PLAN.md` §9.4 forbids negotiating criteria downward.

Three placements were considered:

1. **Inside the 64×64 grid, with a lowered expansion cap.** Rejected: it
   retroactively shrinks v0.1's land promise, and a save that already owns
   the reserved tiles has no coherent migration.
2. **A separate map with a scene switch.** Rejected for v0.3: a second grid
   means a second camera, split pathing, and cross-map worker semantics —
   that is v0.4's "world map" milestone arriving a version early, which is
   the exact failure `PLAN.md` §9.2 names. And a town you cannot walk to
   defeats phase 19.
3. **Extend the grid eastward.** The farm keeps every promise it has made;
   the town gets real tiles in the same pathable, renderable, serializable
   space; NPCs and deliveries need no new movement machinery.

The third is taken. The machinery agrees with it: every index conversion goes
through `shared/geometry.ts`, every dimension through `shared/constants.ts`
(85 references, zero hand-rolled), the save stores `width`/`height`
explicitly, and the terrain renderer chunks in 16-tile columns — extension is
the case this code was shaped for. `tile-grid.ts` even says so: _"the grid is
the one structure that scales with world size, and v0.4 expands the map."_
v0.3 exercises that seam first.

---

## Decision

**The grid becomes 80×64 — one 16-tile chunk column added on the east. The
western 64×64 is the farm region and is exactly the world that shipped:
every existing tile keeps its coordinates, and ownership can never leave it.
The eastern 16×64 band is the town region: town tiles and town buildings,
never ownable, never farmable. Saves migrate by pure index arithmetic
(v6→v7); the town itself is founded by world construction, not by the
migration.**

### 1. Two regions, one space

```
x ∈ [0, 64)   FARM  — ownable, tillable, expandable; the shipped world, unmoved
x ∈ [64, 80)  TOWN  — town tiles and buildings; no tile here is ever ownable
```

`FARM_SIZE = 64` becomes a named constant beside `WORLD_WIDTH = 80`. The
starting plot centres in the **farm region** (unchanged at (32, 32)), and
`expandLand`'s cap keeps its shipped meaning — the plot may reach 64×64 and
may never cross `x = 64`. No town rule is added to the farm commands:
till/plant/water/expand are already gated on ownership, and town tiles are
simply never owned. **The absence of ownership is the whole access-control
model**, which is why it needs no new validation and cannot drift.

One space means one pathfinder, one camera, one snapshot pipeline, one save
format. A worker _could_ walk to the town today; phase 19 gives someone a
reason to walk back.

### 2. The migration is arithmetic, and only arithmetic

v6→v7 re-lays the dense grid (64-wide rows padded to 80 with default tiles)
and remaps every stored tile index:

```
remap(i) = floor(i / 64) * 80 + (i % 64)
```

applied to: crops, worker positions, paths, task targets, schedule zones,
buildings, `lastPlanted`, and the quarantine's tile-bearing entries. Pure,
total, reversible — a v7 document's farm is byte-for-byte the same farm at
the same coordinates. The link adds **no content**: migrations transform
shape (ADR-015), and a town is not a shape.

### 3. The town is founded by construction, idempotently

`foundTown(world)` stamps the town — tile kinds, buildings, blocked bits —
onto the town region. It runs inside world construction for a new world and
after hydration for a loaded one, guarded by one test: **a world with no
town buildings gets the town; a world with any keeps what it has.** That
guard is sound because no command can ever remove a town building — commands
are ownership-gated and town tiles are never owned — so "no town buildings"
can only mean "built before the town existed".

One code path founds every town. A migrated v0.2 save loads, the town
appears beside the farm, and the player's world has visibly grown while they
were away — which is the product's promise (`VISION.md` §2.2) arriving as
geography.

### 4. The town is content; the layout is data

Town tile kinds and building definitions are registered by `plugins/core`
through the public API under the `core:` namespace, exactly like crops and
farm buildings (ADR-019 §2, ADR-026). The layout — which building stands on
which tile — is a **fixed table in core content**, not a generator: every
world gets the same village, because the village is canon
(`WORLD_BIBLE.md` §Village: clustered cozy buildings, paths, a well, market
stalls), not variation. No RNG is consumed; determinism is untouched.

Town buildings use the existing building model unchanged (ADR-004 §5:
definition + instance + blocked tile). They do not appear in the shop's
purchase list, cost nothing to found, and own storage only where a later
phase gives them behaviour. A `TownBuildingDefinition` subclass does not
exist and must not: what makes a building "town" is where it stands.

### 5. What this ADR deliberately does not decide

- **Residents.** Phase 19 (NPC model, its own ADR). The town ships empty and
  that is correct — place before people.
- **The notice board's behaviour.** Phase 20 (contracts). Here it is a
  building that blocks a tile.
- **Further growth.** v0.4's world map decides whether the next expansion is
  another band or a real region model. This ADR proves the seam works;
  it does not pre-design v0.4 on it.

---

## Consequences

**Cost.** Grid arrays grow 1.25× (~5 KB per dense array; bitfields 640 B).
One more chunk column of terrain. A* worst case grows with area; phase-17
measured p99 tick at 0.5 ms of the 3 ms budget, and phase 18 re-measures
against that baseline before closing.

**Save size** grows by the padded band — well inside the 54× headroom
measured in phase-07e.

**Camera and tests.** Anything that assumed "the grid centre is the farm
centre" or hand-computed `y * 64 + x` in a test must move to the constants —
which is where it was always supposed to be. The v0.1 behaviour ("centred
8×8 plot", "cap at 28 expansions") is preserved **by meaning**, now stated
against the farm region rather than the grid.

**The one-way door:** once v7 ships, 80×64 is the floor — later widths must
migrate from it. Accepted: that is what the migration chain is for.
