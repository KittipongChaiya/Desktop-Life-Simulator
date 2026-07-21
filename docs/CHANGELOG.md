# CHANGELOG

All notable changes to Desktop Life Simulator are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Complete documentation foundation: vision, roadmap, architecture, game design, and development rules
- Seven architecture decision records covering rendering, persistence, process architecture, entity model, UI framework, asset pipeline, and simulation tick
- Eight phase specifications for v0.1 (foundation through save/load)
- Project foundation (phase-00): build toolchain, architecture boundary enforcement, asset pipeline, seeded RNG, and the 20 Hz fixed-timestep loop

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
