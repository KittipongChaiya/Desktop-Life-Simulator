# SAVE_FORMAT

> **Status:** Authoritative for the save schema, migrations, and offline progress.
> **Owns:** Save document structure, versioning, migration rules, serialization rules, offline catch-up contracts.
> **Does not own:** Why JSON and why a linear chain (`decisions/ADR-002-save-system.md`); the versioning, compatibility, and migration **contract** — save identity, version separation, the compatibility matrix, migration governance, failure policy (`decisions/ADR-015-save-format-versioning-and-migration.md`).

**The save file is the product.** A player who loses a save has lost everything the game is for. Every rule here exists to prevent that, and none of them may be relaxed for convenience (`AI_RULES.md` §1.4).

---

## 1. Location

```
%APPDATA%/desktop-life-simulator/saves/
├── slot-0.json           Current save
├── slot-0.json.bak       Previous good save
├── slot-0.json.tmp       Transient — exists only mid-write
└── backups/
    ├── slot-0-<tick>.json    Three most recent autosaves, oldest pruned
    └── …
```

Obtained via `app.getPath('userData')` — never hardcoded (`PROJECT_STRUCTURE.md` §7).

v0.1 uses a single slot (`slot-0`). The path shape supports multiple slots without a schema change.

---

## 2. Document Structure

`schemaVersion` is the **first key in the file**, so a truncated or corrupt document can still be identified and routed to the right migration or error. The `magic` identity constant sits directly after it (ADR-015 §1) — both are readable in the first ~60 bytes of any file.

```jsonc
{
  "schemaVersion": 1,
  "magic": "desktop-life-simulator/save",

  "meta": {
    "gameVersion": "0.1.0", // informational only — never drives logic
    "createdAtUnixMs": 1753000000000, // world creation — set once, preserved forever
    "savedAtUnixMs": 1753084800000,
    "playtimeTicks": 1440000,
    "saveCount": 87,
  },

  "world": {
    "seed": 1234567890,
    "tick": 1440000,
    "rngState": [1234567890, 987654321, 55555, 12345],

    "grid": {
      "width": 64,
      "height": 64,
      "kind": "<base64 Uint8Array,  4096 bytes>",
      "owned": "<base64 bitfield,    512 bytes>",
      "tilledAt": "<base64 Uint32Array LE, 16384 bytes>",
      "moisture": "<base64 Uint8Array,  4096 bytes>",
      // `blocked` is deliberately absent — derived from buildings (§2.2)
    },

    "crops": [{ "tile": 4172, "cropId": "core:wheat", "plantedTick": 1438800 }],

    "workers": [
      {
        "id": 1,
        "position": 1952, // a TileIndex — every spatial reference is one
        "state": "moving",
        "task": { "kind": "harvest", "tile": 4172 }, // + "cropId" on a seed-bin Plant
        "path": [4108, 4140, 4172],
        "pathCursor": 1,
        "actionProgress": 0,
        "energy": 74,
        "energyTimer": 12, // sub-period accumulator — determinism state
        "carrying": [{ "item": "core:wheat", "qty": 6 }],
        "replanTick": 1439980, // idle re-plan cadence — determinism state
      },
    ],

    "buildings": [{ "id": 1, "tile": 2050, "buildingId": "core:storage_shed" }],

    "buildingStorage": [{ "building": 1, "stacks": [{ "item": "core:wheat", "qty": 43 }] }],

    "inventory": [{ "item": "core:wheat", "qty": 43 }],

    "wallet": { "coins": 1240 },

    "economy": {
      "multipliers": [{ "item": "core:wheat", "multiplier": 0.84 }],
      "expansionsPurchased": 2,
    },

    "cropStats": { "planted": 3180, "harvested": 3122, "lastActivityTick": 1439990 },

    "lastPlanted": [{ "tile": 4172, "cropId": "core:wheat" }],

    "ids": { "worker": 4, "building": 2 },
  },

  "quarantine": {
    // Not-active world data — §5.3. Present-and-empty from version 1, the
    // `plugins: {}` reasoning: the first quarantined mod entity needs no
    // migration.
    "crops": [],
    "buildings": [], // [{ building, stacks }] — a building and its storage, kept together
    "stacks": [], // [{ owner: "inventory" | "worker:<id>" | "building:<id>", stack }]
    "lastPlanted": [],
  },

  "plugins": {},
}
```

Finalized in phase-07a against the shipped `World`, exactly as `src/persistence/schema.ts` types it — the two are the same shape by definition, and §9's checklist keeps them that way. The authoritative-state set behind every field is enumerated in ADR-015 §6.

### 2.1 Field rules

| Rule                                                | Reason                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` is first                            | Identifiable in a corrupt file                                                                               |
| `magic` is second, and constant forever             | The format's identity (ADR-015 §1); a file without it is not a save                                          |
| `meta.gameVersion` never drives logic               | Only `schemaVersion` controls migration; version strings drift and get reused (ADR-015 §2)                   |
| `meta.createdAtUnixMs` is written once              | World creation time — preserved verbatim by every save and every migration                                   |
| `rngState` is saved, not just `seed`                | Determinism must resume mid-stream, not restart (ADR-007)                                                    |
| Grid arrays are base64 typed arrays                 | A 4,096-element JSON number array is ~8× larger and slower to parse; 32-bit words are explicit little-endian |
| Sparse stores serialize as arrays of records        | Maps are not JSON-native; arrays preserve order deterministically                                            |
| Entity IDs are plain numbers in the save            | Branded types (`CODE_STYLE.md` §1.4) are compile-time only                                                   |
| Container capacities are **not** persisted          | Constants and definitions own them — a rebalance reaches old saves without a migration (ADR-004 §5)          |
| Container stack **order** is preserved verbatim     | Partial-stack top-up order is behavior — order is state, not presentation                                    |
| `ids` — the allocator counters, persisted verbatim  | `max + 1` reconstruction reissues freed IDs and breaks continue-identically (ADR-015 §6)                     |
| Content is referenced by `ContentId`, never inlined | ADR-004 §5 — rebalancing must not require a migration                                                        |

### 2.2 Never persisted

Derived or reconstructible state is **recomputed on load**, never stored:

- Crop `stage` — derived from `growth` and the definition
- Pathfinding caches, spatial indexes
- Snapshot slices, render state, Pixi objects
- Task queues that can be rebuilt from world state
- Anything in `settings.json` (UI preferences — not game state)

Persisting derived state creates a second source of truth that can disagree with the first after a migration. This is a common and hard-to-diagnose save bug.

---

## 3. Serialization Rules

### 3.1 Explicit, by hand, always

Every persisted field is written by a hand-authored `toSave` / `fromSave` pair in `src/persistence/`.

**Automatic or reflective serialization of live objects is banned.** It silently persists whatever fields happen to exist, so an internal refactor becomes an accidental schema change with no version bump and no migration. Explicit serialization makes every schema change a deliberate, visible act.

### 3.2 Determinism

Serialization must be **byte-stable**: the same world always produces the same JSON. Object keys are written in a fixed order and collections are sorted by a stable key (tile index, entity ID). This is what makes the round-trip property test in §7 meaningful.

### 3.3 Numbers

Integers only, wherever possible. Coins, ticks, quantities, and positions are integers (`GAME_DESIGN.md` §6.1). The only permitted floats are price multipliers, stored to three decimal places and rounded on write. Floating-point accumulation in a deterministic simulation causes drift that is nearly impossible to debug.

### 3.4 Size

A mature v0.1 farm is roughly **150–400 KB**. Thresholds:

| Size    | Action                                               |
| ------- | ---------------------------------------------------- |
| > 2 MB  | Investigate — likely an unbounded collection         |
| > 5 MB  | Add gzip (`zlib` in main, transparent to the schema) |
| > 25 MB | Reopen ADR-002                                       |

An unbounded collection is the realistic cause of runaway save growth. Any collection that grows with playtime rather than with world size needs a documented bound.

---

## 4. Versioning and Migration

### 4.1 Versioning

`schemaVersion` is a **monotonically increasing integer**, starting at `1`. Not semver — this is a data format version, unrelated to the app version. The three version concepts — save format version, game version, application version — are independent, and their separation (when each changes; only `schemaVersion` ever drives behavior) is ADR-015 §2.

**Bump it whenever the persisted shape changes**: adding, removing, renaming, or retyping a field, changing a collection's encoding, or changing the meaning of an existing value.

Adding a field with a safe default still requires a bump. A save written by the older version lacks the field, and the migration is where that default is applied explicitly rather than implicitly.

**A schema version is immutable from the moment its golden fixture is committed** (ADR-015 §2). Changing the shape again — even inside one unreleased development cycle — means the next version and the next migration.

### 4.2 Migration contract

```ts
export interface Migration {
  readonly from: number;
  readonly to: number; // ALWAYS from + 1
  readonly describe: string;
  migrate(doc: UnknownSave): UnknownSave;
}
```

| Rule                                                                            | Reason                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Linear only** — `to === from + 1`                                             | O(N) paths instead of O(N²); each link independently testable                                       |
| **Pure** — no I/O, no clock, no RNG                                             | Testable in isolation; deterministic                                                                |
| **Non-destructive** — `migrate` returns a new document, never mutates its input | A failed chain must leave the caller holding the untouched original for the error path (ADR-015 §3) |
| **Append-only** — never edit or delete a merged migration                       | Saves in that state exist on real disks; a wrong migration is repaired by a new one after it        |
| **Total** — must handle any valid document at `from`                            | A migration that throws on real data is a lost save                                                 |
| **Ships with a golden fixture**                                                 | The only thing that stops the chain from rotting                                                    |

Migrations register in the ordered array in `src/persistence/migrations/index.ts`; the runner validates the chain at startup — contiguous, gap-free, ending at `CURRENT_SCHEMA_VERSION` — so a malformed chain fails the build, not the player (ADR-015 §3).

**Loading never writes.** A migrated document reaches disk only through the ordinary atomic save (§7.1), so a partial migration can never exist on disk. From the first _real_ migration onward (v0.2 — none can run in v0.1), the pre-migration original is additionally copied to `backups/slot-0-v<N>-premigration.json` — one per schema version, exempt from autosave pruning — so even a wrong-but-well-formed shipped migration destroys nothing (ADR-015 §3).

### 4.3 Load sequence

```
1. Read slot-0.json
   └─ parse fails → read slot-0.json.bak → still fails → clear error, NEVER a new game

2. Read schemaVersion
   ├─ missing/invalid  → corrupt; go to .bak
   ├─ > CURRENT        → REFUSE. "Save from a newer version." Never partially load.
   └─ < CURRENT        → run migrations from → CURRENT, in order

3. Validate structure (§5)
4. Validate semantics (§5)
5. Hydrate World
6. Compute offline catch-up (§6)
7. Present the return summary
```

Step 2's refusal case matters: silently loading a newer save would drop fields the player's later session created, quietly destroying progress.

### 4.4 Golden fixtures

Every schema version keeps a real save in `tests/fixtures/saves/`, committed, and **never edited** (`PROJECT_STRUCTURE.md` §3).

A test asserts each fixture migrates cleanly to the current version and produces a valid world. When a migration breaks an old save, this test fails — which is the entire mechanism preventing v0.1 saves from silently dying somewhere around v0.4.

Editing a fixture to make a test pass defeats the purpose completely. If a fixture no longer migrates, the _migration_ is wrong.

### 4.5 Field-level compatibility

Version-level compatibility (§4.1–4.2) governs whole documents. These rules govern individual fields, and were pinned as tests by the v0.1 compatibility gate (`fix/0.1/7.2.md`):

| Case                 | Behaviour                                                  | Reason                                                                                      |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Missing field**    | Typed structural error → `.bak` fallback. Never a throw    | Validation runs before hydration precisely so a missing field cannot become a crash         |
| **Unknown field**    | Accepted on read, ignored                                  | A reader that rejects fields it does not recognise rejects its own future                   |
| **Additional field** | Accepted on read, **dropped by the next save**             | The writer rebuilds the document from live world state; it emits the fields it knows (§3.1) |
| **Removed field**    | The migration chain's job — nothing to remove at version 1 | §4.2                                                                                        |

**The dropping is deliberate and worth restating**: hand-written serialization is what keeps an internal refactor from becoming a silent schema change, and the price of that is that this build erases what it does not understand. It is not currently reachable in a way that loses player data — a genuinely newer save is refused before it gets here (§4.2), and adding a field without bumping `schemaVersion` is forbidden by ADR-015 §2.

The full statement of what v0.1 guarantees, with the evidence for each claim, is `save-compatibility-report.md`.

---

## 5. Validation

Disk is an untrusted boundary (`AI_RULES.md` §2.4). After migration, before hydration:

### 5.1 Structural

Every field present, correctly typed, within range. A structural failure is unrecoverable — report clearly and fall back to `.bak`.

**Unknown core fields at a known version are ignored and logged, never fatal** — they cannot come from a newer build (shape changes bump the version), so they are hand-editing or a discipline bug. Explicit serialization means they are not written back. Unknown data under `plugins.*` is the opposite case: preserved verbatim (§8). The full compatibility matrix is ADR-015 §4.

### 5.2 Semantic

Checks that the document is internally coherent:

| Check                                    | On failure                                 |
| ---------------------------------------- | ------------------------------------------ |
| Coins ≥ 0                                | Clamp to 0, log                            |
| Crop tile is within the grid             | Drop the crop, log                         |
| Crop references a registered `ContentId` | Quarantine (§5.3)                          |
| Worker position is within the grid       | Reset to plot center, log                  |
| Worker task references an existing tile  | Clear task → `IDLE`, log                   |
| Building tile is owned and walkable      | Keep the building, log the anomaly         |
| Inventory total ≤ slot capacity          | Keep items, log; never delete player goods |
| Entity IDs are unique                    | Reassign duplicates, log                   |

**Principle: repair where unambiguous, drop where meaningless, never delete player value.** An over-capacity inventory keeps its items and logs the anomaly — deleting the player's goods to satisfy an invariant is worse than the invariant being violated.

Every repair is logged. A save requiring repairs is a defect worth investigating, not a routine event.

### 5.3 Unknown content IDs

A save may reference content that no longer exists — an uninstalled plugin, or removed core content.

Unknown-content entities are **quarantined, not deleted**: removed from the active world, preserved verbatim in the save document, and restored if the content returns. Uninstalling a mod to try something else must not destroy the farm built with it.

The mechanism (phase-07b): the document's top-level `quarantine` section (§2) is the home — crops, buildings (with their storage containers, kept together), owner-tagged item stacks (`inventory` / `worker:<id>` / `building:<id>`), and seed-bin memory. The quarantine is **session state owned by the persistence orchestration, never a field on `World`** — the sim must not learn saves exist — and it is written back on every save until its content returns. The same repair pass restores: a held entry whose content is registered again moves back the moment it can do so without destroying anything — a crop to its tile if the tile is free, a stack to its owner (or to the inventory when the owner is gone; over-capacity is tolerated and logged, never a reason to delete value), a building to its tile if unoccupied. What cannot be restored safely simply stays held. Unknown-item **price multipliers** deliberately pass through untouched: recovery is pure arithmetic that never dereferences a definition, so quarantining them would add machinery to protect nothing.

---

## 6. Offline Progress

### 6.1 Why it is computed, not simulated

Eight hours at 20 Hz is **576,000 ticks**. Replaying those on load would freeze the app for many seconds — the worst possible first impression for a game whose entire premise is that being away is fine.

Each accruing system therefore implements a closed-form catch-up:

```ts
catchUp(state: SystemState, ticks: number): void
```

### 6.2 Elapsed time

```
elapsedMs    = now - meta.savedAtUnixMs
elapsedTicks = min(floor(elapsedMs / TICK_MS), OFFLINE_CAP_TICKS)
```

`OFFLINE_CAP_TICKS` = 8 hours = 576,000 (`GAME_DESIGN.md` §9.3).

Negative elapsed time (clock moved backwards, timezone change, manual clock edit) is clamped to zero. It is never treated as an error and never rewinds the world.

### 6.3 Per-system contracts

| System        | Method                                                       | Accuracy                  |
| ------------- | ------------------------------------------------------------ | ------------------------- |
| **Growth**    | None needed — derived from `tick − plantedTick` (ADR-009 §2) | **Exact by construction** |
| **Economy**   | Multipliers recover toward 1.0 in closed form, capped        | **Exact**                 |
| **Workers**   | Statistical (§6.4)                                           | **±10%, rounded down**    |
| **Auto-sell** | Applied to catch-up output at recovered prices               | Inherits worker accuracy  |

Growth's row is the payoff of ADR-009: because a crop stores `plantedTick` rather than an accumulator, advancing `world.tick` past the gap _is_ the catch-up — no implementation, no error budget. Moisture-modulated growth (and the moisture catch-up it would need) was deferred with ADR-009's amendment of `GAME_DESIGN.md` §3.4; if it returns (v0.2 weather), it must preserve derivability — a rate history, never an accumulator.

### 6.4 Worker catch-up

Exactly simulating pathing over eight hours is precisely what §6.1 exists to avoid. Instead:

```
1. Sample the task mix at save time (harvest / plant / till proportions)
2. Compute average cycle cost: move + action + energy duty cycle (GAME_DESIGN §4.5)
3. cycles = floor(elapsedTicks / avgCycleTicks) × workerCount
4. Apply cycles against available work, bounded by:
     - tiles available to till
     - seeds in inventory
     - crops that could have matured
     - inventory / storage capacity
5. Round DOWN at every step
```

**Rounding down at every step is a hard requirement.** Returning to find slightly more than expected is a pleasant surprise; finding less than the game implied is a bug report and a trust problem.

Bound 4 is what makes the return summary honest — if storage filled after two hours, catch-up stops there and the summary says so (`GAME_DESIGN.md` §9.4).

### 6.5 Accuracy testing

A property test runs `catchUp(state, n)` against `n` real ticks for n ∈ {100, 1,000, 50,000} across arbitrary worlds and asserts:

- The result is within the documented tolerance
- The catch-up result is **never greater** than the real simulation
- Catch-up completes in under 50 ms for the maximum cap

The second assertion is the important one: it enforces the round-down rule as a testable property rather than a coding convention.

---

## 7. Atomic Writes

### 7.1 Sequence

Performed in the main process only (ADR-003 §3):

```
1. Serialize to a string in memory        ← failure here touches no file
2. Write to slot-0.json.tmp
3. fsync the temp file                    ← durability barrier
4. Rename slot-0.json → slot-0.json.bak   ← previous good save preserved
5. Rename slot-0.json.tmp → slot-0.json   ← atomic on NTFS
6. fsync the containing directory
7. Prune backups/ to the three most recent
```

At no point after step 1 does a single failure leave zero valid saves on disk.

Step 6 is **best-effort on Windows** (phase-07c): directory handles cannot be `fsync`ed there, so the attempt is made and its failure tolerated — NTFS journals rename metadata, which is what makes step 5 atomic in the first place. Recorded here so no future session "fixes" the tolerated failure into a crash.

### 7.2 Autosave triggers

| Trigger                   | Notes                                          |
| ------------------------- | ---------------------------------------------- |
| Every 60 s (1,200 ticks)  | `AUTOSAVE_INTERVAL_TICKS`                      |
| Before quit               | Blocks shutdown until complete                 |
| On window close to tray   |                                                |
| After a major transaction | Worker hire, building purchase, land expansion |
| On manual request         | Settings panel                                 |

Serialization happens off the render path. If a save is already in flight, the next trigger is coalesced rather than queued.

Delivered in phase-07e, recorded so no future session re-derives it:

| Decision                                                                     | Why                                                                                                                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Triggers live in main; the document lives in the renderer**                | The renderer owns the world, so every trigger becomes the one `save:requested` event. Adding a trigger never touches serialization.                            |
| The cadence is a **wall-clock** timer of `AUTOSAVE_INTERVAL_TICKS × TICK_MS` | Main has no tick. Deriving rather than restating "60 s" means the two can never drift.                                                                         |
| **Close to tray = quick hide**                                               | This overlay has no closable window; quick hide is the only state where it stops being present and the tray is the way back.                                   |
| **Coalescing lives only in the renderer**                                    | Only the renderer can see a write in flight. Suppressing in both places would drop the quit save queued behind an autosave — the one save with no next chance. |
| Coalescing keeps **one** follow-up, never zero                               | Collapsed, not dropped: the state that changed after the in-flight write began still reaches disk.                                                             |
| The quit save **blocks shutdown, with a 3 s cap**                            | A wedged renderer may delay quit, never prevent it. The previous good save is already on disk, so the worst case is the last few seconds, not the farm.        |
| A **failed** write settles the quit wait too                                 | Otherwise a full disk becomes a hang.                                                                                                                          |
| Major transactions are detected from the **snapshot**, not commands          | A command can be submitted and rejected; a slice only changes when the world did.                                                                              |

### 7.3 Failure handling

| Failure              | Response                                                             |
| -------------------- | -------------------------------------------------------------------- |
| Disk full            | Notify the player, keep playing, retry at the next autosave          |
| Permission denied    | Notify with the path, keep playing                                   |
| Serialization throws | Log with full context, keep playing, do **not** touch existing files |

**A failed save never crashes the game and never damages the existing save.** The player keeps playing with in-memory state intact, which is the state that matters.

The notification carries the **path** (phase-07e). Only the main process knows it — the renderer never derives a filesystem path (ADR-003 §3) — so it travels on the write's outcome. "Permission denied" is a shrug; the file name is something a player can act on. The notice persists rather than auto-dismissing, and clears itself when a later save succeeds, so a transient failure resolves without anyone clicking. It is shown in work mode too: withholding "your game is not being saved" to keep the desktop quiet would be misleading rather than quiet.

Disk-full is **deliberately not simulated in tests**. ENOSPC arrives from the same `writeSync`/`renameSync` calls the delivered failure tests already make throw — with a directory in the way of the temp file, of `.bak`, and of the saves directory itself — and lands in the same `catch`. Mocking `fs` to produce an ENOSPC would test Node's error plumbing, not ours.

---

## 8. Plugin Save Data

```jsonc
"plugins": {
  "someMod": { "schemaVersion": 3, "data": { /* opaque to core */ } }
}
```

| Rule                                                         | Reason                                              |
| ------------------------------------------------------------ | --------------------------------------------------- |
| Core never reads or migrates plugin `data`                   | Plugins own their own versioning                    |
| Data from an absent plugin is **preserved and written back** | Uninstalling a mod must not destroy its state       |
| Namespace collisions are rejected at load                    | Two plugins claiming one namespace is unrecoverable |
| Plugin data counts toward the size thresholds in §3.4        | A misbehaving plugin cannot silently bloat saves    |

v0.1 always writes `"plugins": {}`. The key exists from version 1 so introducing the v0.2 loader requires no migration.

---

## 9. Changing the Schema — Checklist

Every step, in one commit (`AI_RULES.md` §5.1):

- [ ] Update `SaveDocument` in `src/persistence/schema.ts`
- [ ] Update `serialize.ts` and `deserialize.ts`
- [ ] Increment `CURRENT_SCHEMA_VERSION`
- [ ] Add `migrations/vN-to-vN+1.ts` and register it in the ordered chain
- [ ] Add a golden fixture at the **previous** version
- [ ] Add validation rules for new fields (§5)
- [ ] Add `catchUp` if the new state accrues over time (§6)
- [ ] Update §2 of this document
- [ ] Verify: every existing fixture still migrates to current
- [ ] Verify: the round-trip property test passes

---

## 10. Test Requirements

| Test                | Asserts                                                        |
| ------------------- | -------------------------------------------------------------- |
| Round-trip property | `fromSave(toSave(w))` is identical to `w` for arbitrary worlds |
| Byte-stability      | The same world serializes to identical bytes twice             |
| Golden fixtures     | Every historical version migrates to current and validates     |
| Migration purity    | Migrations produce identical output on repeated runs           |
| Crash safety        | Interrupting §7.1 at each step leaves ≥ 1 loadable save        |
| Corruption recovery | Truncated, empty, and malformed files recover from `.bak`      |
| Forward refusal     | A higher `schemaVersion` is refused, never partially loaded    |
| Catch-up accuracy   | Within tolerance, never over-credits (§6.5)                    |
| Unknown content     | Quarantined and restored when content returns                  |
| Size guard          | A mature farm stays under 2 MB                                 |
