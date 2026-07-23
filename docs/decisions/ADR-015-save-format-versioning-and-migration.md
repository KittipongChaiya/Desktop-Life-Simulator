# ADR-015: Save Format Versioning & Migration

|                   |                                               |
| ----------------- | --------------------------------------------- |
| **Status**        | Accepted                                      |
| **Date**          | 2026-07-23                                    |
| **Deciders**      | Project owner (directive `fix/0.1/7.0ADR.md`) |
| **Supersedes**    | —                                             |
| **Superseded by** | —                                             |

> The long-term contract for every save file this project will ever produce, decided **before** phase-07 writes the first one. Once v0.1 ships, save compatibility is a permanent responsibility; this ADR exists to make that responsibility cheap to honor and expensive to break. Authored under the foundation freeze (ADR-012) as its third sanctioned new decision. ADR-002 (frozen) owns the _mechanism_ — why JSON, why atomic writes, why a linear chain; `SAVE_FORMAT.md` owns the field-by-field _schema_; this ADR owns the _contract_ — save identity, version separation, compatibility policy, migration governance, restoration guarantees, and failure handling. It complements both and replaces neither.

---

## Context

Phase-07 is the last phase of v0.1 and the first time a player's world touches disk. Every prior phase produced state that a crash could lose harmlessly, because the app was the only witness. From phase-07 onward the save file **is the product** (`SAVE_FORMAT.md` preamble, ADR-002 §Context): a player who returns after months expects the farm they left, loaded by an app that may be several schema versions newer.

What ADR-002 decided in phase-0 — versioned JSON, atomic writes, a linear migration chain — is the right mechanism, and it is frozen. What it deliberately left open, and what `SAVE_FORMAT.md` has since specified only partially, is the surrounding contract:

1. **Identity.** Nothing in the current sketch says _this file is a Desktop Life Simulator save_. A JSON document with a bare `schemaVersion: 1` could be anything.
2. **Version separation.** `schemaVersion` and `meta.gameVersion` exist, but when each changes — and how either relates to the application's package version — has never been written down. Version-string-driven logic is the classic save-system rot, and the only defense is deciding the separation before the first save exists.
3. **Compatibility policy.** The load sequence handles newer/older/corrupt, but the full case matrix — unknown fields, missing fields, deprecated fields, never-shipped versions, unknown content — has answers scattered across three documents and gaps between them.
4. **Migration governance.** The `Migration` interface exists on paper; how migrations are registered, what "never modify the original" means precisely, and what happens when a shipped migration is _wrong_ have no owner.
5. **Restoration completeness.** "Loading restores the world" is a slogan until the authoritative-state set is enumerated — and the shipped `World` (phases 03–06) has grown state the phase-0 sketch never anticipated: event-maintained cumulative stats, building storage side-tables, the seed bin's per-tile memory, and an ID allocator whose counter is _not_ reconstructible.

One drift must also be reconciled: `SAVE_FORMAT.md` §2 still sketches a crop `growth` accumulator and a growth catch-up row that frozen ADR-009 explicitly obsoleted (growth is a pure function of `plantedTick`; offline growth is exact). Frozen documents win conflicts by standing still (ADR-012 §5); the working document is corrected under this ADR's documentation pass.

**Bound by (frozen, not re-litigated):** ADR-002 (mechanism), ADR-003 §3 (disk I/O in main only; renderer untrusted), ADR-004 §5 (content referenced by `ContentId`, never inlined), ADR-007 (fixed tick, seeded RNG, tick-only time), ADR-008 (events are transient facts), ADR-009 (derived tile state, exact growth), ADR-010 (commands are the only write path, applied on tick boundaries), ADR-011 (conserved container-owned resources), ADR-013 (economy state and its catch-up contracts), ADR-014 §4 (application preferences are never save data).

---

## Decision

**Every save is a self-identifying, versioned document under a permanent compatibility promise: any save written by any shipped version loads in every future version, migrated through an append-only linear chain, or is refused with the original left untouched on disk. Gameplay code never reads a version. Migration is a persistence concern only.**

### 1. Save identity — the mandatory header

The header is the first three members of the document, in this fixed order:

```jsonc
{
  "schemaVersion": 1, // FIRST key — ADR-002 §1, unchanged
  "magic": "desktop-life-simulator/save", // format identity — constant, forever
  "meta": {
    "gameVersion": "0.1.0", // build that WROTE the save — informational only
    "createdAtUnixMs": 1753000000000, // world creation — set once, preserved forever
    "savedAtUnixMs": 1753084800000, // last successful save
    "playtimeTicks": 1440000,
    "saveCount": 87,
  },
  "world": {/* seed, tick, rngState, … — SAVE_FORMAT.md §2 */},
  "plugins": {}, // reserved extension point since version 1
}
```

Field-by-field, against the directive's required list:

| Required field         | Where it lives              | Rules                                                                                                                                      |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Magic identifier       | `magic` (second key)        | The constant `"desktop-life-simulator/save"` (`SAVE_MAGIC`). Never changes for the lifetime of the format. A file without it is not a save |
| Save format version    | `schemaVersion` (first key) | Monotonic integer from `1` — ADR-002 §1's first-key rule stands so a truncated file is still identifiable; the magic sits directly after   |
| Game version           | `meta.gameVersion`          | The semver of the build that wrote the save. **Never drives logic** (`SAVE_FORMAT.md` §2.1) — diagnostic and display only                  |
| Creation timestamp     | `meta.createdAtUnixMs`      | Written once when the world is created; preserved verbatim by every save and every migration thereafter                                    |
| Last save timestamp    | `meta.savedAtUnixMs`        | Rewritten on every save; the offline-progress clock anchor (`SAVE_FORMAT.md` §6.2)                                                         |
| World seed             | `world.seed`                | Deliberately **not** duplicated into `meta` — it is authoritative gameplay state, and a second copy is a second source of truth            |
| Metadata               | `meta.playtimeTicks` etc.   | `meta` is the designated home for future informational fields (a farm name, a future checksum). Informational means: never drives logic    |
| Future reserved fields | `plugins`, `meta`           | `plugins: {}` is written from version 1 so the v0.2 loader needs no migration (ADR-002 §5); new _gameplay_ state is a `world` field + bump |

The magic is placed second rather than first because ADR-002 §1 (frozen) fixes `schemaVersion` as the first key so a truncated or corrupt document can still be routed. Both sit inside the first ~60 bytes; any identity sniff reads them together. Reordering would supersede a frozen clause to gain nothing.

### 2. Version separation — three concepts, three change rules

| Concept                 | Lives in           | Changes when                                                                                  | May drive behavior?                       |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Save format version** | `schemaVersion`    | The persisted shape changes — add, remove, rename, retype, re-encode, or re-mean a field      | **Yes — the only version that ever does** |
| **Game version**        | `meta.gameVersion` | Every product release, whether or not the schema moved                                        | Never                                     |
| **Application version** | `package.json`     | Every build/packaging release; it is the string stamped into `meta.gameVersion` at write time | Never                                     |

The three are independent by construction: many releases can ship without a schema bump; one development cycle can bump the schema more than once; a packaging-only patch advances the application version and nothing else — and none of that matters at load time, because **only `schemaVersion` is ever consulted**. Version strings drift, get reused, and get compared wrongly; an integer under a single owner does not. This elevates `SAVE_FORMAT.md` §2.1's "never drives logic" row from a schema note to an architectural rule: _gameplay code must never depend on save version_ — `src/sim` has no concept of a save version at all, and even `src/persistence` reads `schemaVersion` in exactly one place, the migration runner.

**A schema version is burned the moment its golden fixture is committed.** From that commit on, the version's shape is historical fact: fixtures are append-only (`SAVE_FORMAT.md` §4.4, `PROJECT_STRUCTURE.md` §3), and changing the shape again means the _next_ version and the next migration — even inside one unreleased development cycle. This is the discipline that keeps the chain honest without needing to ask "did anyone's disk ever see this?"

### 3. Migration governance

ADR-002 §3's rules stand in full (linear `from + 1`, pure, append-only, total, golden-fixture-backed). This ADR adds the governance around them:

- **Registration is ordered data.** Migrations register in the explicit array in `src/persistence/migrations/index.ts` — one of the repo's two sanctioned ordered-data `index.ts` files (`PROJECT_STRUCTURE.md` §5.4). The runner validates the chain at startup: contiguous, gap-free, `from + 1` throughout, ending at `CURRENT_SCHEMA_VERSION`. A malformed chain fails the build, not the player.
- **Each link runs at most once, deterministically.** The runner routes by `schemaVersion`, so no document ever passes through the same link twice; and every link is a pure function — identical input document, identical output document, on every run. That determinism (asserted by test, `SAVE_FORMAT.md` §10) is what makes an interrupted load harmless: the next launch simply re-runs the same chain to the same result.
- **Non-destructive in memory.** `migrate(doc)` returns a **new** document; the input is never mutated. A link that throws must leave the caller holding the untouched original for the error path — and the coding standard already demands immutability everywhere.
- **Non-destructive on disk.** Loading never writes. A migrated document reaches disk only through the ordinary atomic save (`SAVE_FORMAT.md` §7.1), which preserves `.bak` — so a _partial migration can never exist on disk, structurally_. Additionally, the first time a real migration runs against a player's save, the pre-migration original is copied to `backups/slot-0-v<N>-premigration.json` — one per schema version, exempt from autosave pruning — so even a _wrong but well-formed_ shipped migration destroys nothing. (This backup ships with the first real migration, in v0.2; in v0.1 no migration can ever run, since version 1 is the first.)
- **A wrong shipped migration is repaired forward.** Append-only means it is never edited; the fix is a new migration after it, plus the pre-migration backup for saves already converted. This is ADR-002 §3's rule with its recovery path named.

### 4. Compatibility policy — the matrix

The complete case set, each with its verdict:

| Case                                                       | Verdict                    | Behavior                                                                                                                                                                                 |
| ---------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save at the current version                                | **Accepted**               | Validated (`SAVE_FORMAT.md` §5), hydrated                                                                                                                                                |
| Save at any older _shipped_ version                        | **Migrated**               | Chain runs `N → current`, then validation. Supported **forever** — dropping a link requires a successor ADR naming the explicit, documented reason                                       |
| Save at a _newer_ version                                  | **Rejected**               | Refused with a clear "save from a newer version" message; never partially loaded (partial load silently destroys the newer session's fields)                                             |
| `schemaVersion` missing, non-integer, or < 1               | **Rejected as corrupt**    | Routed to `.bak` fallback; never a silent new game                                                                                                                                       |
| Save at a version that never shipped and has no chain link | **Rejected as corrupt**    | Indistinguishable from corruption by construction — §2's burn rule means every real version has a link                                                                                   |
| Unknown **core** field at a known version                  | **Ignored**, logged        | Cannot come from a newer build (shape changes bump the version) — it is hand-editing or a discipline bug. Not fatal; not round-tripped (explicit serialization writes only known fields) |
| Missing core field at a known version                      | **Repaired or rejected**   | A missing field is what migrations exist to add; at the _current_ version it is structural corruption — repair where unambiguous (`SAVE_FORMAT.md` §5.2), else `.bak`                    |
| Deprecated field                                           | **Migrated out**           | Removal is a shape change: version bump + a migration that drops it. Readers never silently skip fields                                                                                  |
| Unknown `ContentId` (uninstalled plugin, removed content)  | **Quarantined**, preserved | Removed from the active world, kept verbatim in the document, restored if the content returns (`SAVE_FORMAT.md` §5.3). Never deleted                                                     |
| Data under `plugins.*` for an absent plugin                | **Preserved**              | Written back untouched (ADR-002 §5). Core never reads, migrates, or drops it                                                                                                             |
| Semantically impossible values (negative coins, off-grid)  | **Repaired**, logged       | Repair where unambiguous, drop where meaningless, **never delete player value** (`SAVE_FORMAT.md` §5.2)                                                                                  |

The standing principle over the whole table: **user saves are user data.** No case above may be resolved by discarding the player's world when any lesser resolution exists, and no future version may invalidate a shipped save without an explicit successor ADR documenting why migration was technically impossible.

### 5. Serialization guarantees

`SAVE_FORMAT.md` §3 is the specification; this ADR binds its principles as contract:

- **Only deterministic gameplay state.** The document contains stable identifiers (`ContentId`s, integer entity IDs), integers, and the three permitted rounded floats (price multipliers). It never contains runtime pointers, closures, platform or Electron objects, renderer or Pixi state, UI or presentation state, snapshot slices, or anything from `settings.json` (ADR-014 §4 — the preference/save boundary was fixed in code in phase-01.8, before this schema existed, precisely so nothing has to be migrated out later).
- **Explicit, by hand, byte-stable.** Every field is written by a hand-authored `toSave`/`fromSave` pair; reflective serialization is banned (ADR-002 §Consequences); the same world serializes to identical bytes, keys in fixed order, collections sorted by stable key (`SAVE_FORMAT.md` §3.1–3.2).
- **Derived state is never persisted.** Crop stage, tile status, pathfinding caches, spatial indexes, task queues rebuildable from world state — all recomputed on load (`SAVE_FORMAT.md` §2.2, ADR-009).

### 6. Deterministic restoration — the authoritative-state set

Loading a save must restore the world such that **the simulation continues byte-identically with a session that never saved** — the ADR-007 determinism property extended across the disk boundary, asserted by property test. That demands the persisted set be exactly the authoritative state:

| Directive item    | Authoritative state persisted                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulation tick   | `world.tick`                                                                                                                                                                                                                                                                                                                                         |
| RNG state         | The generator's **full internal state**, not just the seed — determinism resumes mid-stream (ADR-007; `SAVE_FORMAT.md` §2.1)                                                                                                                                                                                                                         |
| World state       | Grid arrays (`kind`, `owned`, `tilledAt`, `moisture`), crops as `{tile, cropId, plantedTick}` (ADR-009 — no accumulator), `lastPlanted` (the seed bin's memory — recorded facts, not derivable), `cropStats` (event-maintained cumulative counters — "ever harvested" cannot be recomputed from the current crop map)                                |
| Workers           | Position, FSM state, task, path + cursor, action progress, energy, and each worker's carry **container**                                                                                                                                                                                                                                             |
| Resources         | `ItemStack`s — `ContentId` + integer quantity, sorted arrays (ADR-011 §1)                                                                                                                                                                                                                                                                            |
| Containers        | Player inventory, every worker hold, and the `buildingStorage` side-table — the complete owner-tagged set (ADR-011 §2)                                                                                                                                                                                                                               |
| Buildings         | The building store: id, tile, `buildingId`                                                                                                                                                                                                                                                                                                           |
| Economy           | Wallet coins, per-item price multipliers, the land-expansion counter (ADR-013 — tick-derived recovery is exactly why persisted multipliers cannot be reset by save/reload)                                                                                                                                                                           |
| Player state      | v0.1 has no player entity; the player _is_ inventory + wallet + plot ownership + progression counters, all above                                                                                                                                                                                                                                     |
| Commands          | **Not persisted — deliberately.** Saves serialize at a tick boundary, after `commandSystem` has drained the queue (ADR-010 §3). An unapplied command is by definition not yet part of the world; what the player _did_ is in the state, what they were _about to do_ is not state                                                                    |
| **ID allocation** | The allocator's counters, persisted explicitly. The tempting `max(existing IDs) + 1` reconstruction is **wrong** the moment any ID has ever been freed (`sellBuilding` frees building IDs today): the loaded world would hand out a different next ID than the never-saved world, and continue-identically fails. Not derivable, therefore persisted |

Not restored because never state: events (transient within their tick's flush — ADR-008 §5), snapshots (recomputed by `snapshotSystem` on the first tick — ADR-005), every renderer and UI structure (disposable views — ADR-003 §4), and desktop-companion state (`settings.json` is not the save, and hidden/click-through have no persisted representation anywhere — ADR-014 §4).

### 7. Failure handling

Restating and completing `SAVE_FORMAT.md` §4.3/§7.3 as policy — **the application never crashes because of invalid save data**, and every failure path is caught, reported in player language, and leaves disk untouched:

| Failure                           | Behavior                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Corrupted / malformed / truncated | Fall back to `.bak`; if that also fails, a clear error naming the file path — **never a silent new game** over a farm that existed          |
| Missing save                      | New game — the only case where that is correct                                                                                              |
| Unknown or invalid version field  | The corrupt path above                                                                                                                      |
| Newer version                     | Refused with a clear message; both files left untouched                                                                                     |
| Migration link throws             | Load aborts with a clear error; the in-memory original is intact (§3 non-destructive), the on-disk files untouched. Never a new game        |
| Partial migration                 | Cannot exist on disk — structurally excluded by §3 (migration is in-memory; disk changes only via the atomic write after full success)      |
| Checksum mismatch                 | Reserved — v0.1 has no checksum (§Alternatives D). If one arrives it is an additive `meta` field, and a mismatch routes to the corrupt path |
| Save-time failures                | Notify, keep playing, existing files untouched (`SAVE_FORMAT.md` §7.3) — a failed save never damages the last good one                      |

### 8. Future-proofing

- **Additive evolution first.** Future needs land as new fields with migration-applied defaults, never as replaced structures, wherever a field suffices. The header (§1), `meta`, `plugins`, and the sparse-store shapes are the designed extension points.
- **Every addition still bumps.** "Unknown fields are safely ignored" (§4) is the _reader's_ robustness, not the _writer's_ license — a writer that adds a field without a bump has created a version that lies about itself. The two rules compose: ignore defensively, version honestly.
- **Readers never break.** A v0.1 reader given a v0.9 save refuses cleanly (§4); a v0.9 reader given a v0.1 save migrates. There is no configuration of shipped versions in which a reader crashes or guesses.

---

## Alternatives Considered

### A. Semver strings for the schema version

- **Rejected because:** a data shape has no minor/patch semantics — it changed or it did not. A total-ordered integer admits exactly one comparison and one mistake-proof routing rule; semver invites "compatible minor" reasoning, which for saved player data is a data-loss generator.

### B. Game-version-driven migration (`meta.gameVersion` selects behavior)

- **Rejected because:** version strings drift, get reused across rebuilds, and conflate packaging with shape. `SAVE_FORMAT.md` §2.1 already bans it at the schema level; §2 here elevates the ban to architecture. One integer, one owner, one reader.

### C. Version-skipping or table-driven direct migration paths

- **Rejected by ADR-002 §Alternatives E**, not re-litigated: O(N²) paths versus an O(N) chain of independently-fixtured links, for a per-load saving measured in microseconds.

### D. Checksums / signatures in v0.1

- **For:** detects bit-rot and hand-editing before the parser does.
- **Against:** the realistic corruption modes — truncation, crash-mid-write, disk-full — are already covered by the atomic write, `.bak`, and structural validation. A checksum adds a write-path cost, a new failure mode, and a temptation to treat player-edited saves as hostile (they are the player's data). Nothing it uniquely catches has a demonstrated occurrence.
- **Deferred:** reserved as an additive `meta` field behind a future version bump, routed to the corrupt path on mismatch (§7).

### E. Magic bytes outside the JSON (binary prefix or envelope)

- **Rejected because:** the file must remain a single valid JSON document — inspectability is the decisive property ADR-002 chose JSON _for_. A prefixed file breaks every JSON tool that would otherwise open it.

### F. Write-back immediately after a load-time migration

- **For:** the migrated document reaches disk sooner.
- **Rejected because:** it adds a write path that runs _before_ the player has seen the loaded world, at the exact moment trust in the new build is lowest. Migration is pure and deterministic (§3), so re-running it on the next launch is free; the first ordinary autosave (~60 s) persists the new shape through the battle-tested atomic path, with `.bak` and the pre-migration backup both intact behind it.

---

## Consequences

### Immediate (phase-07 implements against this contract)

- `SAVE_MAGIC` and `CURRENT_SCHEMA_VERSION = 1` live in `src/persistence/schema.ts`; the header (§1) is part of the version-1 shape and both golden fixtures.
- `meta.createdAtUnixMs` is stamped at world creation and threaded through every `toSave`.
- The ID allocator's counters join the persisted set (§6) — the schema sketch predates the insight.
- The migration runner ships with chain validation (§3) and is proven with a synthetic two-step chain before any real link exists (phase-07 Notes).
- `SAVE_FORMAT.md` is reconciled in the same commit as this ADR: header fields added, the ADR-009 growth drift corrected, the unknown-field policy and non-destructive-migration rules recorded.

### Ongoing (binding on every future session)

- A persisted-shape change is: bump + migration + previous-version golden fixture + `SAVE_FORMAT.md` §2 update, **one commit** (`SAVE_FORMAT.md` §9).
- A schema version is immutable from the commit of its fixture (§2).
- Gameplay code never reads a version; `src/sim` never learns saves exist beyond providing `toSave`-able state.
- Invalidating any shipped save requires a successor ADR naming the reason (§4).
- The first real migration (v0.2) ships the pre-migration disk backup (§3) in the same commit.

### Validation (the §Testing-strategy requirements, mapped)

| Requirement                  | Mechanism                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Round-trip serialization     | Property test: `fromSave(toSave(w))` identical for arbitrary worlds; byte-stability twice-serialized            |
| Migration tests              | Per-link fixture tests + synthetic two-step chain + runner chain-validation tests                               |
| Compatibility tests          | Every golden fixture migrates to current and validates; forward-version refusal; every §4 matrix row has a test |
| Large-world tests            | Reference mature farm under the 2 MB guard (`SAVE_FORMAT.md` §3.4)                                              |
| Repeated save/load           | Save→load→save produces identical bytes (round-trip + byte-stability composed)                                  |
| Offline progression          | Catch-up accuracy per contract; **never over-credits**; < 50 ms at the 8-hour cap (`SAVE_FORMAT.md` §6.5)       |
| Deterministic replay         | Determinism continues across save/load mid-stream (RNG state, §6) — phase-07 acceptance 13                      |
| Long-running simulation      | The phase-06f 8-hour idle proof re-run through a save/load boundary                                             |
| Future-version compatibility | Structural: forward refusal + the append-only fixture regime — v0.1's fixtures are the permanent proof anchor   |

---

## Migration Examples

Worked examples of the two evolution shapes, using the hypothetical v0.2 weather system:

**Additive (the preferred shape) — v1 → v2, a new field with a default:**

```ts
// src/persistence/migrations/v1-to-v2.ts
export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  describe: 'add world.weather with the calm default',
  migrate: (doc) => ({
    ...doc,
    schemaVersion: 2,
    world: { ...doc.world, weather: { kind: 'core:clear', sinceTick: doc.world.tick } },
  }),
};
```

The default is applied **here, explicitly** — never implicitly by a tolerant reader — so a v1 save and a fresh v2 world are indistinguishable after load, and the fixture `tests/fixtures/saves/v1-mature-farm.json` proves it forever.

**Restructure (when a field must move) — v2 → v3, relocating a misplaced field:**

```ts
export const v2ToV3: Migration = {
  from: 2,
  to: 3,
  describe: 'move world.weather.sinceTick into world.weather.history[0]',
  migrate: (doc) => {
    const { sinceTick, ...weather } = doc.world.weather;
    return {
      ...doc,
      schemaVersion: 3,
      world: {
        ...doc.world,
        weather: { ...weather, history: [{ kind: weather.kind, atTick: sinceTick }] },
      },
    };
  },
};
```

Both links are pure, total over any valid input at `from`, return new documents, and ship with a golden fixture at their `from` version — every rule in §3, visible in twenty lines.

---

## Future Extensions

| Future need                       | Arrives as                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Plugin save data (v0.2)           | The loader reads the `plugins` key that has existed since version 1 — **no migration**                  |
| Checksum / integrity field        | Additive `meta` field + bump; mismatch routes to the corrupt path (§7)                                  |
| Save export/import (v0.2)         | The same document — identity is in-band (§1), so an exported file needs no envelope                     |
| Multiple slots (post-v0.1)        | Path shape already supports it (`SAVE_FORMAT.md` §1); zero schema change                                |
| Compression (> 5 MB)              | Transparent gzip beneath the schema (`SAVE_FORMAT.md` §3.4); the JSON document is unchanged inside      |
| Cloud saves (post-v1.0)           | Transport around the same atomic-write artifact; the compatibility promise is what makes sync tractable |
| New accruing systems (every tier) | A `world` field + bump + migration + `catchUp` with a declared accuracy contract, in one commit         |

---

## Open Questions

1. **Pre-migration backup retention** (§3): kept indefinitely (one small file per schema version) or pruned after N successful post-migration saves? Leaning indefinite — the cost is kilobytes and the payoff is a recovery path for a bug discovered months later. Decide with the first real migration (v0.2).
2. **Checksum algorithm and scope**, if Alternative D is ever revisited: whole-document vs `world`-only, and whether a mismatch warns or refuses. Not blocking anything in v0.1.
3. **Export envelope metadata** (v0.2): whether exported saves gain optional out-of-band metadata (screenshot, description) beside the document. The document itself needs nothing (§1 identity is in-band).

---

## Implementation Notes

- **Phase-07 owns all implementation.** This ADR is documentation only; the phase doc (`docs/phases/phase-07-save-load.md`) owns milestones and acceptance. Nothing here changes phase-07's scope except the header fields (§1), the allocator counters (§6), and the explicit non-goals: no checksum, no pre-migration backup (v0.2), no write-back-after-migration.
- `SAVE_FORMAT.md` §2's `world` body is the phase-03–06 sketch; phase-07 finalizes it field-by-field against the shipped `World` (which has since gained `cropStats`, `buildingStorage`, `lastPlanted`, and the economy's expansion counter) under §9's checklist. The reconciliation is mechanical because the authoritative-state set (§6) is now enumerated.
- The load pipeline crosses processes exactly as `ARCHITECTURE.md` §4.3 draws it: main reads, parses, falls back; the renderer migrates, validates, hydrates, catches up. Disk never appears in the renderer (ADR-003 §3), and every IPC payload is validated on receipt.
- Wall-clock timestamps (`createdAtUnixMs`, `savedAtUnixMs`) are written by the **persistence layer**, never read inside `src/sim` (clock access is compile-excluded there — ADR-007 §1). Offline elapsed time is computed at the boundary and handed to `catchUp` as ticks.

---

## Cross References

How ADR-015 complements — never replaces — the standing decisions:

| ADR         | Relationship                                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-002** | The frozen mechanism this contract wraps: JSON, atomic writes, the linear chain. Every §3 rule here is governance _around_ its rules, contradicting none |
| **ADR-003** | Disk I/O in main only; renderer untrusted; `src/persistence` imports only `shared` + `sim` — the process seams the load/save pipeline runs across        |
| **ADR-004** | Content referenced by `ContentId`, never inlined — why rebalancing is a data edit, not a migration; plain-number entity IDs in the document              |
| **ADR-007** | The determinism this format must preserve: tick-only time, RNG state resumed mid-stream, the continue-identically property (§6)                          |
| **ADR-008** | Events are transient facts flushed within their tick — never persisted; `worldLoaded`/`worldSaved` gain their first real producers in phase-07           |
| **ADR-009** | Derived state stays out of the save: no tile status, no crop stage, no growth accumulator — and exact offline growth needs no catch-up entry             |
| **ADR-010** | Commands are not persisted (§6): saves serialize at tick boundaries after the queue drains; the world state _is_ the record of every applied command     |
| **ADR-011** | Containers serialize as sorted stack arrays; conservation makes the document auditable — the round-trip test doubles as a ledger check                   |
| **ADR-013** | Economy state (wallet, multipliers, expansion counter) persists so tick-derived price recovery survives save/reload — the anti-exploit path (§6)         |
| **ADR-014** | The other side of the §4 boundary: preferences in `settings.json` are never save data; loading never touches them; hidden/click-through persist nowhere  |
| ADR-012     | The freeze this ADR is authored under; its third sanctioned new decision                                                                                 |

| Document                            | Relationship                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `SAVE_FORMAT.md`                    | The field-by-field schema authority, reconciled to this contract in the same commit |
| `docs/phases/phase-07-save-load.md` | The implementing phase                                                              |
| `fix/0.1/7.0ADR.md`                 | The source directive                                                                |
