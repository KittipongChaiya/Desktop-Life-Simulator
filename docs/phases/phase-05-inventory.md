# Phase 05 — Inventory

> **Delivers:** Items, stacks, capacity, and storage buildings.
> **Runnable at completion:** Harvested crops accumulate as stacked items with real capacity limits; workers deposit into storage sheds; the player can view and manage inventory.

---

## Objectives

1. Replace phase-03's placeholder counter with a real item system.
2. Introduce the first capacity constraint — the first thing the player must *manage*.
3. Deliver the first building, establishing the model phase-06 extends.
4. Build the first substantial React panel on the snapshot bridge.

### Why capacity matters here

Capacity is what makes storage worth buying and what makes the return summary meaningful (`GAME_DESIGN.md` §9.4: "storage full after 2h 14m"). It is the first system where the player's *absence* has a cost — but a cost measured in **foregone time, never lost goods** (`VISION.md` §2.2).

---

## Deliverables

### Item system
- [ ] `registerItem` and `ItemDefinition` (id, name, sprite, basePrice, stackSize)
- [ ] Core items registered in `plugins/core/content/items.ts` — one per crop
- [ ] `ItemStack` — `{ item: ContentId, qty: number }`
- [ ] Stack size 99 (`GAME_DESIGN.md` §7)

### Inventory store
- [ ] `src/sim/world/inventory.ts`
- [ ] Slot-based: 40 base slots, +50 per storage shed
- [ ] `add`, `remove`, `has`, `count`, `freeSlots` operations
- [ ] Partial adds when a stack fills, spilling into a new slot
- [ ] **Full inventory blocks harvest; it never discards items** (`GAME_DESIGN.md` §7)

### Storage buildings
- [ ] `registerBuilding` and `BuildingDefinition`
- [ ] `core:storage_shed` — 200 coins, +50 slots (placeable but not purchasable until phase-06)
- [ ] `buildings: Map<BuildingId, Building>` store
- [ ] Buildings occupy one tile, block pathing, require owned walkable land
- [ ] Placement validation with clear failure reasons

### Worker integration
- [ ] Deposit task targets the nearest storage shed
- [ ] Falls back to player inventory when no shed exists
- [ ] **A worker whose deposit target is full does not jam** — it re-evaluates and idles gracefully
- [ ] Deposit priority triggers at ≥ 10 carried items

### Harvest integration
- [ ] Harvest yields go to inventory via the item system
- [ ] Harvest blocked when inventory is full, with a clear reason
- [ ] Blocked harvests emit an event the return summary can report

### Snapshot slice
- [ ] `inventory` slice republishing **only on content change**
- [ ] Slice includes items, capacity, and free slots

### UI
- [ ] `InventoryPanel` — grid of stacks with icons and counts
- [ ] Capacity indicator (used / total)
- [ ] Sortable by name and quantity
- [ ] Empty state
- [ ] Building placement mode with a ghost preview in `worldUi`
- [ ] Panel opens and closes without stealing focus

### Rendering
- [ ] Storage sheds render in the `objects` layer
- [ ] Placement ghost renders in `worldUi`, valid/invalid tinted

### Art
- [ ] Item icons for the four crops (16×16, `ui-world` atlas)
- [ ] `storage_shed` sprite (`buildings` atlas)
- [ ] Placement ghost overlay

---

## Out of Scope

- Coins, selling, buying, or the shop *(phase-06)*
- Other buildings — Rest Hut, Seed Bin, Market Stall *(phase-06)*
- Land expansion *(phase-06)*
- Item quality tiers, durability, or crafting *(v0.4)*
- Drag-and-drop item rearrangement — display and auto-stack only in v0.1
- Item transfer between storage buildings *(v0.4 logistics)*
- Save/load of inventory *(phase-07)*
- Building rotation or multi-tile footprints *(not planned for v0.1)*

---

## Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | Harvested crops appear as inventory items | E2E |
| 2 | Items stack to 99, then spill into a new slot | Unit test |
| 3 | Capacity is 40 base, +50 per shed | Unit test |
| 4 | **A full inventory blocks harvest and destroys nothing** | Unit test |
| 5 | A blocked harvest gives a clear reason | Manual + E2E |
| 6 | Partial add fills the stack and reports the remainder | Unit test |
| 7 | Remove handles partial and full stack removal | Unit test |
| 8 | Removing more than held fails and mutates nothing | Unit test |
| 9 | Storage sheds place only on owned walkable land | Unit test |
| 10 | Placing a shed blocks pathing through its tile | Unit test |
| 11 | A shed placed on a worker's path triggers repathing | Unit test |
| 12 | Workers deposit to the nearest shed | Unit test |
| 13 | Workers deposit to player inventory when no shed exists | Unit test |
| 14 | **A worker facing full storage does not jam** | Unit test |
| 15 | The inventory panel shows correct contents and capacity | E2E |
| 16 | The panel opens without stealing focus | Manual |
| 17 | **The inventory slice republishes only on content change** | Unit test |
| 18 | **Zero React commits over 10 s with the panel open and inventory static** | E2E |
| 19 | Idle CPU within budget with the panel open | Measured |
| 20 | Determinism holds with inventory operations | Property test |

**Criterion 4 is the product rule.** Discarding a harvest because a container was full — while the player is at work — is exactly the punish-absence failure `VISION.md` §2.2 forbids. A blocked harvest costs time; a discarded one costs trust.

**Criterion 14** extends phase-04's no-jam guarantee to a new failure surface. Full storage is the most likely new cause of a stuck worker.

**Criterion 18** is where ADR-005's throttled bridge gets its first real test — this is the first substantial panel.

---

## Testing Checklist

### Automated
- [ ] Add: empty, partial stack, new stack, exact fill, overflow
- [ ] Add: to a full inventory returns a clear failure
- [ ] Remove: partial, exact, more than held, from empty
- [ ] Capacity: base, with 1 shed, with 3 sheds
- [ ] Capacity: removing a shed with items over the new limit — **items are kept, anomaly logged**
- [ ] Stack limit boundary at exactly 99 and 100
- [ ] Harvest into full inventory blocks and preserves the crop
- [ ] Building placement: valid, unowned, unwalkable, occupied, out of bounds
- [ ] Pathing: repath when a building blocks a route
- [ ] Worker deposit: nearest selection, no-shed fallback, full-storage handling
- [ ] Slice: republishes on change only (17)
- [ ] Panel: renders stacks, capacity, empty state
- [ ] Panel: re-renders only when the inventory slice changes
- [ ] Property: determinism with random inventory operations
- [ ] Property: total item count is conserved across add/remove sequences
- [ ] E2E: harvest → item appears → panel shows it
- [ ] E2E: fill inventory → harvest blocked → clear message

### Manual
- [ ] Fill inventory by playing; confirm the block is understandable, not frustrating
- [ ] Place sheds; confirm workers use them sensibly
- [ ] Open and close the panel repeatedly; confirm no focus loss
- [ ] Measure CPU with the panel open

---

## Future Dependencies

| Deliverable | Depended on by |
|---|---|
| Item registry | 06 (selling, prices), v0.4 (crafting recipes) |
| Inventory store | 06 (auto-sell), 07 (serialization), v0.4 (logistics) |
| Building model | 06 (three more buildings), v0.4 (factories) |
| Placement validation | 06, v0.3 (town), v0.4 |
| Deposit task | 06 (Market Stall auto-sell), v0.4 (routing) |
| Capacity constraint | 07 — bounds worker catch-up (`SAVE_FORMAT.md` §6.4) |
| Panel pattern | 06 (shop, workers), all later UI |

---

## Notes

**Capacity is the first system where the player's absence has a cost.** Keep that cost honest: time, never goods. The blocked-harvest event exists so phase-07's return summary can tell the player *why* progress stopped — which turns dead time into a legible reason to build storage.

This is the first substantial React panel. Get the slice subscription right here, because phases 06 and beyond copy this pattern.
