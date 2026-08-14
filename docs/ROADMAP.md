# ROADMAP — v0.2, A Living World

> **Status:** Authoritative for v0.2 execution.
> **Owns:** Phase sequencing within v0.2, per-phase purpose, dependencies, deliverables, risks, acceptance criteria, testing strategy, and commit boundaries.
> **Does not own:** Version milestones and release gates (`PLAN.md`), product intent (`VISION.md`), the decisions each phase implements (`docs/decisions/`), per-phase specifications (`docs/phases/`, written when a phase opens).

**No dates.** A phase completes when its acceptance criteria are met.

---

## 1. What v0.2 Is

**Theme: A Living World.** The world evolves independently of the player, and other people can add to it.

v0.2 is also the version where this project stops being an application and becomes an **engine with a game on top of it**. That is the real work; seasons and weather are how it gets proven. Ten architectural goals govern every phase:

1. Data-driven wherever practical
2. Every major system exposes explicit extension points
3. The simulation stays deterministic
4. Presentation stays completely replaceable
5. Engine systems stay plugin-safe
6. Every gameplay mutation flows through commands
7. Assets never contain gameplay logic
8. Features are independently enableable wherever practical
9. Official content and third-party plugins share one extension model
10. Breaking changes are minimised through versioned public interfaces

Where a phase must choose, these outrank its feature scope.

---

## 2. Phase Sequence

| #    | Phase                                | Depends on | Schema | Ships                                              |
| ---- | ------------------------------------ | ---------- | ------ | -------------------------------------------------- |
| 08.0 | Coverage Reconciliation              | —          | —      | The v0.1 release gate turns green                  |
| 08   | Content Identity & Plugin Foundation | 08.0       | —      | The public API, and `plugins/core/`                |
| 09   | Plugin Loader & Capability Registry  | 08         | v2     | Third-party content actually loads                 |
| 10   | Time Simulation                      | 08         | v3     | The day cycle, and layer 5                         |
| 11   | Seasonal Simulation                  | 10         | v4     | The calendar means something                       |
| 12   | Weather Simulation                   | 11         | v5     | Rain, derived and exact                            |
| 13   | Audio Architecture                   | 09, 12     | —      | Buses, a mixer, and the first ambient bed          |
| 14   | Worker Scheduling                    | 08         | v6     | The player directs the farm                        |
| 15   | Distribution & Auto-Update           | 09–14      | —      | The game can safely update itself                  |
| 16   | v0.2 Vertical Slice (RC)             | all        | —      | It feels like one game, and the gates are measured |

### 2.1 Why this order

Three orderings are load-bearing and are stated so no future session resequences them by accident:

- **Plugin foundation before every content system (08 → 10, 11, 12, 14).** Seasons, weather kinds, roles, and sounds are all content. If the public API lands after them, each will have grown a private registration path that has to be retrofitted — the failure ADR-011 avoided by fixing the container model before phase-05, and the failure the missing `plugins/core/` has already begun to demonstrate.
- **Time → seasons → weather (10 → 11 → 12).** Seasons derive from the day; weather derives from the period and is biased by the season. Each is a pure function over the one before it.
- **Weather before audio (12 → 13).** Rain is the first ambient bed with a real trigger. ADR-016 states the rule audio inherits from ADR-008: _"a sound with no trigger is unreachable code."_

Phases 14 (worker scheduling) and 15 (updates) are otherwise independent and may be resequenced with a recorded reason (`PLAN.md` §9.1). 08.0 comes first because a version should not start on a red release gate.

---

## 3. Phase 08.0 — Coverage Reconciliation

**Purpose.** `PLAN.md` §8 makes coverage a binding release gate, and it is red: **63.41% lines against 80%**. The 07.5f close identified the cause as structural rather than neglectful — `TESTING.md` §4 assigns per-area thresholds but never assigns one to `src/devtools`, `src/preload`, or `src/renderer/bootstrap`, while the config counts all three toward a single global 80%. That close called reconciling it _"an owner decision"_; it is now made, and this is where it lands.

**Dependencies.** None.

**Deliverables.**

- `TESTING.md` §4 gains explicit thresholds for every area currently unassigned, with the rationale each existing row carries.
- The coverage config measures what §4 declares — the global total is computed from areas that have a declared threshold.
- Real coverage raised where a threshold is genuinely missed, prioritising `src/persistence` (95%/90%, the highest bar in the project) and `src/sim` (90%/85%, no exemptions granted).
- The v0.1 technical-debt register updated with what was fixed and what remains.

**Risks.**

| Risk                                                          | Mitigation                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Reconciliation becomes a way to lower the bar until it passes | Every threshold change is justified in `TESTING.md` §4.1's existing voice; `src/sim` and `src/persistence` are not eligible for reduction |
| Assertion-free tests added to hit a number                    | `TESTING.md` §4.1 already forbids it: _"Coverage is a floor, not a goal."_ Review gate                                                    |
| Instrumented runs time out, as they did before phase-07e      | The timeouts raised in 07e stand; the memory gate stays uninstrumented                                                                    |

**Acceptance.**

- [x] Every area under `src/` has a declared threshold in `TESTING.md` §4 — and every one is enforced
- [x] `npm run test:coverage` completes and meets every declared threshold — 95.26 / 85.95
- [x] All eight `PLAN.md` §8 release gates are green for v0.1
- [x] No test was weakened or skipped to achieve it

**Documentation.** `TESTING.md` §4; `PLAN.md` §2.2 v0.1 close note; `CHANGELOG.md`.

**Testing strategy.** The gate is the test. A mutation control on at least one newly-covered area, in the 07a/07.2 tradition, to prove the added tests have teeth.

**Commit boundary.** One commit per area reconciled, plus one for the config and `TESTING.md`. The tree is green at each.

---

## 4. Phase 08 — Content Identity & Plugin Foundation

**Purpose.** Build the public plugin API and make first-party content its first consumer, closing the gap between ADR-003 §6's promise and the shipped code. No loader, no third-party content, no behaviour change.

**Dependencies.** 08.0.

**Deliverables.**

_Milestone 08a — content identity (ADR-026)_

- `ContentSource` records and a source registry in `src/sim/content/`.
- Reserved-namespace list and validator in `src/shared/ids.ts`.
- Quarantine gains a namespace index (no behaviour change — v0.1 saves hold one namespace).

_Milestone 08b — the public API (ADR-019)_

- The `PluginApi` surface at `PLUGIN_API_VERSION = 1`, exposing the v1 capability set.
- `plugins/core/` created, owning the `core` namespace, registering crops, items, buildings, and tile kinds **through the public API**.
- `src/sim/world/world.ts` calls the API instead of `registerCore*` directly.

**Risks.**

| Risk                                                                  | Mitigation                                                                                                                                               |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The migration changes behaviour under the cover of "just moving code" | Four bounds in ADR-019 §2, and **unmodified existing tests** as the acceptance proof. A test that must be edited is evidence the bound was crossed       |
| The API is shaped around what core happens to need                    | That is the point (ADR-019 §2), and it is why third-party loading comes after: a capability awkward for `plugins/core/` gets fixed before v1 is declared |
| A first-party shortcut is added "temporarily"                         | ADR-019 §Ongoing; a test asserts core registers through the same entry point a third party would                                                         |
| Boundary erosion — `plugins/` importing something it may not          | `check:boundaries` already covers `plugins/**` and forbids `pixi.js`, `react`, `electron`, and Node builtins                                             |

**Acceptance.**

- [ ] `plugins/core/` exists and registers all four content kinds through `PluginApi`
- [ ] No `registerCore*` is called from `src/sim` any more
- [ ] Content, world, persistence, and determinism suites pass **unmodified**
- [ ] Save documents are byte-identical before and after, for the same world
- [ ] `check:boundaries` and `check:cycles` clean
- [ ] No new content, no new capability beyond ADR-019 §3's v1 set

**Documentation.** `ARCHITECTURE.md` §8, §14; `PLUGIN_API.md` filled from outline to specification; `plugins/README.md`; `CHANGELOG.md`.

**Testing strategy.** Zero-diff migration is the headline: byte-identical saves and unmodified suites. Plus registration-order determinism, namespace-collision rejection, and the no-privileged-path assertion.

**Commit boundary.** Two — one per milestone. Each leaves the tree green and the game running identically.

---

## 5. Phase 09 — Plugin Loader & Capability Registry

**Purpose.** A third party can add content without touching engine source. Includes the first real save migration.

**Dependencies.** 08. **Schema: v1 → v2.**

**Deliverables.**

- Discovery of installed sources; manifest parsing and validation against the amended schema.
- Dependency resolution: topological, deterministic tie-break, total, fails closed per source.
- API-version compatibility checking (ADR-019 §1).
- Enablement: enable/disable a source or feature, persisted as world state (ADR-019 §7).
- The plugin settings panel — list, enable, disable, per-source configuration.
- Save: source manifest and enablement set (`v1 → v2`), plus **the pre-migration backup** (ADR-015 §3, ADR-027 §2).
- Namespace-scoped quarantine wired to source removal.

**Risks.**

| Risk                                                | Mitigation                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A malformed or hostile manifest crashes the load    | `AI_RULES.md` §2.4 — the boundary is untrusted; validate, return typed results, refuse one source and load the rest |
| Load order varies by platform, breaking determinism | Resolution is topological with a declared tie-break, never filesystem order; recorded in the save (ADR-019 §6)      |
| Disabling a source destroys data                    | ADR-026 §3's isolation invariant, tested as a property against a real second source                                 |
| The first real migration is wrong                   | Pre-migration backup ships in this phase; ADR-015 §3's repair-forward rule; golden fixture at v1                    |
| Enablement forks two players' worlds silently       | It is world state and is recorded; ADR-019 §7                                                                       |

**Acceptance.**

- [ ] A third-party source adding a crop loads, appears in game, saves, and reloads — written using only `PLUGIN_GUIDE.md`
- [ ] Removing that source leaves every other namespace byte-identical; re-adding it restores the crops
- [ ] A dependency cycle, missing dependency, unsupported API version, and namespace collision each refuse exactly one source, name it, and leave the rest loaded
- [ ] Both v0.1 golden fixtures migrate `v1 → v2` with zero repairs and continue deterministically
- [ ] A pre-migration backup is written on the first migration and is not pruned
- [ ] Two runs from one seed with the same enabled set are byte-identical

**Documentation.** `PLUGIN_API.md`; `PLUGIN_GUIDE.md` (outline → complete); `SAVE_FORMAT.md` §2, §8, §11; `ARCHITECTURE.md` §14; `CHANGELOG.md`.

**Testing strategy.** A real fixture plugin in `tests/`, not a mock. The isolation property test from ADR-026. Resolution failure cases as unit tests. Migration under `SAVE_FORMAT.md` §9's checklist. E2E: install → load → save → remove → load → restore.

**Commit boundary.** Four — resolution and validation; enablement and persistence (the migration commit, complete per §9's checklist); the settings panel; the isolation test suite and fixture plugin.

---

## 6. Phase 10 — Time Simulation

**Purpose.** The world has a day. Nothing depends on it yet, and that is deliberate.

**Dependencies.** 08. **Schema: v2 → v3.**

**Deliverables.**

- `dayFor`, `timeOfDayFor`, `phaseFor` as pure functions on `game-clock.ts`. **No new system.**
- `ticksPerDay` and the phase set as world creation constants (`v2 → v3`).
- `dayPhaseChanged` event, with a producer and a consumer.
- A `time` snapshot slice publishing `{ day, phase }`, republishing only on change.
- Layer 5 claimed; phase → tint as registered content; finite transitions under an animation lease.

**Risks.**

| Risk                                                               | Mitigation                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| A continuous time value reaches a view and republishes every tick  | ADR-020 §3; the republish test counts slice publications over a full simulated day |
| The lighting transition holds its lease                            | ADR-017 §1's `bindAnimationLease`; the zero-rAF idle test across a phase boundary  |
| Someone adds `world.timeOfDay` because a derivation feels indirect | ADR-020 §Ongoing; there is no field to add to                                      |
| A tint becomes load-bearing for gameplay                           | ADR-020 §4 — systems read the phase, never the lighting                            |

**Acceptance.**

- [ ] `phaseFor` covers every phase exactly once per day, in order, with no gap
- [ ] The `time` slice republishes exactly once per phase boundary over a full day on a static farm
- [ ] Zero `requestAnimationFrame` callbacks over 10 s with a static world, including across a phase boundary once the transition ends
- [ ] Loading a save and advancing past an 8-hour gap yields the same day and phase as running the ticks
- [ ] `world.rng` is byte-identical to a run without the clock in play
- [ ] `v2 → v3` migrates both fixtures with zero repairs

**Documentation.** `ARCHITECTURE.md` §3.4a; `SAVE_FORMAT.md` §2; `PERFORMANCE.md` §4.2; `GAME_DESIGN.md` (the day cycle); `CHANGELOG.md`.

**Testing strategy.** Derivation unit tests; the slice republish counter; the existing idle-invariant E2E extended; offline exactness; the 100k-tick determinism test unchanged.

**Commit boundary.** Three — the clock derivations and the migration; the event and slice; the lighting layer and transitions.

---

## 7. Phase 11 — Seasonal Simulation

**Purpose.** The calendar starts mattering — through opportunity, never through loss.

**Dependencies.** 10. **Schema: v3 → v4.**

**Deliverables.**

- `seasonFor(day)`; `daysPerSeason` and the season list as world constants (`v3 → v4`).
- A season content registry, with `plugins/core/` registering the default set through the public API.
- `CropDefinition.seasons` honoured: a typed out-of-season rejection in plant validation.
- A seasonal price modifier declared in ADR-013 §4's pipeline, with its band stated.
- `seasonChanged`; the season in the `time` slice; seasonal presentation.
- Worker task selection and the seed bin skip out-of-season tiles without blocking.
- Catch-up bounded to season-legal work.

**Risks.**

| Risk                                                              | Mitigation                                                            |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| A season deadlocks a farm whose whole seed stock is out of season | ADR-021 §4; the no-deadlock test with an entirely out-of-season stock |
| Seasonal loss creeps in via yields or spoilage                    | ADR-021 §3 is constitutional; `CONTENT_RULES.md` §3's gate            |
| Catch-up over-credits across a season boundary                    | The never-over property test extended to boundary-spanning gaps       |
| The price modifier escapes its band                               | ADR-013 §4's predictability guarantee; the bounds test                |

**Acceptance.**

- [ ] A crop planted in season and left standing across a boundary matures normally, with a world byte-identical to one where the boundary did not fall
- [ ] A farm with only out-of-season seeds keeps its workers working and resumes planting when the season turns, unattended
- [ ] Effective prices stay inside the product of the declared bands, every season
- [ ] Catch-up never over-credits across one or several boundaries
- [ ] `v3 → v4` migrates every fixture with zero repairs

**Documentation.** `GAME_DESIGN.md`; `SAVE_FORMAT.md` §2, §6; `ARCHITECTURE.md` §3.4a; `CHANGELOG.md`.

**Testing strategy.** Derivation over several years; the no-wither and no-deadlock tests; price bounds; the extended never-over property test; a long-run crossing several boundaries unattended.

**Commit boundary.** Three — derivation, registry, and migration; plantability and worker/seed-bin interaction; the price modifier and presentation.

---

## 8. Phase 12 — Weather Simulation

**Purpose.** Weather that is derived rather than simulated, exact offline, and costs nothing when nobody is watching.

**Dependencies.** 11. **Schema: v4 → v5.**

**Deliverables.**

- `weatherFor(seed, period, season)` as a pure function; `ticksPerWeatherPeriod` as a world constant.
- Weather kinds as registered content, defaults from `plugins/core/`.
- `grid.moisture` **removed**; `grid.wateredAt` added (`v4 → v5`).
- Derived wetness: `wetness(tile, tick)` from `wateredAt` and derived rainfall.
- A real consumer for wetness in this phase, or rain does not ship (ADR-022 §4).
- `weatherChanged`; weather in the `time` slice.
- Layer 4 weather particles under ADR-017 §2's four conditions; pooled; derived variation.

**Risks.**

| Risk                                                    | Mitigation                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A `weatherSystem` is added to `TICK_SYSTEMS`            | ADR-022 §2 makes that the detector: if weather needs a tick slot, the design is wrong |
| Weather draws from `world.rng` and desynchronises saves | The determinism test asserts `world.rng` byte-identical with and without weather      |
| Wetness becomes a stored accumulator                    | ADR-022 §3; the migration removes the field that would have become one                |
| Rain ships with nothing reading wetness                 | `AI_RULES.md` §1.6; the phase gate in ADR-022 §4                                      |
| Rain particles break the idle invariant                 | ADR-017 §2's conditions; the idle test with weather visuals on                        |
| A dry spell stalls a farm                               | ADR-022 §5; the playability-floor long-run                                            |

**Acceptance.**

- [ ] Weather queried for a past period equals what was observed live at that period
- [ ] `world.rng` is byte-identical with and without weather over a long run
- [ ] With a constant rate, growth progress equals `tick − plantedTick` exactly — ADR-009's shipped behaviour preserved as the special case
- [ ] Load + advance past an 8-hour gap is byte-identical to running the ticks, including crop progress
- [ ] Weather visuals on, pointer idle past the timeout → zero `requestAnimationFrame` callbacks
- [ ] A farm that never sees rain completes its loop and earns across a long run
- [ ] `v4 → v5` migrates every fixture, dropping `moisture` and defaulting `wateredAt`, with zero repairs

**Documentation.** `SAVE_FORMAT.md` §2, §6.3; `GAME_DESIGN.md` §3.4; `ARCHITECTURE.md`; `PERFORMANCE.md` §4.2; `ASSETS.md`; `CHANGELOG.md`.

**Testing strategy.** Derivation and past-query equality; the RNG guard; rate-history equivalence to ADR-009; offline exactness; the idle invariant with particles; the playability-floor long-run; the removal migration under §9's checklist.

**Commit boundary.** Four — the derivation and weather content; the migration and derived wetness; the wetness consumer; presentation.

---

## 9. Phase 13 — Audio Architecture

**Purpose.** Turn the shipped placeholder bus into a real audio architecture, and answer the ambient-bed question ADR-016 §4 deferred with a measurement.

**Dependencies.** 09 (plugin audio), 12 (the first real ambient trigger). **Schema: none.**

**Deliverables.**

- Web Audio device layer with a bounded voice pool, replacing `HTMLAudioElement`.
- Category buses (ui, world, ambient, music) under one master; declared ducking.
- The catalogue becomes a registry; `plugins/core/` registers the shipped sounds through `registerAudio`.
- Per-category levels in the `audio` settings category.
- Rain ambience under ADR-023 §5's five conditions.
- **A measured ambient-audio budget** in `PERFORMANCE.md`, with its evidence file in `docs/perf/`.

**Risks.**

| Risk                                                  | Mitigation                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The `AudioContext` keeps a thread alive at idle       | ADR-023 §5 condition 4 — ambience surrenders on presence loss and the context suspends; measured, not asserted |
| The measured budget cannot be met                     | Then ambience does not ship and ADR-016 §4's ban stands. The measurement is the gate                           |
| The bus stops being unit-testable in Node             | ADR-016 §1's property is the acceptance test for whether this was done right                                   |
| Audio variation consumes `world.rng`                  | ADR-023 §4; the muted-vs-unmuted determinism test                                                              |
| Building the graph at boot slows startup, as in 07.5a | Lazy construction; a muted session builds nothing                                                              |

**Acceptance.**

- [x] Muted and unmuted sessions produce byte-identical worlds and byte-identical `world.rng` over a long run — `src/renderer/app/audio-mixer.test.ts`, 200 steps with the bus playing throughout (ADR-023 §6)
- [x] The bus's unit tests still run in Node with no browser — `audio.test.ts` was untouched by the rebuild, and `voice-pool.test.ts` joined it; the device layer takes its context factory as a parameter rather than being mocked
- [x] A fresh profile is silent, and enabling sound does not enable ambience — `src/renderer/app/ambience.test.ts`, and proven end to end by criterion 9, where unmuting alone left the bed **off** and starting it took a second, separate act
- [x] Work mode silences everything including ambience — `src/renderer/app/ambience.test.ts`, in the matrix proving each of ADR-023 §5's five conditions is independently sufficient to silence
- [x] Ambience on, pointer idle past the timeout → the bed stops, measured to `docs/perf/criterion-9-ambient-audio.json`: `on 0.600` while watched, `off` after 14 s untouched. Taken against a farm planted with an already-raining seed, because a bed that is off for want of weather proves nothing. `PERFORMANCE.md` states the ceiling over the source's **existence** rather than its level — a silent-but-running bed would pass a loudness bar and fail this
- [x] The voice pool recycles at capacity and never allocates — `src/renderer/audio/voice-pool.test.ts`; the ambient bed deliberately does **not** take a pooled voice, because a sound that never ends would hold its slot for the session and be the oldest claim on the farm
- [x] A plugin-supplied sound plays through an engine category — `src/sim/content/sounds.test.ts`; core registers eleven sounds through the public `registerAudio`, including `core:rain` as the first **ambient** registration

**Documentation.** `PERFORMANCE.md` (new budget line and idle case); `ASSETS.md` §3, §10; `PLUGIN_API.md`; `docs/assets/` audio canon cross-references; `CHANGELOG.md`.

**Testing strategy.** Determinism guards; the Node-purity check; the measured idle budget through the phase-07.7M harness; pool behaviour in the ADR-017 §4 test shape; E2E for presence and work-mode silencing.

**Commit boundary.** Four — the Web Audio device layer and voice pool; buses, mixer, and settings; the sound registry and plugin audio; ambience with its measurement.

---

## 10. Phase 14 — Worker Scheduling

**Purpose.** The player directs the farm — and the architecture accepts zones, roles, shifts, permissions, and overrides later without being redesigned.

**Dependencies.** 08. **Schema: v5 → v6.**

**Deliverables.**

- The three-stage pipeline: discovery (unchanged) → constraint filter (new) → deterministic selection.
- A constraint vocabulary with a declared evaluation order.
- Priority as an ordering input, never a filter.
- Per-worker schedule state on the `Worker` record (`v5 → v6`).
- Schedule changes as commands, with typed rejections.
- Roles as registered content, defaults from `plugins/core/`.
- A worker panel surface for priority and zone; catch-up bounded to schedule-legal work.

**Risks.**

| Risk                                         | Mitigation                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| A constraint set deadlocks a worker          | ADR-024 §6's three rules; the fully-constrained-out no-deadlock test         |
| An unsatisfiable constraint ships as content | Rejected at registration with a typed error                                  |
| Emergency override becomes a bypass          | ADR-024 §5 — it swaps the constraint set, and it is a command like any other |
| Deprioritised work is never done             | ADR-024 §3; the priority-is-not-a-filter test                                |
| Schedules land in `settings.json`            | ADR-024 §4; they are in the save and in the command stream                   |

**Acceptance.**

- [x] A farm whose every worker is fully constrained out of all work keeps re-planning and resumes the instant a constraint or the world changes — `tests/worker-scheduling.test.ts`, asserted from both directions: the schedule changing with the world untouched, and the world changing with the schedule untouched
- [x] A task kind ordered last is still performed when nothing else is available — `tests/worker-scheduling.test.ts`; priority reorders and never excludes (ADR-024 §3), so an unmentioned kind sorts after the mentioned ones rather than being dropped
- [x] Identical seed, command stream, and schedules produce byte-identical state over 100k ticks — `tests/schedule-determinism.test.ts`; it ran 60,000 until the phase-14 verification pass raised it to the figure this criterion actually states
- [x] An unsatisfiable constraint is rejected at registration and never reaches a worker — `tests/roles.test.ts`
- [x] Schedules survive save → load → save byte-identically; a loaded world continues identically to one that never saved — `tests/migration-v5-to-v6.test.ts` for the round trip, at **non-default** values (a worker with `{}` round-trips correctly even if the codec drops the field entirely); `tests/schedule-determinism.test.ts` for the continuation
- [x] Catch-up never over-credits across shift and zone boundaries — `tests/schedule-determinism.test.ts`, over every day phase. The shift half was **broken** until the verification pass: one phase was sampled and applied to an eight-hour window, so a crew on shift a quarter of the time was credited in full
- [x] `v5 → v6` migrates every fixture with zero repairs — `tests/migration-v5-to-v6.test.ts`; the link is one decision, `{}` rather than `{ taskKinds: [] }`, since the empty form would have silently idled every worker on every existing save

**Documentation.** `GAME_DESIGN.md` §4; `SAVE_FORMAT.md` §2, §6.4; `ARCHITECTURE.md` §3.3; `PLUGIN_API.md` (roles); `CHANGELOG.md`.

**Testing strategy.** The existing FSM deadlock suite extended to constraints; determinism at 100k ticks with schedules; registration rejection; round-trip and continue-identically; the extended never-over property test; E2E driving a zone and a priority change.

**Commit boundary.** Four — the pipeline and constraint vocabulary; schedule state, commands, and migration; roles as content; the panel.

---

## 11. Phase 15 — Distribution & Auto-Update

**Purpose.** The game can update itself without ever endangering a save.

**Dependencies.** 09–14 — every schema bump must exist before the rollback boundary can be tested against a real chain. **Schema: none.**

**Deliverables.**

- Signed package pipeline through `electron-builder`; CI publishes signed artifacts.
- Update check, in-overlay announcement, player-controlled application.
- Atomic replacement with interrupted-update recovery.
- **Schema-bounded rollback** (ADR-025 §2), reading `CURRENT_SCHEMA_VERSION` from both builds.
- Version pinning as an application preference.
- Staged rollout with a locally-derived, non-identifying bucket, and a publish-side halt.

**Risks.**

| Risk                                             | Mitigation                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Rollback across a schema bump orphans a save     | ADR-025 §2 — the check refuses; the pre-migration backup (shipped in Phase 09) is the recovery path |
| A restart interrupts a save                      | Phase-07e's quit-save-blocks-shutdown, 3 s cap, reused unchanged                                    |
| The updater touches the save directory           | ADR-025 §4 — it may not; asserted                                                                   |
| An update prompt becomes an OS notification      | `VISION.md` §5.1; ADR-025 §5                                                                        |
| The chosen library cannot deliver the guarantees | ADR-025 §7 — then it is not adopted, and the gap is implemented rather than the guarantee relaxed   |
| Staged rollout implies telemetry                 | The bucket is local and non-identifying; halting is publish-side                                    |

**Acceptance.**

- [ ] Interrupting the update at each replacement step leaves a launchable application and an untouched save — **proven for the specified sequence, not for the one that ships.** `src/main/install-store.test.ts` halts after each of `stage`/`retain`/`swap`/`commit` against real directories and re-reads a planted save byte-for-byte. But `electron-updater` hands off to the NSIS installer, which does not run that sequence, so the shipping path is unverified. Phase 16 owns it
- [x] A rollback to a build with a lower `CURRENT_SCHEMA_VERSION` than the save is refused with a clear message, save untouched — `src/main/rollback-guard.test.ts`; the message names the pre-migration backup to restore, and "the save is untouched" holds because the module has no way to reach one
- [ ] A pre-migration backup restored into the older build loads and continues correctly — **not attempted.** The backup is written (ADR-027 §2, phase 09) and the refusal names it, but nobody has restored one into an older build and played on. Phase 16
- [x] An update restart requested mid-save waits for the write and never truncates it — `src/main/update-restart.test.ts` asserts the ordering (save resolves before the installer is called) and that a wedged renderer delays but cannot veto; the save machinery itself is phase-07e's, reused unchanged rather than reimplemented
- [ ] A tampered artifact is rejected and the installation is untouched — the mechanism exists and is wired: electron-builder writes a SHA-512 per artifact into `latest.yml`, `electron-updater` verifies it before emitting `update-downloaded`, and `updater.ts` treats that event as the only thing marking a package ready. Demonstrating it needs a published release and a deliberately corrupted artifact. Phase 16
- [x] No prompt appears while hidden or in work mode; none is an OS notification — `src/main/update-policy.test.ts` for the presence gate, `src/renderer/app/hud/companion-toast.test.tsx` for the surface, which is a `div` in the React root; the renderer has no path to a `Notification` at all
- [x] `PLAN.md` §3's _"auto-update never loses a save under interrupted-update testing"_ is an executable suite that passes — `src/main/install-store.test.ts`. **Read it with the first box above**: the suite is real and green, and it exercises the sequence ADR-025 §4 specifies rather than the NSIS path currently shipping

**Documentation.** `ARCHITECTURE.md` §7; `TECH_STACK.md` (any new dependency, justified); `SAVE_FORMAT.md` §11; `PLAN.md` §8; `CHANGELOG.md`.

**Testing strategy.** Real interruption against a real installation, in the phase-07c tradition — halt after each step and assert the invariant. Rollback boundary and backup recovery as integration tests. Signature rejection. E2E for presence discipline.

**Commit boundary.** Four were planned — signing and the publish pipeline; check, announce, and apply; atomic replacement with interruption recovery; rollback boundary, pinning, and staged rollout. **Eighteen shipped**, and the reason is recorded in the phase document: they were built in the reverse of this order so that ADR-025 §7's dependency condition could be measured against an executable suite rather than prose, and every split fell on the same seam — a rule that can be _proven_ ships separately from the wiring that merely _carries_ it (`AI_RULES.md` §4.2).

---

## 12. Phase 16 — v0.2 Vertical Slice (Release Candidate)

**Purpose.** Polish and proof. No new systems. Confirm v0.2 is one coherent game and that every gate is met with evidence.

**Dependencies.** All. **Schema: none.**

**Deliverables.**

- Integration pass: day, season, and weather read as one world rather than three features.
- Every `PERFORMANCE.md` ceiling re-measured with weather, lighting, and audio active, written to `docs/perf/`.
- `docs/save-compatibility-report.md` updated for the v0.2 chain, with the evidence per claim.
- A reference third-party plugin, written from `PLUGIN_GUIDE.md` alone, as the success-criterion proof.
- The v0.2 release-candidate report: measurements, before/after, known limitations, honest release position.
- A foundation-extension ADR in ADR-012's mould, proposing which of ADRs 013–027 join the frozen set — **written here, after production has validated them**, exactly as ADR-012 followed phase-05.6.

**Risks.**

| Risk                                                           | Mitigation                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Budgets hold individually but not together                     | This phase is where they are measured together; that is its purpose                   |
| Coverage drifts again, as it did through v0.1                  | 08.0's per-area thresholds are the structural fix; the gate is re-run here            |
| The freeze is proposed before the foundations have been proven | ADR-012's own timing logic: after validation, before the next version's gameplay wave |

**Acceptance.**

- [ ] All eight `PLAN.md` §8 release gates green, with evidence files behind every number
- [ ] Every `PLAN.md` §3 v0.2 success criterion met, including a third party writing a plugin from documentation alone
- [ ] A v0.1 save loads in v0.2 through the full chain with no data loss
- [ ] Uninstalling a plugin preserves its save data
- [ ] Performance budgets hold with weather, lighting, and audio active
- [ ] Auto-update never loses a save under interrupted-update testing
- [ ] Zero known data-loss defects

**Documentation.** `save-compatibility-report.md`; `PERFORMANCE.md` §11; `PLAN.md`; `VISION.md` if the tier's intent moved; the foundation-extension ADR; `CHANGELOG.md`.

**Testing strategy.** Full suite plus the long-run soaks; combined-budget measurement through the existing harness; the compatibility suite across every version in the chain; the plugin-authoring exercise as a human gate.

**Commit boundary.** One per deliverable, closing with the RC report.

---

## 13. Cross-Phase Invariants

Checked at every phase boundary, not only at the version boundary. Each already has a mechanical detector.

| Invariant                                                      | Detector                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| Determinism: same seed + command stream → byte-identical state | The 100k-tick test — the most important test in the repository |
| Zero `requestAnimationFrame` when static                       | `PERFORMANCE.md` §4.2; deleting it invalidates ADR-001         |
| Zero React commits when static                                 | `PERFORMANCE.md` §4.2; deleting it invalidates ADR-005         |
| No slice republishes every tick                                | Per-slice republish counters                                   |
| Commands are the only write path                               | Review gate; mutation confined to `src/sim/commands/`          |
| Boundaries hold                                                | `check:boundaries`, `check:cycles`                             |
| Every save loads                                               | Golden fixtures at every version                               |
| `src/sim` imports only `shared`                                | The bare-Node import test                                      |
| Devtools absent from production                                | The built-artifact marker test                                 |
| Coverage gates met                                             | `npm run test:coverage`                                        |

---

## 14. What v0.2 Is Not

Per `PLAN.md` §5–§7 and `VISION.md` §5, and restated so no phase absorbs one by degrees:

Multiplayer · networking · cloud save · Steam integration · mobile · desktop overlay modes beyond ADR-014's · wallpaper mode · NPCs · a town · contracts · factories · combat · plugin _code_ execution (ADR-019 §4 — API v2) · plugin distribution or a mod registry (ADR-025 §8 — v1.0) · content override or removal by plugins (ADR-019 §Alternatives E) · telemetry.

---

## 15. Related

| Document          | Relationship                                            |
| ----------------- | ------------------------------------------------------- |
| `PLAN.md`         | Version milestones, success criteria, and release gates |
| `VISION.md`       | Product intent and the permanent non-goals              |
| `docs/decisions/` | ADRs 019–027 — the decisions these phases implement     |
| `docs/phases/`    | Per-phase specifications, written when a phase opens    |
| `ARCHITECTURE.md` | The system composition these phases extend              |
| `AI_RULES.md`     | The process rules binding on every phase                |
