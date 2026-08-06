# ADR-027: v0.2 Save Evolution and Content Isolation

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented across Phases 09–14
**Bound by (not re-litigated):** ADR-015 (the whole contract — identity header, version separation, migration governance, the compatibility matrix, the authoritative-state set, failure handling); ADR-002 (JSON, atomic writes, the linear chain, plugin data preserved); ADR-026 (content identity and the isolation invariant); ADR-019 §7 (enablement is world state); ADR-009 §2 (derive, never accumulate); ADR-012.
**Answers:** ADR-015 §Open Questions 1 — pre-migration backup retention, which that ADR deferred to _"the first real migration (v0.2)."_

---

## Context

v0.1 shipped `schemaVersion: 1` and, deliberately, **no migration** — version 1 is the first, so the chain infrastructure was proven with a synthetic two-step chain (phase-07b) and has never run against a player's save.

v0.2 is where it runs. Five of its phases change the persisted shape, and one of them _removes_ a field for the first time. That is the moment several rules ADR-015 wrote in advance stop being theory:

- **The burn rule** (§2): a schema version is immutable from the commit of its golden fixture, _"even inside one unreleased development cycle."_ So v0.2 cannot land one tidy `v1 → v2` at the end; it lands a chain.
- **The pre-migration backup** (§3): required _"the first time a real migration runs against a player's save"_ and stated to ship _"with the first real migration, in v0.2."_
- **The retention question** (Open Question 1): kept indefinitely or pruned? Deferred to now.

Two things raise the stakes above bookkeeping. ADR-025 §2 shows that the pre-migration backup is not insurance but the _only_ recovery path when a player rolls back across a schema boundary — so its retention policy is load-bearing. And ADR-026 §3's isolation invariant, which promises that removing a content source touches nothing outside its namespace, has to survive a chain of five migrations to still be true at the end of the version.

The release gate this all serves is one line in `PLAN.md` §3: **a v0.1 save loads in v0.2 with no data loss.**

---

## Decision

**v0.2 lands one schema version per shape-changing phase, at that phase's commit boundary. Pre-migration backups are kept indefinitely, one per schema version. Content isolation is a property test that runs against every version in the chain, not a claim made once.**

### 1. One bump per phase, at the phase's commit boundary

Not one per commit, and not one for the whole version.

| Link      | Adds or changes                                                                    | Phase | ADR                    |
| --------- | ---------------------------------------------------------------------------------- | ----- | ---------------------- |
| `v1 → v2` | Source manifest; enablement set                                                    | 09    | ADR-026 §4, ADR-019 §7 |
| `v2 → v3` | Calendar constants (`ticksPerDay`, the phase set)                                  | 10    | ADR-020 §2             |
| `v3 → v4` | Season constants (`daysPerSeason`, the season list)                                | 11    | ADR-021 §1             |
| `v4 → v5` | **Removes** `grid.moisture`; adds `grid.wateredAt` and the weather period constant | 12    | ADR-022 §3             |
| `v5 → v6` | Per-worker schedule state                                                          | 14    | ADR-024 §4             |

Phases 08, 13, 15, and 16 change no persisted shape — the plugin API surface, audio, and the updater are all outside the save by their own ADRs' design, which is a useful check that those designs were right.

**Why a phase is the unit.** A version is burned when its fixture is committed (ADR-015 §2), so the unit has to be something whose shape is settled and testable in isolation. A commit is too fine — an unreleased development cycle would burn versions for intermediate states nobody ever ran. A whole release is too coarse — it means one migration doing five unrelated things, which is the hardest possible link to review and the least useful one to bisect. A phase is exactly the granularity the project already ships at, and each link ends up small, single-purpose, and independently fixtured.

**The chain stays linear and append-only.** Five links is five links; ADR-002 §Alternatives E already priced the alternative and the runner already validates contiguity at startup.

### 2. Pre-migration backups are kept indefinitely

**Answering ADR-015 Open Question 1: kept indefinitely, one file per schema version, exempt from autosave pruning.**

ADR-015 leaned this way already — _"the cost is kilobytes and the payoff is a recovery path for a bug discovered months later"_ — and ADR-025 §2 converts the lean into a requirement. When a player rolls back across a schema boundary, the pre-migration backup is not a nice-to-have; it is the only artifact an older build can read, because `.bak` is at the same version as the save and is refused with it.

Concretely:

- On the first real migration from version _N_, the untouched original is copied to `backups/slot-0-v<N>-premigration.json` **before** the chain runs.
- One file per version, written once, never overwritten by a later migration from the same version.
- Exempt from the three-most-recent autosave pruning (`SAVE_FORMAT.md` §7.1 step 7).
- Never pruned by the updater, which may not touch the save directory at all (ADR-025 §4).

A player who has moved 1 → 6 holds five small files. At the reference farm's measured 38,730 bytes, that is under 200 KB against a 2 MB per-save guard. The cost is not worth reasoning about further; the recovery path is.

### 3. Removing a field is a migration, not a deletion

`v4 → v5` drops `grid.moisture` — the field that is persisted today and read by nothing (ADR-022 §Context).

ADR-015 §4's matrix already decides the shape: _"Deprecated field → Migrated out. Removal is a shape change: version bump + a migration that drops it. Readers never silently skip fields."_ This is the first time it applies, so the pattern is worth fixing explicitly, because every future removal will copy it:

- The migration **drops the old field and populates the new one with an explicit default** — `wateredAt` initialised to `0`, meaning never watered, in the migration rather than by a tolerant reader.
- The golden fixture at v4 is committed before the link, and it proves forever that a v4 save reaches v5 correctly.
- No data is lost, because `moisture` carried no information: it was written, never read, and the migration is removing an empty array rather than discarding player value.

That last point is stated because a future removal will not have it, and the reviewer of _that_ migration needs to notice the difference.

### 4. Enablement and the source manifest

Both are `world` fields, both arrive in `v1 → v2`, and both default to values that make a v0.1 save indistinguishable from a fresh v0.2 world after migration — ADR-015's worked-example principle, applied.

| Field           | Default for a migrated v0.1 save                           |
| --------------- | ---------------------------------------------------------- |
| Source manifest | The single `core` source, which is what a v0.1 world had   |
| Enablement set  | Everything the build ships enabled, which is what v0.1 was |

**Enablement is world state, not a preference** (ADR-019 §7), so it persists here rather than in `settings.json`. Changing it after the fact follows §5's isolation guarantee: disabling isolates, re-enabling restores.

### 5. Content isolation is tested against every link in the chain

ADR-026 §3's invariant — _removing a content source may affect only entities, containers, side-tables, and save partitions in namespaces that source owns_ — is easy to hold at version 2 and easy to lose by version 6, because each migration is an opportunity to touch a quarantined record while restructuring the document around it.

So it is asserted per link, not once:

- **Quarantine passes through migrations untouched.** A migration restructures known fields; quarantined records are carried verbatim. A link that reads inside a quarantined payload has violated ADR-002 §5's rule about opaque plugin data, one level down.
- **Plugin partitions pass through untouched** — already required by ADR-002 §5, now with five links to survive.
- **The isolation property test runs at every version**, on fixtures at each, not only at current. Removing a source from a v3-era save must be as safe as removing it from a v6 one, because a player can arrive at v6 from anywhere.

### 6. What does not change

Stated so no phase re-derives it:

- The identity header — `schemaVersion` first, `SAVE_MAGIC` second, `meta.createdAtUnixMs` preserved forever (ADR-015 §1).
- Explicit hand-written `toSave`/`fromSave`, byte-stable, canonical key order (ADR-015 §5).
- Derived state is never persisted — and v0.2 _increases_ the amount that is derived rather than stored: the calendar, the season, the weather, and wetness are all computed (ADR-020 §1, ADR-021 §1, ADR-022 §1, §3). That is why five feature phases add so little to the document.
- Loading never writes; migration is in-memory; a partial migration cannot exist on disk (ADR-015 §3).
- The compatibility matrix (ADR-015 §4) in full, including forward refusal.

---

## Alternatives Considered

### A. One `v1 → v2` migration for all of v0.2

- **For:** one link, one fixture, one review; the simplest possible chain.
- **Against:** it contradicts the burn rule (ADR-015 §2) the moment any intermediate build is run against a real save — including by a developer — and it produces a single migration doing five unrelated things, which is the hardest link to verify and the least useful to bisect when it is wrong.
- **Rejected because:** the chain is O(N) and each link is independently fixtured. Five small links cost less to trust than one large one.

### B. Prune pre-migration backups after N successful saves

- **For:** bounded disk use; the save directory stays tidy.
- **Rejected because:** ADR-025 §2 makes the backup the rollback path, and a rollback happens _because a build turned out to be bad_ — which is exactly the situation where the player has already saved several times on the bad build and pruning would have removed the file. The failure mode is silent and total; the cost of avoiding it is kilobytes.

### C. Keep `moisture` and add `wateredAt` beside it

- **For:** no removal, so a strictly additive migration.
- **Rejected because:** it leaves an accumulator-shaped field in the format permanently (ADR-009 §2's hazard, ADR-022 §Alternatives B), and "unused but present" is the state that let it survive a whole version unnoticed. Additive-first (ADR-015 §8) is a preference for how to _evolve_, not a reason to keep dead state.

### D. Put enablement in `settings.json` to avoid the schema bump

- **Rejected because:** ADR-019 §7. A preference that changes what the world does forfeits determinism and replay, and the save would no longer determine the world.

---

## Tradeoffs Accepted

| We accept                                        | To gain                                                   | Mitigation                                                    |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| Five migrations and five golden fixtures in v0.2 | Small, single-purpose, bisectable links                   | Each is written with its phase, not retrofitted               |
| Pre-migration backups accumulate forever         | A rollback across a schema boundary is always recoverable | Kilobytes per version; well inside the size guard             |
| The first removal migration sets a precedent     | Dead state leaves the format instead of being inherited   | §3 states the pattern and flags what a future removal lacks   |
| Isolation is tested at every version             | The invariant survives the chain, not just its start      | Fixtures already exist per version; the test is parameterised |

---

## Consequences

### Immediate (Phases 09–14 implement)

- Each shape-changing phase ships, in **one commit**: the schema change, the serializer update, the version bump, the migration, a golden fixture at the _previous_ version, validation rules, `SAVE_FORMAT.md` §2, and — where the state accrues — a `catchUp`. This is `SAVE_FORMAT.md` §9's checklist, unchanged.
- Phase 09 additionally ships the pre-migration backup, because it owns the first real migration (ADR-015 §3).
- `SAVE_FORMAT.md` gains a section recording backup retention and the v0.2 chain.

### Ongoing (binding on every future session)

- **One schema version per phase**, burned when its fixture lands.
- **A pre-migration backup is never pruned.**
- **A migration never reads inside a quarantined or plugin payload.**
- **Removing a field is a migration with an explicit default**, never a tolerant reader.
- Prefer derivation to persistence — v0.2's feature phases are the evidence that it works.

### Validation

- **The gate:** every v0.1 golden fixture (`v1-empty`, `v1-mature-farm`) migrates through the full chain to current, validates with zero repairs, and continues deterministically. This is `PLAN.md` §3's success criterion, executable.
- **Per-link fixtures:** each version's fixture migrates to current; the runner's chain validation still fails a malformed chain at startup.
- **Determinism of links:** each migration produces identical output on repeated runs (ADR-015 §3).
- **Isolation at every version:** ADR-026 §Validation's property tests, parameterised over every fixture version.
- **Round-trip and byte-stability:** unchanged, at every version.
- **Rollback recovery:** a pre-migration backup restored into the older build loads and continues correctly (shared with ADR-025 §Validation).

### Revisit if

- A phase needs two schema versions → it may have. The burn rule governs, not this ADR's table.
- Backup accumulation becomes measurable → it will not before a great many versions; and the size guard in `SAVE_FORMAT.md` §3.4 already watches the saves themselves.

---

## Related

| Document                                                   | Relationship                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| ADR-015                                                    | The contract this executes; Open Question 1 answered in §2  |
| ADR-026                                                    | The isolation invariant §5 tests per link                   |
| ADR-025 §2                                                 | Why retention is load-bearing rather than insurance         |
| ADR-019 §7, ADR-020 §2, ADR-021 §1, ADR-022 §3, ADR-024 §4 | The five shape changes                                      |
| `SAVE_FORMAT.md` §2, §9, §10                               | The schema, the change checklist, and the test requirements |
| `PLAN.md` §3                                               | The v0.2 success criterion this makes executable            |
