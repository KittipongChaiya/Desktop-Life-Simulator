# PLAN

> **Status:** Authoritative roadmap.
> **Owns:** Version milestones, version-level success criteria, release gates, and how this plan changes.
> **Does not own:** Product intent (`VISION.md`), v0.2 phase sequencing and per-phase acceptance (`ROADMAP.md`), per-phase specifications (`docs/phases/`).

**No dates.** This is a sequenced plan, not a schedule. Each milestone completes when its success criteria are met.

---

## 0. Current State

**Machine-checked.** `tests/plan-state.test.ts` fails if this block goes stale
or disagrees with the CURRENT version's phase table — §5B.1 today. It exists because a session can end
at any moment and the next one must resume from the repository, not from the
owner's memory (`AI_RULES.md` §10.4).

|                     |                                  |
| ------------------- | -------------------------------- |
| **Current version** | **v0.6 — The Second Day**        |
| **Current phase**   | **63 — v0.6 Release Candidate**  |
| **Status**          | **COMPLETE — release candidate** |

| Phase | Name                           | Status   |
| ----- | ------------------------------ | -------- |
| 54    | v0.6 Baseline & content census | COMPLETE |
| 55    | Crops & the seasonal choice    | COMPLETE |
| 56    | Chains worth building          | COMPLETE |
| 57    | Things to buy                  | COMPLETE |
| 58    | People worth knowing           | COMPLETE |
| 59    | Somewhere to go                | COMPLETE |
| 60    | Sound that isn't a placeholder | COMPLETE |
| 61    | The arc, re-measured           | COMPLETE |
| 62    | Delivery                       | COMPLETE |
| 63    | v0.6 Release Candidate         | COMPLETE |

**v0.5 shipped as a release candidate** on 2026-08-20 — phases 31–53, three
tracks, `RELEASE-v0.5-RC.md`. Its gate results and its two open human-playtest
criteria live in that document and are not repeated here: §0 tracks the CURRENT
version, and a §0 that accumulated every version's history would stop being a
resume block.

**v0.6 is a CONTENT tier and adds no simulation** (ADR-046 §1). `VISION.md` §4
was amended first, as §9.3 requires — and that amendment records that the same
rule was not followed when v0.5 opened, rather than backdating the row and
pretending it was.

**What opened this version.** Phase 54 counted what was actually in the game.
Every registry held a demo: **4 crops, 6 purchasable buildings, 2 recipes, 1
authored quest chain, 3 expedition sites, 4 residents, 11 placeholder sounds.**
Four crops cannot fill four seasons — spring and winter offered two plantable
each. Five versions had built content-_driven_ systems and the content running
on them would have fitted on an index card, which is why a perfect player
exhausts the arc in twelve minutes and why §2.2's fourth criterion — _a tester
returns unprompted on a second day_ — has never been closable.

**What closed it.**

| Registry         | v0.5 | v0.6    |
| ---------------- | ---- | ------- |
| Crops            | 4    | **12**  |
| Recipes          | 2    | **9**   |
| Items            | 13   | **36**  |
| Buildings        | 10   | **13**  |
| Expedition sites | 3    | **6**   |
| Authored quests  | 1    | **5**   |
| Sprites          | 242  | **298** |

Every season now offers five or six plantable crops; production runs four chains
with one four items deep; three buildings sit above the Market Stall; every
resident has a written chain rather than a generated one. **No new simulation
system, no new save field, no migration** — ADR-046 §1 held for the whole
version.

**v0.6 shipped as a release candidate** on 2026-08-21 — phases 54–63,
`RELEASE-v0.6-RC.md`. Seven of the eight §8 gates are green; **performance is
PARTIAL**, on one sample of sixty reading 2.026% against a 2.0% ceiling while
its mean sits inside target. Three of seven success criteria PASS, one is
PARTIAL, one UNTESTED, and the two human-playtest criteria are OPEN for the
second version running — no substitute was reported in their place.

**Scope is bounded by ten rules, not by counts** (ADR-046 §2). Each states a
property the content set must have; `tests/content-census.test.ts` carries all
ten from phase 54 with the unsatisfied ones gated against a phase table it reads
as data, so a rule cannot be quietly dropped. The version closes when all ten
pass and §8's gates are green.

**Balance authority is delegated for this version** (ADR-046 §4). The owner
granted it on 2026-08-20: costs, prices, rewards, growth times and recipe values
may be tuned without per-change approval **when a measurement requires it**.
ADR-044's standard of evidence is unchanged — instinct is not a measurement.

**Known blockers** (none stop the remaining phases — `AI_RULES.md` §10.7):

- **Code signing** — BLOCKED on the owner's certificate purchase. ADR-028's
  exception is extended through v0.6 at phase 62 so it blocks _publication_
  and nothing else. Tracked as a delivery blocker at the owner's direction.
- **Three update-behaviour tests** — BLOCKED behind a published release.
- **Three GPU render criteria** — BLOCKED on hardware with a real adapter.
- **Two product criteria** (§2.2) are **human-playtest** and can never be closed
  by a session with no person in it (ADR-040). v0.6 exists partly to make them
  closable; closing them is not v0.6's to do.

**Deferred, with reasons recorded:**

- **Offline hauling** — a chain's buffers are credited across a gap, the chain
  itself is not. Under-credits deliberately (`GAME_DESIGN.md` §9.2). Carried
  from v0.4.
- **Phase 29** is CONDITIONAL on ADR-003 §2's trigger (p99 tick > 3 ms), still
  unmet.
- **Rocks, bushes and ore veins at the old scale** — carried from v0.5's world
  track. Revisited in phase 59 only where new content needs them.

---

## 1. Version Roadmap

| Version  | Theme                    | Ships                                                 |
| -------- | ------------------------ | ----------------------------------------------------- |
| **v0.1** | Farm & Overlay           | The core loop, running in a livable overlay           |
| **v0.2** | A Living World           | Seasons, weather, day/night, audio, the plugin loader |
| **v0.3** | Town & Trade             | NPCs, settlement, contracts, a market that moves      |
| **v0.4** | Automation & Exploration | Factories, logistics, a map beyond the farm           |
| **v0.5** | The Playable Cut         | The systems become a game someone can live with       |
| **v0.6** | The Second Day           | Content depth, and a build that can reach a player    |
| **v1.0** | Full Life Simulator      | RPG, dungeons, bosses, city defense, mod ecosystem    |

**v0.5 and v0.6 were both inserted after v0.4 shipped**, and the reasons are in
§5A and §5B. `VISION.md` §4 authorises both, as §9.3 requires — for v0.6 before
this section was written, and for v0.5 late, which that document records rather
than backdates. The shipped
versions keep the names they were released under — those names appear in
`RELEASE-v0.2-RC.md`, `RELEASE-v0.3-RC.md`, `RELEASE-v0.4-RC.md` and every
phase document, and renaming a version after its release report is written
makes the record disagree with itself.

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

**Success criteria** (closed by phase-23; evidence in `RELEASE-v0.3-RC.md` §3)

- [x] NPCs follow believable daily schedules — **phase-19**: dawn-staggered wakes, day itineraries over the town's places, indoors by night; derived, so offline-exact (ADR-031)
- [x] Contracts create a reason to plant specific crops — **phases 20–22**: the premium band is the only above-base coin; the board leans toward wanted crops; standing and quests pay for deliveries alone
- [x] The economy feels responsive without becoming unpredictable — **phase-21**: demand moves prices inside a declared mean-1 band, one owner per axis; "feels" is evidenced by bounded rules and on-screen legibility, not playtesting, and the RC says so
- [x] Entity counts stay within `PERFORMANCE.md` — profiled at **every** addition (phases 17, 18, 19, 21) and re-taken combined at the RC; §14
- [x] Cross-platform is re-evaluated here — **re-evaluated and kept Windows-only** for v0.3; the evaluation is recorded in `RELEASE-v0.3-RC.md` §3, and v0.4 may revisit

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

### 5.1 Phases

| #   | Phase                    | Schema | Delivers                                            | Decided by |
| --- | ------------------------ | ------ | --------------------------------------------------- | ---------- |
| 24  | v0.4 Baseline            | —      | Every gate re-measured fresh; the production model  | ADR-035    |
| 25  | Recipes & Factories      | v11    | Buildings that consume and produce; a 3-step chain  | ADR-035    |
| 26  | Logistics & Reservation  | v12    | The chain runs itself; the 8-hour unattended proof  | ADR-036    |
| 27  | The Wilds & Resources    | v13    | Walkable land past the town; mining, foraging       | ADR-037    |
| 28  | World Map & Expeditions  | v14    | Regions as destinations; workers sent away and back | ADR-038    |
| 29  | Simulation Threading     | —      | The renderer's world reference severed; the thread  | ADR-039    |
| 30  | v0.4 Vertical Slice (RC) | —      | It feels like one game, and the gates are measured  | —          |

Three orderings are dictated by dependency rather than preference:

- **The production model before any factory (24 → 25).** The jam rules are the
  part that cannot be retrofitted — a chain that stalls forever is invisible
  to every test that does not already know to look for it — so ADR-035 states
  them before a factory exists.
- **Factories before logistics (25 → 26).** Logistics is designed once, on
  purpose, against endpoints that already exist. Phase 25 deliberately ships a
  factory that cannot feed itself, so that "how items get there" is not
  invented as a mill's private convenience (ADR-035 §9).
- **Threading last, and conditional (29).** ADR-003 §2 pre-committed the
  migration trigger — p99 tick > 3 ms — and v0.3 measured 0.2–0.5 ms. Phase 29
  is sequenced where the version's load finally exists to test that trigger
  against. Its first half (severing the renderer's direct `world` reference,
  which is where the migration's real cost sits — not `src/sim`, which is
  already pure) is worth doing whether or not the trigger fires; its second
  half runs only if it does, or if a successor ADR replaces the trigger. **The
  RC records the measured number either way.**

**Success criteria** — closed at phase 30, with evidence in
`RELEASE-v0.4-RC.md` §3.3.

- [x] A production chain runs unattended for 8 hours without jamming —
      `tests/chain-longrun.test.ts`, 576,000 ticks, three claims asserted
- [x] Exploration yields meaningfully feed the farm economy — gathering and
      expeditions both reach storage through the existing deposit path, and
      `tests/expedition-rate.test.ts` holds every destination inside
      half-to-double a forager's rate
- [x] Entity and building counts stay within budget — **515 visible sprites**
      under full v0.4 load (`PERFORMANCE.md` §17). The worker-thread migration
      did **not** land here: ADR-003 §2's trigger was measured and **not met**
      (p99 0.4–0.5 ms against 3 ms), and ADR-039 records the decision
- [ ] Offline catch-up remains accurate with production chains active —
      **PARTIAL**. A chain's buffers are credited; the chain is not, because
      nothing models hauling offline. It under-credits deliberately, which
      `GAME_DESIGN.md` §9.2 permits and the reverse would not

---

## 5A. v0.5 — The Playable Cut

**Numbered 5A rather than renumbering §6 onward**, so that every existing
reference to §6, §7 and §8 — the release gates most of all — keeps pointing at
what it always pointed at.

**Goal:** the game stops being system-complete and starts being _playable_.

v0.1 through v0.4 built a farm, a world, a town, and automation. Not one of
them closed **v0.1's four product criteria** (§2.2), which have been carried
unmet through four versions. The technical gates have been green since phase
08; the product gates have never been measured at all, and none of them can be
closed by a test.

That is what this version is for. **No new simulation system ships in v0.5.**

| Milestone         | Delivers                                                        | Depends on               |
| ----------------- | --------------------------------------------------------------- | ------------------------ |
| Audio worth hours | Real synthesis, per-play variation, beds that now have triggers | v0.2 audio wiring        |
| Zone painting     | Drawing a worker's zone on the map                              | v0.2 `setWorkerZone`     |
| "What now?"       | One surface answering what is in flight and what is next        | v0.3 contracts, v0.4 map |
| First run         | The opening minutes teach themselves                            | "What now?"              |
| Balance           | The stage arc measured, and tuned only if the number says so    | v0.4's five income paths |
| The idle cost     | The presence-gating question, resolved with measurement         | v0.3's open question     |

### 5A.1 Phases

Three tracks, one goal. The **art track** (32–39) and the **world-rendering
track** (40–46) were both added mid-version at the owner's direction; the
**playability track** (47–51) is the version's original scope and is unchanged
except in numbering.

The two visual tracks are not competing systems, and ADR-042 opens by saying so:
ADR-041 raised the CRAFT of individual sprites and was right to. What it could
not fix is that every object in the world was one tile, because that is a
rendering and content-model fact rather than an art one.

| #   | Phase                        | Track       | Delivers                                             | Decided by |
| --- | ---------------------------- | ----------- | ---------------------------------------------------- | ---------- |
| 31  | v0.5 Baseline & evidence     | —           | Evidence classes; the arc timed for the first time   | ADR-040    |
| 32  | Art Direction & The Palette  | Art         | The palette, the drawing vocabulary, the rules       | ADR-041    |
| 33  | The Ground                   | Art         | Grass, soil, wild ground, paths; season and weather  | ADR-041    |
| 34  | Buildings                    | Art         | Every structure its own silhouette                   | ADR-041    |
| 35  | The Farm                     | Art         | Crops with growth personality; field dressing        | ADR-041    |
| 36  | Characters & Small Life      | Art         | Workers readable by role; ambient creatures          | ADR-041    |
| 37  | Density & The Three Regions  | Art         | Props and decor; farm / town / wilds identity        | ADR-041    |
| 38  | The UI Joins The World       | Art         | Panels and icons that belong to the same place       | ADR-041    |
| 39  | Motion & Overlay-Scale       | Art         | Ambient motion; the consistency and cost pass        | ADR-041    |
| 40  | Depth & Anchors              | World       | One y-sorted layer, one sort key, one anchor rule    | ADR-042    |
| 41  | Footprints                   | World       | Buildings that stand on more than one tile           | ADR-042    |
| 42  | Buildings At Their Real Size | World       | The art that fills those footprints                  | ADR-042    |
| 43  | Nature At Their Real Size    | World       | Trees with volume; nature that overlaps              | ADR-042    |
| 44  | Terrain Transitions & Paths  | World       | Ground that connects instead of tiling               | ADR-042    |
| 45  | Region Composition           | World       | Landmarks and clusters; farm / town / wilds read     | ADR-042    |
| 46  | World Acceptance & Cost      | World       | The real game, looked at; the idle budget, measured  | ADR-042    |
| 47  | Audio That Earns Eight Hours | Playability | Layered synthesis, derived variation, triggered beds | ADR-043    |
| 48  | Zone Painting                | Playability | The map interaction the command has waited for       | ADR-035    |
| 49  | What Now                     | Playability | The objectives surface; ADR-034 §7 amended           | ADR-034    |
| 50  | First Run                    | Playability | Onboarding that teaches by playing                   | ADR-034    |
| 51  | Balance & The Idle Cost      | Playability | **TRIGGERED** by phase 31's arc measurement          | ADR-044    |
| 52  | v0.5 Release Candidate       | —           | Every gate, and the four product criteria            | —          |
| 53  | Start New Game               | Post-RC     | Ending a farm on purpose, without losing it          | ADR-045    |

Three orderings are dictated rather than preferred:

- **The palette and the library before any asset (32 → 33–38).** ADR-041's
  finding is that the vocabulary is the ceiling; authoring assets against the
  old one would produce the old look more expensively.
- **The ground before everything standing on it (33 → 34–37).** Grass is the
  most-repeated pixel in the game, and every other asset is judged against it.
- **"What now?" before first run (42 → 43).** Onboarding teaches a player to
  read the game; it cannot teach them to read a surface that does not exist.

### 5A.2 The three classes of evidence

The product criteria are not tests, and pretending otherwise is the one way
this version can lie. ADR-040 defines three classes, and every criterion is
reported in exactly one:

| Class                  | Means                                                  | May I mark PASS? |
| ---------------------- | ------------------------------------------------------ | ---------------- |
| **Machine-verifiable** | A test or measurement asserts it, repeatably           | Yes              |
| **AI-observable**      | I drove the app and observed it; the judgement is mine | Yes, labelled    |
| **Human-playtest**     | Requires a person's reaction                           | **Never**        |

**Success criteria** — v0.1's four, promoted to v0.5's release gates:

- [ ] Runs an 8-hour workday without being noticed in Task Manager —
      _machine-verifiable_
- [ ] Reaching stage 4 (`GAME_DESIGN.md` §1.1) takes under ~4 hours of play —
      _AI-observable_, with a machine-verifiable bound
- [ ] The first worker hire produces a visible "oh, I see" moment —
      **human-playtest**
- [ ] A tester returns unprompted on a second day — **human-playtest**

The last two **cannot be closed by this session**, and the v0.5 report will say
so rather than reporting a substitute and calling it the criterion.

### 5A.2a Where v0.5's phase record went

v0.5 wrote no per-phase documents; its record accumulated in §0, which must
describe the current version and nothing else. When v0.6 opened, that narrative
was **moved** to `docs/phases/v05-phase-record.md` rather than deleted. The gate
results and the four criteria are in `RELEASE-v0.5-RC.md`.

### 5A.3 Out of scope, bindingly

No RPG progression, combat, dungeons, bosses, or city defense. No new
simulation systems. No factories beyond v0.4's model, and no world-map
expansion. Those are v1.0's (§6), and this section does not move them.

---

## 5B. v0.6 — The Second Day

**Numbered 5B for the same reason §5A is 5A**: every existing reference to §6,
§7 and §8 — the release gates most of all — keeps pointing at what it always
pointed at.

**Goal:** the game acquires a reason to still be open tomorrow, and a build that
can reach the person who would open it.

v0.5 finished the game's surfaces and was bindingly forbidden to add anything to
do. What that left is a finished machine running a demo. Phase 54 counted it:
**4 crops, 6 purchasable buildings, 2 recipes, 1 authored quest chain, 3
expedition sites, 3 resource nodes, 4 residents, 11 placeholder sounds.**
ADR-035's factory model, built for chains, runs
one two-step chain, and four crops cannot fill four seasons — spring and winter
offer two plantable crops each.

That is why a perfect player exhausts the arc in twelve minutes, and it is the
reason §2.2's fourth criterion has never been closable: **there is no second day
in the box.**

**No new simulation system ships in v0.6** (ADR-046 §1) — the same discipline
v0.5 held, for the same reason. Every phase is a data edit landing through the
public API `plugins/core` already uses, plus the art and audio that data names.

| Milestone         | Delivers                                                       | Depends on              |
| ----------------- | -------------------------------------------------------------- | ----------------------- |
| The census        | Scope written down as ten checkable rules before authoring     | ADR-046                 |
| Choices           | A season that presents a decision instead of a filter          | v0.2 seasons            |
| Chains            | Production worth automating; the Mill and Kitchen earn tiles   | v0.4 recipes, logistics |
| A longer ladder   | Somewhere for coins to go above the Market Stall               | v0.1 economy            |
| Reasons to return | Quest chains that span days; a town that wants things          | v0.3 reputation         |
| Reach             | Destinations that differ on more than one axis                 | v0.4 expeditions        |
| A voice           | Sound that is not a placeholder                                | v0.5 ADR-043            |
| The arc, again    | The economy re-measured after content, and tuned if it says so | ADR-044, ADR-046 §4     |
| Delivery          | A build a person can install, and the exact blocker if not     | v0.2 updater, ADR-028   |

### 5B.1 Phases

One track. The ordering is dictated in three places and preferred nowhere.

| #   | Phase                          | Delivers                                                   | Decided by |
| --- | ------------------------------ | ---------------------------------------------------------- | ---------- |
| 54  | v0.6 Baseline & content census | Gates re-run fresh; ten rules; the census instrument       | ADR-046    |
| 55  | Crops & the seasonal choice    | Three plantable per season; none strictly dominated        | ADR-046 §2 |
| 56  | Chains worth building          | Chains of depth ≥ 3; every factory named by two recipes    | ADR-035    |
| 57  | Things to buy                  | Purchasable buildings above the Market Stall               | ADR-046 §2 |
| 58  | People worth knowing           | An authored chain per resident                             | ADR-034    |
| 59  | Somewhere to go                | Sites differing on more than one axis                      | ADR-038    |
| 60  | Sound that isn't a placeholder | Real timbre through ADR-043's verified replacement path    | ADR-043    |
| 61  | The arc, re-measured           | The economy measured after content; tuned only if required | ADR-044    |
| 62  | Delivery                       | Version string, signing decision, an installable build     | ADR-028    |
| 63  | v0.6 Release Candidate         | Every gate, the ten rules, and the four product criteria   | —          |

Three orderings are dictated rather than preferred:

- **The census before any authoring (54 → 55–60).** A content version scoped by
  a feeling either stops early or never stops. ADR-046 §2 exists so the version
  has a target before anything is authored against it.
- **All authoring before the arc is re-measured (55–60 → 61).** Tuning a moving
  target is how a balance pass becomes a rebalance loop. ADR-044's evidence
  standard needs the content set to hold still.
- **The arc before delivery (61 → 62).** The build a tester installs is the one
  chance §2.2's two human criteria get. Spending it on a version whose economy
  has not been measured wastes the tester, not the build.

**Success criteria**

Reported in the evidence class each belongs to (ADR-040, §5A.2's table):

- [x] All ten ADR-046 §2 content rules pass — _machine-verifiable_ — **PASS**
- [x] The v0.5 golden save fixture loads unchanged — _machine-verifiable_ — **PASS**
- [ ] Idle cost still inside `PERFORMANCE.md` budgets with the full content set
      loaded — _machine-verifiable_
- [x] The progression arc clears both floor and ceiling after content —
      _machine-verifiable_ — **PASS**, 10–17 min across six openings
- [ ] A build installs and runs on a clean machine — _machine-verifiable_,
      BLOCKED on §0's signing blocker for the _published_ case only
- [ ] The first worker hire produces a visible "oh, I see" moment —
      **human-playtest**, carried from §2.2
- [ ] A tester returns unprompted on a second day — **human-playtest**, carried
      from §2.2

The last two **cannot be closed by this session**, exactly as in v0.5. What v0.6
changes is that they become _askable_: there is content to return to, and a
build to return to it with.

### 5B.2 Out of scope, bindingly

No RPG progression, combat, dungeons, bosses, or city defense. No new simulation
systems, no new save-schema fields, no new command kinds, no new extension
points. No world-map expansion beyond authoring destinations into v0.4's
existing model. Those are v1.0's (§6), and this section does not move them.

ADR-046 §Deliberately-not-done additionally refuses a content-authoring DSL or
editor: the cost of a crop is a data literal plus a generator entry, and
building a faster way to make content is a system.

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
