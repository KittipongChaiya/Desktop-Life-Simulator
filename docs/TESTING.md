# TESTING

> **Status:** Authoritative for test strategy, tooling, and coverage gates.
> **Owns:** What to test, how, where tests live, coverage thresholds, CI gates.
> **Does not own:** Per-phase checklists (`docs/phases/`), process rules (`AI_RULES.md` §3.3).

**A feature is done when a test proves it works and would fail if it broke** (`AI_RULES.md` §3.3).

---

## 1. Strategy

### 1.1 The simulation has no excuse

`src/sim` is pure, deterministic, and headless by construction (ADR-003 §4). It has no DOM, no Electron, no PixiJS, no I/O, and no clock. Testing it requires no mocks, no test doubles, and no setup — just call a function and check the world.

This is the payoff for the boundary enforcement in `CODE_STYLE.md` §8, and it is why the sim carries the highest coverage bar in the project with no exemptions.

### 1.2 The shape of the suite

```
                    ▲  fewer, slower, higher confidence
        ┌───────────────────────┐
        │   E2E (Playwright)    │   ~15 tests — overlay, idle cost, save integrity
        ├───────────────────────┤
        │     Integration       │   ~40 tests — save round-trip, migrations, tick
        ├───────────────────────┤
        │  Property (fast-check)│   ~15 properties — determinism, round-trip, catch-up
        ├───────────────────────┤
        │        Unit           │   ~300 tests — systems, content, pure logic
        └───────────────────────┘
                    ▼  many, fast, focused
```

Property tests sit above integration deliberately. **The three most important guarantees in this project are properties, not examples:**

- Same seed + same intents → identical state (ADR-007)
- `fromSave(toSave(w))` ≡ `w` (ADR-002)
- `catchUp(n)` ≤ `n` real ticks, within tolerance (`SAVE_FORMAT.md` §6.5)

None can be adequately covered by hand-written cases.

### 1.3 Test behavior, not implementation

Assert on outcomes reachable through public interfaces. A test that breaks during a refactor which preserves behavior is a bad test.

```ts
// Bad — asserts internals
expect(world.crops.get(tile)._internalGrowthCounter).toBe(600);

// Good — asserts behavior
stepTicks(world, 1200);
expect(cropAt(world, tile).stage).toBe(CropStage.Mature);
```

---

## 2. Tooling

| Tool                         | Scope                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **Vitest**                   | Unit, integration, property. Shares Vite config, so aliases work without duplication |
| **@vitest/coverage-v8**      | Coverage measurement and gates                                                       |
| **fast-check**               | Property-based testing                                                               |
| **Playwright** (`_electron`) | E2E against the real packaged app                                                    |
| **@testing-library/react**   | UI component tests — queries by role and text, never by class                        |

**No mocking framework.** If a unit test needs heavy mocking, the boundary is wrong. The sim needs none; persistence takes a filesystem interface as a parameter; the renderer is tested through snapshots. Reaching for a mock is a design signal, not a testing need.

---

## 3. Location

Unit tests are co-located; cross-cutting tests live in `tests/` (`PROJECT_STRUCTURE.md` §2.2, §3).

```
src/sim/systems/growth.ts
src/sim/systems/growth.test.ts        ← co-located unit test

tests/
├── e2e/            Playwright, launches the real app
├── integration/    Multi-module, in-process
├── property/       fast-check
└── fixtures/
    └── saves/      Golden fixtures — COMMITTED, NEVER EDITED
```

---

## 4. Coverage Gates

Enforced in CI. A PR below any threshold does not merge.

The numbers live in `coverage-policy.config.ts`, `vitest.config.ts` derives its gates from there, and `tests/coverage-policy.test.ts` asserts that this table and that file agree. A threshold changed in one place and not the other fails the suite.

| Area                        | Line / Branch | Rationale                                                                        |
| --------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `src/sim/**`                | **90 / 85**   | Pure and trivially testable. No exemptions granted                               |
| `src/persistence/**`        | **95 / 90**   | Highest in the project — this code protects player data                          |
| `src/shared/**`             | 90 / 85       | Mostly types; the logic that is there is small and pure                          |
| `src/renderer/app/**`       | 85 / 75       | Behavior over pixels — panels render a snapshot and dispatch intents             |
| `src/renderer/render/**`    | 95 / 85       | What remains after §4.2 is the extracted logic, and it is ordinary to test       |
| `src/renderer/bootstrap/**` | 85 / 75       | Composition and input translation; the host mounts are in §4.2                   |
| `src/main/**`               | 90 / 80       | What remains after §4.2 takes its host dependency as a parameter                 |
| `src/devtools/**`           | 85 / 75       | Dev-only, but real code with real tests (ADR-018)                                |
| `src/preload/**`            | E2E           | Every file is a host binding — see §4.2                                          |
| `plugins/**`                | 90 / 85       | Content registration is sim-adjacent and pure; measured before phase-08 fills it |
| **Project total**           | **90 / 85**   | `AI_RULES.md` §3.3                                                               |

### 4.1 On the numbers

`src/persistence` carries the highest bar because a bug there destroys a player's months of progress, and because it is exactly the code that is never exercised by casual play — a broken migration surfaces only when someone loads an old save.

`src/sim` carries 90/85 with no exemption because it is pure, headless, and needs no setup to test (§1.1). It is also the area with the least margin: at phase-08.0 it cleared its branch gate by a single branch, so a new uncovered branch there turns the strictest gate in the project red.

**Every row above went up at phase-08.0, or stayed.** That is not a rewrite of the standard; it is what happened once §4.2 stopped counting host bindings as untested logic. `src/renderer/render` was declared at 50/40 and measured 34% — because the row averaged extracted, well-tested logic against Pixi files that a unit test cannot reach at all. Measuring only the first gives 98.94%, and the row that could honestly be asked for rose to 95/85. `src/main` moved the same way, from a declared 60% measuring 31% to 90/80.

**Coverage is a floor, not a goal.** 90% coverage with tests that assert nothing is worse than 70% with tests that would catch a regression. Do not add assertion-free tests to hit a number.

### 4.2 What is not measured, and what covers it instead

A file leaves the measured set only when **both** hold:

1. it is a **host binding** — its body exists to call Pixi, Electron, or the DOM host, and cannot be imported in the unit environment without one; **and**
2. a named test does exercise it.

A file that fails either test and is uncovered is a **gap**, not an exclusion, and the answer is a test. This register is checked by `tests/coverage-policy.test.ts`: every path must exist, appear in `coverage-policy.config.ts`, and name at least one detector that itself exists.

The criterion is not new. `save-store.ts` states it as doctrine — the save directory is a parameter rather than `app.getPath`, so the whole atomic sequence is testable against a real temp directory — and §2 states its consequence: reaching for a mock is a design signal, not a testing need. Most rows below therefore carry a **Logic** column: the decisions were extracted long ago, and what is excluded is the sprite or window binding left over.

| File                                       | Logic lives in                                 | Detector                                                              |
| ------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------- |
| `src/main/index.ts`                        | —                                              | `overlay`, `background-tick`, `save`, `companion` specs               |
| `src/main/overlay-window.ts`               | —                                              | `overlay.spec.ts`                                                     |
| `src/main/settings.ts`                     | `src/main/settings-store.ts`                   | `companion.spec.ts`, `overlay.spec.ts`                                |
| `src/preload/index.ts`                     | `src/shared/ipc/contract.ts`                   | `overlay.spec.ts`, `companion.spec.ts`                                |
| `src/renderer/entry/main.tsx`              | —                                              | `tests/boundaries.test.ts`, `overlay.spec.ts`                         |
| `src/renderer/bootstrap/start.tsx`         | —                                              | `overlay.spec.ts`, `hud-layout.spec.ts`                               |
| `src/renderer/bootstrap/world-mount.ts`    | —                                              | `render-budget.spec.ts` — criterion 18 cycles it twenty times         |
| `src/renderer/bootstrap/devtools-mount.ts` | —                                              | `devtools-excluded-from-production`, `inspector`, `performance-panel` |
| `src/renderer/render/app.ts`               | —                                              | `render-budget.spec.ts` — criterion 1                                 |
| `src/renderer/render/layers.ts`            | —                                              | `render-budget.spec.ts`                                               |
| `src/renderer/render/world-view.ts`        | `src/renderer/render/dirty-gate.ts`            | `render-budget.spec.ts` — criteria 5, 8                               |
| `src/renderer/render/worker-view.ts`       | `src/renderer/render/worker-render.ts`         | `worker.spec.ts`, `render-budget.spec.ts`                             |
| `src/renderer/render/crop-view.ts`         | `src/renderer/render/crop-anim.ts`             | `economy.spec.ts`, `render-budget.spec.ts`                            |
| `src/renderer/render/building-view.ts`     | —                                              | `placement.spec.ts`, `render-budget.spec.ts`                          |
| `src/renderer/render/building-ghost.ts`    | —                                              | `placement.spec.ts`                                                   |
| `src/renderer/render/decor-view.ts`        | `src/renderer/render/decor.ts`                 | `render-budget.spec.ts`                                               |
| `src/renderer/render/particle-view.ts`     | `src/renderer/render/particle-pool.ts`         | `render-budget.spec.ts`                                               |
| `src/renderer/render/terrain-renderer.ts`  | `src/renderer/render/terrain-chunks.ts`        | `render-budget.spec.ts` — criterion 7                                 |
| `src/renderer/render/floating-numbers.ts`  | `src/renderer/render/floating-number-state.ts` | `render-budget.spec.ts`                                               |
| `src/renderer/render/effects.ts`           | `src/renderer/render/effect-state.ts`          | `render-budget.spec.ts`                                               |
| `src/renderer/render/highlight.ts`         | —                                              | `inspector.spec.ts`, `render-budget.spec.ts`                          |
| `src/renderer/render/chunk-debug.ts`       | —                                              | `chunk-debug.spec.ts`                                                 |
| `src/renderer/render/path-debug.ts`        | —                                              | `path-debug.spec.ts`                                                  |
| `src/renderer/render/world-debug.ts`       | —                                              | `inspector.spec.ts`                                                   |

**23 files, 1,378 lines, of which unit tests reached 34.** That ratio is the argument: the set is denominator with almost no numerator, so removing it moved nine thresholds up and none down. If a future addition to this register would lower a threshold, it is the wrong addition.

**`bootstrap/web-audio.ts` is deliberately absent.** It is a host binding by the criterion's first test — it is the one module that knows a sound is a file — but no test names it, so the second test refuses it and it stays measured at 0%. ADR-023 replaces it wholesale in phase-13; writing tests for a module with a scheduled deletion is not the answer, and neither is excluding it without a detector.

---

## 5. What to Test, by Layer

### 5.1 Simulation

| Target             | Assert                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| Each system        | Given a world state, one tick produces the expected state                 |
| System ordering    | Growth-before-harvest: a crop maturing on tick N is harvestable on tick N |
| Determinism        | Same seed + intents → byte-identical state after 100k ticks               |
| Intent validation  | Invalid intents return an error and leave state untouched                 |
| Store ownership    | No system mutates a store it does not own (§3.3 of `ARCHITECTURE.md`)     |
| Content registries | Registration, lookup, duplicate-ID rejection                              |
| Pathing            | Correct paths, unreachable targets handled, deterministic tie-breaking    |
| Worker FSM         | Every transition; **no state can deadlock**                               |
| Edge cases         | Empty world, full inventory, no seeds, no walkable path                   |

**The determinism test is the most important test in the repository.** ADR-002, ADR-003, ADR-004, and ADR-007 all build on it. If it fails, something far more serious than a single feature is broken.

**Worker deadlock** deserves special attention: `GAME_DESIGN.md` §4.2 makes "a worker never deadlocks" a hard product requirement, because automation that jams while the player is away is the exact failure `VISION.md` §2.2 forbids.

### 5.2 Persistence

| Target           | Assert                                                      |
| ---------------- | ----------------------------------------------------------- |
| Round trip       | `fromSave(toSave(w))` ≡ `w` for arbitrary worlds (property) |
| Byte stability   | The same world serializes identically twice                 |
| Golden fixtures  | Every historical version migrates to current and validates  |
| Migration purity | Repeated runs produce identical output                      |
| Crash safety     | Interrupting each write step leaves ≥ 1 loadable save       |
| Corruption       | Truncated / empty / malformed files recover from `.bak`     |
| Forward refusal  | A higher `schemaVersion` is refused, never partially loaded |
| Catch-up         | Within tolerance; **never over-credits**                    |
| Unknown content  | Quarantined, then restored when content returns             |

Full list: `SAVE_FORMAT.md` §10.

### 5.3 UI

| Target        | Assert                                                   |
| ------------- | -------------------------------------------------------- |
| Panels        | Render correct data from a given snapshot slice          |
| Interactions  | Dispatch the correct intent — **never mutate the world** |
| Subscriptions | A component re-renders only when its slice changes       |
| Idle          | Zero React commits over 10 s with a static world         |
| Accessibility | Keyboard navigable; controls have accessible names       |

Query by role and text (`getByRole('button', { name: 'Buy' })`), never by CSS class. Class-based queries break on styling changes and test nothing a user experiences.

### 5.4 Rendering

| Target              | Assert                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Idle                | **Zero `requestAnimationFrame` callbacks over 10 s with a static world** |
| Dirty gate          | A world change marks the scene dirty exactly once                        |
| Animation lifecycle | Every increment of `animatingEntityCount` has a matching decrement       |
| Teardown            | Collapsing destroys all Pixi resources; no retained references           |
| Draw calls          | Static reference farm stays under the ceiling                            |
| Interpolation       | Positions interpolate correctly across `alpha` ∈ [0,1)                   |

The animation-lifecycle test is the guard against the most likely way render-on-demand decays: an effect that starts animating and never stops.

### 5.5 Main process and overlay (E2E)

| Target              | Assert                                                    |
| ------------------- | --------------------------------------------------------- |
| Docking             | Sits above the taskbar, spanning `workArea` width         |
| Always-on-top       | Stays above normal windows; **yields to fullscreen apps** |
| Click-through       | Clicks in transparent regions reach the window beneath    |
| Multi-monitor       | Re-docks on monitor change                                |
| DPI                 | Correct geometry on scaling change                        |
| **Background tick** | The tick continues while the window is fully occluded     |
| Single instance     | A second launch focuses the first                         |
| Save on quit        | Quitting writes a complete, loadable save                 |

The background-tick test validates `backgroundThrottling: false` (ADR-003 §2). Without it, a regression would silently stall the simulation whenever the player did anything else — which is the normal case for this product, and would be nearly invisible in casual testing.

---

## 6. Writing Tests

### 6.1 Structure and naming

Arrange–Act–Assert, with names that state the behavior:

```ts
test('a crop maturing on tick N is harvestable on tick N', () => {
  // Arrange
  const world = createTestWorld({ seed: 1 });
  plantCrop(world, tile(10, 10), 'core:wheat');

  // Act
  stepTicks(world, 2400);

  // Assert
  expect(harvest(world, tile(10, 10)).ok).toBe(true);
});
```

Good: `'returns an error when planting on untilled soil'`
Bad: `'test plant'`, `'it works'`

### 6.2 Determinism in tests

Always pass an explicit seed. Never depend on wall-clock time. A flaky test in a deterministic simulation means either the test or the simulation is wrong — and the simulation being wrong is a critical defect, not a retry candidate.

### 6.3 Builders over fixtures

```ts
const world = createTestWorld({ seed: 1, plotSize: 4, coins: 500 });
```

Builders make each test state its own preconditions. Shared mutable fixtures create ordering dependencies and tests that pass alone but fail together.

### 6.4 Never

- Retry a flaky test. Diagnose it (`superpowers:systematic-debugging`).
- Change a test to match broken behavior. Fix the code; change the test only if it asserted the wrong thing (`AI_RULES.md` §8).
- Skip a test to merge. A skipped test is a lie about coverage.
- Assert on internals (§1.3) or on CSS classes (§5.3).
- Edit a golden fixture (§7.2).

---

## 7. CI Gates

### 7.1 Every PR

| Gate                          | Command                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| Typecheck (all three configs) | `npm run typecheck`                                                 |
| Lint, zero warnings           | `npm run lint`                                                      |
| Architecture boundaries       | `npm run check:boundaries`                                          |
| Import cycles                 | `npm run check:cycles`                                              |
| Unit + integration + property | `npm test`                                                          |
| Coverage thresholds           | `npm run test:coverage`                                             |
| Build succeeds                | `npm run build`                                                     |
| E2E                           | `VITE_FEATURE_DEBUG=true npm run build` **then** `npm run test:e2e` |
| Performance regressions       | `PERFORMANCE.md` §10.1                                              |
| Asset validation              | `ASSETS.md` §13                                                     |

> **The E2E rebuild is not optional, and the order above is the trap.** The suite
> launches `electron .`, which runs whatever sits in `out/`. Eight specs drive the
> app through the F1 developer console — it is the only way to fund a farm or skip
> the 1,800 ticks a turnip takes from outside the process — and a production build compiles that console
> out (`electron.vite.config`, `__FEATURE_DEBUG__`). So running the `npm run build`
> gate on the line above and then the E2E gate leaves `out/` stripped, and those
> eight specs fail on a 30-second `locator.fill` timeout that names no cause.
>
> This was misread as cross-spec order-dependence. It is not: a spec run entirely
> alone fails the same way against a production build, and passes untouched against
> a debug one. `tests/e2e/global-setup.ts` now refuses to start against a stripped
> build and names the command to run.

### 7.2 The append-only rule

`tests/fixtures/saves/` is **append-only**. These files represent saves on real players' disks.

Editing one to make a test pass defeats the entire migration system (ADR-002 §3). If a fixture stops migrating, the migration is wrong — not the fixture. CI rejects any PR that modifies an existing fixture file.

---

## 8. Phase Testing

Each phase document carries a checklist covering that phase's specific behaviors. The rules here apply throughout; phase checklists add what is unique to the phase.

**A phase is not complete until:**

- [ ] All checklist items pass
- [ ] Coverage gates met for touched areas
- [ ] Performance budgets measured and recorded (`PERFORMANCE.md` §10.2)
- [ ] E2E suite green
- [ ] The app builds and launches

Reporting a phase complete without running these is the failure mode `AI_RULES.md` §6 exists to prevent. **Run the commands. Read the output. Then report.**
