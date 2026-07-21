# Phase 03 — Farming

> **Delivers:** The manual gameplay loop — till, plant, water, harvest — and the content registry system.
> **Runnable at completion:** A player can till soil, plant seeds, watch crops grow through four stages, and harvest them. Stage 1 of the progression arc is playable.

---

## Objectives

1. Deliver the manual loop that everything after this automates.
2. **Build the content registry system** — the extension point mod support depends on (ADR-003 §6).
3. Establish `plugins/core/` registering through the public plugin API.
4. Implement growth as the first real simulation system.

### Why registries land here

This is the first phase that defines content, so it is the last cheap moment to establish namespaced IDs and registries. Retrofitting them after crops exist means breaking permanent identifiers (`AI_RULES.md` §1.4), and hardcoding content into systems now would silently foreclose mod support.

---

## Deliverables

### Content registry system

- [ ] `src/sim/content/registry.ts` — generic typed registry primitive
- [ ] `registerCrop`, `registerItem`, `registerTileKind` with `CropDefinition` etc.
- [ ] **Namespaced IDs** (`core:wheat`) validated at registration (`ContentId` brand)
- [ ] Duplicate-ID registration rejected with a clear error
- [ ] Unknown-ID lookup returns an explicit error, never `undefined`

### plugins/core

- [ ] `plugins/core/manifest.json`
- [ ] `plugins/core/index.ts` exporting a `register()` entry point
- [ ] `plugins/core/content/crops.ts` — the four v0.1 crops (`GAME_DESIGN.md` §3.1)
- [ ] `plugins/core/content/tile-kinds.ts` — including `core:tilled` and `core:path`
- [ ] `plugins/README.md` documenting the plugin API surface
- [ ] **Statically imported by the sim bootstrap** — no loader (ADR-003 §6)

### Crop system

- [ ] `src/sim/world/crop.ts` — `Crop` record (ADR-004 §1)
- [ ] `crops: Map<TileIndex, Crop>` sparse store
- [ ] `growthSystem` — accumulates `growth`, applies the moisture rate, advances `stage`
- [ ] Four growth stages at the fractions in `GAME_DESIGN.md` §3.3
- [ ] **`growth` accumulates; `stage` is derived and never persisted** (`SAVE_FORMAT.md` §2.2)
- [ ] Inserted into `TICK_SYSTEMS` **before** `harvestSystem`

### Tile actions

- [ ] `core:tilled` tile kind; tilling converts owned grass
- [ ] Tilled soil reverts to grass after 6,000 idle ticks — the only decay in v0.1
- [ ] Moisture: 0–100, decays 1 per 200 ticks, 1.25× growth when watered
- [ ] **Crops never die from lack of water** (`GAME_DESIGN.md` §3.5)

### Intents

- [ ] `till`, `plant`, `water`, `harvest` intents
- [ ] `intentSystem` validating each and returning a `Result`
- [ ] Validation: tile owned, correct kind, seed available, crop mature
- [ ] Failures leave state **completely untouched**
- [ ] `intentSystem` runs **first** in `TICK_SYSTEMS` (ADR-007 §4)

### Event bus

- [ ] `src/sim/events/` — typed bus, queued during the tick
- [ ] `eventFlushSystem` in `TICK_SYSTEMS`, before `snapshotSystem`
- [ ] Events are **queued during the tick and flushed once**, never dispatched
      mid-system — a listener mutating state another system is iterating is the
      failure this ordering prevents (`ARCHITECTURE.md` §3.5)
- [ ] First real flow: `cropHarvested` produced by `harvestSystem`
- [ ] Deferred here from phase-01.6 deliberately: the bus needs a real producer
      and consumer to be designed against
      (`docs/phases/phase-01.6-hardening.md` §3)

### Harvest

- [ ] `harvestSystem` — removes the crop, credits yield
- [ ] Runs **after** `growthSystem`, so a crop maturing on tick N is harvestable on tick N
- [ ] Emits `cropHarvested` on the event bus

### Rendering

- [ ] Crops render in the `objects` layer, y-sorted
- [ ] Stage change is the only thing dirtying a growing crop — four redraws over ten minutes
- [ ] Tilled and watered soil render in `terrainOverlay`
- [ ] Click-to-tile using the phase-02 coordinate conversion

### UI

- [ ] Tool selection (hoe, seed, can, hand) via keys `1`–`4`
- [ ] Selected-seed indicator
- [ ] Hover highlight in `worldUi`
- [ ] Inline transient failure messages — **never a modal** (`GAME_DESIGN.md` §10.1)

### Art

- [ ] Four stages × four crops = 16 sprites, in the `crops` atlas
- [ ] Tilled and watered soil in `terrain`
- [ ] Tool cursors in `ui-world`

---

## Out of Scope

- Workers or automation _(phase-04)_
- Inventory storage or capacity — harvested items go to a simple counter _(phase-05)_
- Coins, selling, or the shop _(phase-06)_
- Buildings _(phase-06)_
- Save/load _(phase-07)_
- Seasons or weather affecting growth _(v0.2)_
- Crop quality tiers, fertilizer, or crop diseases _(not planned for v0.1)_
- Land expansion _(phase-06)_

---

## Acceptance Criteria

| #   | Criterion                                                      | Verified by        |
| --- | -------------------------------------------------------------- | ------------------ |
| 1   | Clicking owned grass with the hoe tills it                     | Manual + E2E       |
| 2   | Planting on tilled soil creates a crop                         | E2E                |
| 3   | Planting on untilled soil fails and changes nothing            | Unit test          |
| 4   | Crops advance through all four stages at the table rate        | Unit test          |
| 5   | **A crop maturing on tick N is harvestable on tick N**         | Unit test          |
| 6   | Harvesting removes the crop and credits the yield              | Unit test          |
| 7   | Watering sets moisture to 100 and raises growth to 1.25×       | Unit test          |
| 8   | Moisture decays at 1 per 200 ticks, clamped at 0               | Unit test          |
| 9   | **A crop at 0 moisture still grows and never dies**            | Unit test          |
| 10  | Tilled soil reverts to grass after 6,000 idle ticks            | Unit test          |
| 11  | Tilled soil with a crop **never** reverts                      | Unit test          |
| 12  | All four crops match the `GAME_DESIGN.md` §3.1 table exactly   | Unit test          |
| 13  | Duplicate content-ID registration is rejected                  | Unit test          |
| 14  | Unknown content ID returns an explicit error                   | Unit test          |
| 15  | **No system contains a `switch` on a crop ID**                 | Code review + grep |
| 16  | Core content registers through the public plugin API           | Code review        |
| 17  | A growing crop dirties the scene exactly 4 times over its life | Unit test          |
| 18  | Idle CPU stays within budget with 200 crops growing            | Measured           |
| 19  | Invalid intents leave state byte-identical                     | Property test      |
| 20  | Determinism holds: same seed + intents → identical state       | Property test      |

**Criterion 15 is the one that silently breaks mod support.** A `switch (cropId)` anywhere in a system means a plugin-added crop will not work, and the failure will not surface until v0.2. Grep for it explicitly.

**Criterion 17** confirms staged growth is not accidentally continuous — 200 crops each dirtying every tick would blow the idle budget (criterion 18).

---

## Testing Checklist

### Automated

- [ ] Every crop: full growth cycle timing
- [ ] Growth: moisture multiplier applied correctly
- [ ] Growth: stage boundaries at exact fractions
- [ ] Ordering: growth-before-harvest (5)
- [ ] Ordering: intent-first — an action lands on the tick it was issued
- [ ] Each intent: valid path succeeds
- [ ] Each intent: every invalid path fails cleanly and mutates nothing
- [ ] Moisture: decay, clamping, watering
- [ ] Tilled reversion: with and without a crop
- [ ] Registry: register, look up, duplicate, unknown
- [ ] Registry: `ContentId` format validation rejects unnamespaced IDs
- [ ] Events: `cropHarvested` emitted with correct payload
- [ ] Events: emitted during the tick, flushed by `eventFlushSystem`
- [ ] Property: determinism over 100k ticks with random valid intents
- [ ] Property: invalid intents never mutate state
- [ ] E2E: full manual loop — till, plant, wait, harvest

### Manual

- [ ] Play the loop for 15 minutes; confirm it is satisfying, not tedious
- [ ] Verify stage art reads clearly at 220 px overlay height
- [ ] Confirm failure messages are informative and non-intrusive
- [ ] Measure idle CPU with 200 crops growing

---

## Future Dependencies

| Deliverable            | Depended on by                                          |
| ---------------------- | ------------------------------------------------------- |
| Content registries     | 05 (items), 06 (buildings), **v0.2 plugin loader**      |
| Namespaced IDs         | 07 (save references), v0.2 (mods)                       |
| `plugins/core` pattern | v0.2 — proves the API before third parties depend on it |
| Crop store + growth    | 04 (harvest tasks), 06 (auto-replant), 07 (catch-up)    |
| Moisture               | 04 (watering tasks), v0.2 (rain)                        |
| Intent validation      | 04, 05, 06 — every action extends this                  |
| Event bus usage        | 06 (auto-sell), v0.2 (plugin hooks)                     |
| Tile actions           | 04 — workers perform the same actions                   |

---

## Notes

**The registry is the deliverable that outlives this phase.** Crops are content; the registry is architecture. If time pressure appears, cut a crop — never cut the registry.

Write growth logic without touching moisture first, then layer moisture on. Two independently tested behaviors are easier to debug than one combined one.

**Watch criterion 15 during implementation, not review.** A `switch` on crop ID is the natural first thing to write and the hardest thing to notice later.
