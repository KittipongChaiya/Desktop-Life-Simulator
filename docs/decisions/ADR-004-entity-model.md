# ADR-004: Data-Oriented Entity Stores, Not an ECS

|                   |                               |
| ----------------- | ----------------------------- |
| **Status**        | Accepted                      |
| **Date**          | 2026-07-21                    |
| **Deciders**      | Project owner, lead architect |
| **Supersedes**    | —                             |
| **Superseded by** | —                             |

---

## Context

The simulation must represent tiles, crops, workers, buildings, and items — and eventually NPCs, monsters, projectiles, machines, and vehicles (`VISION.md` §4). The entity model determines how systems are written, how state is saved, and how expensive it is to add an entity kind five phases from now.

Scale, honestly assessed:

| Version | Tiles    | Active entities         | Ticked entities/sec @ 20 Hz |
| ------- | -------- | ----------------------- | --------------------------- |
| v0.1    | ~4,096   | ~10 workers, ~500 crops | ~10,000                     |
| v0.4    | ~65,000  | ~200                    | ~4,000 (most sleeping)      |
| v1.0    | ~250,000 | ~1,000                  | ~20,000                     |

This is small. A 20 Hz tick over a thousand entities is not a performance problem on any machine from the last decade — the design pressure here is **maintainability and extensibility**, not throughput.

The genuine tension: a full ECS is the standard answer for entity-heavy games with an ambitious roadmap, and it is also exactly the kind of speculative machinery `AI_RULES.md` §1.5 forbids. Choosing wrong in either direction is costly — premature ECS burdens every phase with ceremony; naive OOP produces an inheritance hierarchy that has to be torn out when combat arrives.

---

## Decision

**Entities are plain typed records held in `id`-keyed stores. Systems are free functions over the world. No ECS library, no inheritance hierarchy.**

### 1. Entities are data, not objects

```ts
export interface Worker {
  readonly id: WorkerId;
  position: TilePosition; // mutable: sim hot state (CODE_STYLE.md §2.2)
  state: WorkerState;
  task: WorkerTask | null;
  path: readonly TileIndex[];
  pathCursor: number;
  energy: number;
}
```

No methods, no base class, no `update()` on the entity. An entity is a bag of state; behavior lives in systems. This keeps entities trivially serializable (ADR-002 §Explicit serialization) and keeps behavior in one greppable place per concern.

### 2. The world is a struct of stores

```ts
export interface World {
  readonly seed: number;
  tick: number;
  readonly rng: Rng;

  readonly tiles: TileGrid; // dense: flat typed arrays
  readonly crops: Map<TileIndex, Crop>; // sparse: keyed by tile
  readonly workers: Map<WorkerId, Worker>; // sparse: keyed by id
  readonly buildings: Map<BuildingId, Building>;

  readonly inventory: Inventory;
  readonly wallet: Wallet;
  readonly intents: IntentQueue;
  readonly events: EventBus;
}
```

**Dense storage for tiles, sparse for entities.** Tiles are a fixed grid where nearly every cell exists — parallel flat typed arrays (`Uint8Array` for kind, `Uint16Array` for moisture, …) indexed by `y * width + x`. This is compact, cache-friendly, and directly serializable. Entities are sparse and irregular, so `Map` keyed by branded ID (`CODE_STYLE.md` §1.4) is the right shape.

Choosing per-store rather than imposing one uniform layout is the whole point: the tile grid and the worker list have genuinely different access patterns, and pretending otherwise is what a general ECS would force.

### 3. Systems are pure free functions, ordered explicitly

```ts
export function growthSystem(world: World): void {
  /* ... */
}
export function workerSystem(world: World): void {
  /* ... */
}
```

The tick runs a **fixed, explicitly ordered list** of systems (ADR-007 §Tick Order). Order is data, declared in one file, not implied by registration order or discovery. Where order matters for correctness — growth before harvest, so a crop maturing this tick is harvestable this tick — it is stated in a comment and covered by a test.

### 4. Composition where variation is real

Optional capabilities are optional fields or separate side-tables, not subclasses:

```ts
// A building that stores items has an inventory; one that doesn't, doesn't.
readonly buildingInventories: Map<BuildingId, Inventory>;
```

When combat arrives in v1.0, `health` becomes a side-table over whatever entity kinds can be damaged. No hierarchy to reshape, no `AbstractDamageable` to introduce.

### 5. Content definitions are separate from instances

This is the load-bearing distinction for mod support (ADR-003 §6).

|         | Definition                                         | Instance                                         |
| ------- | -------------------------------------------------- | ------------------------------------------------ |
| Example | `core:wheat` — grows in 1200 ticks, yields 3 wheat | _this_ wheat plant on tile 4172, 340 ticks grown |
| Count   | Tens                                               | Thousands                                        |
| Mutable | Never                                              | Yes                                              |
| Source  | Content registry (core or plugin)                  | Runtime                                          |
| Saved   | **No** — referenced by ID                          | **Yes**                                          |

Instances store a `ContentId`, never a copy of the definition. Definitions live in registries populated at startup. This is why a plugin can add a crop without touching core, and why rebalancing a crop's growth time in a patch applies to already-planted crops rather than requiring a migration.

### 6. Snapshots for views

Views never read `World` directly. The sim produces an immutable snapshot when state changes, and views consume it (ADR-003 §5). Snapshots are produced only for what changed, and only when something did — the render layer's dirty gate (ADR-001) and the UI's throttle (ADR-005) both hang off this.

---

## Alternatives Considered

### A. A real ECS library (bitECS, miniplex, becsy)

- **For:** the standard answer for entity-heavy games. Excellent cache locality via archetypes. Composition is native. Query systems scale to tens of thousands of entities.
- **Against:** archetype storage is _hostile to the save format_ — reconstructing archetype layouts across schema versions is far harder than migrating plain records (ADR-002 §3). Component-ID registration adds ceremony to every new entity kind. Debugging means inspecting parallel component arrays rather than reading an object. And the performance it buys is for a problem this game does not have: the table above shows peak load at ~20,000 entity-ticks per second, roughly three orders of magnitude below where archetype iteration matters.
- **Rejected because:** it is speculative generality of exactly the kind `AI_RULES.md` §1.5 forbids — real costs in every phase, paid against a bottleneck that never arrives. Critically, the chosen design **upgrades into it** if that assessment turns out wrong: entities are already plain data with no behavior, systems already iterate stores, and behavior is already separate from state. The migration would be mechanical rather than a rewrite.

### B. OOP class hierarchy (`Entity` → `Actor` → `Worker`)

- **For:** familiar; `worker.update()` reads naturally at first.
- **Against:** this is the model that fails. Entity hierarchies collapse when an entity needs traits from two branches — a worker that fights, a building that moves. Serialization requires custom logic per class. Behavior scatters across the hierarchy, so "everything that touches energy" becomes unanswerable. Every one of those pressures arrives on this roadmap.
- **Rejected because:** it is the highest-regret option, and its costs land precisely when the project is largest.

### C. Uniform generic entity bags (`Map<string, unknown>` components)

- **Rejected because:** it discards type safety in the one module where correctness matters most. `noUncheckedIndexedAccess` and branded IDs (`CODE_STYLE.md` §1) exist specifically to catch entity mix-ups at compile time; this alternative throws that away for flexibility nobody asked for.

### D. Immutable persistent world (structural sharing, Immer)

- **For:** free undo, trivial snapshots, no mutation bugs.
- **Against:** allocation pressure at 20 Hz over thousands of entities is a real GC cost, and GC pauses in a process with a hard idle budget are exactly the wrong failure mode. `CODE_STYLE.md` §2.2 already grants bounded mutation inside `src/sim/systems/` for this reason.
- **Rejected because:** the benefits are largely achievable through snapshots at the view boundary without paying per-tick allocation.

---

## Tradeoffs Accepted

| We accept                                    | To gain                                  | Mitigation                                                                      |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Manual system ordering                       | Explicit, debuggable, deterministic tick | Order declared in one file; correctness-critical pairs tested                   |
| Mutation inside `src/sim/systems/`           | No per-tick allocation                   | Bounded to one directory by `CODE_STYLE.md` §2.2; views get immutable snapshots |
| No archetype cache locality                  | Simplicity, save-friendliness            | Entity counts are ~1000× below where it matters                                 |
| Adding an entity kind touches several places | No framework ceremony                    | Documented checklist in `ARCHITECTURE.md`                                       |
| Hand-written serialization per store         | Explicit, migratable saves               | Required by ADR-002 anyway                                                      |
| No built-in query language                   | No indirection                           | Stores are small; direct iteration is clear and fast                            |

---

## Consequences

### Immediate

- `src/sim/world/` defines `World` and the stores; `src/sim/systems/` holds one file per system.
- Branded IDs from the start (`CODE_STYLE.md` §1.4) — retrofitting them after entity types exist is a wide, mechanical, error-prone change.
- The tile grid uses flat typed arrays from phase-02. Converting an array-of-objects grid to typed arrays later would touch every tile consumer.
- Content registries exist from phase-03, the first phase that defines content.

### The ID allocator is NOT an entity registry (phase-02.5)

`src/sim/entities/id-allocator.ts` allocates and tracks globally unique,
serializable IDs. It **does not store entities**.

Each system owns its own typed store — `crops` keyed by tile, `workers` keyed by
`WorkerId`. That is this ADR's decision, and alternative C above rejected
"uniform generic entity bags" precisely because they discard type safety in the
one module where correctness matters most.

**If a future change makes the allocator hold entity data, that is the generic
bag this ADR rejected arriving through the back door.** Store entities in their
system's typed store instead.

IDs are a monotonic counter — never random, never clock-derived — so two runs
from the same seed allocate the same IDs in the same order. They are never
reused, so a stale reference cannot silently resolve to a different entity that
recycled its number. Zero is reserved as "no entity", so a zeroed field never
reads as a valid reference.

### Ongoing — adding a new entity kind

1. Define its record type in `src/sim/world/`
2. Add its store to `World`
3. Add `toSave`/`fromSave` and bump the schema version with a migration (ADR-002)
4. Add or extend the system(s) that operate on it
5. Register its place in the tick order (ADR-007)
6. Add its `catchUp` for offline progress if it accrues over time
7. Add snapshot projection if a view needs it

That this list is explicit — rather than absorbed by a framework — is the tradeoff. It is also why nothing about a new entity kind is hidden.

### Validation

- Property test: `fromSave(toSave(world))` is identical for arbitrary worlds (shared with ADR-002).
- Determinism test: identical seed and intent sequence produce byte-identical state after N ticks.
- A test asserts no system mutates a store it does not own, catching cross-system interference early.

### Revisit if

- Entity counts exceed ~50,000 ticked entities → profile, then consider alternative A.
- Adding entity kinds becomes repetitive across many sites → extract a helper, still not a framework.
- Undo/time-travel becomes a product requirement → reconsider alternative D at the snapshot layer only.
