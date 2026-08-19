# Phase 00 — Foundation

> **Delivers:** A repository with enforced boundaries, a working build, a ticking headless simulation, and green CI. No gameplay.
> **Runnable at completion:** An empty Electron window opens; `npm test` runs a headless simulation for 100,000 ticks deterministically.

---

## Objectives

1. Establish the toolchain and build so every later phase compiles independently.
2. **Enforce the architecture boundary before any code can violate it.**
3. Build the asset pipeline before the first sprite exists.
4. Build the fixed-tick loop and seeded RNG before the first system exists.
5. Get CI green so every subsequent phase inherits working gates.

### Why this phase exists

Every item above is **cheap now and expensive later**. A boundary linter added after violations exist requires fixing violations before it can be turned on. An asset pipeline added after loose-file loading has spread means touching every call site (ADR-006 §Consequences). A tick loop retrofitted around existing systems means re-testing all of them.

This phase produces no gameplay and is not optional.

---

## Deliverables

### Repository and toolchain

- [ ] `package.json` with pinned versions per `TECH_STACK.md` §1
- [ ] Three `tsconfig` files — **`tsconfig.sim.json` omits both DOM and Node libs** (`TECH_STACK.md` §3.1)
- [ ] `electron.vite.config.ts` with three entry points and path aliases matching the tsconfigs
- [ ] `electron-builder.yml` targeting `win/x64`
- [ ] `.gitattributes` with LF normalization; `.gitignore` covering `assets/dist/`, `dist/`, `out/`, coverage
- [ ] Prettier config per `CODE_STYLE.md` §11

### Boundary enforcement — the core deliverable

- [ ] ESLint flat config with `typescript-eslint`
- [ ] `eslint-plugin-boundaries` implementing the full matrix in `CODE_STYLE.md` §8.1
- [ ] `eslint-plugin-import` for ordering and cycle detection
- [ ] `dependency-cruiser` config
- [ ] Custom rules: no `Math.random()` / `Date.now()` / `performance.now()` in `src/sim`; no string-literal texture paths
- [ ] `npm run check:boundaries` and `npm run check:cycles`
- [ ] Husky pre-commit running typecheck, lint, format on staged files

### Directory skeleton

- [ ] Full tree from `PROJECT_STRUCTURE.md` §1–§5, with real files — **no empty placeholder directories**

### Shared foundations

- [ ] `src/shared/constants.ts` — `TICKS_PER_SECOND = 20`, `TICK_MS`, `MAX_CATCHUP_TICKS`, budgets
- [ ] `src/shared/result.ts` — `Result<T,E>`, `ok()`, `err()`
- [ ] `src/shared/errors.ts` — `AppError` taxonomy
- [ ] `src/shared/ids.ts` — branded ID types (`CODE_STYLE.md` §1.4)
- [ ] `src/shared/geometry.ts` — `TilePosition`, index↔coord conversion

### Simulation core

- [ ] `src/sim/rng/rng.ts` — seeded PRNG with serializable state; **the only randomness source**
- [ ] `src/sim/world/world.ts` — minimal `World` (seed, tick, rng) and `createWorld()`
- [ ] `src/sim/tick.ts` — `stepSimulation(world)` running an empty ordered system list
- [ ] `src/sim/systems/index.ts` — `TICK_SYSTEMS`, empty but typed

### Application shell

- [ ] `src/main/index.ts` — opens a plain window, no overlay behavior
- [ ] `src/preload/index.ts` — empty typed `contextBridge` surface
- [ ] `src/renderer/main.tsx` — mounts, starts the accumulator loop
- [ ] `src/renderer/bootstrap/loop.ts` — accumulator with `MAX_CATCHUP_TICKS` guard (ADR-007 §3)

### Asset pipeline

- [ ] AssetPack configured for the six atlas groups (`ASSETS.md` §4)
- [ ] `npm run assets` generating atlases and `manifest.ts`
- [ ] One placeholder tile sprite proving the pipeline end to end
- [ ] Watch mode wired into `npm run dev`

### Testing and CI

- [ ] Vitest configured for all three tsconfig contexts
- [ ] Coverage reporting with thresholds from `TESTING.md` §4
- [ ] Playwright configured against the built app
- [ ] fast-check installed
- [ ] `tests/` skeleton per `PROJECT_STRUCTURE.md` §3
- [ ] GitHub Actions running every gate in `TESTING.md` §7.1

---

## Out of Scope

Binding (`AI_RULES.md` §3.2):

- Overlay behavior of any kind — transparency, docking, always-on-top, tray _(phase-01)_
- PixiJS initialization or any rendering _(phase-02)_
- React components beyond a mount point _(phase-01)_
- Any game system, entity, or content _(phase-03+)_
- Save/load, serialization, migrations _(phase-07)_
- Real art beyond one placeholder _(phase-02)_
- The snapshot bridge _(phase-01)_

---

## Acceptance Criteria

Every item is a runnable command or an observable behavior.

| #   | Criterion                                                                   | Verified by          |
| --- | --------------------------------------------------------------------------- | -------------------- |
| 1   | `npm install` succeeds on a clean checkout                                  | Clean clone          |
| 2   | `npm run typecheck` — zero errors across all three configs                  | Command              |
| 3   | `npm run lint` — zero warnings                                              | Command              |
| 4   | `npm run build` produces a launchable app                                   | Command + launch     |
| 5   | `npm run dev` starts with HMR and main-process restart                      | Manual               |
| 6   | `npm run assets` generates atlases and a typed manifest                     | Command + inspect    |
| 7   | **A test file importing `pixi.js` into `src/sim` fails lint**               | Deliberate violation |
| 8   | **A test file importing `electron` into `src/sim` fails lint**              | Deliberate violation |
| 9   | **`Math.random()` in `src/sim` fails lint**                                 | Deliberate violation |
| 10  | `document` and `process` are compile errors in `src/sim`                    | Deliberate violation |
| 11  | `npm run check:cycles` reports no cycles                                    | Command              |
| 12  | 100,000 ticks with a fixed seed produce identical RNG state across two runs | Test                 |
| 13  | The accumulator advances exactly 20 ticks per simulated second              | Test                 |
| 14  | A 10-second simulated stall advances at most `MAX_CATCHUP_TICKS`            | Test                 |
| 15  | Every sim module imports cleanly in bare Node (no DOM, no Electron)         | Test                 |
| 16  | CI green on a fresh PR                                                      | GitHub Actions       |

**Criteria 7–10 are the point of this phase.** They must be verified by _deliberately writing a violation and observing the failure_, then reverting. A boundary that has never been tested is a boundary that does not exist.

---

## Testing Checklist

- [ ] RNG: same seed → same sequence; state serializes and resumes mid-stream
- [ ] RNG: different seeds → different sequences
- [ ] Tick loop: exact tick count over simulated time
- [ ] Tick loop: catch-up cap holds; no spiral under a long stall
- [ ] Tick loop: fractional time accumulates rather than being lost
- [ ] `Result`: `ok`/`err` narrow correctly
- [ ] Geometry: index↔coord round-trips for every tile in a 64×64 grid
- [ ] Geometry: out-of-bounds handled explicitly
- [ ] Boundary violations 7–10 each rejected (write, observe, revert)
- [ ] Sim modules import in bare Node
- [ ] Coverage thresholds enforced — verify by dropping one below and seeing CI fail
- [ ] E2E: the built app launches and exits cleanly

---

## Future Dependencies

| Deliverable           | Depended on by                                                   |
| --------------------- | ---------------------------------------------------------------- |
| Boundary linter       | **Every phase** — the mechanism protecting the architecture      |
| Three tsconfigs       | Every phase; sim purity is a compile error because of this       |
| Seeded RNG            | 03 (crop variance), 04 (worker decisions), 07 (determinism)      |
| Accumulator loop      | 02 (interpolation alpha), 03+ (all systems)                      |
| `TICK_SYSTEMS`        | Every system in 03–06                                            |
| Branded IDs           | 03–06; retrofitting after entities exist is wide and error-prone |
| Asset pipeline        | 02, 03, 04, 05                                                   |
| `Result` / `AppError` | Every boundary in every phase                                    |
| Coverage gates        | Every phase                                                      |
| Constants             | 03–07 — all content authored in ticks (ADR-007 §7)               |

---

## Notes

**Do not skip the deliberate-violation tests.** They are the only proof the architecture is enforced rather than merely documented. `ARCHITECTURE.md` §10 lists boundary erosion as the top architectural risk precisely because it happens one convenient import at a time.

**Pin every version.** Verify current stable releases at implementation time — the floors in `TECH_STACK.md` were written earlier and may lag.
