# GAME_DESIGN

> **Status:** Authoritative for v0.1 mechanics and balance.
> **Owns:** Gameplay systems, content tables, numbers, player interaction, UI philosophy.
> **Does not own:** Product intent (`VISION.md`), technical implementation (`ARCHITECTURE.md`).

**All durations are in ticks.** `TICKS_PER_SECOND = 20` (ADR-007). Numbers here are the _initial_ balance; they live in content definitions (ADR-004 §5) and are tunable without code changes or save migrations.

---

## 1. The v0.1 Gameplay Loop

```
    ┌───────────────────────────────────────────────────────┐
    │                                                       │
    ▼                                                       │
  TILL ──► PLANT ──► [grow, offline-safe] ──► HARVEST ──► SELL
    ▲        ▲                                    │          │
    │        │                                    ▼          ▼
    │     BUY SEEDS ◄──────────────────────── INVENTORY   COINS
    │                                                        │
    └──────────── HIRE WORKER / BUILD ◄──────────────────────┘
                        (automates the loop above)
```

### 1.1 The progression arc

v0.1's entire design is a four-stage transition from _playing the loop_ to _owning a machine that plays it for you_.

| Stage             | Player does                                           | Unlocked by   | Roughly       |
| ----------------- | ----------------------------------------------------- | ------------- | ------------- |
| **1. Manual**     | Tills, plants, harvests, sells by hand                | —             | First 10 min  |
| **2. Delegation** | Hires a worker; watches it farm                       | 150 coins     | 10–30 min     |
| **3. Automation** | Buys auto-replant and storage; checks in occasionally | 500–700 coins | 30 min – 3 hr |
| **4. Idle**       | Auto-sell running; returns to collect and expand      | 1,200 coins   | 3 hr+         |

**Stage 2 is the emotional core of v0.1** (`VISION.md` §6.3). Everything before it exists to make it feel earned; everything after it exists to prove the promise was real.

Reaching stage 4 means the player can close the panel and the game genuinely plays itself — which is the product thesis. If playtesting shows stage 4 arriving too late to be discovered, the fix is lowering the market stall's cost, not adding content.

---

## 2. The World

### 2.1 Tile grid

| Property            | Value                                         | Notes                                                                           |
| ------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| World size          | 80 × 64 = 5,120 tiles                         | 64×64 in v0.1–v0.2; the eastern 16×64 band is town land since v0.3 (ADR-030 §1) |
| Farm region         | The western 64 × 64                           | Ownership never leaves it; the shipped world, unmoved (ADR-030 §1)              |
| Tile size           | 32 × 32 logical px                            | ADR-006 §5                                                                      |
| Starting owned plot | 8 × 8 = 64 tiles, centered in the farm region |                                                                                 |
| Expansion           | Ring of tiles around the owned area           | Cost escalates, §6.3; caps at the farm region's 64×64                           |

### 2.2 Tile kinds

| ID            | Walkable | Tillable | Notes                                                              |
| ------------- | -------- | -------- | ------------------------------------------------------------------ |
| `core:grass`  | Yes      | Yes      | Default unowned and owned terrain                                  |
| `core:tilled` | Yes      | —        | Ready to plant; reverts to grass when its crop is harvested (§3.6) |
| `core:water`  | No       | No       | Decoration; blocks pathing                                         |
| `core:stone`  | No       | No       | Decoration; blocks pathing                                         |
| `core:path`   | Yes      | No       | Player-placed; workers move 1.5× faster                            |

Tilled soil reverting to grass is the only decay in v0.1, and it is deliberately gentle: it costs a few seconds of work, never a crop or an item. `VISION.md` §2.2 forbids anything harsher.

**Amended in 07.9.** The trigger is the HARVEST, not an idle timer. The 6,000-idle-tick revert this row specified was never built (`docs/phases/phase-03-farming.md`, acceptance 10) and is not v0.1's: a timer punishes the player who prepared ground and then went away, which is the one thing `VISION.md` §2.2 rules out. Reverting on harvest costs the same few seconds of work and only ever follows a reward. Detail in §3.6.

### 2.3 Per-tile state

```
kind        : TileKind      (Uint8)
owned       : boolean       (bitfield)
tilledAt    : tick          (Uint32, 0 = not tilled)
```

Crops are stored separately, keyed by tile index (ADR-004 §2) — most tiles have no crop, so a sparse store is correct.

### 2.4 The day (v0.2, phase-10)

A day is **24,000 ticks — 20 real minutes** at 20 Hz, and passes through four named phases:

| Phase | Runs from | Length    | Looks like             |
| ----- | --------- | --------- | ---------------------- |
| Dawn  | 0%        | 5 minutes | A warm, light wash     |
| Day   | 25%       | 9 minutes | No tint at all         |
| Dusk  | 70%       | 2 minutes | A deeper orange        |
| Night | 80%       | 4 minutes | A dim blue, never dark |

**Nothing on the FARM depends on the time of day**, and that is a design choice rather than an unfinished one. No crop stops growing at night; no worker refuses to work in the dark. `VISION.md` §2.2 forbids punishing absence, and a night that halted production would punish exactly the player who leaves the game running overnight — the player this product is for.

**Since phase-19 the town does**: residents wake at dawn, spend the day among the village's places, and are indoors by night (ADR-031). This is the tier this paragraph always reserved the behaviour for — and it stays on the town's side of the line: a resident's schedule gates nothing the player earns and nothing a worker does.

Night is a **legible dim, not a dark screen**. A player must be able to see that a crop is ready at 3am without waiting for dawn.

The day's length is fixed when a world is created and never changes for that world: altering it would silently renumber every day the player has already spent (ADR-020 §2).

---

## 3. Crops

### 3.1 The v0.1 crop table

| ID             | Growth             | Seed cost | Sell (base) | Yield | Profit/tile | Coins/sec/tile |
| -------------- | ------------------ | --------- | ----------- | ----- | ----------- | -------------- |
| `core:turnip`  | 1,800 t (90 s)     | 5         | 12          | 1     | 7           | **0.078**      |
| `core:wheat`   | 4,800 t (240 s)    | 12        | 34          | 1     | 22          | **0.092**      |
| `core:carrot`  | 9,600 t (480 s)    | 25        | 80          | 1     | 55          | **0.115**      |
| `core:pumpkin` | 24,000 t (1,200 s) | 60        | 230         | 1     | 170         | **0.142**      |

**Rebalanced in 07.9: every growth time doubled.** At 45 seconds a turnip spent under twelve seconds in each of its four stages — the crop read as a progress bar, and the loop asked for attention faster than an idle game should. The multiplier is UNIFORM by design: coins/sec/tile scales by the same 0.5 for every crop, so the ordering below and the 1.82× spread between the ends of the table are exactly what they were. Prices, seed costs and yields are untouched — this pass moved time, not money.

### 3.1a Seasons (v0.2, phase-11)

Each crop declares the seasons it may be **planted** in. Nothing else about a crop changes with the calendar.

| Crop           | Seasons        | Why                                                              |
| -------------- | -------------- | ---------------------------------------------------------------- |
| `core:turnip`  | **All year**   | The staple, and the crop workers sow by default                  |
| `core:wheat`   | Spring, Summer | The early-game step up from turnips                              |
| `core:carrot`  | Summer, Autumn | Mid-game, overlapping wheat on one side and pumpkin on the other |
| `core:pumpkin` | Autumn, Winter | The best crop in the game, in the half-year that has least else  |

Every season has at least two crops, and **the turnip is available in all four on purpose**. It is the crop workers sow by default, so a season it could not be sown in would leave a farm without a seed bin with nothing to plant for two hours and twenty minutes of real time — a worker idled by the calendar, which ADR-021 §4 forbids outright.

Winter is the leanest season, not a dead one: turnip and pumpkin. Since pumpkin is the best coins/sec in the game, winter is where the patient player does best — the §3.2 curve pointing the same way the calendar does.

**Three rules bound what a season may do** (ADR-021 §2), and they are constitutional rather than tuning:

1. A season gates what may be **planted**. A standing crop always matures — planting in season and returning to a harvest is the promise (§9).
2. Nothing withers, spoils, or is destroyed by a season. Ever.
3. A season may never leave a worker with nothing to do.

The first is the only one a player experiences as a restriction, and it is a restriction on **starting** something, never on keeping it.

### 3.2 Why the curve slopes this way

Longer crops yield strictly better coins-per-second. This is the opposite of most active games and is the single most important balance decision in v0.1: **it makes going away the optimal strategy.**

A player checking in every minute or so is best served by turnips and earns 0.078/tile/sec. A player who plants pumpkins and comes back after lunch earns 0.142 — nearly twice as much for a fraction of the attention. This is `VISION.md` §2.2 expressed as arithmetic.

The counterweight is capital: pumpkin seeds cost 12× turnip seeds, so early players cannot access the efficient crops. Progression is therefore about _affording patience_.

### 3.3 Growth stages

Every crop has four visual stages, mapped to growth fractions:

| Stage     | Fraction    | Sprite     |
| --------- | ----------- | ---------- |
| `seed`    | 0 – 0.25    | `<crop>_0` |
| `sprout`  | 0.25 – 0.55 | `<crop>_1` |
| `growing` | 0.55 – 0.99 | `<crop>_2` |
| `mature`  | 1.0         | `<crop>_3` |

Stage changes are the only thing that dirties the scene for a growing crop (ADR-001 §1) — four redraws over ten minutes rather than continuous animation. This is why growth is staged rather than smoothly scaled.

### 3.4 Crop state

```
cropId      : ContentId
plantedAt   : tick
growth      : ticks accumulated       (Uint32)
stage       : CropStage
```

**AMENDED IN PHASE-03 (ADR-009 §2).** Growth is now DERIVED from `plantedTick`, not accumulated. A crop instance stores `cropId`, `tile`, and `plantedTick` only. The moisture multiplier below is deferred with it. The payoff: offline progress is **exact** — there is no catch-up pass and no error budget.

### 3.5 Moisture

Tiles hold moisture 0–100. Watered tiles grow crops at **1.25×**; dry tiles at **1.0×**. Moisture decays 1 point per 200 ticks (10 s) and is replenished by rain (v0.2) or a player/worker watering action.

**Crops never die from lack of water.** Moisture is a bonus, never a penalty — dry is the baseline, not a failure state.

### 3.6 After the harvest (07.9)

Harvesting takes the crop **and the tilling**. The tile returns to the ground it started as:

```
  grass ──till──► tilled ──plant──► seed ──► sprout ──► growing ──► mature
    ▲                                                                 │
    └─────────────────────────── harvest ◄────────────────────────────┘
```

This is the §1 loop diagram at the scale of one tile, and it is why that diagram always drew the return edge into TILL rather than into PLANT.

Three consequences, all deliberate:

- **The loop has a shape.** A farm at rest is grass. Every planted tile is the result of work someone did, which is what makes a full plot read as an achievement rather than a starting condition.
- **The cost is the gentlest one available.** A till is 30 ticks (§4.3) and it only ever follows a yield. Nothing is lost, nothing decays while the player is away, and nothing can fail.
- **Automation absorbs it.** A worker's priority list already ends in _till_ (§4.4), so the reverted tile is simply the next thing to do; the harvest → till → plant cycle closes with no new behaviour and no new task kind. It costs one more action per cycle, which the offline model charges for (`SAVE_FORMAT.md` §6).

---

## 4. Workers

Workers are the automation layer and v0.1's central unlock.

### 4.1 Cost

```
cost(n) = floor(150 × 1.6^(n-1))
```

| Worker | Cost | Cumulative |
| ------ | ---- | ---------- |
| 1st    | 150  | 150        |
| 2nd    | 240  | 390        |
| 3rd    | 384  | 774        |
| 4th    | 614  | 1,388      |
| 5th    | 983  | 2,371      |

Exponential cost against linear throughput means each worker takes meaningfully longer to afford — which is what keeps the progression loop (`VISION.md` §3.3) supplied with a target.

### 4.2 State machine

```
        ┌──────────────────────────────────────────┐
        ▼                                          │
     ┌──────┐  task available   ┌──────────┐       │
     │ IDLE │──────────────────►│ MOVING   │       │
     └──────┘                   └────┬─────┘       │
        ▲                            │ arrived     │
        │                            ▼             │
        │ energy > 0            ┌──────────┐       │
        │                       │ WORKING  │───────┘  task complete
        │                       └────┬─────┘
        │                            │ energy = 0
     ┌──────┐   arrived at hut  ┌────▼─────┐
     │ REST │◄──────────────────│ SEEKING  │
     └──────┘                   │   REST   │
                                └──────────┘
```

Five states: `IDLE`, `MOVING`, `WORKING`, `SEEKING_REST`, `REST`.

**A worker never deadlocks and never destroys value.** With no task available it returns to `IDLE` and waits. This is a hard requirement (`VISION.md` §2.2) — an idle game whose automation can jam is a game that punishes absence.

### 4.3 Action timings

| Action                       | Ticks | Seconds |
| ---------------------------- | ----- | ------- |
| Move one tile                | 10    | 0.5     |
| Move one tile on `core:path` | 7     | 0.35    |
| Till                         | 30    | 1.5     |
| Plant                        | 20    | 1.0     |
| Water                        | 20    | 1.0     |
| Harvest                      | 30    | 1.5     |
| Deposit to storage           | 20    | 1.0     |

### 4.4 Task priority

Workers select tasks by fixed priority, nearest-first within a priority band:

1. **Harvest** a mature crop — realizing value beats creating it
2. **Plant** on tilled soil, if seeds are available
3. **Till** owned, empty, untilled grass
4. **Water** a planted tile below 40 moisture
5. **Deposit** if carrying ≥ 10 items and storage exists

Priority is a fixed list in v0.1, not player-configurable. Configurable priorities are a v0.2 feature and would be premature here (`AI_RULES.md` §1.5).

Ties break by lowest tile index — never by RNG. Deterministic tie-breaking is required by ADR-007 §Validation.

### 4.5 Energy

| Property                | Value                                      |
| ----------------------- | ------------------------------------------ |
| Maximum                 | 100                                        |
| Consumed                | 1 per 20 ticks while `WORKING` or `MOVING` |
| Recovered               | 2 per 20 ticks while `REST`                |
| Recovered at a Rest Hut | 4 per 20 ticks                             |

A worker at 100 energy works for 100 seconds and rests for 50 — a 2:1 duty cycle, improving to 4:1 with a Rest Hut. This gives the Rest Hut a concrete purpose and makes worker throughput a thing the player can invest in.

Energy never causes failure. A worker with no reachable Rest Hut rests where it stands.

### 4.6 Carrying capacity

A worker carries 20 items. At capacity it deposits to storage, or to the player inventory if no storage building exists.

A worker's hold, the player inventory, and every storage are the same thing — **containers** under one resource model (ADR-011). "Carrying" is a stack in the worker's hold; "depositing" is an explicit transfer of that stack into another container. The resource never moves through the world on its own; the worker carries it and ownership transfers on arrival.

---

## 5. Buildings

| ID                  | Cost  | Effect                                               | Unlocks                       |
| ------------------- | ----- | ---------------------------------------------------- | ----------------------------- |
| `core:storage_shed` | 200   | +50 inventory slots; workers deposit here            | Longer unattended runs        |
| `core:rest_hut`     | 300   | Worker rest at 4/20t instead of 2/20t                | Higher worker throughput      |
| `core:seed_bin`     | 500   | Workers auto-replant the last crop planted on a tile | **Removes manual replanting** |
| `core:market_stall` | 1,200 | Auto-sells deposited crops at 90% of market price    | **Removes manual selling**    |

### 5.1 The 10% auto-sell tax

The market stall sells at 90%, so full automation is _slightly_ worse per-item than selling by hand. This is deliberate: it gives an attentive player a small, real edge without making inattention feel punished. The player who never opens the panel still earns 90% of optimal — well inside "reward absence" (`VISION.md` §2.2), while leaving a reason to check in.

### 5.2 Placement

Buildings occupy one tile, must be on owned walkable land, and block pathing. They can be sold for 50% of cost. No rotation, no multi-tile footprints in v0.1.

Architecturally (ADR-011): a storage building **owns a container** — it is not a special inventory. A placed building marks its tile impassable in the tile-grid walkability model, so pathfinding routes around it without ever inspecting buildings. Workers choose where to deposit through a **storage-target service** (nearest shed with room in v0.1), so worker logic never depends on a building type and future strategies — priority, capacity balancing, filters, logistics — replace the service alone.

---

## 6. Economy

### 6.1 Currency

One currency: **coins**. Integer only — no fractional coins anywhere, which avoids floating-point drift in a deterministic simulation (ADR-007 §7).

### 6.2 Dynamic pricing

Each sellable item has a `basePrice` and a `priceMultiplier` starting at 1.0.

```
On selling n units:   multiplier -= n × 0.002        (floor 0.50)
Every 20 ticks:       multiplier += 0.005            (cap 1.00)
Sale price:           floor(basePrice × multiplier)
```

Dumping 100 wheat drops wheat to 0.80× and takes about 40 seconds to recover. The floor of 0.50 bounds the worst case.

**Purpose:** it rewards crop diversity without any explicit "diversity bonus" mechanic, and it makes the market feel alive at essentially zero implementation cost. It is also the natural hook for v0.3's town and trade systems.

Multipliers are per-item, persisted, and recover during offline time via the economy system's `catchUp` (§9).

### 6.3 Land expansion

```
cost(n) = floor(100 × 1.8^n)     // n = expansions already purchased
```

| Expansion | Cost  | Plot becomes | Tiles |
| --------- | ----- | ------------ | ----- |
| 1st       | 100   | 10 × 10      | 100   |
| 2nd       | 180   | 12 × 12      | 144   |
| 3rd       | 324   | 14 × 14      | 196   |
| 4th       | 583   | 16 × 16      | 256   |
| 5th       | 1,049 | 18 × 18      | 324   |

Land competes with workers for the same coins. Land raises the ceiling; workers raise throughput toward it. Neither is right on its own, which is the strategic content of v0.1.

### 6.4 Sinks and sources

| Sources                     | Sinks                |
| --------------------------- | -------------------- |
| Selling crops               | Seeds (recurring)    |
| Contract deliveries (§6.5)  | Workers (escalating) |
| Starting capital: 100 coins | Buildings (one-time) |
|                             | Land (escalating)    |

Escalating sinks against linear sources is what keeps the progression loop from terminating. There is no prestige or reset in v0.1.

### 6.5 Contracts (v0.3, phase-20 — ADR-032)

The town's notice board posts **2 offers per day**, derived from the seed
(never stored, never rolled): a resident asks for a quantity of an in-season
crop's produce by a deadline. Accepting freezes the deal into the save;
delivering — all-or-nothing, drawn from inventory and sheds exactly as
selling draws — pays the frozen reward.

| Property        | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Offers per day  | 2, refreshed at each day boundary                                   |
| Concurrent held | 3 at most                                                           |
| Reward          | `quantity × floor(basePrice × premium)`, premium ∈ **[1.25, 1.50]** |
| Deadline        | 3 days from the posting day's start                                 |
| Items asked     | Yields of crops plantable in the posting day's season               |
| Expiry          | Silent: the contract leaves and is counted. No fee, no penalty.     |

**The premium band is the second memorizable price rule** (§6.2 gives the
first): a contract always pays more than base — above the spot channel's
ceiling — and never more than half again. That is the whole reason to plant
what the board asks rather than whatever is most efficient per second, which
is `PLAN.md` §4's criterion for this phase. Delivering does **not** depress
the §6.2 multiplier: goods sold to a named neighbour never touched the open
market. (The market's reaction to demand is phase-21.)

Expiring gently is `VISION.md` §2.2 applied: a missed contract is a missed
premium — opportunity, never loss — and a fresh board posts every morning.

---

## 7. Inventory

| Property           | Value                                 |
| ------------------ | ------------------------------------- |
| Base slots         | 40                                    |
| Per storage shed   | +50                                   |
| Stack size         | 99                                    |
| Behavior when full | Harvest is **blocked**, not discarded |

Blocking rather than discarding is deliberate. Losing a harvest to a full inventory while away is exactly the punish-absence failure `VISION.md` §2.2 forbids; a blocked harvest simply waits, and the player loses time rather than goods.

Architecturally, the inventory is a bounded **container** (ADR-011); a harvest that cannot fit is a transfer rejected for lack of space, leaving the crop unharvested rather than discarded. Stacks, capacity, and conservation are the same across worker holds, storage sheds, and the player inventory.

---

## 8. Player Interaction

### 8.1 Direct actions

| Action         | Input                                       | Cost    |
| -------------- | ------------------------------------------- | ------- |
| Till           | Click an owned grass tile with the hoe tool | Instant |
| Plant          | Click tilled soil with a seed selected      | 1 seed  |
| Water          | Click a planted tile with the can tool      | Instant |
| Harvest        | Click a mature crop                         | Instant |
| Place building | Select from shop, click a tile              | Coins   |
| Select worker  | Click a worker                              | —       |
| Pan camera     | Drag, or scroll horizontally                | —       |

Player actions are **instant**; worker actions take time (§4.3). The player is more efficient per action but has finite attention — which is precisely the trade the game is about.

### 8.2 Command model

Every action becomes a Command, accepted or rejected immediately and applied on the next tick boundary (ADR-010). At 20 Hz the worst-case latency is 50 ms — imperceptible — and determinism is preserved.

"Instant" above is about **feedback, not application**. The player learns straight away whether an action was legal, because validation is pure and runs at the moment of the click; the world changes up to one tick later. The two are separable, and separating them is what keeps the outcome independent of where in a frame the click landed.

Workers, automation, and the player all issue the **same** commands through the same path (ADR-010 §6). There is no faster route for any of them — which is what makes the player's efficiency advantage a matter of attention, as §8.1 intends, rather than an artifact of the code.

Failures surface as a brief inline message ("Inventory full", "Not enough coins"). Never a modal dialog (§10).

### 8.3 Keyboard

| Key     | Action                             |
| ------- | ---------------------------------- |
| `1`–`4` | Select tool (hoe, seed, can, hand) |
| `Space` | Collapse / expand overlay          |
| `Esc`   | Close panel, deselect              |
| `Tab`   | Cycle panels                       |

A global hotkey to expand the overlay is a **v0.2** feature — registering system-wide hotkeys risks conflicting with the player's real work, which needs its own design pass.

**AMENDED IN PHASE-01.8 (ADR-014 §5).** The design pass this paragraph asked for happened. v0.1 ships exactly three **global** hotkeys — companion controls that must work while the overlay is not interactive:

| Global key     | Action                    |
| -------------- | ------------------------- |
| `F11`          | Work mode toggle          |
| `F10`          | Quick hide / restore      |
| `Ctrl+Shift+C` | Click-through mode toggle |

In-game keys above stay window-local; a global expand hotkey remains v0.2; adding a fourth global hotkey requires amending ADR-014. Quick hide's key is `F10` by owner rebind — the directive's original `F12` is unregistrable on Windows (ADR-014's second amendment note); the keys are defaults rendered from one bindings table, never identity (ADR-014 §5).

---

## 9. Idle and Offline Mechanics

### 9.1 While running unattended

The simulation runs continuously (ADR-003 §2). Nothing about the game changes when the player looks away — there is no "offline mode" while the app is running.

### 9.2 After a gap

On load, elapsed real time converts to a tick delta, computed closed-form rather than simulated (ADR-002 §6, ADR-007 §6). Per-system contracts:

| System    | Catch-up                                                                                           | Accuracy                            |
| --------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Growth    | None needed — maturity derives from `tick − plantedTick` (ADR-009 §2); advancing the tick is exact | **Exact by construction**           |
| Workers   | Statistical: harvest-and-replant cycles per standing crop, conservatively costed (phase-07d)       | ±10%, deliberately rounded **down** |
| Economy   | Price multipliers recover toward 1.0 in closed form, over the exact period crossings               | Exact                               |
| Auto-sell | Applies to catch-up overflow at prices floored to the worst multiplier the real path could reach   | Inherits worker accuracy            |

_(Amended in phase-07d to match frozen ADR-009: the original moisture-modulated growth rows described the pre-ADR-009 accumulator design; growth is now exact and moisture-modulation is deferred with the §3.4 amendment. Delivered model notes: replanting is credited only through the seed bin's per-tile memory — the bin is what makes unattended replanting reliable, and crediting more would over-credit against the real worker rule; untilled ground is never newly planted; overflow fills worker carry-holds before anything auto-sells.)_

Worker catch-up is approximate because exactly simulating pathing over eight hours is the thing §9 exists to avoid. It rounds down so the player is never _over_-credited — returning to find slightly more than expected is fine; finding less than the game implied is not.

### 9.3 Offline cap

Offline progress is capped at **8 hours** in v0.1. This bounds the accumulated error in worker catch-up and keeps the return summary comprehensible. The cap is a content constant, raisable later.

### 9.4 The return summary

On load after a gap over 60 seconds, a dismissible summary shows time away, crops harvested, coins earned, and anything that blocked progress ("storage full after 2h 14m"). Reporting the blocker is what turns dead time into a legible reason to build more storage.

---

## 10. UI Philosophy

### 10.1 Rules

1. **Never steal focus.** No modals, no dialogs, no auto-opening panels. Failures are inline and transient.
2. **Collapsed is the default state.** The game spends most of its life as a status bar. That view must be genuinely useful: coins, worker count, next harvest.
3. **One click to the common action.** Harvesting, planting, and buying seeds must never be more than one click from the expanded view.
4. **Readable at a glance.** High contrast, large numerals for the three numbers that matter. The player is reading peripherally while doing something else.
5. **No timers counting down.** Progress is shown as a bar or a growth stage, never a ticking clock. Countdowns create urgency, and urgency is exactly what this product must not create.
6. **No red.** Reserved for genuine errors, of which there are almost none. Nothing routine is ever alarming.
7. **Silence is the default.** Sound acknowledges what the player did; it never announces, never loops, and never plays unasked. The game ships muted and work mode silences it outright (ADR-016) — an overlay that makes noise beside real work is the intrusion this product exists not to be. Added in phase-07.5a.
8. **Motion is a reply, not a mood.** Every animation is triggered by something that happened and ends on its own. Nothing sways, pulses, or drifts while the world is at rest, because a companion that moves forever is a background game (ADR-001; phase-07.5's first decision).

### 10.2 Layout

```
┌───────────────────────────────── EXPANDED (220 px) ───────────────────────────────┐
│ ┌─ HUD ────────────────────────────────────────────────────────────────────────┐  │
│ │  ⬤ 1,240 coins   👤 3 workers   🌾 next harvest 0:42        [tools] [▾]      │  │
│ └──────────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ WORLD (PixiJS) ─────────────────────────────┐ ┌─ PANEL (React) ─────────────┐  │
│ │                                              │ │  Inventory / Shop / Workers │  │
│ │        tile grid, crops, workers             │ │                             │  │
│ └──────────────────────────────────────────────┘ └─────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────── COLLAPSED (48 px) ───────────────────────────────┐
│  ⬤ 1,240   👤 3   🌾 0:42                                                   [▴]  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Collapsed mode destroys the Pixi application entirely (ADR-001 §2) — the status bar is plain DOM, so the idle cost approaches the tick alone.

### 10.3 Companion presence states (phase-01.8, ADR-014)

The overlay's presence is a small state model. The simulation runs identically through every row — the companion changes what the player _sees_, never what the world _does_.

| State                              | Window        | Pixi world | HUD / panels         | Opacity                                           |
| ---------------------------------- | ------------- | ---------- | -------------------- | ------------------------------------------------- |
| Expanded                           | shown, 220 px | live       | shown                | player's slider (30–100%)                         |
| Collapsed                          | shown, 48 px  | destroyed  | status bar only      | player's slider                                   |
| **Work mode** (`F11`)              | shown, 220 px | live       | **hidden**           | **25% — a mode constant, below the slider floor** |
| **Hidden** (`F10`)                 | hidden        | live       | —                    | —                                                 |
| **Click-through** (`Ctrl+Shift+C`) | as base state | as base    | visible, mouse-inert | as base state                                     |

Hidden and click-through compose over any base state; work mode is a variant of expanded (it must show the living world). Work mode keeps only world, workers, crops, and buildings; mode toggles confirm with a transient in-overlay toast — never an OS notification (`VISION.md` §5.1). Opacity and work-mode state are application preferences (`settings.json`), never save data; hidden and click-through always reset on launch (ADR-014 §4).

---

## 11. Future Expansion Points

Where each future system attaches. **Designed for, not built** (`VISION.md` §4.2).

| Future system                  | Attaches via                                        | Cost paid in v0.1                              |
| ------------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| Seasons, weather               | Growth-rate modifiers; render layers 4–5            | Moisture already modifies growth; layers exist |
| ~~Day/night~~ **BUILT (v0.2)** | Lighting layer; worker schedules                    | Layer 5 claimed in phase-10c; see §2.4         |
| NPCs (v0.3)                    | Worker state machine generalizes to any actor       | FSM is data-driven, not worker-specific        |
| Town, contracts                | Economy price multipliers become demand curves      | Dynamic pricing already exists                 |
| Trading                        | Item registry + price model                         | Both exist                                     |
| Factory (v0.4)                 | Buildings that consume and produce items            | Building + inventory model supports it         |
| Exploration                    | World grid extends beyond the owned plot            | Grid is already 64× the starting plot          |
| Combat (v1.0)                  | `health` side-table over entity stores (ADR-004 §4) | Composition model supports it                  |
| Mods                           | Content registries + namespaced IDs                 | ADR-003 §6                                     |

**None of these may add v0.1 scope.** Each phase document's _Out of Scope_ section is binding (`AI_RULES.md` §3.2).

---

## 12. Balance Tuning Rules

1. **Numbers live in content definitions, never in code.** Rebalancing is a data change requiring no migration (ADR-004 §5).
2. **Preserve the coins/sec ordering in §3.2.** Longer crops must always be more efficient. Violating this inverts the product thesis.
3. **Keep escalating sinks ahead of linear sources** (§6.4), or progression terminates.
4. **Never introduce a decay that destroys player value.** Tilled soil reverting is the only permitted decay, and it costs seconds of work, not goods.
5. **Test balance changes against the stage table in §1.1.** If stage 4 moves past ~4 hours of play, it will not be discovered.

---

## Game feel (phase-07.7)

What each action gives back. All of it is presentation — none of it changes a
tick, a yield, or a price.

| The player does   | The farm answers                                                                |
| ----------------- | ------------------------------------------------------------------------------- |
| Tills             | dust off the hoe, soil turns brown, a low scrape                                |
| Plants            | the crop presses in from small with an overshoot, soil disturbed, a soft tap    |
| Waits             | the crop swells once and sparkles at each of its four growth stages             |
| Harvests          | the crop lifts and fades, leaves scatter, `+n` rises, a burst on the tile       |
| Sells             | gold bursts at the market stall with `+coins`                                   |
| Watches a worker  | it swings while working, eases into its steps, and hops when it finishes a task |
| Places a building | a confirmation ring, the camera eases to it, and one rattle for the batch       |
| Uses the HUD      | buttons lift on hover and press _below_ resting size                            |

Three rules govern all of it:

- **Nothing is announced that did not happen.** Every effect fires from a
  published event or a settled snapshot, never from an intent, so a rejected
  command is silent.
- **A farm at rest is still.** Finite effects end and stop costing frames.
  Motion that never ends — swaying plants, breathing workers — is off by
  default and stops on its own when nobody is watching.
- **The player can turn any of it off.** Six controls in Settings →
  Accessibility, with Reduced Motion as a master switch that overrides the
  other five without erasing them.
