# ADR-037: The Wilds and Gathered Resources

**Status:** Accepted — v0.4 Phase 27 (implemented, **with the §4 amendment below**).
**Date:** 2026-08-18
**Phase:** v0.4 Phase 27 (The Wilds & Resources) — walkable land past the town, and something out there worth going for.
**Bound by (not re-litigated):** ADR-030 (two regions in one space; the grid extends by whole chunk columns; ownership is the access model; migration is pure index arithmetic); ADR-011 (resources are conserved quantities in owner-tagged containers; harvest is a declared source); ADR-009 (state is recorded facts, derived where possible); ADR-024 (the worker pipeline: discover → filter → select); ADR-036 (a task-shaped band joins that pipeline without new machinery); ADR-007 (determinism); `VISION.md` §2.2.

---

## Context

`PLAN.md` §5 asks for _"mining, foraging, gathering, so there's something out
there worth going for"_ and _"regions beyond your farm to go to"_. ADR-030
deliberately left the shape of that expansion open:

> **Further growth.** v0.4's world map decides whether the next expansion is
> another band or a real region model. This ADR proves the seam works; it does
> not pre-design v0.4 on it.

Three questions follow, and the third is the one that decides whether this
phase costs the save anything at all:

1. Where the wilds physically are.
2. What a resource node is, and how gathering reaches the existing worker.
3. **Which parts of a node are stored and which are derived.**

---

## Decision

**The grid becomes 112×64 — two more 16-tile chunk columns on the east, past
the town. Wild tiles are never ownable, exactly as town tiles are not. A
resource node's EXISTENCE is derived from a hash of (seed, tile) and costs the
save nothing; only its harvest time is stored, and only for nodes that have
been harvested. Gathering is one more band in the worker pipeline.**

### 1. Three regions, still one space

```
x ∈ [0,  64)   FARM   — ownable, tillable, expandable. Unmoved since v0.1.
x ∈ [64, 80)   TOWN   — the village. Never ownable (ADR-030 §1).
x ∈ [80, 112)  WILDS  — gatherable. Never ownable, never tillable.
```

Another band rather than a second map, for the reasons ADR-030 §Context already
rejected a scene switch: a separate grid means a second camera, split pathing,
and cross-map worker semantics. One space keeps one pathfinder, one camera, one
snapshot pipeline, one save format — and a worker can simply _walk_ there,
which is what makes gathering ordinary work rather than a mode.

112 divides into the terrain renderer's 16-tile chunk columns exactly seven
times. The v12→v13 migration is the same pure index re-lay ADR-030 §2 proved:
`remap(i) = floor(i / 80) * 112 + (i % 80)`.

**The town now sits between the farm and the wilds**, which is a happy accident
of ordering rather than a design goal: you pass the village on the way out.

### 2. Ownership is still the whole access-control model

No command needs a new "is this the wilds?" check. Till, plant, water and
expand are already gated on ownership, and `expandLand` still caps at
`FARM_SIZE`. A wild tile is simply never owned, so every farm rule declines it
without knowing the wilds exist. ADR-030 §1's sentence holds unchanged: **the
absence of ownership is the access model**, which is why it cannot drift.

### 3. A node's existence is DERIVED; only its harvest is stored

This is the load-bearing decision, and it is ADR-009's rule applied to the
largest collection v0.4 adds.

```
nodeAt(seed, tile) = pure function → ResourceNodeDefinition | null
harvestedAt: Map<TileIndex, tick>   ← the ONLY stored part, sparse
```

A tile's node kind is a hash of `(seed, tile)` against the registered node
kinds and their declared densities. No RNG stream is consumed, so determinism
is untouched and the draw order of anything else is unaffected.

What this buys, and why it is worth a slightly less controllable layout:

|                            | Derived existence                  | Stored node table             |
| -------------------------- | ---------------------------------- | ----------------------------- |
| Save cost                  | **zero**                           | ~2,000 entries for the band   |
| Offline exactness          | **exact** — regrowth is arithmetic | needs a catch-up model        |
| Migration                  | nothing to migrate                 | a table to build and validate |
| A new node kind in content | **changes the world**              | needs a generator pass        |

The last row is the price and it is stated rather than discovered: **installing
a content pack that adds a node kind re-rolls what grows where.** That is the
same trade ADR-022 accepted for weather ("adding a kind changes what it rained
last Tuesday") and it is tolerable for the same reason — a wild tile is a
convenience, never a requirement. Nothing the player built depends on it.

**Regrowth is derived too.** A node is available iff
`tick − (harvestedAt ?? −∞) ≥ regrowTicks`. That is `plantedTick`'s shape one
system over: an eight-hour absence needs no catch-up model for the wilds at
all, because the answer is arithmetic on the tick the player returns at.

`harvestedAt` is pruned when it expires, so the stored map holds only nodes
harvested _recently_ — it cannot grow without bound however long the game runs.

### 4. Gathering is a band, not a system

`WorkerTaskKind.Gather`, discovered and filtered exactly like harvest, plant,
till and haul (ADR-024 §1). It therefore inherits zones, shifts, roles,
priority ordering and the never-deadlock rule with no new code, and phase 26
already proved a new band costs a discovery function and a command.

**Priority: LAST, and OPT-IN.** See the amendment below: the original ordering
put gathering above plant and till and it emptied the farm, and last-resort
ordering alone still cost a farm its idle hands. A worker gathers only if its
schedule names `Gather` — `core:forager` is the role that does.

Yields go straight into the worker's carry hold — a declared **source**
(ADR-011 §4), the same boundary a crop harvest crosses — and reach storage
through the deposit path that already exists. Nothing new touches conservation.

### 5. Node kinds are content

`ResourceNodeDefinition` registers through the public API under a namespace,
like every other content type (ADR-019, ADR-026):

```ts
{ id, displayName, sprite, yields: ItemStack[], gatherTicks, regrowTicks, density }
```

`plugins/core` ships three, chosen to cover the three verbs `PLAN.md` §5 names
and no more: **timber** (foraging), **stone** (gathering), **ore** (mining).

### 6. What this ADR deliberately does not decide

- **Expeditions and the world map.** Phase 28. The wilds are walkable ground;
  regions you are _sent_ to are a different mechanism, and conflating them here
  would pre-design phase 28 the way ADR-030 declined to pre-design this one.
- **Whether a route may cross into the wilds.** Logistics endpoints are
  buildings, and no building stands in the wilds, so the question does not
  arise yet.
- **Rare or tiered resources.** One density per kind. Tiers are a balance
  feature with no consumer until v1.0's crafting depth.

---

## Amendment — gathering is last-resort, not mid-priority

**Made during phase-27 implementation, 2026-08-18.** §4 above put gathering
below harvest and haul but **above plant and till**, reasoning that "a crop
rots and a chain starves; a rock does not — but a rock still outranks ground
that will still be there tomorrow."

Measured, that reasoning was wrong, and not marginally. The wilds begin
thirty-plus tiles from the farm, so a gather trip costs a long walk in each
direction. A worker that chose gathering therefore did **almost nothing else**
for the rest of its day. With the original ordering:

- `dry-farm` earned **zero** over a long unattended run — the farm had stopped.
- **28** catch-up and dry-farm assertions failed, all of them measuring farm
  output that no longer happened.

The ordering is now **harvest → haul → plant → till → gather**. A crew works
the farm, and goes out only when the farm has nothing for it.

**And that was still not enough.** Last-resort ordering fixed the earnings but
not the shape: a worker that reaches the wilds is gone for minutes, so a farm
with one quiet moment lost a hand for a long time, and `worker.test.ts`'s
"returns to Idle and waits when no task is available" became false — there is
always a rock somewhere.

So **gathering is opt-in, and it is the only band that is.** Everywhere else in
ADR-024's model an absent `taskKinds` means unconstrained; gathering requires
the worker's schedule to name it explicitly. `plugins/core` ships
**`core:forager`** as that opt-in.

This is the shape logistics already took, and the parallel is the argument:
hauling does not happen until the player declares a ROUTE, and gathering does
not happen until the player says which workers are for it. Both are
long-distance work, and **neither should start merely because nobody said no.**

Two things this gets right that the original did not:

1. **The farm is the game.** `VISION.md` §1 is a farm that plays itself;
   exploration is meant to _feed_ that (criterion 2), not replace it. An
   ordering that let a rock outrank a field inverted the product.
2. **The scan cost lands where it belongs.** Wild discovery walks a 32×64 band,
   and it now runs only when every nearer band has come back empty — which on
   a working farm is rarely.

The general lesson, recorded because it is the second time a task band has been
mispriced by reasoning rather than measurement (ADR-036 §3's haul ordering was
the first, and it was right): **a band's priority is a claim about worker time,
and worker time includes the walk.** Distance is part of the priority, and it
is not visible in the reasoning — only in the run.

---

## Consequences

**Immediate (phase 27 implements)**

- `WORLD_WIDTH` 80 → 112; `WILDS_MIN_X = 80`.
- Schema **v13**: the tile re-lay, plus `harvestedAt` — with a v12 golden
  fixture that **carries a harvested node**, or the link passes vacuously.
- A `ResourceNodeDefinition` registry and its `ContentBundle` field.
- `nodeAt(seed, tile)` — pure, hashed, no RNG draw.
- `WorkerTaskKind.Gather`, its discovery band, and its command.
- Wild terrain: the band is painted with existing tile kinds; node sprites are
  new art through `generate-world-art.mjs`.

**Ongoing**

- **A wild tile is never owned.** Any code asking "is this the wilds?" to
  decide access is reintroducing a check ownership already makes.
- **Node existence stays derived.** Storing a node table later would be a
  schema change and a catch-up model, and it should be argued for on those
  terms.
- **A new node kind changes existing worlds' layouts.** Content packs adding
  one must accept that, as weather kinds already do.

**Validation**

- Ownership can never reach `x ≥ FARM_SIZE` — the existing expansion cap test,
  now with two regions past it.
- `nodeAt` is pure and stable: same seed and tile, same answer, always.
- Regrowth is exact across a save/load and an offline gap.
- `harvestedAt` never grows without bound — pruned on expiry.
- A gathered yield conserves: the existing container property covers it.

**Revisit if**

- **The band fills up** and the wilds need to grow again → another chunk
  column; the migration shape is now proven twice.
- **Density needs to vary by distance** (richer further out) → `density`
  becomes a function of `x`; still derived, still no save cost.
