# ADR-011: Resources Are Conserved Quantities Owned by Containers

|                   |                               |
| ----------------- | ----------------------------- |
| **Status**        | Accepted                      |
| **Date**          | 2026-07-22                    |
| **Deciders**      | Project owner, lead architect |
| **Supersedes**    | —                             |
| **Superseded by** | —                             |

---

## Context

Phase-04 is complete. The project now turns from simulation-only gameplay to **persistent resources**: the things a worker harvests, carries, and deposits, and everything downstream of them.

By v1.0 resources flow through many systems — crops, worker carrying, player inventory, storage buildings, crafting, economy, trading, and, later, dungeon loot and enemy drops (`VISION.md` §4). Each is a place a resource **enters, moves through, or leaves** the world. If each system invents its own rules for what a resource is and how it moves, the result is a web of incompatible representations: harvest yields shaped one way, storage another, loot a third, with lossy conversions at every boundary. That is the failure this ADR exists to prevent — a single model must govern the whole lifecycle.

The decision is nearly impossible to reverse. It sets the **save format** (`SAVE_FORMAT.md` §2 already sketches `carrying` and `inventory` as stacks — this ADR is the model behind that sketch, made explicit before any of it is built), it sets what **replay** must reproduce, and it is depended on by every resource-touching system that follows. Retrofitting a different model after inventory ships means migrating every save and rewriting every consumer. It is therefore recorded now, before phase-05, while nothing yet depends on it.

Two prior decisions already bound this one and must not be re-litigated:

- **Commands are the only write path** (ADR-010). A resource moves only through a command, never a direct store mutation.
- **Entities are plain records in id-keyed stores; content is data, instances reference it** (ADR-004 §5). Resources inherit this: an item _kind_ is a definition; a held _amount_ is an instance that references it by `ContentId`.

The counter-risk is over-engineering. `AI_RULES.md` §1.5 forbids building machinery for imagined needs. This ADR is **architecture only** — it defines the model and defers every mechanism (inventory, carrying, storage, crafting, economy) to the phase that has a real consumer. It draws the boundary; it does not fill it.

---

## Decision

**A resource is a conserved integer quantity of a content-defined item, held in exactly one owner-tagged container. Resources are never free-standing world entities. They move only by an explicit, atomic, command-driven transfer between two containers, and total quantity is conserved everywhere except at declared sources and sinks.**

### 1. A resource is a stack: a `ContentId` and an integer quantity

```ts
export interface ItemStack {
  readonly item: ContentId; // which item — references a definition, never copies it
  readonly quantity: number; // how many — integer, never fractional (ADR-007 §7)
}
```

The stack already exists (`src/sim/content/crops.ts`); this ADR promotes it to _the_ resource primitive. An item **kind** is a `ItemDefinition` in a registry (`stackSize`, `basePrice`, tags, …), separate from the amount held — ADR-004 §5, the same split that lets a plugin add an item and lets rebalancing be a data edit rather than a save migration. Quantities are integers because a deterministic simulation cannot carry floating-point drift (ADR-007 §7, `SAVE_FORMAT.md` §3.3).

### 2. A resource exists only inside a container; every container has exactly one owner

A **container** is a bounded collection of stacks. A resource is never loose in the world and never ownerless — at every instant it sits in exactly one container, and every container belongs to exactly one owner:

| Owner              | Container         | Arrives in   |
| ------------------ | ----------------- | ------------ |
| The player         | player inventory  | phase-05     |
| A worker           | its carry hold    | phase-05     |
| A storage building | building storage  | phase-06     |
| A tile (a "drop")  | ground pile       | v1.0 (loot)  |
| A wagon / chest    | its own container | v0.4 / later |

The list grows by adding an owner-tagged container of the **same type**, never a new resource representation. A dropped item on the ground is a container keyed by tile — the "world" case is not a special kind of resource, it is a special kind of _owner_. This is what makes one model govern harvesting, storage, and loot alike.

### 3. Ownership is explicit and singular; movement is transfer, never teleportation

A resource moves by an **atomic transfer**: decrement the source container, increment the destination, in one command. There is no intermediate state where a unit exists in both or neither. Ownership changes only through a transfer, and only through a command (ADR-010) — never by a system reaching into two stores.

```
transfer(from, to, {item, quantity})
  ├─ reject if `from` lacks the quantity          → nothing changes
  ├─ reject if `to` cannot accept it (full)        → nothing changes
  └─ else  from -= quantity;  to += quantity       → conserved, atomic
```

"No implicit teleportation" is the load-bearing rule: a unit never appears in a destination without leaving a source. This is what makes a save auditable and a replay reproducible.

### 4. Quantity is conserved except at declared sources and sinks

Every operation conserves total quantity **except** the two declared boundaries where the world creates or destroys resources:

| Boundary   | Creates / destroys | Examples                                      |
| ---------- | ------------------ | --------------------------------------------- |
| **Source** | creates            | harvest, mining, foraging, loot, craft output |
| **Sink**   | destroys           | consumption, sale, craft input, decay         |

Everywhere else — carrying, depositing, hauling, trading between two owners — is a transfer, and transfers conserve. This invariant is the single most valuable property of the model: it is directly testable (§Validation), it makes "where did my wheat go" always answerable, and it is the shape a networked or replayed simulation needs.

### 5. Harvested resources become container quantities immediately — never world entities

When a crop is harvested, its yield goes **straight into the harvesting actor's container** (a worker's hold, or the player's inventory for a player harvest). It does not become a world object with a position that must be walked to and picked up.

| Concern            | Why immediate-into-container wins                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save size          | A large farm holds `wheat: 4000` as one number, not 4,000 item entities. Resource count scales with **item kinds**, not harvest volume (`SAVE_FORMAT.md` §3.4). |
| Determinism        | No item-entity merging, physics, or pickup ordering to make deterministic — a transfer is two integer writes.                                                   |
| One rule set       | There is no second "world item" model to keep in sync with the inventory model — the exact fragmentation this ADR forbids.                                      |
| Worker AI          | Workers reason about **containers** (which storage has space), not about chasing loose items across the map.                                                    |
| Future multiplayer | Conserved quantities in owner-tagged containers are the clean netcode shape (ADR-008 §10); item-entity physics is not.                                          |

The `cropHarvested` event already carries `yields` as stacks (ADR-008 worked example); phase-05's inventory subscribes and receives them. Harvest does not change.

### 6. The carrier moves; the resource transfers at the endpoints

A worker "carrying" wood does not move a wood resource through the world. The wood is a stack in the worker's **carry container**; the _worker entity_ walks (phase-04 movement); on arrival a deposit command **transfers** the stack from the carry container to the storage container. The resource's ownership changes at the endpoint, instantaneously and atomically — the journey is the carrier's, not the resource's.

This is the answer to "how do resources move": **by ownership transfer, carried by an entity that itself moves** — not by the resource pathfinding, and not by a container physically relocating. It keeps movement (an entity concern, already deterministic) separate from ownership (a resource concern), and each stays simple.

### 7. Containers are bounded; a full destination blocks, never discards

A container has a capacity (slots, per `GAME_DESIGN.md` §7). A transfer into a full container is **rejected**, and the source keeps its units — a blocked harvest waits rather than a lost one. Silently discarding overflow while the player is away is exactly the punish-absence failure `VISION.md` §2.2 forbids. Partial transfers are permitted: a transfer moves `min(requested, available, space)` and reports what actually moved, so a nearly-full container takes what it can.

### 8. Reservation is a claim on available quantity — defined, not built

A future system will need to **reserve** resources: a crafting job or a construction site claims materials in storage so a second consumer cannot spend them first. This mirrors phase-04's tile **claiming** (`GAME_DESIGN.md` §4.4), where a worker reserves a tile so two workers never target it.

The model accommodates it without implementing it: a container exposes `available = quantity − reserved`, a reservation decrements `available` without transferring ownership, and a fulfilled reservation becomes a transfer. This is **documented now and built when a consumer exists** (v0.4 logistics / crafting) — naming it here ensures the container type is not designed in a way that blocks it.

### 9. Fungible now; non-fungible via instance side-tables later

Every v0.1 item is **fungible**: one wheat is exactly like another, so a quantity is a complete description and a container is a compact multiset of `(ContentId → quantity)`. The model commits to fungible stacks as the default and keeps them cheap.

Non-fungible items — quality, durability, enchantments, per-instance metadata (v1.0) — are **real variation**, and ADR-004 §4 already dictates how to handle real variation: a side-table, not a field on every record. A non-fungible item becomes an **item instance** with an id from the allocator (ADR-004 §Consequences) and its properties in a side-table; only those items pay for instance identity. Inflating every fungible stack with unused `quality`/`durability`/`metadata` slots would be the speculative generality `AI_RULES.md` §1.5 and ADR-004 §Alternatives C both reject, and it would bloat every save for a property v0.1 never uses.

### 10. Transfers are commands; resource events are facts, deferred until consumed

Every resource movement is a **command** (ADR-010) — the only write path. The future command vocabulary (`DepositItems`, `WithdrawItems`, `SellItems`, …) is named here as documentation; each is registered by the phase that needs it, never speculatively.

Resource **events** are facts in past tense (ADR-008 §2). The eventual vocabulary is:

| Event               | Fired when                        | First real consumer |
| ------------------- | --------------------------------- | ------------------- |
| `inventoryChanged`  | a container's contents change     | phase-05 (HUD)      |
| `resourceDeposited` | a transfer into storage completes | phase-06            |
| `resourceSold`      | a sink converts items to coins    | phase-06 (economy)  |
| `resourceReserved`  | a reservation is placed           | v0.4                |

Per ADR-008 §Ongoing, **none of these is introduced until it has a producer and a consumer.** They are listed so the model is legible, not so they are built.

---

## Alternatives Considered

### A. Resources as world entities (Minecraft-style dropped items)

- **For:** intuitive; a harvested item you can see on the ground and walk over to collect.
- **Against:** it forces **two** resource representations — a world-entity form (position, id, physics, merging) and an inventory form (quantity) — with lossy conversion at every pickup and drop. That is precisely the per-system fragmentation this ADR exists to prevent. It also makes save size scale with harvest volume rather than item kinds (`SAVE_FORMAT.md` §3.4), turns pickup ordering and item merging into determinism hazards, and makes worker AI chase entities instead of reasoning about containers.
- **Rejected because:** the costs land in exactly the properties the project protects most — determinism, save size, and one coherent model — for a benefit (visible ground items) that is a **rendering** concern the container model can still satisfy: a ground pile is a tile-keyed container, and a view can draw a sprite for it without the resource being an entity.

### B. Universal per-instance stacks (every stack carries metadata)

- **For:** one representation covers fungible and non-fungible items; quality/durability "just work" everywhere.
- **Rejected because:** it pays the cost of non-fungibility on every fungible unit — every wheat becomes an addressable instance in memory and in every save, for a property v0.1 has no use for. This is the generic-bag anti-pattern ADR-004 §Alternatives C rejected and the speculative generality `AI_RULES.md` §1.5 forbids. Non-fungibility is real variation, and §9 handles it the way ADR-004 §4 dictates: a side-table over the items that actually need it.

### C. A single global resource pool (world-wide quantities, no per-owner containers)

- **For:** the simplest possible bookkeeping — one bag of `(item → quantity)` for the whole world.
- **Rejected because:** it discards **ownership and locality**, which the game is built on. It cannot express "in a worker's hold versus in storage versus in the market stall," cannot give a storage building its own capacity (`GAME_DESIGN.md` §5), cannot support "in transit," and cannot support reservation. Ownership is not incidental here — it is the substance of logistics, storage, and trade.

### D. Resources move by relocating themselves (the resource paths to its destination)

- **For:** conceptually uniform — everything that moves, moves the same way.
- **Rejected because:** it duplicates the carrier's movement onto the resource, paying pathfinding per resource for no gain, and it reintroduces alternative A's world-entity representation. §6's split — the carrier moves, the resource transfers at the endpoints — is strictly cheaper and keeps movement and ownership independent.

---

## Tradeoffs Accepted

| We accept                                                    | To gain                                           | Mitigation                                                               |
| ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Resources have no independent world position                 | One model, compact saves, deterministic movement  | A visible "drop" is a tile-keyed container; the sprite is a view concern |
| A move is a two-container transfer with a conservation check | An auditable, replayable, conserved ledger        | The transfer helper is one function; conservation is a property test     |
| Non-fungible items need a second representation later        | Fungible items stay cheap in memory and in saves  | §9 — instance side-tables, added with their first consumer (ADR-004 §4)  |
| Reservation is defined but not built                         | No speculative machinery now (`AI_RULES.md` §1.5) | The container exposes `available`; the mechanism lands with logistics    |
| Cross-owner reactions take one tick (via events)             | Systems decouple as the roadmap grows (ADR-008)   | Fixed and known; reactions land in `postUpdate` of the same tick         |

---

## Consequences

### Immediate (phase-05 implements, this ADR governs)

- An `ItemDefinition` type + registry (ADR-004 §5); the four crops' harvest items are the first entries.
- A `Container` primitive: a bounded multiset of `ItemStack`, with `add`/`remove`/`available`/capacity, and a single `transfer(from, to, stack)` that is atomic and conserving.
- `inventory` and `wallet` stores on `World` (already anticipated in `ARCHITECTURE.md` §3.1 and `SAVE_FORMAT.md` §2).
- Deposit/withdraw **commands** (ADR-010) — the only way to move resources.
- The worker `carrying: number` field reserved in phase-04 becomes `carrying: Container` (the save format already models it as `[{item, qty}]`, `SAVE_FORMAT.md` §2).
- `cropHarvested` yields flow into a container; a full inventory **blocks** the harvest (`GAME_DESIGN.md` §7), it is not discarded.
- `inventoryChanged` gains its first real producer and consumer.

### Ongoing

- **A new resource kind is a content definition** — data, no code (ADR-004 §5).
- **A new container kind (wagon, chest, ground pile) is a new owner-tagged container of the same type** — never a new resource representation.
- **A resource never moves without a command**, and a command never partially applies (ADR-010 §2). No system writes two stores to "move" an item.
- **Never spawn a world-entity for a stackable item.** A visible drop is a tile-keyed container plus a view sprite.
- **Serialization stays a sorted array of `{item, qty}` records** (`SAVE_FORMAT.md` §2.1), content referenced by `ContentId`, quantities integer.

### Validation

- **Conservation property test:** across an arbitrary sequence of transfer commands, `Σ(all containers) + Σ(sinks) − Σ(sources)` is invariant. A transfer that creates or destroys a unit fails this — the single most important resource test.
- **Determinism test:** identical command streams produce byte-identical container state after N ticks (extends the ADR-007 §Validation test to resources).
- **Save round-trip:** `fromSave(toSave(world))` preserves every container exactly (shared with ADR-002).
- **Full-container test:** a transfer into a full container is rejected and leaves both containers unchanged (§7).

### Revisit if

- **Non-fungible items arrive** (quality, durability) → add item-instance side-tables (§9); do **not** inflate the fungible stack.
- **A resource genuinely needs an independent, physics-bearing world position** (unlikely before v1.0) → add a bounded item-entity layer for _that case only_, as a view-and-pickup shim over containers, never as a second canonical representation.
- **Transfer volume becomes a measurable per-tick cost** → batch transfers within a command; the model does not change.

---

## Impact on Future Phases

This ADR reaches forward through the entire resource half of the roadmap:

| Phase / tier           | How it depends on this ADR                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **05 — Inventory**     | Builds the `Container` primitive and item registry as **the** resource unit — not a bespoke inventory. Worker `carrying` becomes a container; harvest yields deposit into one.                          |
| **06 — Economy**       | Storage shed, market stall, and seed bin are containers + transfer commands; selling is a sink; buying seeds is a source-side purchase. Dynamic pricing (`GAME_DESIGN.md` §6.2) reads item definitions. |
| **07 — Save/Load**     | Containers serialize as the sorted stack arrays `SAVE_FORMAT.md` §2 already specifies; no new entity store to migrate.                                                                                  |
| **v0.4 — Automation**  | Logistics routes transfers between building containers; reservation (§8) prevents double-spend; crafting is source (output) + sink (input) over containers.                                             |
| **v1.0 — Combat/Loot** | Enemy drops are ground-pile containers; pickup is a transfer. No new resource model.                                                                                                                    |

**Should phase-05 be adjusted?** Yes, in framing, not scope. Phase-05 is implemented **as "Resources & Containers" on top of this ADR** (`docs/phases/phase-05-resources-containers.md`) — the general `Container`/`ItemStack`/`transfer` primitive first, with player inventory and worker carry as its first two owners — rather than a one-off inventory that phases 06 and v0.4 would later have to generalize. The deliverables do not change; the internal structure they build does, and the phase document names this ADR as its governing model.

The phase-04 worker `carrying: number` field was deliberately left a reserved tally (phase-04 Out-of-Scope) precisely so it could become a `Container` here without rework.
