# Phase 06 — Economy

> **Delivers:** Coins, dynamic pricing, the shop, land expansion, and the three remaining buildings — completing the idle loop.
> **Runnable at completion:** The full v0.1 game. With a Market Stall and Seed Bin, the farm runs and earns entirely unattended. **Stage 4 of the progression arc.**

---

## Delivery status

| Milestone | Scope                                                                                     | Status        |
| --------- | ----------------------------------------------------------------------------------------- | ------------- |
| **06a**   | Wallet, economy state, pricing engine, `economySystem`, base prices finalised             | **Delivered** |
| **06b**   | Seed items, seed consumption on plant, `sellItems` / `buySeeds`, `itemSold`, seed icons   | **Delivered** |
| **06c**   | Three new buildings, costs charged (buildings + hire), `sellBuilding`, building effects   | **Delivered** |
| **06d**   | `expandLand`, progression state, `wallet` + `economy` snapshot slices                     | **Delivered** |
| **06e**   | `ShopPanel`, sell interface, seed selector, coin counter, price indicators, full-loop E2E | **Delivered** |
| **06f**   | The idle proof: 8-hour long-run, balance ordering, 100k-tick determinism, pacing          | **Delivered** |

**Phase 06 is complete.** The full v0.1 game loop runs: the farm earns
entirely unattended with a Market Stall and Seed Bin — stage 4 of the
progression arc, the product thesis verified by test.

## Resolved interpretations

Decisions the deliverables left open, resolved before coding against canon and
ADR-013. Each is the smallest reading that satisfies the written rule; changing
one later is a spec edit, not a refactor surprise.

1. **Batch sale pricing.** Selling n units credits `n × floor(basePrice × multiplier)`
   at the **pre-sale** multiplier, then applies the decay once (§6.2 states the
   price formula and the decay as separate steps; predictable beats marginal).
2. **Seeds are items** — `core:<crop>_seed`, stack 99, consumed 1 per plant
   (`GAME_DESIGN.md` §8.1). Player **and worker** plants draw from the player
   inventory (farm stock); workers make no seed-fetch trips in v0.1.
3. **Seeds are sellable** at `basePrice = seed cost` through the ordinary
   pipeline. Buying stays fixed-price (§3.1); selling at `multiplier ≤ 1.0`
   can never exceed the purchase price, so no loop exists.
4. **"The selected seed" for workers = the worker default crop (turnip).** Tool
   and seed selection are presentation state and may not enter the deterministic
   sim (phase-03.6 rule, ADR-007 §1). The player's own planting carries the
   HUD-selected crop explicitly in the command.
5. **Rest Hut is global-while-placed**: recovery 4/20t whenever at least one
   stands; workers still rest in place. Walking to the hut is v0.2 behaviour.
6. **Market Stall owns a small container** and participates in the ordinary
   deposit-target service; `economySystem` sweeps stall contents each tick,
   selling at `floor(0.9 × salePrice)` with normal multiplier decay.
7. **Selling a storing building requires its container be empty** — refund
   never destroys stored goods (ADR-011 §7, ADR-013 "losses never destroy
   value while absent").
8. **Hiring starts charging** `hireCost(n)` — the §6.4 escalating worker sink,
   validated against the wallet like any purchase.
9. **A new world holds 100 coins and zero seeds.** Buying seeds is the loop's
   entry edge (§ resource flow); the starting capital is the declared source
   that funds it (ADR-013 assumption 2 — verified).

**06a delivered** — the money and pricing core, no commands yet:

- `world/wallet.ts` — coins as a conserved integer resource (ADR-013):
  `addCoins`/`spendCoins` all-or-nothing, typed `InsufficientFunds`, rejects
  fractional/negative amounts. Property tests: always a non-negative integer;
  accepted operations conserve exactly against a ledger.
- `world/economy.ts` — sparse per-item multipliers (absent = 1.0), all writes
  through 3-decimal rounding (`SAVE_FORMAT.md` §3.3); pure
  `salePrice`/`decayedMultiplier`/`recoveredMultiplier` — the batch form equals
  the stepped form, which is what phase-07's catchUp needs.
- `systems/economy.ts` — recovery on `tick % 20 === 0` (never a private
  timer), registered in the reserved `economy` phase. The §6.2 worked example
  passes as a test: a 100-wheat dump lands on exactly 0.80 and recovers in
  800 ticks (ADR-013 validation checkpoint 3).
- `World` gains `wallet` (opens at the declared 100-coin source, §6.4) and
  `economy`. Item base prices finalised to §3.1: 12 / 34 / 80 / 230, pinned by
  test. 599 unit/integration + 12 E2E pass.

**06b delivered** — commerce: money starts moving:

- Seeds are items (`core:<crop>_seed`, §3.1 costs 5/12/25/60 on
  `CropDefinition.seedItem`/`seedCost`), and **planting consumes one** from the
  farm stock — the ADR-013 conversion boundary, enforced in `validatePlant`
  (typed `MissingItem`) for player and worker alike.
- `commands/commerce-commands.ts` — `sellItems` (batch priced at the pre-sale
  multiplier, then one decay; publishes `itemSold`) and `buySeeds` (fixed
  §3.1 price; all-or-nothing against funds AND space). Both registered through
  the ordinary dispatcher; `CommandWorld` gains `wallet` + `economy`.
- Worker task selection gates the plant band on seed availability — no seeds,
  no plant claims; the band reopens the moment seeds arrive (never jams,
  §4.2). "The selected seed" is realised as the worker default crop
  (interpretation 4).
- `itemSold` event carries `{item, quantity, coins, automatic}` — the stall
  sweep (06c) and phase-07's return summary publish/consume the same shape.
- Art: four seed-pouch icons (`item_*_seed`) from the crop-art script — one
  drawstring-pouch silhouette, crop named by seed-accent colour; atlas packs
  87 sprites. The phase-04 long-run test now stocks seeds in setup: seed
  exhaustion is a valid wind-down, workers idle rather than jam.
- **Idle re-plan cadence** (`Worker.replanTick`, 20 ticks): a null work scan
  schedules the next one instead of repeating every tick. Sustained no-work
  became a normal regime with consumable seeds, and per-tick full-farm scans
  from every idle worker drove the 8-hour long-run from ~14 s to 255 s —
  an idle-CPU violation, not just a slow test. One second of bounded
  staleness; derived from `world.tick` only, so determinism and offline
  derivation hold (the field joins the byte-identical comparison).

**06c delivered** — the buildings wave; every §5 and §4.1 sink is real:

- The §5 table completed: `core:rest_hut` (300), `core:seed_bin` (500),
  `core:market_stall` (1,200; a 10-slot pass-through container so it joins the
  ordinary deposit-target service). `placeBuilding` charges; `hireWorker`
  charges `hireCost(n)` — `hireCost(0)` = 150 > the 100-coin start, so the
  §1.1 stage-2 gate is now arithmetic, not scripting.
- `sellBuilding`: refund `floor(cost × 0.5)`, tile unblocked; a storing
  building sells only once empty (interpretation 7 — refunds never destroy
  goods).
- Effects: rest hut → recovery 4/20t global-while-placed; seed bin →
  per-tile `lastPlanted` memory (recorded on every plant), workers replant
  the tile's crop when its seed is in stock, falling back to the default,
  skipping the tile when nothing sowable — never blocks; market stall →
  `economySystem` sweeps stall containers every tick at
  `floor(0.9 × salePrice)` with normal decay, publishing
  `itemSold {automatic: true}`. `WorkerTask` gains `cropId`, chosen at
  selection.
- `grantCoins` — the declared dev-only source (ADR-013), reached via the
  devtools console's reserved `money` command, wired through the ordinary
  player source (no privileged write path). **E2E finding:** `FEATURE_DEBUG`
  is build-time and the E2E bundle in `out/` was STALE — the E2E gate now
  rebuilds with `VITE_FEATURE_DEBUG=true npm run build` first, which also
  un-skipped three render-budget criteria (all pass).
- Art: `seed_bin` (a low open hopper heaped with seed) and `market_stall`
  (the farm's tallest silhouette — Parchment/Straw striped canopy, produce on
  the counter) join the buildings atlas; 89 sprites pack. Four buildings, four
  silhouette classes.

**06d delivered** — land expansion and the snapshot bridge; the sim side of
phase-06 is complete:

- `expandLand` — a bare intent like `hireWorker`: cost derives from
  `expansionsPurchased` (`expansionCost(n) = floor(100 × 1.8^n)`, the §6.3
  table pinned by test), claims the next centered ring (the inner claim is
  idempotent), and stops at the world edge. New tiles arrive grass, therefore
  tillable. The starting 8×8 now comes from the same `plotSizeAfter(0)`
  formula expansions grow — one source of truth.
- `wallet` slice: one number, so the coin readout re-renders alone.
- `economy` slice: every item's live INTEGER price + base price, sorted;
  `expansionsPurchased` + `nextExpansionCost` for the shop. **The crit-16
  gate holds by construction**: the slice speaks in whole coins, never raw
  multipliers — a full 0.80 → 1.00 recovery republishes ≤ 8 times (the
  integer price's distinct values), not 40 (periods), not 800 (ticks);
  pinned by test, plus a 400-tick static-economy zero-republish test.

**06e delivered** — the UI wave; the player can drive the whole economy:

- `ShopPanel` — the §6.4 sinks in §6.4's order: seeds (fixed §3.1 prices
  from the slice; the icon doubles as the SEED SELECTOR feeding the seed
  tool via the new `SeedSelection` presentation store), buildings (the §5
  table from static content data, arming the existing placement flow), and
  land (the §6.3 next cost from the slice). Affordability disables exactly
  what validation would reject — muted, never red.
- The sell interface lives in the inventory panel: each stack row shows its
  live price with a quiet amber ↓ while depressed, and Sell 1 / Sell all
  submit ordinary `sellItems` (the preview is exact — batch pricing means
  quantity × unit is precisely the credit).
- `WorkerPanel` replaces FarmControls: count, hire at its real §4.1 cost
  (disabled when unaffordable — the stage-2 gate made visible), and an
  expandable list of workers with state labels. The build button moved to
  the shop.
- `CoinCounter` in the status bar: React renders it only when the wallet
  slice changes; the count-up is ONE rAF tween writing `textContent` (crit
  18 — never a 20 Hz re-render). The Reward Gold text is the bar's one warm
  accent (R-09).
- All panels verified inside the 220-px expanded overlay (ADR-013
  assumption 4 — no modal; long lists scroll internally). 9 component
  tests; the StatusBar zero-commit test now settles the first-tick slice
  corrections before its baseline. Vitest gains the `@assets` alias so
  component tests can mount atlas-slicing panels.
- `tests/e2e/economy.spec.ts` — the full loop as one continuous session:
  buy seeds → till → plant → console-accelerated growth → harvest → sell
  (coin readout settles on the exact credit) → hire → build (capacity
  0/40 → 0/90) → expand ((0 bought) → (1 bought)).

**06f delivered** — the idle proof (`tests/economy-longrun.test.ts`); the
phase's closing gate:

- **Crit 19, the product thesis:** the stage-4 farm (all four buildings,
  five workers, a deep seed stock — built through the ordinary command
  path) ran 8 simulated hours with zero input: >100 full plant→harvest→
  deposit cycles, >50 automatic stall sales, **>1,000 coins earned
  unattended**, every worker in a valid state, the market inside its
  declared bands throughout. Close the panel and it plays itself — now a
  regression test.
- **Crit 21:** coins/sec strictly increases across the §3.1 table with
  seed costs included; endpoints pinned (turnip 0.156, pumpkin 0.283) so a
  rebalance cannot silently flatten the away-is-optimal curve.
- **Crit 23:** two identical 100k-tick full-economy runs agree
  byte-for-byte — wallet, multipliers, replant memory, crops, stats, RNG.
- **Crit 20 (floor):** a crude greedy bot reaches the stage-4 purse
  (1,700 coins) in **under one simulated hour** of its four-hour budget —
  pacing failures can only be a feel problem, which stays with the manual
  playthrough below. Notable: at farm scale the §6.2 rates equilibrate —
  steady turnip selling decays ~0.17/min against 0.30/min recovery, so
  honest continuous play never craters its own market.
- **Crit 22 (measured):** the perpetually-active farm simulates at
  ~3.5k ticks/s headless ≈ **0.6% of one core at the real 20 Hz** — the
  always-busy worker/stall cycle is comfortably inside the idle budget.
- **Gate-order note for future sessions:** `npm test` includes
  `devtools-excluded-from-production.test.ts`, which runs a REAL production
  build into `out/` — silently replacing the debug bundle Playwright runs.
  The E2E gate order is therefore: unit suite → `VITE_FEATURE_DEBUG=true
npm run build` → `npm run test:e2e`, never concurrent and never reversed
  (this was also the root of 06c's "stale bundle" find).

---

## Objectives

1. Close the economic loop: sell → buy → expand → earn more.
2. Deliver the two buildings that make the game genuinely idle.
3. Implement dynamic pricing — the hook v0.3's town economy extends.
4. Deliver escalating sinks that keep progression from terminating.

### Why this is the last gameplay phase

After this, the game is complete except for persistence. Everything the player needs to reach stage 4 (`GAME_DESIGN.md` §1.1) exists, and the product thesis — _close the panel and it plays itself_ — becomes verifiable.

---

## Deliverables

### Currency

- [x] `src/sim/world/wallet.ts` — **integer coins only** (`GAME_DESIGN.md` §6.1)
- [x] Starting capital: 100 coins
- [x] Add/spend with explicit insufficient-funds failure

### Dynamic pricing

- [x] Per-item `priceMultiplier`, starting 1.0
- [x] Selling n units: `multiplier -= n × 0.002`, floor 0.50
- [x] Recovery: `+0.005` per 20 ticks, cap 1.00
- [x] Sale price: `floor(basePrice × multiplier)`
- [x] `economySystem` in `TICK_SYSTEMS`
- [x] **Multipliers stored to 3 decimal places, rounded on write** (`SAVE_FORMAT.md` §3.3)

### Selling and buying

- [x] `sellItems` intent — validates quantity, credits coins, adjusts the multiplier
- [x] `buySeeds` intent — validates funds and inventory space
- [x] Seed prices per `GAME_DESIGN.md` §3.1 (fixed, not dynamic)
- [x] `itemSold` event emitted

### Buildings

- [x] `core:rest_hut` — 300 coins; worker rest 4/20t instead of 2/20t
- [x] `core:seed_bin` — 500 coins; **workers auto-replant the last crop planted on a tile**
- [x] `core:market_stall` — 1,200 coins; **auto-sells deposited crops at 90% of market price**
- [x] Buildings sellable for 50% of cost
- [x] Purchase validated against coins and placement rules

### Auto-replant (Seed Bin)

- [x] Per-tile `lastPlantedCrop` recorded on plant
- [x] Worker plant task defaults to the tile's last crop when a Seed Bin exists
- [x] Falls back to the selected seed when no record or no seeds
- [x] **Never blocks — a worker with no matching seeds moves to the next task**

### Auto-sell (Market Stall)

- [x] Deposited crops auto-sell at 90% of current price
- [x] Applies the same multiplier decay as manual selling
- [x] `itemSold` emitted so the return summary can report it
- [x] The 10% tax is deliberate (`GAME_DESIGN.md` §5.1) — do not "optimize" it away

### Land expansion

- [x] `expandLand` intent; cost `floor(100 × 1.8^n)`
- [x] Expands the owned plot by one ring
- [x] Newly owned tiles become tillable
- [x] `expansionsPurchased` tracked in progression state

### Snapshot slices

- [x] `wallet` slice — republishes only on coin change
- [x] `economy` slice — prices, throttled; **must not republish every tick as multipliers recover**

### UI

- [x] `ShopPanel` — buy seeds, buy buildings, expand land, with prices and affordability
- [x] Sell interface with quantity selection and a live price preview
- [x] `WorkerPanel` — list, states, hire button with cost
- [x] HUD coin counter with a smooth animated transition (**CSS or one rAF component — never a 20 Hz re-render**)
- [x] Price indicators showing depressed prices

### Art

- [x] `rest_hut`, `seed_bin`, `market_stall` sprites in the `buildings` atlas
- [x] Coin icon; shop UI icons

---

## Out of Scope

- Save/load _(phase-07)_
- Offline progress _(phase-07)_
- NPCs, contracts, or trading partners _(v0.3)_
- Demand curves beyond the multiplier model _(v0.3)_
- Crafting or production chains _(v0.4)_
- Achievements or prestige _(not planned)_
- Configurable worker priorities _(v0.2)_
- More crops or buildings than specified

---

## Acceptance Criteria

| #   | Criterion                                                                             | Verified by    |
| --- | ------------------------------------------------------------------------------------- | -------------- |
| 1   | Selling credits coins at the correct dynamic price                                    | Unit test      |
| 2   | Selling n units drops the multiplier by exactly `n × 0.002`                           | Unit test      |
| 3   | The multiplier floors at 0.50 and never goes lower                                    | Unit test      |
| 4   | The multiplier recovers at 0.005/20t and caps at 1.00                                 | Unit test      |
| 5   | **Coins are always integers — no fractional coins anywhere**                          | Property test  |
| 6   | Buying seeds validates funds and inventory space                                      | Unit test      |
| 7   | Insufficient funds fails cleanly and mutates nothing                                  | Unit test      |
| 8   | Building costs and effects match `GAME_DESIGN.md` §5 exactly                          | Unit test      |
| 9   | Rest Hut doubles rest recovery                                                        | Unit test      |
| 10  | Seed Bin causes workers to auto-replant the tile's last crop                          | E2E            |
| 11  | **Seed Bin with no matching seeds does not jam the worker**                           | Unit test      |
| 12  | Market Stall auto-sells deposits at exactly 90%                                       | Unit test      |
| 13  | Land expansion costs match the escalation formula                                     | Unit test      |
| 14  | Newly expanded tiles are owned and tillable                                           | Unit test      |
| 15  | Selling a building refunds exactly 50%                                                | Unit test      |
| 16  | **The economy slice does not republish every tick during recovery**                   | Unit test      |
| 17  | **Zero React commits over 10 s with a static economy**                                | E2E            |
| 18  | The coin counter animates without re-rendering the tree per frame                     | React Profiler |
| 19  | **Full idle: Market Stall + Seed Bin runs 8 hours unattended, earning coins, no jam** | Long-run test  |
| 20  | **Stage 4 is reachable in under ~4 hours of play**                                    | Playthrough    |
| 21  | Longer crops remain strictly better coins/sec                                         | Balance test   |
| 22  | Idle and active CPU within budget with the full game running                          | Measured       |
| 23  | Determinism holds over 100k ticks with the full economy                               | Property test  |

**Criterion 19 is the product thesis made testable.** If the farm cannot run unattended for 8 hours and earn money, v0.1 has not delivered what it promised.

**Criterion 20 is a design gate, not a code gate.** If stage 4 arrives too late, players never discover the game plays itself. The fix is lowering the Market Stall's cost — not adding content (`GAME_DESIGN.md` §1.1).

**Criterion 21** protects the inversion that makes absence optimal (`GAME_DESIGN.md` §3.2). Any rebalancing must preserve it.

**Criterion 16** is a real trap: price multipliers change every 20 ticks during recovery, and a naive slice would republish constantly, blowing the idle budget.

---

## Testing Checklist

### Automated

- [x] Price: decay per sale, at all quantities
- [x] Price: floor and cap boundaries
- [x] Price: recovery rate and timing
- [x] Price: rounding to 3 decimals is stable across repeated writes
- [x] Sell: correct coins, correct multiplier change, correct inventory removal
- [x] Sell: more than held fails cleanly
- [x] Buy: sufficient funds, insufficient funds, no inventory space
- [x] Each building: cost, effect, placement, sale refund
- [x] Seed Bin: auto-replant with seeds, without seeds, with no record
- [x] Market Stall: 90% rate, multiplier interaction, event emission
- [x] Rest Hut: recovery rate change
- [x] Expansion: cost escalation over 5 purchases
- [x] Expansion: new tiles owned, tillable, correctly bounded
- [x] Slice: wallet republishes on change only
- [x] Slice: economy does not republish during recovery (16)
- [x] Property: coins are always integers (5)
- [x] Property: no sequence of transactions produces negative coins
- [x] Property: determinism with the full economy (23)
- [x] **Long-run: 8 simulated hours fully automated — coins increase, no jam (19)**
- [x] Balance: coins/sec ordering across all four crops (21)
- [x] E2E: full loop — harvest, sell, buy, hire, build, expand

### Manual

- [ ] **Full playthrough to stage 4; record elapsed time (20)**
- [ ] Confirm the progression feels paced, not grindy
- [ ] Confirm the Market Stall purchase feels like a meaningful unlock
- [ ] Verify dynamic pricing is noticeable but not punishing
- [ ] Measure CPU with the full game running

---

## Future Dependencies

| Deliverable        | Depended on by                                        |
| ------------------ | ----------------------------------------------------- |
| Wallet             | 07 (serialization), v0.3 (contracts)                  |
| Price multipliers  | 07 (catch-up recovery), **v0.3 demand curves**        |
| Building set       | 07 (serialization), v0.4 (factories extend the model) |
| Auto-sell          | 07 — offline earnings depend on it                    |
| Auto-replant       | 07 — offline worker catch-up depends on it            |
| Land expansion     | v0.4 (world map extends beyond the plot)              |
| Shop panel pattern | v0.2 (plugin settings), v0.3 (town shops)             |

---

## Notes

**Do not remove the 10% auto-sell tax.** It looks like an inefficiency and is a deliberate design choice (`GAME_DESIGN.md` §5.1): it gives an attentive player a small real edge while leaving the absent player at 90% of optimal — comfortably inside "reward absence."

**Criterion 19 must run accelerated in the headless sim**, not in real time. The simulation is deterministic and headless, so 8 hours of ticks completes in seconds.

Balance numbers live in content definitions (ADR-004 §5). Tuning them is a data change requiring no migration — so tune freely against criterion 20, but never against criterion 21.
