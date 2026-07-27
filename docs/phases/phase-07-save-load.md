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
| 07b | Migration chain & validation           | `Migration` interface + ordered runner with startup chain validation, synthetic two-step chain proof, golden fixtures (`v1-empty`, `v1-mature-farm`), structural + semantic validation with logged repairs, unknown-content quarantine        | **Delivered** |
| 07c | Disk & the load pipeline               | Main-process atomic six-step write, `.bak` fallback, `backups/` pruning, forward-version refusal, typed IPC save/load channels, crash-safety + corruption tests, E2E quit → relaunch exact                                                    | **Delivered** |
| 07d | Offline progress                       | `catch-up.ts` orchestration; economy exact recovery, workers statistical (rounded down at every step), auto-sell, capacity bounds + blocker reporting, 8-hour cap, negative-time clamp, < 50 ms at cap; never-over-credit property            | **Delivered** |
| 07e | Autosave, return summary & phase close | Autosave triggers + coalescing, failure notifications, manual save, the return summary (defers in work mode, ADR-014), kill-mid-save E2E, size guard, the full v0.1 release-gate run                                                          | **Delivered** |

### Delivered (07e) — autosave, the return summary & phase close

- **Triggers in main, the document in the renderer** (`src/main/save-triggers.ts`, no `electron` import, every timer injected): the 60-second cadence derives its period from `AUTOSAVE_INTERVAL_TICKS` rather than restating "60 s", so the wall-clock timer main needs cannot drift from the tick constant the spec sets. Quit **blocks shutdown** through a rendezvous with the `save:write` handler — `before-quit` defers once, waits, then re-issues — and every exit from that handler settles the wait, so a save that FAILED releases shutdown just as surely as one that succeeded (a full disk must not become a hang). The wait is capped at 3 s: a wedged renderer can delay quit, never prevent it. Close-to-tray maps to quick hide, the one state where the window stops being present and the tray is the way back.
- **Coalescing lives in exactly one place** (`save-controller.ts`), because only the renderer can see a write in flight. One write at a time, and however many triggers arrive during it they collapse to a **single** follow-up — collapsed, not dropped: the trigger that lands mid-write is often the quit save, the one save with no next chance. Serialization is deferred into a later task (`setTimeout(0)`, deliberately not a microtask, which would still run inside the frame that queued it), so the transaction trigger — which fires from a snapshot subscriber, inside `store.pump`, inside a frame — never spends a frame budget on JSON.
- **The major-transaction trigger reads the snapshot, not the command stream** (`transaction-watch.ts`): a command can be submitted and rejected, but a slice only changes when the world did. Worker count, building count, and the expansion counter are monotone in v0.1, so a GROWTH test is the whole rule and a future shrink (firing a worker, v0.3) can never masquerade as a purchase.
- **The return summary defers rather than vanishes** (ADR-014's stated requirement, and the reason work mode had to ship before phase-07): the controller holds the report, the component decides visibility, so work mode hides the summary without touching what is held, and leaving work mode shows the player what they never got to read. Only a dismissal clears it. The over-a-minute gate is `RETURN_SUMMARY_MIN_TICKS` — its own constant, not a reuse of the autosave interval it happens to equal, because one is a cadence and the other a threshold. The §9.4 blocker line converts the report's absolute `atTick` back to elapsed-relative time: "Storage full after 2h 14m".
- **A save failure is survivable, and says where** (§7.3): `SaveWriteOutcome` carries the PATH on failure — only main knows it, and the renderer must never derive one (ADR-003 §3) — because "permission denied" is a shrug and the file name is something a player can act on. The notice persists instead of auto-dismissing (a missed mode toast is nothing; a missed save failure is trust in a save that is not there), clears itself when a later save succeeds, and shows **in work mode too**: withholding "your game is not being saved" to keep the desktop quiet is not quiet, it is misleading. It is the one place `GAME_DESIGN.md` §10.1's red is correct.
- **Write failures are real refusals, not mocked ones** — a directory where the temp file must go, a directory where `.bak` must go, a file where the saves directory must be. Each asserts the same pair: the call throws so main can report it, and the good save already on disk is untouched. **Disk full is deliberately not simulated**: ENOSPC arrives from the same calls these cases already make throw and lands in the same `catch`, and mocking it would test Node's error plumbing rather than ours.
- **Measured** (on the reference `v1-mature-farm` fixture): reference save **38,730 bytes** against a 2 MB ceiling (crit 23); serialization **0.64 ms** median against 100 ms (crit 21); load + catch-up at the full 8-hour cap **1.35 ms** median against 1.5 s (crit 22); memory growth over an accelerated 8-hour run **10,112 bytes** against 25 MB (crit 26) — essentially flat, which is the point: the gate exists to catch a collection that grows with PLAYTIME rather than world size (`SAVE_FORMAT.md` §3.4's named hazard), and 576,000 real ticks is long enough that any per-tick retention would be unmistakable. That run costs minutes, so it carries its own 300 s timeout rather than raising the suite's.
- **E2E against the real app**: quitting saves by itself with nobody asking (crits 19, 25); the autosave cadence fires on the **real 60-second constant** with no test seam shortening it — an autosave that only fires when a test asks is not an autosave, which is why that test is slow and why it is worth being slow; a worker hire saves inside 10 s, far short of the cadence; and SIGKILL during a burst of writes still leaves a parseable save that relaunches into the same farm (crits 4, 25). **Every E2E spec now runs on a throwaway profile** (`isolated-profile.ts`): isolation was optional while nothing wrote saves, but an app that saves itself would otherwise write its test farm into the developer's real save and load it back on the next run.

### Delivered (07d) — offline progress

- **The closed forms** (`src/persistence/catch-up.ts`, pure — wall clock enters exactly once, in `computeElapsedTicks`, which caps at 8 hours and clamps negative time to zero): growth is _free_ — advancing the tick is the catch-up, exact by ADR-009's derivation; economy recovery is _exact_ — the batch multiplier form applied over the **period crossings** the real scheduler would have fired (not `floor(elapsed/period)`, which drifts by one at unaligned starts); worker production is _statistical and provably conservative_.
- **Every approximation points down** (crit 14, the critical property): the per-cycle handling constant (150 ticks) sits above the real simulation's per-cycle worker cost, so the k-th modeled harvest is always later than a real worker could manage; untilled ground is never newly planted; overflow fills worker carry-holds before anything sells (real workers would still be carrying those items — selling them would over-credit coins); sold units are priced at the **worst multiplier the real path could have reached** (`decayed(saveValue, totalUnits)` — every real sale happened at or above it, since recovery only raises). The fast-check property compares catch-up against the real simulation on a byte-identical clone at n ∈ {100, 1,000, 50,000} across arbitrary farms: harvests, plants, and coins earned all ≤ real, always.
- **The property test drew blood before passing**: the first model replanted same-crop unconditionally and the shrinker produced the minimal counterexample — one worker, one wheat crop, one wheat seed, no bin — where real workers replant only the _default_ crop without a seed bin. The delivered rule mirrors reality: replanting is credited **only through the seed bin's per-tile memory** (`hasSeedBin && lastPlanted[tile] === crop`); anything less is harvest-only. The bin is the automation building whose whole purpose is reliable unattended replanting — now the catch-up model says so too.
- **Accuracy at saturation** (crit 15): on the representative mature farm — all four buildings, three workers, six crops across three species, seeds stocked — the model lands **within the documented ±10% band, under**, at n = 50,000. Where workers are the bottleneck the model deliberately under-credits further; the 8-hour product case is growth/seed-bound, where it converges.
- **Bounds and blockers** (crit 17): storage genuinely full (inventory, sheds, _and_ carry-holds) with no stall → production stops with `{reason: 'storage-full', atTick}` for the §9.4 summary; with a stall the overflow sells and coins arrive; replants consume seeds and stop at the stock. **< 50 ms at the 576,000-tick cap** (crit 16) — measured, it is arithmetic over standing crops.
- **Wired at the load boundary**: boot computes elapsed from `savedAtUnixMs`, applies catch-up before the loop's first tick, and folds the result into the load note (the `CatchUpReport` is held for 07e's return summary). E2E: the app closed for 4 seconds relaunches with at least that time credited as ticks — offline progress proven against the real app. `GAME_DESIGN.md` §9.2 reconciled to ADR-009 in the same commit (the moisture-era growth rows were pre-ADR-009 drift).

### Delivered (07c) — disk & the load pipeline

- **The atomic write is real** (`src/main/save-store.ts`, pure Node — no `electron` import, directory injected, so the sequence is testable against real temp directories): the exact §7.1 six steps, both `fsync`s included (the directory fsync is best-effort on Windows — directory handles cannot be fsynced there; NTFS journals rename metadata, which is why step 5 is already atomic — recorded honestly in code and in `SAVE_FORMAT.md`). Every successful save also rotates a copy into `backups/slot-0-<tick>.json`, pruned to the newest three.
- **Crash safety by real interruption** (criterion 4, the phase-doc §Notes way): the write sequence executes against a real directory and stops dead after each step — five halt points — and an existing good save survives every one, loadable as one of the two real states, never a torn hybrid. A crash on the very first save leaves a clean `missing`, not corruption.
- **The load split is exactly `ARCHITECTURE.md` §4.3**: main's half is bytes → parsed JSON with `.bak` routing (`readSavesForLoad` — both documents travel, because a structural failure discovered _after_ migration also falls back to `.bak` without a second round trip; `missing` is true only when _neither file exists_ — present-but-unreadable is never a new game). The renderer's half is the pure `loadWorld` pipeline (`src/persistence/load.ts`): migration → structural validation → semantic repair → hydration per candidate, with one deliberate exception — **a newer save refuses outright and never falls back** to an older backup (quietly loading it would discard the newer session's world). A hydration throw converts to a typed corrupt-save error; the app never crashes on save data.
- **One save path** (forward-built for 07e): every trigger — quit, tray, autosave — arrives as main's `save:requested` event; the renderer serializes at its one site (meta continuity: `createdAtUnixMs` carried forever, `saveCount` increments only on success, the held quarantine written back verbatim) and invokes `save:write`; **main validates the document structurally on receipt** (the renderer is untrusted, ADR-003 §3) and produces the canonical bytes itself. Boot became async: missing → new game (random seed, authoritative thereafter); unloadable → a clear in-overlay error, **never a silent new game**; the load log (migrations, repairs, backup use) surfaces as a devtools metric until 07e's player-facing summary.
- **E2E against the real app** (isolated userData): save → relaunch → the _same_ farm continues (seed and `createdAtUnixMs` identical, tick advanced, saveCount counted, `.bak` rotated — criterion 25's 07c half); and a hand-corrupted slot recovers from `.bak` with the world intact (criterion 5). Semantic repair found and closed a real gap during this milestone: an orphaned storage container (building gone) now becomes held stacks instead of a hydration crash.

### Delivered (07b) — migration chain & validation

- **The runner exists before anything to run** (the phase's stated point): `migrate.ts` is the ONE place `schemaVersion` is ever read (ADR-015 §2). `validateChain` rejects a malformed chain at startup — gaps, skips, wrong start, stopping short — as a thrown build failure, never a player-facing one; `runMigrations` returns typed results (`SaveFromNewerVersion` refused outright, no-link versions are `SaveCorrupt`, a throwing or version-lying link converts to `MigrationFailed` with the caller still holding the untouched original). The mechanism is proven with a **synthetic two-step chain** — add-a-field then rename-a-field — plus non-destructiveness and determinism tests. `migrations/index.ts` ships empty and validated at v1.
- **Structural validation** (`parseSaveDocument`) proves the current shape field-by-field — header, meta, every store, quarantine, plugins — and **decodes the grid encodings**, so corrupt base64 is a typed validation error routed to `.bak`, never a hydration crash.
- **Semantic validation** (`repairSaveDocument`, non-destructive) implements every §5.2 row with a named rule per repair: coins clamp, out-of-bounds crops dropped, lost workers reset to the plot center (computed from the owned bitfield), incoherent tasks cleared to idle, buildings on unowned/unwalkable ground kept-and-logged, **an over-capacity inventory keeps every item** (acceptance 11), duplicate entity IDs reassigned with the allocator bumped, behind-the-max allocator counters bumped (the ADR-015 §6 hazard as a repair rule), multipliers clamped into their band.
- **Quarantine is real** (§5.3, acceptance 12): the document gains a top-level `quarantine` section — present-and-empty from version 1, the `plugins: {}` reasoning — holding crops, buildings _with their storage_, owner-tagged stacks, and seed-bin memory. The same pass restores held entries the moment their content returns and a safe home exists: crop to its free tile, stack to its owner or to the inventory when the owner is gone, building to its unoccupied tile. Unknown-item multipliers deliberately pass through — recovery is arithmetic that dereferences nothing.
- **Golden fixtures committed**: `v1-empty.json` (a fresh world) and `v1-mature-farm.json` (16×16 plot, all four buildings, three workers, stocked containers, a depressed market — then **500 real simulation ticks**, so the fixture is a state the game actually reached). Each migrates through the real chain, validates with **zero repairs**, hydrates, and continues deterministically for 200 ticks. Append-only from this commit.

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

- [x] The exact six-step sequence in `SAVE_FORMAT.md` §7.1, including both `fsync` calls _(07c — the directory fsync is best-effort on Windows, recorded honestly; NTFS journals rename metadata)_
- [x] `.bak` rotation preserving the previous good save
- [x] Three most recent autosaves in `backups/`, oldest pruned _(07c — a copy rotates on every successful write)_
- [x] **Disk I/O only in main** — the renderer sends a plain object over IPC _(07c — and main validates it structurally on receipt, then produces the canonical bytes itself)_

### Load

- [x] The seven-step sequence in `SAVE_FORMAT.md` §4.3 _(07c — steps 1 in main, 2–5 in the pure `loadWorld` pipeline; step 6 catch-up is 07d, step 7 summary is 07e)_
- [x] Parse failure → automatic `.bak` fallback with a clear player message _(07c — E2E'd against a hand-corrupted slot)_
- [x] **A higher `schemaVersion` is refused, never partially loaded** _(07c — and never quietly replaced by an older backup: the refusal deliberately does not fall back)_
- [x] Missing save → new game (the only case where that is correct) _(07c — `missing` is true only when neither file exists; present-but-unreadable stops with a clear error instead)_

### Migration infrastructure

- [x] `Migration` interface; linear ordered chain _(07b — `to === from + 1` enforced by `validateChain` at startup)_
- [x] Runner applying migrations sequentially, never skipping _(07b — routing by version; a version-lying link is a typed `MigrationFailed`)_
- [x] `migrations/index.ts` — empty but functional and tested at v1
- [x] Golden fixtures: `v1-empty.json`, `v1-mature-farm.json`, committed to `tests/fixtures/saves/` _(07b — the mature farm is 500 real ticks of simulation, not a synthetic pose; both validate with zero repairs and continue deterministically)_

### Validation

- [x] Structural validation against the current schema _(07b — including grid-encoding decode, so corrupt base64 is a typed error, never a hydration crash)_
- [x] Semantic validation per `SAVE_FORMAT.md` §5.2 _(07b — every row, one named rule each)_
- [x] **Repair where unambiguous, drop where meaningless, never delete player value** _(07b — acceptance 11's over-capacity inventory keeps every item, by test)_
- [x] Every repair logged with context _(07b — returned as `{rule, detail}` records; the load pipeline logs them in 07c)_
- [x] Unknown content IDs **quarantined and preserved**, not deleted (§5.3) _(07b — the document's `quarantine` section, with the restore pass proven both ways)_

### Offline progress

- [x] `catch-up.ts` orchestration _(07d — one pure function at the load boundary; wall clock enters exactly once)_
- [x] `catchUp(state, ticks)` per accruing system, with the §6.3 contracts _(07d — growth free, economy exact over period crossings, workers statistical)_
- [x] Growth: **no catch-up implementation** — derived from `plantedTick`, exact by construction (ADR-009 §2); a test asserts the derivation holds across an 8-hour gap _(07d — the no-worker exactness property)_
- [x] Economy: exact multiplier recovery _(07d — period **crossings**, not `floor(elapsed/period)`, matching the real scheduler at unaligned starts)_
- [x] Workers: statistical, ±10%, **rounded down at every step** _(07d — the handling constant sits above real per-cycle cost; replants only via the seed bin's memory; the never-over property found and killed the unconditional-replant over-credit)_
- [x] Auto-sell applied to catch-up output _(07d — overflow only, after storage and carry-holds, priced at the worst multiplier the real path could reach)_
- [x] Bounded by tiles, seeds, and capacity — so blockers are reported honestly _(07d — `{reason, atTick}` mid-stream, not after the fact)_
- [x] 8-hour cap; negative elapsed time clamped to zero
- [x] **Completes in under 50 ms at the maximum cap** _(07d — measured at 576,000 ticks)_

### Autosave

- [x] Every 60 s, before quit, on close-to-tray, after major transactions, on manual request _(07e — the cadence, quit, and hide in `save-triggers.ts`; transactions off the snapshot; manual through the same controller. Close-to-tray is quick hide, this app's only true absence)_
- [x] Serialization off the render path _(07e — deferred to a later task, because the transaction trigger fires from inside a frame)_
- [x] In-flight saves coalesce rather than queue _(07e — one in flight, one follow-up slot; collapsed, never dropped)_
- [x] Failures notify and keep playing — **never crash, never damage the existing save** _(07e — status → notice; the throw path never reaches disk at all)_

### UI

- [x] Return summary after a gap over 60 s: time away, harvested, earned, and **what blocked progress** _(07e — `RETURN_SUMMARY_MIN_TICKS`; the blocker line is elapsed-relative)_
- [x] Dismissible; never modal _(07e — `role="status"`, focus untouched, the world runs behind it)_
- [x] Manual save button in settings _(07e — reports its outcome on the button; no toast for a save that worked)_
- [x] Save-failure notification with the path _(07e — the path travels on `SaveWriteOutcome`; only main knows it)_

### IPC

- [x] Save and load channels added to the typed contract, validated on receipt _(07c — `save:load`, `save:write`, and the `save:requested` event every future trigger rides)_

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
- [x] Crash safety at each of the six write steps (4) _(07c — real filesystem operations halted after each step, never mocked failures; an existing good save survives every halt)_
- [x] Corruption: truncated, empty, malformed, wrong-type, missing-version _(07c — disk-level cases in `save-store.test.ts`; missing/invalid version is the 07b runner's `SaveCorrupt` path)_
- [x] `.bak` fallback in each corruption case _(07c — at the disk level and through the full pipeline, plus the live E2E)_
- [x] Forward-version refusal (7) _(07b runner + 07c pipeline: refused outright, never falls back to an older backup)_
- [x] Both golden fixtures load and validate (8) _(07b — through the real chain, zero repairs, deterministic continuation)_
- [x] Migration runner with an empty chain (9) _(07b)_
- [x] Migration runner with a synthetic two-step chain — proves the mechanism works before it is needed _(07b — add-a-field then rename-a-field, plus mid-chain entry, non-destructiveness, determinism, and every failure mode typed)_
- [x] Every semantic repair rule in `SAVE_FORMAT.md` §5.2 _(07b — one named rule per row, each with a dedicated test)_
- [x] Unknown content quarantine and restoration (12) _(07b — crops, buildings with storage, owner-tagged stacks, seed-bin memory; restore defers rather than destroys when the home is occupied)_
- [x] Determinism continues across save/load (13) _(07a — hydrated vs never-saved worlds stepped up to 300 ticks with workers, economy, and RNG live, compared byte-for-byte; the E2E half joins 07c)_
- [x] Catch-up: per-system accuracy against real ticks _(07d — exactness with no workers; the ±10%-under band on the representative mature farm at n = 50,000)_
- [x] Catch-up: never over-credits (14) — the critical property _(07d — fast-check vs the real simulation on byte-identical clones, n ∈ {100, 1,000, 50,000}, arbitrary farms; harvests, plants, and coins all ≤ real)_
- [x] Catch-up: capacity bounds and blocker reporting _(07d)_
- [x] Catch-up: clock moved backwards _(07d — clamped to zero, never a rewind)_
- [x] Catch-up: at exactly the 8-hour cap and beyond _(07d — capped, and < 50 ms there)_
- [x] Autosave: every trigger; coalescing under load _(07e — the cadence and quit rendezvous in `save-triggers.test.ts`, the transaction trigger in `transaction-watch.test.ts`, coalescing in `save-controller.test.ts`; the cadence and the transaction proven again live)_
- [x] Save failure: disk full, permission denied, serialization throw _(07e — real filesystem refusals, each asserting the existing save is untouched; the serialization throw never reaches disk. Disk full is deliberately unmocked — same call, same `catch`; see the 07e notes)_
- [x] E2E: quit and relaunch preserves state (25) _(07c — save → relaunch → same seed, same `createdAtUnixMs`, tick advanced, `.bak` rotated. 07e made it automatic: the test now asks for no save at all and closes the app)_
- [x] E2E: kill the process mid-save; verify recovery _(07e — SIGKILL during a burst of writes; a parseable save survives and relaunches into the same farm)_
- [x] Size guard on the reference save (23) _(07e — 38,730 bytes against the 2 MB ceiling, plus a re-serialization through the real path so the guard cannot go stale)_

### Manual

- [x] Kill the process during a save; confirm recovery _(07e — automated instead, and more harshly: SIGKILL lands during a burst of writes rather than a hand-timed one, then the app relaunches into the same farm. A human cannot reliably hit the window this test hits every run)_
- [x] Corrupt the save by hand; confirm `.bak` recovery and messaging _(07c — automated E2E writes real garbage into `slot-0.json` between launches)_
- [x] Measure the save-system budgets and record them _(07e — size, serialization, load + catch-up, and 8-hour memory growth, all recorded in `PERFORMANCE.md` §8.1)_

**Outstanding — owner, on real hardware.** These need a human and a clock; nothing here can be honestly checked off by automation, and none is claimed:

- [ ] Play 30 minutes, quit, relaunch — verify everything is exactly as left _(the automated equivalent proves continuity over seconds, not over a session a player would recognise)_
- [ ] Close for 2 hours; verify the return summary is accurate and readable _(readability is criterion 24's "Manual" by design)_
- [ ] Fill storage, close for 4 hours; confirm the summary reports the blocker _(the blocker path is unit- and component-tested; what a human is judging is whether the sentence tells them to build a shed)_
- [ ] The remaining `PERFORMANCE.md` §10.2 manual items — collapsed and expanded CPU over 5 minutes, RSS in all three states, cold start to interactive, and the four §7.1 behaviors against a fullscreen video and a fullscreen game
- [ ] **Complete the v0.1 release-gate checklist** (`PLAN.md` §8) — seven of eight gates pass; **coverage does not**, and the manual rows above remain. See the gate table below.

---

## v0.1 Release Gates (`PLAN.md` §8)

Run at the 07e close. Every automated gate is green; the manual rows above are what remains before the version boundary.

| Gate               | Status                                                                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | **Pass** — both golden fixtures migrate through the real chain, validate with zero repairs, hydrate, and continue deterministically. Append-only from 07b.                                                                                                      |
| Performance        | **Pass (automated)** — `PERFORMANCE.md` §8.1 records the four save-system budgets, all measured on the reference farm. The §10.2 manual observations remain outstanding.                                                                                        |
| Coverage           | **FAIL — 67.36% lines / 64.30% branches against 80% / 75%.** See below. This is the one gate v0.1 does not clear, and it is a pre-existing shortfall, not a 07e regression.                                                                                     |
| Boundaries         | **Pass** — `check:boundaries` clean; `check:cycles` clean over 167 modules / 530 dependencies. 07e's one violation was real and fixed rather than suppressed: the return summary now takes a view model instead of importing `CatchUpReport` into the UI layer. |
| Docs               | **Pass** — `SAVE_FORMAT.md` §7.2/§7.3 carry the delivered decisions, `PERFORMANCE.md` §8.1 the measurements, `CHANGELOG.md` the entry, this document the milestone.                                                                                             |
| ADRs               | **Pass** — 07e made no architectural decision ADR-002 and ADR-015 do not already settle. Trigger ownership, coalescing location, and the quit rendezvous implement §7.2; they are recorded there, not as a new ADR.                                             |
| Data loss          | **Pass** — zero known defects. The write's failure modes are proven against real filesystem refusals with the existing save intact; SIGKILL mid-write still relaunches into the same farm.                                                                      |
| Dead code          | **Pass** — no placeholders, no skipped unit tests (883 passing). The three skipped Playwright tests are GPU-gated and pre-date this milestone; they skip on hardware, not by annotation.                                                                        |

### The coverage gate — what actually failed, and why nobody saw it

`npm run test:coverage` had **never completed**. V8 instrumentation costs roughly 3.5×, which blew the 240 s timeout on the 8-hour behavioural long-run and the default budget on 07d's n = 50,000 never-over-credit property; the run died before the reporter ever printed, so the thresholds were never evaluated. Both timeouts are now raised, the memory gate runs uninstrumented, and the gate reports for the first time.

Measured against `TESTING.md` §4:

| Area                     | Required (line / branch) | Measured            | Verdict                      |
| ------------------------ | ------------------------ | ------------------- | ---------------------------- |
| `src/persistence/**`     | 95% / 90%                | 90.76% / 82.13%     | **under**                    |
| `src/sim/**`             | 90% / 85%                | 97.37% / 84.60%     | branches **under** by 0.4 pt |
| `src/shared/**`          | 85% / 80%                | 86.96% / 94.87%     | pass                         |
| `src/renderer/app/**`    | 70% / 60%                | 83.29% / 71.35%     | pass                         |
| `src/renderer/render/**` | 50% / 40%                | 21.05% / 17.91%     | **under**                    |
| `src/main/**`            | 60% / 50%                | 29.87% / 34.33%     | **under**                    |
| **Project total**        | **80% / 75%**            | **67.36% / 64.30%** | **under**                    |

The shortfall sits almost entirely in code that has never had unit tests: `main/index.ts` (0%, 162 lines), `preload/index.ts` (0%, 28), `bootstrap/start.tsx` (0%, 120), `renderer/render` (21%), `devtools` (48%). Three of those — `devtools`, `preload`, and `bootstrap` — `TESTING.md` §4 never assigned a threshold to at all, while the coverage config counts them toward the total; that mismatch is itself worth resolving before chasing the number.

07e's own code is not the cause: `save-triggers.ts`, `save-controller.ts`, `transaction-watch.ts`, and `return-summary.ts` are at 100% lines, and the three new components 85–89%.

**This blocks criterion 27, and therefore the v0.1 boundary — not milestone 07e.** Closing it means testing the composition root, the preload bridge, the Electron entry, and the PixiJS view layer, which is a hardening pass of its own rather than a loose end of the save system. It is an owner scope call, and `PLAN.md` §8 is explicit that no gate may be waived.

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
