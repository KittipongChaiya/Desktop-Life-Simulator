# PLAN

> **Status:** Authoritative roadmap.
> **Owns:** Version milestones, version-level success criteria, release gates, and how this plan changes.
> **Does not own:** Product intent (`VISION.md`), v0.2 phase sequencing and per-phase acceptance (`ROADMAP.md`), per-phase specifications (`docs/phases/`).

**No dates.** This is a sequenced plan, not a schedule. Each milestone completes when its success criteria are met.

---

## 1. Version Roadmap

| Version  | Theme                    | Ships                                                 |
| -------- | ------------------------ | ----------------------------------------------------- |
| **v0.1** | Farm & Overlay           | The core loop, running in a livable overlay           |
| **v0.2** | A Living World           | Seasons, weather, day/night, audio, the plugin loader |
| **v0.3** | Town & Trade             | NPCs, settlement, contracts, a market that moves      |
| **v0.4** | Automation & Exploration | Factories, logistics, a map beyond the farm           |
| **v1.0** | Full Life Simulator      | RPG, dungeons, bosses, city defense, mod ecosystem    |

Ordering rationale — why each tier is a prerequisite rather than an arbitrary sequence — is in `VISION.md` §4.1.

---

## 2. v0.1 — Farm & Overlay

**Goal:** prove the product thesis. A game you can leave running all day beside real work, which plays itself once you have built it up.

### 2.1 Phases

| #    | Phase                          | Delivers                                                                                                                                                                                                                                                                     | Independently runnable?                |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 00   | Foundation                     | Toolchain, three tsconfigs, boundary linter, asset pipeline, tick loop, CI                                                                                                                                                                                                   | Empty window, headless sim ticks       |
| 01   | Overlay                        | Docked transparent window, click-through, tray, collapse/expand, snapshot bridge                                                                                                                                                                                             | A livable overlay with a status bar    |
| 01.5 | Developer Infrastructure       | Debug overlay, console, profiler, inspector, logger, feature flags                                                                                                                                                                                                           | Tooling usable in a running app        |
| 01.7 | Entry Boundary                 | Renderer entry constrained; alias-resolution hole closed                                                                                                                                                                                                                     | No behavior change                     |
| 02.5 | Engine Foundations             | Event bus, scheduler, ID allocator, time scaling                                                                                                                                                                                                                             | No gameplay                            |
| 02   | Tile World                     | PixiJS, 7 layers, terrain chunks, camera, render-on-demand                                                                                                                                                                                                                   | A visible, pannable farm plot          |
| 03   | Farming                        | Crops, growth, till/plant/water/harvest, content registries                                                                                                                                                                                                                  | The manual loop is playable            |
| 03.5 | Command Model                  | Command dispatcher, queue, tick-boundary execution, source interfaces                                                                                                                                                                                                        | No behavior change                     |
| 03.6 | Player Interaction             | Tool selection, hover, tile selection, click → command, dispatch feedback                                                                                                                                                                                                    | **The manual loop is playable**        |
| 04   | Worker AI                      | Worker entities, FSM, pathing, task priority, energy                                                                                                                                                                                                                         | **Stage 2 — delegation**               |
| 05   | Resources & Containers         | Container model (ADR-011): items, stacks, capacity, storage buildings                                                                                                                                                                                                        | Unattended runs become possible        |
| 05.5 | AI Asset Production Foundation | Creative canon: art direction, style lock, palette, world/character/lore bibles, prompt library, audio + design docs                                                                                                                                                         | Docs only — no runtime change          |
| 05.6 | Vertical Slice (Golden Set)    | First production asset set validating the 05.5 canon: world/crop/UI/character art, audio specs, validation report                                                                                                                                                            | Assets only — no code change           |
| 06   | Economy                        | Coins, dynamic pricing, shop, land expansion, buildings                                                                                                                                                                                                                      | **Stage 4 — full idle loop**           |
| 01.8 | Desktop Companion              | Opacity dial, quick hide, click-through mode, work mode, z-order control (always-on-top since the 2026-07-23 livability verdict); rebindable-shortcut & categorized app-settings architecture — platform only (ADR-014)                                                      | The overlay coexists with real work    |
| 07   | Save/Load                      | Schema & save identity, atomic writes, migration chain, autosave, offline progress — under the ADR-015 versioning & compatibility contract                                                                                                                                   | The game persists                      |
| 07.5 | Vertical Slice (v0.1 RC)       | Polish only, no new systems: audio (ADR-016), feedback effects, camera focus, accessibility, ground decoration, and the release-candidate report                                                                                                                             | **v0.1 feels like one game**           |
| 07.6 | Visible farming (fix)          | Not a phase — a fix completing phase-03's presentation. Tilled soil, the crops slice and renderer, twelve crop sprites, and visual-regression references. Recorded in `docs/fixes/phase-03-visible-farming.md`                                                               | The farming loop is visible            |
| 07.7 | Game Feel Polish               | Presentation only, no new mechanics (ADR-017): pooled particles and floating numbers, crop and worker animation, camera shake, HUD feel, ambient life behind presence, six accessibility settings, and the measured performance budgets                                      | **The farm responds to being touched** |
| 07.8 | Developer Tools                | Diagnostic tooling only, no gameplay (ADR-018): world and entity inspectors, event and command monitors, pathfinding and chunk visualisation, performance panel, time controls, spawn tools that dispatch commands, recording and screenshot mode — all `FEATURE_DEBUG`-only | The game is diagnosable                |

Phase order is dictated by dependency, not preference. Two orderings are worth stating explicitly:

- **Overlay before world (01 → 02).** If the overlay is not livable, nothing else matters. It carries the highest product risk and is deliberately faced first, alone.
- **Save/load last (07).** Persistence must serialize a _complete_ world. Building it earlier means migrating the schema after every subsequent phase — seven migrations before v0.1 ships, each one an opportunity to lose data. The save **contract** itself — identity header, version separation, the compatibility matrix, migration governance — was decided ahead of implementation (ADR-015), so phase-07 implements a settled contract rather than designing one mid-flight.
- **Resource model before inventory (ADR-011).** Phases 05 (inventory) and 06 (economy), and every resource system after them, share one model fixed before phase-05: resources are conserved quantities owned by containers, moved only by explicit transfer. Deciding it up front prevents each system inventing incompatible resource rules — the same forethought as the command model (03.5) preceding its four consumers.
- **Desktop companion after the loop, before persistence (06 → 01.8 → 07).** Numbered with the overlay family because it extends phase-01's platform shell; built after phase-06 so the companion behaviors wrap a complete, earning game, and before phase-07 so the preference/save boundary (app settings in `settings.json`, never in the save — ADR-014 §4) is fixed in code before the save schema exists, and the return summary can be designed knowing work mode hides the HUD.

### 2.2 Success criteria

v0.1 ships when **all** are true:

**Product**

- [ ] Runs an 8-hour workday without being noticed in Task Manager
- [ ] Reaching stage 4 (`GAME_DESIGN.md` §1.1) takes under ~4 hours of play
- [ ] The first worker hire produces a visible "oh, I see" moment in playtesting
- [ ] A tester returns unprompted on a second day

**Technical**

- [ ] All `PERFORMANCE.md` ceilings measured and met on baseline hardware
- [x] All `TESTING.md` coverage gates met — **phase-08.0**, 95.26% lines / 85.95% branches against a raised 90 / 85
- [x] Determinism test passes at 100k ticks
- [x] Save round-trip and crash-safety tests pass
- [x] Zero known data-loss defects

> **Phase-08.0 closed the coverage gate**, the last of the eight §8 release gates to go green. The cause was not neglect: six of the seven published per-area thresholds had never been enforced by the config, and 1,378 lines of Pixi and Electron binding sat in the denominator contributing 34 covered lines. `TESTING.md` §4.2 now states the criterion for what is measured, and a test fails if the document and the config ever disagree again.
>
> **One correctness defect is open and is not a data-loss defect**: catch-up over-credits by one harvest on a specific farm (`phase-07.7` debt #13, `PLAN.md` §8 criterion 14). The player gains rather than loses and nothing on disk is damaged, so the §8 data-loss gate stands — but the criterion itself does not hold, and it is the recommended next work.

**Documentation**

- [ ] A new AI session can implement a v0.2 feature using only `docs/` and the code, without asking a question these documents already answer

The last criterion is what this documentation set exists to satisfy (`VISION.md` §6.4).

### 2.3 v0.1 is explicitly not

Combat · RPG · dungeons · bosses · city defense · factory · town · NPCs · trading · exploration · multiplayer · audio · weather · seasons · day/night · achievements · plugin _loading_ · auto-update · telemetry · non-Windows platforms

---

## 3. v0.2 — A Living World

**Goal:** the world changes on its own, and other people can add to it.

v0.2 is also where this project stops being an application and becomes **an engine with a game on top of it**. Seasons and weather are how that gets proven; the plugin architecture is the work. Ten architectural goals govern the version and are stated in `ROADMAP.md` §1.

### 3.1 Phases

Sequencing, dependencies, deliverables, risks, acceptance criteria, testing strategy, and commit boundaries: **`ROADMAP.md`**.

| #    | Phase                                | Schema | Delivers                                           | Decided by       |
| ---- | ------------------------------------ | ------ | -------------------------------------------------- | ---------------- |
| 08.0 | Coverage Reconciliation              | —      | The v0.1 release gate turns green                  | §8, `TESTING.md` |
| 08   | Content Identity & Plugin Foundation | —      | The public API, and `plugins/core/`                | ADR-026, ADR-019 |
| 09   | Plugin Loader & Capability Registry  | v2     | Third-party content actually loads                 | ADR-019, ADR-027 |
| 10   | Time Simulation                      | v3     | The day cycle, and lighting layer 5                | ADR-020          |
| 11   | Seasonal Simulation                  | v4     | The calendar means something                       | ADR-021          |
| 12   | Weather Simulation                   | v5     | Rain, derived and exact                            | ADR-022          |
| 13   | Audio Architecture                   | —      | Buses, a mixer, and the first ambient bed          | ADR-023          |
| 14   | Worker Scheduling                    | v6     | The player directs the farm                        | ADR-024          |
| 15   | Distribution & Auto-Update           | —      | The game can safely update itself                  | ADR-025          |
| 16   | v0.2 Vertical Slice (RC)             | —      | It feels like one game, and the gates are measured | —                |

Three orderings are dictated by dependency rather than preference, and `ROADMAP.md` §2.1 states them: the plugin foundation precedes every content system (08 before 10, 11, 12, 14); time precedes seasons precedes weather; and weather precedes audio, because rain is the first ambient bed with a real trigger.

**Worker scheduling, not worker priorities.** The milestone was _"player-configurable task priority"_; a reorderable list answers one of the six scheduling concepts on the roadmap and makes the other five special cases. ADR-024 replaces it with a three-stage pipeline in which zones, roles, permissions, shifts, and emergency overrides each arrive as data.

**Success criteria**

- [ ] A third party writes a plugin adding a crop, using only `PLUGIN_GUIDE.md`
- [ ] A v0.1 save loads in v0.2 with no data loss, through the full five-link chain
- [ ] Uninstalling a plugin preserves its save data (`SAVE_FORMAT.md` §8) and touches no other namespace (ADR-026 §3)
- [x] Performance budgets hold with weather, lighting, and audio active — measured **together** in phase-17 (criterion 12): p99 tick 0.5 ms vs 3 ms with rain, lighting, audio, and all motion simultaneously live on the reference farm (`PERFORMANCE.md` §14)
- [ ] Auto-update never loses a save under interrupted-update testing

**Note:** auto-update ships here and not in v0.1 deliberately — an updater that can restart the app is a way to lose player data, so it follows proven save integrity. v0.2 sharpens that: it also lands five schema versions, and ADR-025 §2 shows that **rollback across a schema bump orphans a save** unless the updater is bounded by schema version. Phase 15 therefore follows every shape-changing phase.

---

## 4. v0.3 — Town & Trade

**Goal:** the player gains neighbours, and the economy gains a counterparty.

| Milestone      | Delivers                                 | Depends on                                    |
| -------------- | ---------------------------------------- | --------------------------------------------- |
| NPCs           | NPC entities with schedules and needs    | v0.2 time of day; v0.1 worker FSM generalized |
| Settlement     | A town area, buildings, residents        | v0.1 building model                           |
| Contracts      | Timed delivery requests with rewards     | v0.1 economy                                  |
| Dynamic market | Demand curves replacing flat multipliers | v0.1 price multipliers                        |
| Reputation     | Standing with the town, gating access    | New                                           |
| Quests         | Simple objective chains                  | New                                           |

**Success criteria**

- [ ] NPCs follow believable daily schedules
- [ ] Contracts create a reason to plant specific crops
- [ ] The economy feels responsive without becoming unpredictable
- [ ] Entity counts stay within `PERFORMANCE.md` — profile before adding more
- [ ] Cross-platform is re-evaluated here at the earliest (`VISION.md` §5.1)

---

## 5. v0.4 — Automation & Exploration

**Goal:** the player gains reach.

| Milestone   | Delivers                                 | Depends on                                |
| ----------- | ---------------------------------------- | ----------------------------------------- |
| Factories   | Buildings that consume and produce items | v0.1 inventory + buildings                |
| Logistics   | Item routing between buildings           | v0.1 worker movement                      |
| Recipes     | Multi-input crafting chains              | v0.1 item registry                        |
| World map   | Regions beyond the farm                  | v0.1 grid (already 64× the starting plot) |
| Expeditions | Send workers away for timed returns      | v0.1 worker tasks + offline catch-up      |
| Resources   | Mining, foraging, gathering              | v0.1 tile kinds                           |

**Success criteria**

- [ ] A production chain runs unattended for 8 hours without jamming
- [ ] Exploration yields meaningfully feed the farm economy
- [ ] Entity and building counts stay within budget — **worker-thread migration likely lands here** (ADR-003 §2)
- [ ] Offline catch-up remains accurate with production chains active

---

## 6. v1.0 — Full Life Simulator

**Goal:** the player gains a life.

| Milestone       | Delivers                                            | Depends on         |
| --------------- | --------------------------------------------------- | ------------------ |
| RPG progression | Character levels, skills, equipment                 | v0.4 resources     |
| Combat          | `health` side-table over entity stores (ADR-004 §4) | v0.1 entity model  |
| Dungeons        | Generated encounters with rewards                   | v0.4 expeditions   |
| Bosses          | Set-piece encounters                                | Combat             |
| City defense    | Waves threatening the settlement                    | v0.3 town + combat |
| Mod ecosystem   | Registry, discovery, versioning                     | v0.2 loader        |

**Success criteria**

- [ ] Combat integrates without violating `VISION.md` §5.1 — **no mechanic requires reaction speed**
- [ ] A v0.1 save still loads, through every intervening migration
- [ ] The overlay constraint still holds under the heaviest content
- [ ] A meaningful third-party mod ecosystem exists

### 6.1 The v1.0 risk, named now

Combat is the most likely place this project betrays its own thesis. `VISION.md` §5.1 permanently forbids twitch mechanics, so v1.0 combat must be **resolution-based or tactical-pause**, never real-time action.

If v1.0 combat cannot be made satisfying without reaction speed, the correct outcome is **shipping without real-time combat** — not relaxing the non-goal. The non-goal is the product.

---

## 7. Post-v1.0 (Unscheduled)

Named to show they were considered, and deliberately left unplanned:

Multiplayer · cross-platform (macOS/Linux) · Steam release · cloud saves · mobile companion

**Multiplayer** deserves a note: the determinism work in v0.1 (ADR-007) makes it _possible_, not _planned_. It would require netcode, an authoritative server, anti-cheat, and infrastructure — a larger project than everything above it combined. Determinism was paid for because it is cheap now and impossible to retrofit, not because multiplayer is committed.

---

## 8. Release Gates

Binding at every version boundary. No exceptions, and none of these may be waived to hit a date — there are no dates (§Preamble).

| Gate               | Requirement                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | Every prior version's golden fixture loads (`SAVE_FORMAT.md` §4.4, ADR-015 §4); the version's guarantees stated and evidenced in `save-compatibility-report.md` |
| Performance        | All ceilings measured on baseline hardware (`PERFORMANCE.md` §10)                                                                                               |
| Coverage           | All thresholds met (`TESTING.md` §4)                                                                                                                            |
| Boundaries         | `check:boundaries` and `check:cycles` clean                                                                                                                     |
| Docs               | `ARCHITECTURE.md`, `SAVE_FORMAT.md`, `CHANGELOG.md` current                                                                                                     |
| ADRs               | Every architectural change recorded                                                                                                                             |
| Data loss          | **Zero known defects. Blocking, always.**                                                                                                                       |
| Dead code          | None; no placeholders; no skipped tests                                                                                                                         |

---

## 9. How This Plan Changes

1. **Phases may be resequenced within a version** when a dependency proves wrong — record why in the phase document.
2. **Scope moves later, never earlier.** Pulling a v0.3 feature into v0.1 is the failure mode `VISION.md` §4.2 exists to prevent.
3. **A new version tier requires amending `VISION.md` §4 first.** This document implements that roadmap; it does not define it.
4. **Success criteria are not negotiable downward.** If a criterion cannot be met, that is information about the design, not about the criterion.
