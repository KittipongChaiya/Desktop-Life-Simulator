# SAVE COMPATIBILITY REPORT — v0.1 (§1–§11) · v0.3 addendum (§12)

> **Status:** The v0.1 save-compatibility gate (`fix/0.1/7.2.md`). Verification only — this document records what the shipped pipeline does; it decides nothing.
> **Owns:** The compatibility guarantees v0.1 makes to save files, and the evidence for each.
> **Does not own:** The format itself (`SAVE_FORMAT.md`), why JSON and a linear chain (ADR-002), the versioning and migration **contract** (ADR-015).
> **Verified by:** `tests/save-compatibility.test.ts` (45 tests), plus the phase-07 suites it builds on. Every claim below is a test, not an intention. If a claim and the suite disagree, the suite is right.

---

## 1. Why this document exists

v0.1 is the first release whose save files outlive the build that wrote them. From the moment a player opens the game, `slot-0.json` stops being an implementation detail and becomes **the product** (`SAVE_FORMAT.md` preamble). This gate exists to state — before that happens, and in writing — exactly what the format promises, so that v0.2 has something to be compatible _with_.

No gameplay changed to produce this report. It is verification, and its only new code is tests.

---

## 2. The save header

Every save opens with the same five facts, in this order:

| Field                  | Purpose                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `schemaVersion`        | **First key in the file.** The only value that drives migration                           |
| `magic`                | `desktop-life-simulator/save` — constant forever. A file without it is not a save         |
| `meta.gameVersion`     | Informational only, and deliberately never read by logic (ADR-015 §2)                     |
| `meta.createdAtUnixMs` | World creation. Written once, preserved by every save and every migration — save identity |
| `meta.savedAtUnixMs`   | When this write happened. The input to offline progress                                   |
| `meta.playtimeTicks`   | Simulation time behind this save                                                          |
| `meta.saveCount`       | Successful writes so far. Increments only on success                                      |
| `world.seed`           | The world's identity. Authoritative from creation, carried forever                        |

**Why the ordering is load-bearing:** a future build must be able to say "this save is from a version I do not support" about a file it cannot otherwise parse. Version and identity live in the first ~60 bytes, so that judgement never depends on the rest of the document being intact. Pinned by a test that asserts `"schemaVersion"` begins at byte 1 of the serialized text.

Optional metadata: none in v0.1. `plugins: {}` is present from version 1 so that v0.2's loader needs no migration to introduce it (§7).

---

## 3. Compatibility rules

Every case `fix/0.1/7.2.md` enumerates, with the delivered behaviour and the reason.

| Case                    | v0.1 behaviour                                                                      | Why                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Older save**          | Migrated forward through the chain, one link per version, never skipping            | The only mechanism that can exist before the first real migration (ADR-015 §3)                                          |
| **Current save**        | Loads unchanged, zero repairs                                                       | —                                                                                                                       |
| **Future save**         | **Refused outright.** Never partially loaded, and never replaced by an older backup | A newer save describes a world this build cannot represent; quietly loading a backup instead discards the newer session |
| **Unsupported version** | Treated as corrupt, with a clear message                                            | A version number no release ever shipped is indistinguishable from corruption (ADR-015 §4)                              |
| **Missing field**       | Typed validation error → `.bak` fallback → clear message. Never a throw             | Structural validation runs before hydration precisely so a missing field cannot become a crash                          |
| **Unknown field**       | **Accepted on read**, ignored                                                       | A reader that rejects fields it does not recognise rejects its own future                                               |
| **Additional field**    | Accepted on read, then **dropped by the next save**                                 | The writer rebuilds the document from live world state; it emits what it knows (`SAVE_FORMAT.md` §3.1)                  |
| **Removed field**       | Not applicable at v1 — there is no earlier shape to have removed one                | The mechanism that will handle it is proven with a synthetic two-step chain (07b)                                       |

### 3.1 The one rule that could surprise a v0.2 author

**Unknown fields survive reading but not re-saving.** They pass validation, they survive the repair pass's JSON round trip, and then hydration reads only the fields it knows and the next write rebuilds the document from the live world. Anything this build does not understand is gone one autosave later.

This is a consequence of hand-written serialization, which `SAVE_FORMAT.md` §3.1 requires for a reason worth more than field preservation: reflective serialization turns an internal refactor into a silent schema change. The trade is deliberate, and the test that pins it says so.

It is also **not currently reachable in a way that loses player data**: a field this build does not know can only arrive from a hand-edited file or from a build that added a field without bumping `schemaVersion`, which ADR-015 §2 forbids. A genuinely newer save is refused before it reaches this path.

---

## 4. Determinism

`save → load → continue` produces byte-identical results to a world that was never saved, verified subsystem by subsystem after 1,000 further ticks on a farm with 20,000 ticks behind it:

workers · resources · containers · economy · buildings · inventory · simulation tick · **RNG** · world state · player state · crop statistics.

Two additional forms of the same property:

- **Two loads of the same bytes** continue identically to each other.
- **The RNG resumes mid-stream**, not from its seed expansion. Asserted on the next sixteen _draws_, not on the stored state — the draws are what determinism means — together with a control proving the stream was genuinely mid-sequence.

> The RNG assertion exists because a mutation control found its absence. An earlier version of this suite passed with RNG restoration deliberately deleted, because no scenario had advanced the generator. The scenarios now stir it, and the deletion fails five tests.

### 4.1 Round trip

`save → load → save` is not merely equivalent — it is **byte-identical**, across all seven scenarios in §6. When metadata legitimately moves on (a new timestamp, an incremented `saveCount`), those two fields are the _only_ difference; `world`, `quarantine`, `plugins`, and `createdAtUnixMs` are untouched.

**100 consecutive save/load cycles** leave the document identical to the first byte. This is the test that would catch drift too small to see in a single round trip — a re-sorted map, a float re-rendered, a counter incremented on read — because such drift compounds.

---

## 5. Offline progress

Verified in phase-07d and re-checked here:

| Property                     | Guarantee                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **No duplicated production** | Catch-up runs once, at the load boundary, from `savedAtUnixMs`. Two loads of the same bytes with the same elapsed time produce identical worlds |
| **No missing production**    | Growth is exact by construction; economy recovery is exact over period crossings                                                                |
| **No divergence**            | Catch-up is closed-form arithmetic and never touches the RNG stream                                                                             |
| **Never over-credits**       | Property-tested against the real simulation on byte-identical clones at n ∈ {100, 1,000, 50,000}                                                |
| **Bounded**                  | 8-hour cap; negative elapsed time clamps to zero, never rewinds                                                                                 |

---

## 6. Compatibility test matrix

Each scenario round-trips through the **whole** pipeline — serialize → bytes → parse → migrate → structurally validate → semantically repair → hydrate — and must produce **zero repairs**. A repair means the document said something the world could not mean; a world this build itself produced must never need one.

| Scenario                        | Shape                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| Empty world                     | A brand-new farm — the smallest save v0.1 can write             |
| Minimum world                   | One owned tile, one worker                                      |
| Large world                     | 1,600 owned tiles, 800 standing crops, 500,000 ticks            |
| Many workers                    | 30, each carrying, at varied energy and sub-period accumulators |
| Large inventory                 | Every slot occupied, filled through the ordinary container path |
| Full storage, maximum resources | All four buildings at capacity; a 2,000,000,000-coin wallet     |
| Long economy simulation         | 20,000 real ticks with workers, market, and seed bin live       |
| Repeated cycles                 | 100 consecutive save/load operations                            |

---

## 7. Migration framework

The runner shipped in 07b, before anything exists to migrate — deliberately, because writing the mechanism and the first real migration together, under pressure, is how save systems destroy data.

| Property                   | Status                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration               | `migrations/index.ts` — empty, validated at v1                                                                                               |
| Ordering                   | `validateChain` rejects gaps, skips, wrong starts, and chains stopping short — at **startup**, as a build failure, never a player-facing one |
| Idempotency                | Migrating an already-current document is a fixed point: no links applied, byte-identical output                                              |
| Unknown-version rejection  | A version with no chain link is `SaveCorrupt`; a higher version is `SaveFromNewerVersion`                                                    |
| Non-destructiveness        | The runner never mutates its input; a throwing or version-lying link leaves the caller holding the original                                  |
| Proven before it is needed | A synthetic two-step chain — add-a-field, then rename-a-field — exercises the whole mechanism                                                |

**Future migrations require no architectural change.** Adding a link to the ordered array is the entire operation; `migrate.ts` is the one place `schemaVersion` is ever read (ADR-015 §2).

### 7.1 What a future migration looks like

```ts
// migrations/002-add-weather.ts — v0.2, illustrative
export const migration: Migration = {
  from: 1,
  to: 2,
  migrate: (document) => ({
    ...document,
    schemaVersion: 2,
    world: { ...document.world, weather: { kind: 'clear', sinceTick: document.world.tick } },
  }),
};
```

Registered by appending to `MIGRATIONS`. The chain validator then requires it, the golden fixtures prove it, and `v1-empty.json` / `v1-mature-farm.json` must still migrate — **append-only from the moment they were committed** (`TESTING.md` §7.2). If a fixture stops migrating, the migration is wrong; never the fixture.

---

## 8. Failure handling

**A failed save never crashes the game and never damages the existing save.** A failed load never silently starts a new game.

| Failure                       | Response                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Corrupt `slot-0.json`         | Automatic `.bak` fallback, with the fact reported                                                                                |
| Both files corrupt            | Clear in-overlay error. **Never a new game** — that is the forbidden outcome                                                     |
| Missing file (neither exists) | New game — the one case where that is correct (and the state a deliberate reset leaves behind, ADR-045)                          |
| Unknown / future version      | Refused, stated plainly, files left untouched                                                                                    |
| Incomplete or partial data    | Typed validation error; every top-level key removed in turn is a message, not a throw                                            |
| Unexpected fields             | Accepted (§3)                                                                                                                    |
| Semantic damage               | Repaired where unambiguous, **and reported** — never silently accepted                                                           |
| Disk full / permission denied | Notification carrying the path, play continues, retry at the next autosave                                                       |
| Crash mid-write               | The six-step sequence leaves ≥ 1 loadable save after every step; proven by real interruption and by SIGKILL against the live app |

Checksums are deliberately absent, with a reserved additive path (ADR-015 §Alternatives D). Nothing in v0.1 validates a checksum, so the "invalid checksum" row of `fix/0.1/7.2.md` has no behaviour to report — structural validation is what catches damage instead.

---

## 9. Performance

Measured on the reference save (`v1-mature-farm.json`) and on the largest world v0.1 can represent. Full method and ceilings in `PERFORMANCE.md` §8.1.

| Metric                             | Reference farm   | Large world (1,600 tiles, 800 crops) | Ceiling |
| ---------------------------------- | ---------------- | ------------------------------------ | ------- |
| Serialized size                    | 38,730 bytes     | **88,575 bytes**                     | 2 MB    |
| Save (serialization)               | 0.64 ms          | **0.33 ms**                          | 100 ms  |
| Load + full pipeline               | —                | **1.03 ms**                          | 1.5 s   |
| Load + catch-up at the 8-hour cap  | 1.35 ms          | —                                    | 1.5 s   |
| Repeated saves (1st → 10th)        | 0.262 → 0.265 ms | —                                    | flat    |
| Memory growth, accelerated 8 hours | 10,112 bytes     | —                                    | 25 MB   |

Repeated saves are flat, which is the property that matters for a whole-file rewrite: state accumulating per save — a growing quarantine, an unpruned log — would appear as a rising cost long before it appeared as a bug.

**Desktop responsiveness during save** is structural rather than measured: serialization is deferred off the render path into a later task, and disk I/O happens in the main process, so a save cannot occupy a frame (`SAVE_FORMAT.md` §7.2, phase-07e).

---

## 10. Known limitations

Stated so none of them is later mistaken for a defect.

1. **Unknown fields do not survive a re-save** (§3.1). Deliberate; the consequence of hand-written serialization.
2. **Plugin data is not preserved in v0.1.** `SAVE_FORMAT.md` §8 promises that data from an absent plugin is written back; v0.1 always writes `plugins: {}`. The key exists so v0.2's loader needs no migration — the preservation rule arrives with the loader that can honour it.
3. **No checksums.** Corruption is caught by structural validation, not by an integrity hash. Additive path reserved.
4. **One save slot.** The path shape supports more; the UI does not.
5. **No pre-migration disk backup.** It ships with the first _real_ migration in v0.2 — no migration can run in v0.1 (ADR-015 §3).
6. **A load-time migration is not written back immediately.** The first ordinary autosave persists the migrated shape (ADR-015 §Alternatives F).
7. **Main validates the renderer's document structurally, not exhaustively.** `save:write` re-serializes the validated object, so a renderer that sent unknown fields would write them. The renderer's only builder is `toSaveDocument`, which cannot.
8. **The 8-hour offline cap** bounds worker catch-up error; time beyond it is not credited.

---

## 11. Release readiness

| Acceptance criterion (`fix/0.1/7.2.md`)       | Status                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| Save files include version information        | **Pass** — §2                                                   |
| Migration framework exists                    | **Pass** — §7                                                   |
| Future migrations need no architecture change | **Pass** — append a link; §7.1                                  |
| Save → load → continue is deterministic       | **Pass** — §4, per subsystem                                    |
| Save → load → save is logically identical     | **Pass** — byte-identical, and over 100 cycles; §4.1            |
| Unknown versions fail gracefully              | **Pass** — §3                                                   |
| Corrupted saves never crash                   | **Pass** — §8                                                   |
| All compatibility tests pass                  | **Pass** — 45 tests, three mutation controls                    |
| Existing tests continue to pass               | **Pass** — full unit suite and E2E green                        |
| No gameplay regressions                       | **Pass** — no gameplay code changed; this gate added only tests |

**The save system is ready for v0.1**, and phase-07.5 (Vertical Slice) is unblocked as far as persistence is concerned.

Two caveats belong to the version boundary rather than to this gate:

1. **The project coverage threshold still fails** — 67.36% lines / 64.66% branches against 80% / 75%. The shortfall is in code unrelated to persistence: `main/index.ts`, `preload/index.ts`, `bootstrap/start.tsx`, the PixiJS view layer, devtools. `PLAN.md` §8 admits no waivers, so v0.1 cannot ship on that gate; nothing about it blocks the vertical slice.
2. **`src/persistence` is below its own bar** — 90.76% lines / 84.15% branches against `TESTING.md` §4's 95% / 90%, the highest in the project because this code protects player data. This gate's 45 tests raised branches by two points and did not move lines, which is itself informative: the uncovered remainder is not compatibility behaviour but the defensive arms of validation and repair that arbitrary-world tests do not reach. Closing it means adversarial input tests rather than more scenarios.

---

## 12. v0.3 addendum (phase-23)

Everything above still holds, verified by the same suite at every commit
since. What v0.2 and v0.3 added to the promises:

### 12.1 The chain, at v0.3

`v1 → v10`, linear and append-only, with a golden fixture at **every** prior
version (`tests/fixtures/saves/`). Two links are not simple field additions
and carry extra proof obligations, both met:

- **`v6 → v7` relays out the world** (64×64 → 80×64): every stored tile
  index re-encodes. Invariant stated in coordinates — a thing at (x, y)
  before the link is at (x, y) after — and pinned including a populated
  quarantine, after an empty-fixture version of the test passed vacuously
  and was caught.
- **`v9 → v10` re-keys offer identity** (`day × 2 + slot` → `day × 4 +
slot`): every frozen contract term rides through untouched, and the v9
  fixture deliberately carries an open AND a fulfilled contract so the
  re-key cannot pass vacuously — the v6→v7 lesson, applied on purpose.

### 12.2 New guarantees carried by the save

| Since | Fact                        | Guarantee                                                                                                       |
| ----- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| v8    | Accepted contracts          | Terms frozen at acceptance; no rebalance or derivation change rewrites a promise                                |
| v9    | Delivered contracts         | Persist to their deadline as receipts — store presence is the double-acceptance guard (the live-caught exploit) |
| v10   | `contractStats.byRequester` | Event-maintained; empty on migration — unrecorded history is never invented                                     |
| v10   | `quests` watermarks         | A paid quest step can never pay again, across ticks, saves, and reloads                                         |

Standing, offers, residents, weather, and demand are **derived** and carry
nothing — a v0.3 save is bigger than a v0.2 save only by the rows above.

### 12.3 Offline progress, extended

The v0.1 table in §5 gains three rows, all proven:

- **Contract expiry needs no model**: expiry is a tick comparison; the
  first live tick sweeps overdue contracts. Nothing can fulfill while away.
- **Quest steps cannot cross while away** (they follow deliveries), so
  catch-up never pays a reward; a migrated save with recorded history is
  paid on the first live tick, deliberately.
- **Offline sales credit at the minimum demand** across the spells the gap
  touched (ADR-033) — computed, exact within one spell, never above any
  spell seen. Conservative crediting preserved.

### 12.4 The two v0.1 caveats, closed

Both §11 caveats are gone: the project coverage gate has been green since
phase-08.0, and `src/persistence` now clears its 95 / 90 bar — the final
points closed by exactly what §11 prescribed, adversarial-input tests
(`tests/migration-defensive.test.ts`, `tests/serialize-ordering.test.ts`,
phase-23).

---

## 13. v0.4 addendum (phase-30)

Four links land in v0.4 — **v10 → v11 → v12 → v13 → v14** — and the version's
engineering signature is the same one v0.3 recorded, applied to bigger systems:
**what is derivable is derived**, so a version that added factories, logistics,
a wilderness and expeditions grew the save by four collections and one grid
re-lay, and by nothing else.

### 13.1 The chain, and what each link is for

| Link        | Adds or changes                                                       | Why it is safe                                                                   |
| ----------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `v10 → v11` | `factories`, empty                                                    | A v10 world had no building any recipe could name                                |
| `v11 → v12` | `routes`, the route id counter (from **1**, never 0), `hauling: null` | A v11 world could not declare a route, so nobody was part-way along one          |
| `v12 → v13` | **Relayout** 80×64 → 112×64; adds `harvestedAt`                       | A thing at (x, y) before is at (x, y) after — asserted by position, not by count |
| `v13 → v14` | `expeditions`, empty                                                  | A v13 world could send nobody anywhere                                           |

**The second relayout is a near-copy of the first, deliberately.** `v12 → v13`
is `v6 → v7` at a different width, with its dimensions written as literals for
the reason `v6 → v7` states: importing the live `WORLD_WIDTH` would have
silently rewritten what the older link does the moment the world widened again.
A frozen link may never change behaviour, and sharing a helper with a later one
is how one of them eventually does.

### 13.2 What v0.4 does NOT store

The list is longer than what it does:

| Not stored               | Derived from                                  |
| ------------------------ | --------------------------------------------- |
| What stands in the wilds | `hash(seed, tile)` — ~2,000 tiles, zero bytes |
| A node's readiness       | `tick − harvestedAt >= regrowTicks`           |
| An expedition's return   | `departedTick + travelTicks`                  |
| An expedition's haul     | `hash(seed, worker, departedTick)`            |
| A craft's progress       | `tick − startedTick`                          |
| A haul's reservation     | The worker's task — nothing to leak (ADR-036) |

Two of these were reservations in the ADRs that specified them and became
derivations during implementation, with the amendments written down rather than
diverged from silently.

### 13.3 The one collection that could have grown with playtime

`harvestedAt` — tile → the tick its node was last worked — is the only thing in
the save that scales with _what the player did_ rather than with world size,
which §3.4 of `SAVE_FORMAT.md` names as the hazard. It does not grow, because
an entry is pruned the moment its node regrows: absent and long-past mean the
same thing to the readiness test.

**Measured**: 132 entries after 120,000 ticks with three foragers, and there is
a test asserting it stays bounded across a long unattended run.

### 13.4 Offline progress, extended again

§5's table gains three rows for v0.4, and the honest one is listed first:

- **A chain's buffers are credited; the chain is not.** Offline, a factory
  finishes what was already staged in its input when the player left, and no
  hauling happens. That **under-credits** — the one direction §9.2 permits —
  and it makes `PLAN.md` §5's criterion 4 PARTIAL rather than PASS. The cost is
  stated at the code: a player who leaves a chain running for eight hours is
  credited the buffers, not the chain.
- **An expedition needs no model at all.** Its return is a comparison against
  `departedTick`, so a trip that completes during a gap resolves on the first
  live tick — and there is a test that runs one world through every tick of a
  trip and jumps another over the gap and asserts the same goods arrive. A gap
  ten times the travel time still credits exactly one trip.
- **The wilds need no model either.** Regrowth is arithmetic on the tick, so an
  absence of any length resolves exactly.

### 13.5 A worker who is away is not farm labour

Found at phase 30's economy read-through and fixed there: `catchUpWorld` sized
its statistical worker budget from `world.workers.size`, which includes anyone
on an expedition — so the model credited a harvest nobody performed. Everyone
away is now excluded for the whole gap, under-crediting a hand who would have
come home part-way through it.

Their haul is not lost by that exclusion: a return is a comparison, so the
expedition system brings them in on the first live tick after the gap.

### 13.6 A third over-credit, and what it says about property tests

`catchUpFactories` advanced crafts at a cadence of `craftTicks`; the simulation
runs them at `craftTicks + 1`, because a factory that completes on tick T is
idle on T and cannot restart until T + 1. The model claimed 11 crafts where the
game completes 10.

It is the third over-credit that one function has had, and it shipped in
phase 26 because **the never-over property fails on about one run in three, so
a green run was never evidence.** Both counterexamples are now pinned as
deterministic examples beside the property, and the cadence has a test that
measures the interval off a live mill rather than asserting a constant.

**The transferable rule**: a probabilistic gate that has ever been red is not
discharged by a green re-run. Run it until the failure rate is known, then pin
the case.

---

## 14. v0.5 addendum (phase-52)

**v0.5 added no link.** The chain is still `v1 → v14` and
`CURRENT_SCHEMA_VERSION` is still 14, after a version that changed how every
object in the world is drawn, gave seven buildings real multi-tile footprints,
rebuilt the entire art set, added pitch variation to audio, added zone painting
and added a "what now?" line to the HUD.

**That is the headline, and it is the point.** A version this visible adding
nothing to the file is not an accident; it is ADR-009 §1 applied to every
temptation the version offered.

### 14.1 What v0.5 was tempted to store, and did not

| Tempting to store      | Where it actually comes from                                      |
| ---------------------- | ----------------------------------------------------------------- |
| A building's footprint | Its definition, looked up by the id the save already held         |
| The tiles it blocks    | Recomputed from origin + footprint on load and on founding        |
| Which grass variant    | A hash of the tile index                                          |
| Which worker rig       | A hash of the worker id                                           |
| Decor placement        | A hash of the tile index, filtered by region                      |
| Sprite depth / z-order | The base's position in world pixels, computed each frame          |
| A sound's pitch offset | A per-sound play counter through the same hash                    |
| "What to do next"      | A question asked of the snapshot the HUD already holds            |
| Painted worker zones   | Already persisted since v0.3 — v0.5 only made them reachable      |
| Onboarding progress    | Nothing. There is no tutorial state, because there is no tutorial |

Each row is a save field that was never written, a migration that was never
needed, and a way for an old file to disagree with a new build that does not
exist.

### 14.2 The one compatibility question v0.5 did raise

Footprints changed what counts as a legal placement, and **worlds saved before
v0.5 contain buildings placed under the old rule** — a 3×3 mill one tile from
a shed was legal when both were one tile.

ADR-042 §4 fixed the answer: **loading never fails and never moves a
building.** Occupancy is rebuilt across footprints on load, so overlapping
legacy buildings simply both mark the tiles they cover; the grid is a set of
blocked tiles, not a claim of ownership, and marking one twice is not a
conflict. Only NEW placements are validated against the new rule.

The alternative — rejecting or relocating a legacy building — would have made
a rendering change destroy a player's farm, which is the one outcome this
document exists to prevent.

### 14.3 Status

`v1 → v14` against every golden fixture, zero repairs, unchanged from v0.4
because nothing in the chain was touched. The guarantees stated in §13 stand
as written.

---

## 15. v0.6 addendum (phase-63)

**v0.6 added no schema field, no migration, and no new save version.** It is the
first version of which that has been true, and it is not an accident — ADR-046
§1 defines the content tier by exactly this property: _"If a proposed piece of
content would require a save migration, it is not v0.6 content — it is a system,
and it belongs to a later version."_

### 15.1 Why a content version is free, and where the freedom comes from

ADR-004 §5, written at phase 00 and unchanged since: **definitions are data;
instances reference them.** A crop in a save stores a `ContentId`, a
`plantedTick` and a tile — never a growth time, never a price, never a sprite
key. So adding eight crops, seven recipes, three buildings and three
destinations changes what a NEW farm can do and changes nothing about what an
old one contains.

That is a decision paying out six versions later, and it is worth naming because
the alternative was available and normal: had a crop instance stored its own
growth time — as most engines would — every one of the twelve crops would now be
a migration, and rebalancing one would be a schema change.

### 15.2 The one way v0.6 could have broken a save, and the guard against it

**A `ContentId` is a permanent name.** An instance resolves its definition at
load, so renaming `core:wheat` orphans every wheat in every save and removing it
does the same. A content pass is therefore the version most able to destroy a
farm by accident — not by writing a bad field, but by taking away a name
something already points at.

ADR-046 §3 forbids renaming and removing outright, and
`tests/content-census.test.ts` is what makes that a fact rather than an
intention: it pins **all 73 ids that existed at the v0.6 baseline** — 64 across
twelve registries, plus 4 residents and 5 quest chains — and fails if any one of
them stops resolving. Deliberately removing content in a later version means
editing that list, which is exactly as much friction as the decision deserves.

Nothing was renamed. Nothing was removed. Two definitions had their NUMBERS
changed (the Sunken Coast and Ashfell hauls, brought inside a worker's carrying
capacity), which is a balance change and not an identity change.

### 15.3 What a v0.5 save does when it meets v0.6

It loads, and it simply never refers to the new ids. A farm saved before this
version has turnips in it; the game it loads into knows about strawberries as
well, and nothing in the save has an opinion about that.

The golden fixtures carry this: every prior version's fixture still loads, which
is `PLAN.md` §8's binding gate, and the v0.5 fixture required no addition to the
migration chain because there is nothing to migrate.

### 15.4 Status

**PASS.** Save compatibility is unchanged by v0.6, every prior fixture loads,
the migration chain is untouched, and the id floor is guarded by a test rather
than by care.

The one thing this version could have done to a save — orphaning an instance by
renaming what it points at — is the thing ADR-046 §3 was written to prevent
before any content was authored.
