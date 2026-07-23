# Phase 07 — Save / Load

> **Delivers:** Durable persistence, the migration chain, and offline progress. **v0.1 ships at the end of this phase.**
> **Runnable at completion:** The game saves atomically, survives crashes and corruption, loads reliably, and credits progress made while the app was closed.
> **Governing decisions:** ADR-002 (the mechanism — JSON, atomic writes, the linear chain) and ADR-015 (the contract — save identity, version separation, compatibility matrix, migration governance, failure policy, the authoritative-state set). This phase implements a settled contract; it does not design one.

---

## Objectives

1. Make the save file **impossible to lose** — the single most important requirement in the project.
2. Build the migration chain infrastructure before any migration exists.
3. Deliver closed-form offline progress that loads instantly.
4. Complete v0.1's release gates.

### Why persistence is last

Persistence must serialize a **complete** world. Building it in phase-03 would mean migrating the schema after every subsequent phase — seven migrations before v0.1 even ships, each one an opportunity to lose data (`PLAN.md` §2.1).

The cost of going last is that this phase touches every system built so far. That is the correct trade: one careful serialization pass beats seven rushed migrations.

---

## Milestones

| #   | Milestone                              | Delivers                                                                                                                                                                                                                                      | Status        |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 07a | The document & the round trip          | `schema.ts` (`SAVE_MAGIC`, `CURRENT_SCHEMA_VERSION`, `SaveDocument`), the pure base64 codec, explicit hand-written serialize/hydrate per store, blocked-bits recomputation; round-trip + byte-stability + continue-identically property tests | **Delivered** |
| 07b | Migration chain & validation           | `Migration` interface + ordered runner with startup chain validation, synthetic two-step chain proof, golden fixtures (`v1-empty`, `v1-mature-farm`), structural + semantic validation with logged repairs, unknown-content quarantine        | —             |
| 07c | Disk & the load pipeline               | Main-process atomic six-step write, `.bak` fallback, `backups/` pruning, forward-version refusal, typed IPC save/load channels, crash-safety + corruption tests, E2E quit → relaunch exact                                                    | —             |
| 07d | Offline progress                       | `catch-up.ts` orchestration; economy exact recovery, workers statistical (rounded down at every step), auto-sell, capacity bounds + blocker reporting, 8-hour cap, negative-time clamp, < 50 ms at cap; never-over-credit property            | —             |
| 07e | Autosave, return summary & phase close | Autosave triggers + coalescing, failure notifications, manual save, the return summary (defers in work mode, ADR-014), kill-mid-save E2E, size guard, the full v0.1 release-gate run                                                          | —             |

### Delivered (07a) — the document & the round trip

- **The version-1 document is real and final in shape**: `schema.ts` carries `SAVE_MAGIC`, `CURRENT_SCHEMA_VERSION = 1`, and a `SaveDocument` typed field-for-field against the shipped `World` — including the state the phase-0 sketch never anticipated (`cropStats`, `buildingStorage`, `lastPlanted`, the expansion counter, the allocator counters, and the workers' `energyTimer`/`replanTick` sub-period accumulators). `SAVE_FORMAT.md` §2 was finalized against it in the same commit.
- **Serialization is explicit, pure, and byte-stable**: every field written by name in canonical key order, collections sorted by stable keys (for workers/buildings, sorted-by-id _equals_ live Map insertion order — the monotonic allocator guarantees it — so hydration reproduces the iteration order the economy's stall sweep depends on), container stack order preserved verbatim because partial-stack top-up order is behavior. The base64 codec is hand-rolled (pure ES2022 has no `Buffer`/`btoa`) with 32-bit words explicitly little-endian.
- **Hydration reuses `createWorld`** for registries, commands, events, and the crop-stats subscription, then overwrites every authoritative field; derived state is recomputed (`blocked` bits from the building store, capacities from constants and definitions).
- **The three properties hold over arbitrary worlds** (fast-check): round trip, byte-stability through a full disk trip, and **continue-identically** — hydrated vs never-saved worlds stepped up to 300 ticks with workers acting and the economy sweeping, compared byte-for-byte, plus the freed-building-ID case that motivated persisting the allocator counters (ADR-015 §6). A deliberate mutation control (dropping `energyTimer` restoration) failed 3 of 7 tests — the suite has teeth.
- Gates: typecheck, lint, full unit/integration suite, full Playwright E2E on a fresh debug build.

---

## Deliverables

### Schema

- [x] `src/persistence/schema.ts` — `SaveDocument` matching `SAVE_FORMAT.md` §2 exactly _(07a — §2 finalized against this type in the same commit)_
- [x] `CURRENT_SCHEMA_VERSION = 1`
- [x] `schemaVersion` written **first** in the document; `SAVE_MAGIC` identity constant second (ADR-015 §1) _(07a — asserted on the serialized text itself)_
- [x] `meta.createdAtUnixMs` stamped at world creation, preserved by every save (ADR-015 §1) _(07a — the field; the stamping call site arrives with the save orchestration, 07c/e)_
- [x] The ID allocator's counters persisted — **not** reconstructed as `max + 1`, which breaks continue-identically determinism once any ID has been freed (ADR-015 §6) _(07a — the freed-ID case is a dedicated test)_
- [x] `SAVE_FORMAT.md` §2's `world` body finalized against the shipped `World` — `cropStats`, `buildingStorage`, `lastPlanted`, the expansion counter (ADR-015 §Implementation Notes) _(07a — plus `energyTimer`/`replanTick`, the sub-period accumulators determinism demanded)_
- [x] `plugins: {}` present from version 1 — so v0.2's loader needs no migration

### Serialization

- [x] `serialize.ts` / `deserialize.ts` — **explicit, hand-written `toSave`/`fromSave` per store** _(07a — hydration reuses `createWorld` for wiring, then overwrites every authoritative field by name)_
- [x] **Reflective or automatic serialization is banned** (`SAVE_FORMAT.md` §3.1)
- [x] Grid typed arrays encoded as base64 _(07a — hand-rolled codec; pure ES2022 has no `Buffer`/`btoa`; 32-bit words explicitly little-endian)_
- [x] Sparse stores as arrays sorted by a stable key _(07a — for workers/buildings sorted-by-id **equals** live Map insertion order, so hydration reproduces live iteration order, which the stall sweep depends on)_
- [x] RNG state serialized so determinism resumes mid-stream
- [x] **Byte-stable**: the same world always produces identical JSON _(07a — property-tested, including through a full round trip)_
- [x] Derived state never persisted — `stage`, caches, snapshots (`SAVE_FORMAT.md` §2.2) _(07a — `blocked` bits recomputed from the building store on hydrate; container capacities from constants/definitions)_

### Atomic writes (main process)

- [ ] The exact six-step sequence in `SAVE_FORMAT.md` §7.1, including both `fsync` calls
- [ ] `.bak` rotation preserving the previous good save
- [ ] Three most recent autosaves in `backups/`, oldest pruned
- [ ] **Disk I/O only in main** — the renderer sends a plain object over IPC

### Load

- [ ] The seven-step sequence in `SAVE_FORMAT.md` §4.3
- [ ] Parse failure → automatic `.bak` fallback with a clear player message
- [ ] **A higher `schemaVersion` is refused, never partially loaded**
- [ ] Missing save → new game (the only case where that is correct)

### Migration infrastructure

- [ ] `Migration` interface; linear ordered chain
- [ ] Runner applying migrations sequentially, never skipping
- [ ] `migrations/index.ts` — empty but functional and tested at v1
- [ ] Golden fixtures: `v1-empty.json`, `v1-mature-farm.json`, committed to `tests/fixtures/saves/`

### Validation

- [ ] Structural validation against the current schema
- [ ] Semantic validation per `SAVE_FORMAT.md` §5.2
- [ ] **Repair where unambiguous, drop where meaningless, never delete player value**
- [ ] Every repair logged with context
- [ ] Unknown content IDs **quarantined and preserved**, not deleted (§5.3)

### Offline progress

- [ ] `catch-up.ts` orchestration
- [ ] `catchUp(state, ticks)` per accruing system, with the §6.3 contracts
- [ ] Growth: **no catch-up implementation** — derived from `plantedTick`, exact by construction (ADR-009 §2); a test asserts the derivation holds across an 8-hour gap
- [ ] Economy: exact multiplier recovery
- [ ] Workers: statistical, ±10%, **rounded down at every step**
- [ ] Auto-sell applied to catch-up output
- [ ] Bounded by tiles, seeds, and capacity — so blockers are reported honestly
- [ ] 8-hour cap; negative elapsed time clamped to zero
- [ ] **Completes in under 50 ms at the maximum cap**

### Autosave

- [ ] Every 60 s, before quit, on close-to-tray, after major transactions, on manual request
- [ ] Serialization off the render path
- [ ] In-flight saves coalesce rather than queue
- [ ] Failures notify and keep playing — **never crash, never damage the existing save**

### UI

- [ ] Return summary after a gap over 60 s: time away, harvested, earned, and **what blocked progress**
- [ ] Dismissible; never modal
- [ ] Manual save button in settings
- [ ] Save-failure notification with the path

### IPC

- [ ] Save and load channels added to the typed contract, validated on receipt

---

## Out of Scope

- Multiple save slots — path shape supports it; UI does not _(post-v0.1)_
- Cloud saves _(post-v1.0)_
- Save file export/import _(v0.2)_
- Compression — not needed until the 5 MB threshold (`SAVE_FORMAT.md` §3.4)
- Checksums — deferred with a reserved additive path (ADR-015 §Alternatives D)
- The pre-migration disk backup — ships with the first _real_ migration in v0.2; no migration can run in v0.1 (ADR-015 §3)
- Write-back immediately after a load-time migration — the first ordinary autosave persists the migrated shape (ADR-015 §Alternatives F)
- Auto-update _(v0.2 — deliberately after proven save integrity)_
- Plugin save data beyond the reserved empty key _(v0.2)_
- Undo or time travel _(not planned)_

---

## Acceptance Criteria

| #   | Criterion                                                                       | Verified by        |
| --- | ------------------------------------------------------------------------------- | ------------------ |
| 1   | **`fromSave(toSave(w))` is identical to `w` for arbitrary worlds**              | Property test      |
| 2   | **The same world serializes to identical bytes twice**                          | Property test      |
| 3   | Save writes follow the exact six-step sequence                                  | Code review + test |
| 4   | **Interrupting the write at each step leaves ≥ 1 loadable save**                | Test, all 6 steps  |
| 5   | A corrupt `slot-0.json` recovers from `.bak` with a clear message               | Test               |
| 6   | A truncated, empty, or malformed file never crashes and never starts a new game | Test               |
| 7   | **A higher `schemaVersion` is refused, never partially loaded**                 | Test               |
| 8   | Both golden fixtures load and validate                                          | Test               |
| 9   | The migration runner works correctly with an empty chain                        | Test               |
| 10  | Semantic repairs are applied and logged                                         | Test               |
| 11  | **An over-capacity inventory keeps its items** (never deletes player goods)     | Test               |
| 12  | Unknown content is quarantined, preserved, and restored when content returns    | Test               |
| 13  | RNG state resumes mid-stream — determinism continues across a save/load         | Property test      |
| 14  | **Catch-up never over-credits versus real simulation**                          | Property test      |
| 15  | Catch-up is within tolerance at n = 100 / 1,000 / 50,000                        | Property test      |
| 16  | Catch-up completes in **under 50 ms** at the 8-hour cap                         | Measured           |
| 17  | Catch-up is bounded by capacity and reports the blocker                         | Test               |
| 18  | Negative elapsed time is clamped, never rewinds                                 | Test               |
| 19  | Autosave fires on every specified trigger                                       | Test               |
| 20  | **A save failure notifies, keeps playing, and does not touch existing files**   | Test               |
| 21  | Save write under 100 ms; no perceptible hitch                                   | Measured           |
| 22  | Load + catch-up to interactive under 1.5 s                                      | Measured           |
| 23  | Reference save under 2 MB                                                       | Measured           |
| 24  | The return summary is accurate and readable                                     | Manual             |
| 25  | **Quit → relaunch preserves the exact game state**                              | E2E                |
| 26  | Memory growth over 8 hours within budget                                        | Measured           |
| 27  | All v0.1 release gates pass (`PLAN.md` §8)                                      | Full check         |

**Criteria 1, 2, 4, and 20 are the phase.** A save system that works in the happy path and loses data on a crash is worse than no save system, because the player trusts it.

**Criterion 14's asymmetry is deliberate:** catch-up must never credit _more_ than real simulation. Returning to slightly more than expected is a pleasant surprise; returning to less than the game implied is a bug report and a trust problem.

**Criterion 11** is the concrete case of "never delete player value" — deleting a player's goods to satisfy an invariant is worse than the invariant being violated.

---

## Testing Checklist

### Automated

- [x] Round-trip property across arbitrary worlds (1) _(07a — invariant-preserving arbitrary worlds: crops, workers mid-task, all four buildings with storage, multipliers, freed IDs)_
- [x] Byte-stability across repeated serialization (2) _(07a — twice, and through a full serialize → parse → hydrate → serialize trip)_
- [x] Every store: serialize and deserialize independently _(07a — collectively, via the round-trip property; the per-store pairs are named blocks inside `toSaveDocument`/`hydrateWorld`, and a mutation control confirmed a single dropped field fails the suite)_
- [x] Grid: base64 typed-array round-trip _(07a — RFC 4648 vectors + arbitrary-bytes property + explicit little-endian pin)_
- [x] Sparse stores: stable ordering _(07a — byte-stability is the assertion)_
- [ ] Crash safety at each of the six write steps (4)
- [ ] Corruption: truncated, empty, malformed, wrong-type, missing-version
- [ ] `.bak` fallback in each corruption case
- [ ] Forward-version refusal (7)
- [ ] Both golden fixtures load and validate (8)
- [ ] Migration runner with an empty chain (9)
- [ ] Migration runner with a synthetic two-step chain — proves the mechanism works before it is needed
- [ ] Every semantic repair rule in `SAVE_FORMAT.md` §5.2
- [ ] Unknown content quarantine and restoration (12)
- [x] Determinism continues across save/load (13) _(07a — hydrated vs never-saved worlds stepped up to 300 ticks with workers, economy, and RNG live, compared byte-for-byte; the E2E half joins 07c)_
- [ ] Catch-up: per-system accuracy against real ticks
- [ ] Catch-up: never over-credits (14) — the critical property
- [ ] Catch-up: capacity bounds and blocker reporting
- [ ] Catch-up: clock moved backwards
- [ ] Catch-up: at exactly the 8-hour cap and beyond
- [ ] Autosave: every trigger; coalescing under load
- [ ] Save failure: disk full, permission denied, serialization throw
- [ ] E2E: quit and relaunch preserves state (25)
- [ ] E2E: kill the process mid-save; verify recovery
- [ ] Size guard on the reference save (23)

### Manual

- [ ] Play 30 minutes, quit, relaunch — verify everything is exactly as left
- [ ] Close for 2 hours; verify the return summary is accurate and readable
- [ ] Fill storage, close for 4 hours; confirm the summary reports the blocker
- [ ] Kill the process during a save; confirm recovery
- [ ] Corrupt the save by hand; confirm `.bak` recovery and messaging
- [ ] Measure all `PERFORMANCE.md` budgets and record them
- [ ] **Complete the v0.1 release-gate checklist** (`PLAN.md` §8)

---

## Future Dependencies

| Deliverable             | Depended on by                                          |
| ----------------------- | ------------------------------------------------------- |
| Migration chain         | **Every future version** — this is the mechanism        |
| Golden fixtures         | Every future version proves compatibility against these |
| Atomic write            | v0.2 auto-update depends on proven save integrity       |
| `catchUp` pattern       | v0.2+ — every new accruing system implements it         |
| Plugin save key         | v0.2 loader — present from v1, so no migration needed   |
| Validation + quarantine | v0.2 — uninstalled mods rely on it                      |
| Return summary          | v0.2 (weather events), v0.3 (town events)               |

---

## Notes

**Build the migration infrastructure even though there is nothing to migrate.** The chain runner, golden fixtures, and their tests all ship at v1. Writing them when the first real migration arrives means writing the mechanism and the migration under pressure, at the exact moment a mistake destroys real saves.

Test the runner with a **synthetic** two-step chain to prove it works before it is needed for real.

**The golden fixtures are append-only from the moment they are committed** (`TESTING.md` §7.2). They represent saves on real disks. If a fixture stops migrating, the migration is wrong — never the fixture.

Run the crash-safety tests (criterion 4) by actually interrupting writes, not by mocking failure. The failure modes that matter are the ones the filesystem produces, not the ones a mock imagines.
