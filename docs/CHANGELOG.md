# CHANGELOG

All notable changes to Desktop Life Simulator are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Complete documentation foundation: vision, roadmap, architecture, game design, and development rules
- Eleven architecture decision records covering rendering, persistence, process architecture, entity model, UI framework, asset pipeline, simulation tick, event system, world model, the command model, and the resource lifecycle
- Autonomous worker AI (phase-04): hire workers who pathfind, farm, carry, rest, and can be selected — the emotional core of v0.1
- Resource lifecycle model (ADR-011): one architecture governs how every resource enters, moves through, and leaves the world — conserved quantities owned by containers, moved only by explicit transfer, ahead of inventory in phase-05
- Resources & containers (phase-05a/b): harvested crops become stacked items in containers with real capacity; workers carry a hold and deposit it; a full container blocks a harvest rather than discarding it
- Storage buildings (phase-05c): place storage sheds on owned land; workers deposit their harvest into the nearest shed with room, falling back to the player inventory. Buildings block pathing, and workers pick a deposit target through a strategy that stays replaceable
- Inventory panel and building placement (phase-05d): an inventory panel — the first substantial React panel on the throttled snapshot bridge — shows stacked items with icons, counts, capacity, and sort, opening without stealing focus and doing no work while the inventory is static. Sheds render on the map, and a build mode previews placement with a ghost tinted by the same validator the placement uses — green where it will land, amber where it will not. Phase-05 (Resources & Containers) is complete
- AI asset production foundation (phase-05.5a): the creative canon under `docs/assets/` — an immutable style lock (rules R-01..R-18), art direction, the canonical colour palette, a pixel and sizing guide, creative quality-rejection criteria, and extended naming/folder conventions — constraining how every future AI session generates art without drifting the visual identity. Creative docs define artistic intent and defer to `ASSETS.md` and the ADRs as the single source of truth for pipeline, naming, atlas structure, and build; the never-created `assets/src/PALETTE.md` reference is repointed to `docs/assets/COLOR_PALETTE.md`. First sub-milestone of the phased phase-05.5 asset-foundation work (source directives `fix/0.1/5.5Assets A–H`)
- Creative bibles (phase-05.5b): `CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, and `LORE_BIBLE.md` under `docs/assets/` — the world's people, place, and story as canon for every future generation session. The character bible fixes the shared human rig and the `1 : 4` head-to-body proportion `STYLE_LOCK.md R-07` points to; the world bible sets architecture, biomes, and regions as tints over the shared palette with home always safe; the lore bible establishes a deliberately light, open fiction (the giving land, the faded First Tenders, the dormant Old Works) whose consistency rules keep danger at the frontier and let unstated lore be filled in later and become canon. Character colour values (an inclusive skin sub-ramp plus hair/cloth mapping) were added to `COLOR_PALETTE.md §3.5`, keeping colour values in the palette and their usage in the bible
- UI, icon & animation guides (phase-05.5c): `UI_STYLE_GUIDE.md`, `ICON_GUIDE.md`, and `ANIMATION_GUIDE.md` under `docs/assets/`. The UI guide owns only the interface's cozy _look_ (parchment panels, chunky controls, HUD styling) and defers behaviour/layout to `GAME_DESIGN.md §10`, the React/DOM framework and snapshot bridge to `ADR-005`, and colour values to `COLOR_PALETTE.md §6`. The icon guide sets design standards for every category built around the 16 px read — one centred subject, silhouette-first, the shared 1 px outline, reserved accents kept meaningful — and defers sizes/atlas to `ASSETS.md §3` and names to `NAMING_CONVENTION.md`. The animation guide owns per-action frame counts, cadence, and loop intent, with the cadence math (`fps = 20 / frameTicks`, calm at 2–5 fps) and the rule that a one-shot animation fills its action's sim duration (`GAME_DESIGN.md §4.3`), deferring the format and manifest to `ASSETS.md §7`
- Visual language & technical router (phase-05.5f): `VISUAL_REFERENCE.md` and `TECHNICAL_ASSET_SPEC.md` under `docs/assets/`. The visual reference completes the pre-declared three-way split — `ART_DIRECTION.md` the philosophy, `STYLE_LOCK.md` the rules, this the _language_: nine binding visual keywords, inspiration reduced to abstract qualities with explicit never-copy pairs, the attention hierarchy and the four tools that enforce it, shape grammar per category on one axis (rounded = safe and present, angular = old and wild), a signature-cue-per-material table for small-size readability, composition rules, lighting/colour/animation-feel language for future contexts, and the environmental-storytelling grammar `ART_DIRECTION.md §9` promised it — with no values, since hexes, sizes, and frame counts stay with their owners. The technical spec is a ROUTER: a one-hop index from every technical concern to its single owner, with genuinely unowned future concerns marked "no owner yet" as a binding statement; it owns exactly one artifact — the `GENERATION.md` asset-metadata schema (`AI_ASSET_PIPELINE.md §7` assigned it here) recording per-asset generation provenance (AI model, prompt section + git hash, palette/animation canon hashes, date, dependencies), reusing git history as the version store per `ADR-006 §2`. `QUALITY_GUIDELINES.md §6` gains the checklist line that makes the metadata row a review requirement
- Audio canon (phase-05.5e): `AUDIO_DIRECTION.md`, `MUSIC_LIBRARY.md`, and `SFX_LIBRARY.md` under `docs/assets/` — the sound direction locked before a single note exists, exactly as the art canon preceded the art. The direction doc is governed by one principle — audio you can leave running all day beside real work — making music sparse and optional, ambience a quiet bed, reward the loudest thing the player hears, and loops long, seamless, and hook-free; audio's binding constraints come from `VISION.md §2.1/§2.2` (the product), since `STYLE_LOCK.md` binds only the visual canon. The two catalogs list every intended track and effect with mood/intent, loop or trigger behaviour, and the earliest roadmap tier each can ship in; the SFX catalog's event names feed the `sfx_` file-name grammar in `NAMING_CONVENTION.md §4.2`, and action one-shots sync to their animation and fill the sim duration (`GAME_DESIGN.md §4.3`). All forward-looking — no audio ships in v0.1 (`VISION.md §5.2`); pipeline and format stay owned by `ADR-006 §8` and `ASSETS.md §3`
- AI production system (phase-05.5d): `ASSET_CATALOG.md`, `PROMPT_LIBRARY.md`, and `AI_ASSET_PIPELINE.md` under `docs/assets/`, turning the canon into a repeatable workflow. The pipeline doc owns the authoring half (concept → prompt → generation → review → approved source PNG) and routes the source→runtime half (naming, atlas packing, import, versioning, release) to `ASSETS.md` and `ADR-006`, meeting at a single seam — an approved PNG in `assets/src/`. The prompt library gives reusable per-class prompts that each prepend a shared style preamble, palette block, and universal negative prompt (every `STYLE_LOCK.md` prohibition as a negative), framing the model as a concept generator whose output the review gates. The catalog is the human production backlog (priority/phase/estimate/dependencies), grounded in real v0.1 content and flagging phase-06's economy art as the next wave; it is renamed from the directive's `ASSET_MANIFEST` and carries a header distinguishing it from the generated `manifest.ts` (`ASSETS.md §5`) it must never be confused with
- Eight phase specifications for v0.1 (foundation through save/load)
- Project foundation (phase-00): build toolchain, architecture boundary enforcement, asset pipeline, seeded RNG, and the 20 Hz fixed-timestep loop
- Docked overlay with click-through, tray, and collapse/expand (phase-01)
- Player interaction (phase-03.6): tool selection (`1` hoe, `2` seed, `4` hand), hover and selection highlights, and click-to-act — the first real consumer of the command dispatcher, proving the pathway worker AI and automation will use
- Command model (phase-03.5): a single dispatcher as the only write path into the simulation — commands validate purely at dispatch, queue, and execute on the tick boundary, publishing events only on success (ADR-010)
- World and crop domain (phase-03): tile states, four crops, deterministic growth, plant/harvest commands
- Engine foundations (phase-02.5): typed event bus, phase-based simulation scheduler, deterministic ID allocation, development time scaling
- Tile world with render-on-demand (phase-02)
- Developer tooling (phase-01.5): F3 debug overlay, F1 console, F4 inspector, profiler, logger, and feature flags — excluded from production builds

### Fixed

- Non-deterministic test count: the headless import suite enumerated `src/sim` at collection time and picked up the temporary fixtures `boundaries.test.ts` writes into `src/sim/__boundary_fixtures__/` from a parallel worker, so identical runs reported different totals. Transient `__`-prefixed directories are now excluded from enumeration.

### Notes

- No player-visible functionality yet. Phase-00 delivers infrastructure only; the overlay itself arrives in phase-01.

---

## Versioning Rules

### Two version numbers

This project tracks **two independent versions**. Confusing them causes save-compatibility bugs.

| Version                 | Format                  | Meaning                     | Where                                   |
| ----------------------- | ----------------------- | --------------------------- | --------------------------------------- |
| **App version**         | Semantic (`0.1.0`)      | The release the player sees | `package.json`, `meta.gameVersion`      |
| **Save schema version** | Integer (`1`, `2`, `3`) | The persisted data format   | `schemaVersion` (`SAVE_FORMAT.md` §4.1) |

They move independently. A patch release may bump the schema; a minor release may not. **Only `schemaVersion` controls migration** — `meta.gameVersion` is informational and must never drive logic (`SAVE_FORMAT.md` §2.1).

### Semantic versioning, as applied here

Pre-1.0, the conventional rules are adapted to the roadmap in `PLAN.md`:

| Bump                | Means                                               | Example         |
| ------------------- | --------------------------------------------------- | --------------- |
| **MAJOR** (`1.0.0`) | v1.0 — the feature-complete life simulator          | Reserved        |
| **MINOR** (`0.2.0`) | A roadmap tier: new systems, possibly a schema bump | v0.1 → v0.2     |
| **PATCH** (`0.1.1`) | Fixes, balance, performance; no new systems         | Bug fix release |

**Backward compatibility is never broken**, at any bump (`AI_RULES.md` §1.4). A v0.1 save must load in v1.0. There is no version increment that licenses breaking a save.

---

## Entry Format

### Categories

Use these six, in this order. Omit empty ones.

| Category     | For                          |
| ------------ | ---------------------------- |
| `Added`      | New features                 |
| `Changed`    | Changes to existing behavior |
| `Deprecated` | Features to be removed later |
| `Removed`    | Features removed now         |
| `Fixed`      | Bug fixes                    |
| `Security`   | Vulnerability fixes          |

### Writing entries

Entries are for **players**, not developers. The reader wants to know what changed about the game, not which module was refactored.

```markdown
## [0.2.0] - 2026-XX-XX

### Added

- Weather system: rain automatically waters crops
- Plugin loader — mods can now add crops, items, and buildings
- Day/night cycle affecting worker schedules

### Changed

- Wheat growth time reduced from 120s to 100s
- Market Stall now sells at 92% (was 90%)

### Fixed

- Workers no longer stall when storage fills while carrying items
- Overlay re-docks correctly after a DPI change

### Save Compatibility

- Schema version 1 → 2 (adds weather state)
- v0.1 saves load automatically; no player action needed
```

### The Save Compatibility section

**Required on any release that bumps `schemaVersion`.** It must state the version transition and, in plain language, what the player needs to do — normally "nothing."

This section exists because save compatibility is the promise this project makes most seriously, and a release that changes the format without saying so undermines it even when the migration works.

### Rules

- **Player-facing language.** "Workers no longer stall when storage fills," not "fixed null deref in `deposit-task.ts`."
- **No internal refactors.** If it does not change what the player experiences, it does not belong here (that is what git history is for).
- **One line per change.** Link to an issue if there is detail worth having.
- **Add to `[Unreleased]` in the same commit as the change** (`AI_RULES.md` §5.4).
- **Balance changes are always listed.** A player who notices wheat is faster deserves to find it here.
- **Performance improvements are listed when measurable**, with the measurement: "Idle CPU reduced from 1.4% to 0.6%."

---

## Release Process

1. Verify every gate in `PLAN.md` §8 — **including zero known data-loss defects**
2. Move `[Unreleased]` entries under a new version heading with the release date
3. Add the Save Compatibility section if `schemaVersion` changed
4. Bump `version` in `package.json`
5. Confirm every golden fixture still loads (`SAVE_FORMAT.md` §4.4)
6. Tag the release `v<version>`
7. Create a fresh empty `[Unreleased]` section

Step 5 is not optional and not covered by step 1's general test run. It is the specific check that a released build can still load saves from every prior version.

---

## Version History

_No releases yet. v0.1 ships at the completion of phase-07 (`docs/phases/phase-07-save-load.md`)._
