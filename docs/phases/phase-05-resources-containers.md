# Phase 05 — Resources & Containers

> **Delivers:** The container model of ADR-011, made real — items, stacks, and bounded containers (player inventory, worker holds, storage sheds) with conservation-preserving transfers.
> **Runnable at completion:** Harvested crops become stacked items held in containers with real capacity; workers deposit their hold into storage sheds; the player views inventory in a panel.
> **Governing model:** `ADR-011` — a resource is a conserved integer quantity of a content-defined item, held in exactly one owner-tagged container, moved only by an explicit transfer command. This phase builds that primitive first; inventory and worker carry are its first two owners.

---

## Objectives

1. Build the `Container` / `ItemStack` primitive as **the** resource unit (ADR-011), not a one-off inventory — so phase-06 (storage, market) and v0.4 (logistics) reuse it unchanged.
2. Turn phase-04's reserved `carrying: number` tally into a real worker hold, and harvest yields into container contents.
3. Introduce the first capacity constraint — the first thing the player must _manage_ — and the first building.
4. Build the first substantial React panel on the snapshot bridge.

### Why capacity matters here

Capacity is what makes storage worth buying and what makes the return summary meaningful (`GAME_DESIGN.md` §9.4: "storage full after 2h 14m"). It is the first system where the player's _absence_ has a cost — but a cost measured in **foregone time, never lost goods** (`VISION.md` §2.2, ADR-011 §7).

---

## Deliverables

### Resource foundation (ADR-011)

- [ ] `ItemDefinition` (id, name, sprite, basePrice, stackSize) + `registerItem`
- [ ] Core items in `plugins/core/content/items.ts` — one per crop
- [ ] `ItemStack` — `{ item: ContentId, quantity: number }` (integer, ADR-007 §7)
- [ ] `src/sim/world/container.ts` — the `Container` primitive: a bounded collection of stacks with `add`, `remove`, `available`, `count`, capacity, and a single atomic **`transfer(from, to, stack)`**
- [ ] Stack size from the definition (99, `GAME_DESIGN.md` §7); partial fills spill into a new slot
- [ ] **Conservation:** every `transfer` decrements the source and increments the destination by the same amount — a unit never appears without leaving somewhere (ADR-011 §3, §4)

### Player inventory (a container)

- [ ] `src/sim/world/inventory.ts` — the player's `Container`
- [ ] Slot-based capacity: 40 base, +50 per storage shed
- [ ] **A full inventory blocks harvest; it never discards items** (`GAME_DESIGN.md` §7, ADR-011 §7)

### Worker hold (a container)

- [ ] The phase-04 `carrying: number` field becomes `carrying: Container` (capacity 20, `GAME_DESIGN.md` §4.6)
- [ ] A harvest completed by a worker deposits its yield into the worker's hold
- [ ] The deposit task transfers the hold into a storage container; triggers at ≥ 10 held items

### Transfers as commands (ADR-010 + ADR-011)

- [ ] Deposit / withdraw are **commands** — the only way resources move; no system writes two stores directly
- [ ] A transfer into a full destination is rejected atomically, leaving both containers unchanged
- [ ] `inventoryChanged` event gains its first real producer and consumer (ADR-008)

### Storage buildings

- [ ] `BuildingDefinition` + `registerBuilding`; `buildings: Map<BuildingId, Building>` store
- [ ] `core:storage_shed` — 200 coins, +50 slots (placeable; not purchasable until phase-06)
- [ ] Buildings occupy one tile, block pathing, require owned walkable land
- [ ] Placement validation with clear failure reasons; a shed on a worker's route triggers repathing

### Worker integration

- [ ] Deposit targets the nearest storage shed; falls back to the player inventory when none exists
- [ ] **A worker whose deposit target is full does not jam** — it re-evaluates and idles gracefully (extends the phase-04 no-jam guarantee)

### Harvest integration

- [ ] Harvest yields flow into a container via a transfer
- [ ] Harvest blocked when the destination is full, with a clear reason; a blocked harvest emits an event the return summary can report

### Snapshot slice

- [ ] `inventory` slice republishing **only on content change**; includes items, capacity, free slots

### UI

- [ ] `InventoryPanel` — grid of stacks with icons and counts; capacity indicator; sortable; empty state
- [ ] Building placement mode with a ghost preview in `worldUi`
- [ ] Panel opens and closes without stealing focus

### Rendering

- [ ] Storage sheds render in the `objects` layer
- [ ] Placement ghost renders in `worldUi`, valid/invalid tinted

### Art

- [ ] Item icons for the four crops (16×16, `ui-world` atlas)
- [ ] `storage_shed` sprite (`buildings` atlas); placement ghost overlay

---

## Out of Scope

- Coins, selling, buying, or the shop _(phase-06)_
- Other buildings — Rest Hut, Seed Bin, Market Stall _(phase-06)_
- Land expansion _(phase-06)_
- **Item quality, durability, or per-instance metadata** — v0.1 items are fungible; non-fungible items arrive via instance side-tables, not by inflating every stack (ADR-011 §9, v1.0)
- **Reservation** of container contents — defined by ADR-011 §8, built with logistics _(v0.4)_
- Drag-and-drop rearrangement — display and auto-stack only in v0.1
- Item transfer between storage buildings _(v0.4 logistics)_
- Save/load of containers _(phase-07)_
- Building rotation or multi-tile footprints _(not planned for v0.1)_

---

## Acceptance Criteria

| #   | Criterion                                                              | Verified by   |
| --- | ---------------------------------------------------------------------- | ------------- |
| 1   | Harvested crops appear as container items                              | E2E           |
| 2   | Items stack to the definition's limit, then spill into a new slot      | Unit test     |
| 3   | Capacity is 40 base, +50 per shed                                      | Unit test     |
| 4   | **A full container blocks harvest and destroys nothing**               | Unit test     |
| 5   | A blocked harvest gives a clear reason                                 | Manual + E2E  |
| 6   | Partial add fills the stack and reports the remainder                  | Unit test     |
| 7   | Remove handles partial and full stack removal                          | Unit test     |
| 8   | Removing more than held fails and mutates nothing                      | Unit test     |
| 9   | **A transfer conserves quantity — source loses what dest gains**       | Property test |
| 10  | Storage sheds place only on owned walkable land                        | Unit test     |
| 11  | Placing a shed blocks pathing and triggers repathing                   | Unit test     |
| 12  | Workers deposit to the nearest shed                                    | Unit test     |
| 13  | Workers deposit to player inventory when no shed exists                | Unit test     |
| 14  | **A worker facing full storage does not jam**                          | Unit test     |
| 15  | The inventory panel shows correct contents and capacity                | E2E           |
| 16  | The panel opens without stealing focus                                 | Manual        |
| 17  | **The inventory slice republishes only on content change**             | Unit test     |
| 18  | **Zero React commits over 10 s with the panel open, inventory static** | E2E           |
| 19  | Idle CPU within budget with the panel open                             | Measured      |
| 20  | Determinism holds with container operations                            | Property test |

**Criterion 4 is the product rule.** Discarding a harvest because a container was full — while the player is away — is exactly the punish-absence failure `VISION.md` §2.2 forbids. A blocked harvest costs time; a discarded one costs trust.

**Criterion 9 is ADR-011's load-bearing invariant.** Total quantity is conserved across every transfer; only declared sources and sinks change it. This is the single most valuable resource test.

**Criterion 14** extends phase-04's no-jam guarantee to a new failure surface: full storage is the most likely new cause of a stuck worker.

**Criterion 18** is where ADR-005's throttled bridge gets its first real test — this is the first substantial panel.

---

## Testing Checklist

### Automated

- [ ] Container add: empty, partial stack, new stack, exact fill, overflow
- [ ] Container add to a full container returns a clear failure and changes nothing
- [ ] Container remove: partial, exact, more than held, from empty
- [ ] Transfer: full move, partial move (dest nearly full), rejected move (dest full)
- [ ] **Property: total quantity conserved across arbitrary transfer sequences** (crit 9)
- [ ] Capacity: base, with 1 shed, with 3 sheds; removing a shed over the new limit **keeps items, logs the anomaly**
- [ ] Stack limit boundary at exactly the definition's size and one over
- [ ] Harvest into a full container blocks and preserves the crop
- [ ] Building placement: valid, unowned, unwalkable, occupied, out of bounds
- [ ] Pathing: repath when a building blocks a route
- [ ] Worker deposit: nearest selection, no-shed fallback, full-storage handling
- [ ] Slice: republishes on change only (17)
- [ ] Panel: renders stacks, capacity, empty state; re-renders only on slice change
- [ ] Property: determinism with random container operations
- [ ] E2E: harvest → item appears → panel shows it
- [ ] E2E: fill container → harvest blocked → clear message

### Manual

- [ ] Fill inventory by playing; confirm the block is understandable, not frustrating
- [ ] Place sheds; confirm workers use them sensibly
- [ ] Open and close the panel repeatedly; confirm no focus loss
- [ ] Measure CPU with the panel open

---

## Future Dependencies

| Deliverable           | Depended on by                                                             |
| --------------------- | -------------------------------------------------------------------------- |
| `Container` primitive | 06 (storage, market stall), 07 (serialization), v0.4 (logistics, crafting) |
| Item registry         | 06 (selling, prices), v0.4 (crafting recipes)                              |
| Transfer command      | 06 (auto-sell, buy), v0.4 (routing)                                        |
| Building model        | 06 (three more buildings), v0.4 (factories)                                |
| Placement validation  | 06, v0.3 (town), v0.4                                                      |
| Deposit task          | 06 (Market Stall auto-sell), v0.4 (routing)                                |
| Capacity constraint   | 07 — bounds worker catch-up (`SAVE_FORMAT.md` §6.4)                        |
| Panel pattern         | 06 (shop, workers), all later UI                                           |

---

## Notes

**Build the `Container` primitive first, then its owners.** ADR-011 is the whole point: the same type backs the player inventory, the worker hold, and the storage shed. A one-off inventory here would be re-generalized in phase-06 and again in v0.4. The conservation property test (crit 9) is the proof the primitive is right.

**Capacity is the first system where absence has a cost.** Keep that cost honest: time, never goods. The blocked-harvest event exists so phase-07's return summary can tell the player _why_ progress stopped — turning dead time into a legible reason to build storage.

This is the first substantial React panel. Get the slice subscription right here, because phases 06 and beyond copy this pattern.
