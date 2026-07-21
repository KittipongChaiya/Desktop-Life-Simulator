# ADR-002: Versioned JSON Saves with a Linear Migration Chain

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-21 |
| **Deciders** | Project owner, lead architect |
| **Supersedes** | — |
| **Superseded by** | — |

---

## Context

This is an idle game the player is expected to return to for months. The save file *is* the product from the player's perspective — losing it destroys everything the game is for. Two properties dominate every other consideration:

1. **A save must never be lost or corrupted**, including on power loss, crash-during-write, or disk-full.
2. **A save written by v0.1 must still load in v1.0**, across every intervening schema change.

Property 2 is unusually demanding here. `VISION.md` §4 commits to adding NPCs, factories, combat, and mods — every one of which changes the persisted shape. A save system that makes migration painful will, in practice, cause a future session to break compatibility "just this once," which violates `AI_RULES.md` §1.4.

Contributing factors:

- The world is small. A mature v0.1 farm is a few thousand tiles, tens of entities, and an inventory — on the order of **100–500 KB** as JSON, comfortably under a megabyte. It fits in memory many times over.
- The simulation is deterministic and fully described by its state (ADR-004, ADR-007). There is no hidden state in the renderer or UI to capture.
- Saves must also carry data owned by plugins that may not be installed on the next load (ADR-003 §Plugins).

---

## Decision

**Saves are a single versioned JSON document, written atomically, and upgraded through a linear chain of pure migration functions.**

### 1. Format

One JSON file per save slot. `schemaVersion` is a monotonically increasing integer starting at `1`, and it is the **first key in the document** so a truncated or corrupt file can still be identified.

```jsonc
{
  "schemaVersion": 1,
  "meta": {
    "gameVersion": "0.1.0",
    "savedAtUnixMs": 1753084800000,
    "playtimeTicks": 1440000,
    "lastTick": 1440000
  },
  "world": { "seed": 1234567890, "tick": 1440000, /* ... */ },
  "plugins": {}
}
```

Full field-by-field specification: `SAVE_FORMAT.md`.

**JSON, not a binary format,** because at this size the space saving is irrelevant while the debuggability is decisive: a player can send a save file, an AI session can read it directly, and a corrupted one can be inspected by hand. This is revisited only if save size exceeds ~5 MB (`SAVE_FORMAT.md` §Compression).

### 2. Atomic writes

Losing a save to a crash mid-write is unacceptable and entirely preventable:

```
1. Serialize to a string in memory (fail here → nothing on disk was touched)
2. Write to  save-N.json.tmp
3. fsync the temp file                    ← durability barrier
4. Rename  save-N.json → save-N.bak       ← previous good save preserved
5. Rename  save-N.json.tmp → save-N.json  ← atomic on NTFS
6. fsync the containing directory
```

At no point does a single failure leave zero valid saves on disk. On load, a failed parse of `save-N.json` automatically falls back to `save-N.bak` and reports it to the player rather than starting a new game silently.

**Rotating backups:** in addition to `.bak`, the three most recent autosaves are retained. Cheap insurance against corruption that is only noticed later.

### 3. Migrations

A migration is a **pure function from version N to version N+1**:

```ts
export interface Migration {
  readonly from: number;
  readonly to: number;                       // always from + 1
  readonly describe: string;
  migrate(doc: UnknownSave): UnknownSave;
}
```

Rules, binding on every future session:

- **Linear and sequential.** Loading v1 in a v7 app runs migrations 1→2→3→4→5→6→7 in order. No version-skipping shortcuts — they are where migration bugs live.
- **Pure.** No I/O, no clock, no RNG. Testable in isolation.
- **Append-only.** A merged migration is never edited or deleted, because saves in that state exist in the wild. Fixing a bad migration means adding a new one after it.
- **Every migration ships with a golden fixture** — a real save at version N committed to the repo — and a test asserting it upgrades to a valid current save. This is what keeps the chain from rotting.
- **Forward-incompatible saves are refused, not guessed at.** A save with a `schemaVersion` higher than the app's is reported clearly and never partially loaded.

### 4. Validation on load

The renderer and disk are both untrusted boundaries (`AI_RULES.md` §2.4). After migration, the document is validated against the current schema *before* being handed to the simulation. A structurally valid but semantically impossible save (negative coins, a crop on a nonexistent tile) is repaired where repair is unambiguous and rejected where it is not — each repair is logged.

### 5. Plugin data is namespaced and preserved

```jsonc
"plugins": {
  "someMod": { "schemaVersion": 3, "data": { /* opaque to core */ } }
}
```

If a plugin is absent on load, **its data is preserved untouched and written back on the next save.** Uninstalling a mod temporarily must never destroy its data. Core never inspects or migrates plugin payloads; plugins version themselves.

### 6. Offline progress is computed, not simulated

A save records `lastTick` and wall-clock `savedAtUnixMs`. On load, elapsed real time converts to a tick delta.

**Replaying that delta tick-by-tick is forbidden.** Eight hours at 20 Hz is 576,000 ticks — that would hang the app on launch, which is the worst possible first impression for an idle game. Instead each system implements a closed-form `catchUp(state, ticks)` and declares its accuracy contract. Specification: `SAVE_FORMAT.md` §Offline Progress.

---

## Alternatives Considered

### A. SQLite (better-sqlite3)

- **For:** transactional durability for free, partial reads/writes, queryable, scales far past JSON.
- **Against:** a **native module**, which `TECH_STACK.md` §7.2 bans — rebuilt per Electron version, breaks CI on upgrades, complicates packaging. Migrations become schema DDL, which is *more* ceremony than a pure function, not less. And it optimizes for a scale problem this game does not have: the entire world fits in memory by design.
- **Rejected because:** it trades a real, immediate cost (native dependency) for a benefit that only materializes at a scale the design does not reach.

### B. Binary format (MessagePack / Protobuf / custom)

- **For:** smaller and faster to parse.
- **Against:** destroys inspectability — the single most valuable property when debugging a player's broken save or when an AI session must reason about save state. Protobuf adds a schema compiler and a build step; a custom format means writing and versioning a serializer by hand.
- **Rejected because:** parse time for a 300 KB JSON document is a few milliseconds. There is no problem here to solve. Revisit only at the size threshold in `SAVE_FORMAT.md`.

### C. Event sourcing / command log

- **For:** perfect history, replay, and time travel — and genuinely attractive given the simulation is already deterministic.
- **Against:** load time grows without bound with playtime, which is fatal for a game measured in months. Requires snapshotting anyway, so you build both systems. Every migration must handle historical *commands*, which is strictly harder than migrating state.
- **Rejected because:** the load-time growth is disqualifying for this genre. Determinism is still exploited for testing and reproduction — just not as the storage mechanism.

### D. Automatic structural migration (infer changes from schema diffs)

- **Rejected because:** it silently guesses at semantics. "This field was renamed" and "this field was deleted and a different one added" are indistinguishable structurally but produce completely different player outcomes. Save migration is exactly the wrong place for cleverness.

### E. Version-skipping migrations (direct 1→7 paths)

- **Rejected because:** with N versions it eventually implies N² migration paths, each needing its own test. The linear chain is O(N) and each link is independently verifiable. Sequential migration of a small in-memory document is microseconds.

---

## Tradeoffs Accepted

| We accept | To gain | Mitigation |
|---|---|---|
| Whole-file rewrite on every save | Atomicity and simplicity | File is small; autosave is throttled and off the render path |
| JSON's size overhead | Inspectability and debuggability | Optional gzip at a documented size threshold |
| Migration chain grows forever | Guaranteed backward compatibility | Each link is small, pure, and covered by a golden fixture |
| Discipline required to never break the schema | Player trust | Golden-fixture tests fail loudly if compatibility breaks |
| Full state in memory | Simplicity everywhere | Explicitly bounded by the design; tracked in `PERFORMANCE.md` |
| Offline progress is approximate | Instant load | Each system documents its accuracy contract; deviations are bounded and tested |

---

## Consequences

### Immediate

- `src/persistence/` is a separate module importing only `shared` and `sim` types (`CODE_STYLE.md` §8).
- Serialization is **explicit**, never reflective. Every persisted field is written by hand in a `toSave`/`fromSave` pair. Automatic serialization of live objects is banned — it silently persists fields nobody intended and breaks the moment an internal type changes.
- Disk I/O happens in the **main process**, never the renderer. The renderer produces a plain object and sends it over IPC.
- `schemaVersion: 1` ships with v0.1 even though no migration exists yet — the chain infrastructure and its first golden fixture are built in phase-07 regardless.

### Ongoing

- Any change to persisted shape requires a version bump, a migration, a golden fixture, and a `SAVE_FORMAT.md` update **in the same commit**.
- Adding a new system means adding its `toSave`, `fromSave`, and `catchUp` implementations.
- Never store derived data. Anything recomputable is recomputed on load; only authoritative state persists.

### Validation

- Property test (`fast-check`): for arbitrary valid worlds, `fromSave(toSave(w))` produces a state identical to `w`.
- Golden-fixture test: every historical version upgrades cleanly to current.
- Crash-safety test: interrupting the write at each of the six steps in §2 always leaves at least one loadable save.
- Corruption test: truncated, empty, and malformed files all produce a clear error and successful `.bak` recovery — never a crash loop.

### Revisit if

- Save size exceeds ~5 MB → add compression, then reconsider a binary format.
- Save write time becomes perceptible → move serialization to a worker thread.
- Plugins require querying save data without a full load → reconsider alternative A.
