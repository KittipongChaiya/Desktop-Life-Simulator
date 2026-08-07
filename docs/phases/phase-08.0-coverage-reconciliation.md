# Phase 08.0 — Coverage Reconciliation

> **Delivers:** The v0.1 release gate turns green — by measuring the right set, and by covering what the measurement then shows is genuinely missing.
> **Governing decisions:** none new. Bound by `TESTING.md` §4, `AI_RULES.md` §3.3, `PLAN.md` §8.
> **Hard constraint:** no production behaviour change. No test weakened, skipped, or made assertion-free. `src/sim` and `src/persistence` are not eligible for a reduced threshold.

---

## Why this phase exists

`PLAN.md` §8 makes coverage a binding release gate and it is red: **67.28% lines / 66.47% branches against 80 / 75**. Phase 07.7 registered it as debt #1 and called the cause structural rather than neglectful, leaving the reconciliation as an owner decision. `ROADMAP.md` §2 puts that decision here, first, because a version should not start on a red release gate.

The measurement found the cause is worse than "structural", and in a specific way:

**`vitest.config.ts` enforced no per-area threshold at all.** From phase-00 until this phase it carried one global pair, `{ lines: 80, branches: 75 }`, while `TESTING.md` §4 published seven per-area rows. Six of the seven had never been machine-checked. They were prose, and three of them had been quietly false for months:

| Area                                                    | Declared | Measured          |                                   |
| ------------------------------------------------------- | -------- | ----------------- | --------------------------------- |
| `src/persistence`                                       | 95 / 90  | 90.77 / 84.15     | below its published bar           |
| `src/renderer/render`                                   | 50 / 40  | 34.26 / 35.98     | below its published bar           |
| `src/main`                                              | 60 / 50  | 31.42 / 40.00     | below its published bar           |
| `src/sim`                                               | 90 / 85  | 97.36 / **85.08** | clears branches by **one branch** |
| `src/devtools`, `src/renderer/bootstrap`, `src/preload` | —        | —                 | no row at all                     |

So this was never a config-only phase, and the arithmetic said so before any work started: lift every declared area to exactly its floor and change nothing else, and the project total lands at **73.0%**. The 80% global was unreachable from the area floors. What had to be decided was not how high the bars are — it was **what the denominator contains**.

---

## The criterion

A file leaves the measured set only when **both** hold:

1. it is a **host binding** — its body exists to call Pixi, Electron, or the DOM host, and cannot be imported in the unit environment without one; **and**
2. a named test does exercise it.

A file that fails either test and is uncovered is a **gap**, not an exclusion, and the answer is a test.

**The criterion is the repository's, not this phase's.** `save-store.ts` states it as doctrine in its own header — the save directory is a parameter rather than `app.getPath`, "so the sequence is testable against real temp directories, including the crash-interruption tests criterion 4 demands" — and `TESTING.md` §2 states the consequence: reaching for a mock is a design signal, not a testing need. The split already runs through the renderer, which is why 9 of the 23 excluded files name a `logic` counterpart that is covered: `worker-view.ts` is excluded and `worker-render.ts` is not; `floating-numbers.ts` is excluded and `floating-number-state.ts` is not. The decisions were extracted phases ago. What is excluded is the sprite binding left behind.

### Why this raises the bar rather than lowering it

| Area                  | Was declared | Measured then | Measured after    | Now declared |
| --------------------- | ------------ | ------------- | ----------------- | ------------ |
| `src/renderer/render` | 50 / 40      | 34.26 / 35.98 | **98.94 / 88.37** | 95 / 85      |
| `src/main`            | 60 / 50      | 31.42 / 40.00 | **78.79 / 88.24** | 90 / 80      |
| `src/renderer/app`    | 70 / 60      | 85.25 / 76.73 | —                 | 85 / 75      |
| `src/shared`          | 85 / 80      | 90.43 / 96.43 | —                 | 90 / 85      |
| **Project total**     | 80 / 75      | 67.29 / 66.48 | **89.19 / 80.80** | **90 / 85**  |

Nine rows went up. None went down. `src/renderer/render` was declared at 50% because the row averaged well-tested extracted logic against Pixi files a unit test cannot reach at all — measure only the first and it is at 98.94%, and the honest ask rose to 95.

**The decisive number: the excluded set is 23 files and 1,378 lines, of which unit tests reached 34** — 2.5%. It is denominator with almost no numerator. Nothing that was covered left. If a future addition to the register would lower a threshold, it is the wrong addition.

---

## Milestones

| #     | Milestone                                         | Ships                                                                                         | Status        |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| 08.0a | Policy and mechanism                              | The criterion, `TESTING.md` §4 rewritten, per-area gates actually enforced, the register test | **Delivered** |
| 08.0b | `src/persistence` to 95 / 90                      | Quarantine's own structure, eleven untested §5 repair rules, and hydration's guards           | **Delivered** |
| 08.0c | The gaps the criterion exposes                    | Six untested modules, +124 tests; two brought to a testable shape without behaviour change    | **Delivered** |
| 08.0d | `src/sim` branch margin, and the mutation control | `sim/content` and the command input boundary; margin 0 → 16 branches                          | **Delivered** |
| 08.0e | Close                                             | Gate green at 95.26 / 85.95; debt #1 resolved, two items opened                               | **Delivered** |

**The coverage gate was red until 08.0e, by construction** — it is the deliverable. `npm test`, `npm run typecheck`, `npm run lint`, `check:boundaries` and `check:cycles` were green at every commit; a future session reading a red `test:coverage` on a mid-phase commit is reading work in progress, not a broken tree.

The thresholds declared in 08.0a are targets that 08.0b–d meet, and they were checked for reachability before being written: 08.0b and 08.0c together yield +182 lines and +110 branches, which puts the project at roughly **95% lines / 85.5% branches** — above the 90 / 85 declared.

---

## 08.0a — what shipped

**`coverage-policy.config.ts`** (new). The single home for every coverage number and for the exclusion register. Each entry carries `path`, `reason`, `logic`, and `detectors` — the last never empty.

**`vitest.config.ts`.** Derives `thresholds` and `exclude` from the policy module. Gains `plugins/**` in `include`.

**`docs/TESTING.md` §4.** Rewritten: a row for every area, `§4.1` extended with why the numbers moved up, and a new `§4.2` carrying the criterion and the 23-row register with a detector for each.

**`tests/coverage-policy.test.ts`** (new, 10 tests). The mechanical fix for the root cause. It asserts the document and the config agree on every threshold and every excluded path, that each excluded path exists and names at least one detector that itself exists, and that an area documented as E2E-gated has no measured file left behind.

Two mutation controls confirmed it has teeth, in the 07a tradition:

| Mutation                                                          | Result                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Lower `src/sim` to 80 in the policy, leave `TESTING.md` saying 90 | 1 test fails — _agrees with the document on every number_                                  |
| Add `pointer-actions.ts` to the register with `detectors: []`     | 2 tests fail — _names at least one real detector_, and _lists every excluded file in §4.2_ |

The first mutation is precisely the defect that produced this phase. It is now caught in 324 ms.

### Why `plugins/**` is measured before it exists

Phase 08 creates `plugins/core/` and moves core content registration out of `src/sim` and into it (ADR-019, ADR-026). `src/sim/content` is well covered; an unmeasured destination would drop those lines out of the total on a pure refactor, and `plugins/` would start life with no threshold — repeating exactly the drift this phase exists to end, one phase after ending it. The row and the `include` entry are in place now, while the directory is still empty.

---

## 08.0b — what shipped

`src/persistence` carries the highest bar in the project (95 / 90) for the reason `TESTING.md` §4.1 gives: a defect here destroys a player's months of progress, and it is exactly the code casual play never exercises. It measured **90.77 / 84.15**, and now measures **99.10 / 91.93** — clear of the bar on both, with margin rather than by a branch.

The project total moved with it: **89.19 → 90.56% lines**, past the new global gate, and 80.80 → 81.95% branches.

**`validate.test.ts`: 25 → 39 tests.** The gap was not obscure branches; it was §5 rules with no test at all.

_Structural (§5.1) — the quarantine section was never validated._ Quarantine holds player value indefinitely and is written back on every save, so a malformed entry survives every future load. All four of its arrays now reject malformed entries with the same strictness as the live world.

_Semantic (§5.2) and restoration (§5.3) — eleven rules._ A second crop on one tile; a plant task whose seed no longer exists; a duplicate building ID and the storage that must follow it; a building on unwalkable terrain; a planting memory out of bounds or with unknown content; the worker allocator falling behind; and the restore paths for a held building with its goods, a held stack returning to a building's storage, and a held planting memory.

**`deserialize.test.ts` (new, 6 tests).** Hydration's guards had none. They protect against a pipeline ordering bug rather than a corrupt file — validation runs before them — which is precisely why they need tests: if validation is ever bypassed or reordered, these throws are the last thing between a malformed document and a silently wrong world. A `kind`-length `owned` encoding does not crash; it loads a farm with its last rows quietly reset.

### Two defects in the existing suite, not just gaps

1. A test named _"clamps a multiplier outside its band **and drops one at the cap**"_ never pushed a multiplier at the cap. It asserted half of what its name claimed, and the drop rule had never once executed. It now does both, and asserts two repairs rather than one.
2. _"restores a quarantined stack to its owner"_ covered worker-owned and owner-gone but never building-owned; _"bumps an allocator counter"_ covered buildings but never workers — and a behind worker counter reissues a live worker's ID on the next hire, which is the exact failure ADR-015 §6 added the counters to prevent.

A test whose name promises more than it asserts is worse than a missing test: it makes the gap invisible to everyone who reads the suite for what is covered.

### Mutation controls

| Mutation                                     | Result                                                               |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Stop dropping a duplicate crop tile          | 1 test fails — _drops a second crop on an already-planted tile_      |
| Stop quarantining an unknown planting memory | 1 test fails — _quarantines a planting memory whose crop is unknown_ |

Writing them also caught a weak assertion of my own: the duplicate-building test originally asserted only "no storage left orphaned", which passes even if the storage never follows the reassigned ID. It now pins the storage count too, so goods cannot be lost silently.

### Scope widened, and why

08.0b was scoped as "`validate.ts`'s rejection paths". That alone would have cleared the line gate and left branches at **90.48%** — half a point of margin, which is the same knife-edge this phase criticises `src/sim` for sitting on. The branch headroom was in `deserialize.ts` (68.4%, the worst file in the area), so the milestone took in hydration's guards as well. Same milestone, wider than planned, and the result is 91.93% rather than 90.48%.

### What the full run now says

Four thresholds remain red, and they are exactly 08.0c's scope:

| Gate                                  | Measured      | Closes in                                                    |
| ------------------------------------- | ------------- | ------------------------------------------------------------ |
| Project branches (85)                 | 81.95         | 08.0c — needs +71 branches; the targets hold +78             |
| `src/renderer/bootstrap/**` (85 / 75) | 66.43 / 63.88 | 08.0c — `pointer-actions.ts` is 68 lines, 40 branches, at 0% |
| `src/main/**` lines (90)              | 78.78         | 08.0c — `docking.ts` and `settings.ts`                       |

Every other area passes. `src/devtools/**` clears 85 / 75 on aggregate despite `devtools/console` sitting at 69.45 — `builtins.ts` is still 08.0c work, and closing it is what buys the project-branch margin.

### One line left uncovered, deliberately

`validate.ts:340` — the rethrow of a non-`Structural` error. Every decode failure is already converted to `Structural` inside the helper, so that line is reachable only through a genuine bug in the module; forcing it would require an input `JSON.parse` cannot produce. One line of 355, in a file now at 99.7%.

---

## 08.0c — what shipped

Six modules that failed the §4.2 criterion and simply had no test. **+124 tests.**

| Module                               | Was | Tests | What they pin                                                                            |
| ------------------------------------ | --- | ----- | ---------------------------------------------------------------------------------------- |
| `bootstrap/pointer-actions.ts`       | 0%  | 22    | Click-versus-drag slop, presses over the HUD, placement mode, worker selection, teardown |
| `devtools/console/builtins.ts`       | 3%  | 36    | All twelve builtins — the only way E2E can fund a farm or skip growth                    |
| `main/docking.ts`                    | 0%  | 14    | Docking to the work area, not the screen; re-dock on display change                      |
| `main/settings-store.ts`             | new | 10    | First run, truncated JSON, unwritable directory — none of them fatal                     |
| `renderer/app/overlay-controller.ts` | 0%  | 15    | Optimistic collapse, and click-through de-duplication                                    |
| `shared/ipc/contract.ts`             | 0%  | 3     | No two channels collide — a duplicate crashes `ipcMain.handle` at launch                 |

### Two production modules changed shape, and none changed behaviour

`docking.ts` and `settings.ts` imported `electron` at module scope, so no part of either could be loaded by a unit test — including `dockedBounds`, which is pure arithmetic, and the settings read/write, whose failure modes are all filesystem ones. `TESTING.md` §2 rules out answering that with a mock, and `save-store.ts` already states the alternative as doctrine: _"the directory is a parameter, not `app.getPath` — this module is pure Node, so the sequence is testable."_

Both were brought to that shape, by the route that touched fewest call sites:

- **`docking.ts` was parameterised.** It now takes the work area and a `DisplaySource`, imports only erased _types_ from `electron`, and is fully testable — including `watchDisplayChanges`, the re-dock-on-display-change path that its own comment calls "a class of bug that only shows up on someone else's machine", and which could not be tested at all before. Four call sites, in two files.
- **`settings.ts` was split.** `settings-store.ts` takes the directory and holds the read and write; `settings.ts` keeps `loadSettings`/`saveSettings` unchanged and answers only "where is `userData`". Zero call sites changed — the alternative would have edited eight. It joins the §4.2 register with `settings-store.ts` as its `logic`.

The plain-write asymmetry `save-store.ts` calls out — preferences are cheap to lose, saves are the product — is preserved and documented, not quietly closed.

### Mutation controls

| Mutation                                       | Result                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `CLICK_SLOP_PX` 4 → 0                          | 1 test fails — _still clicks after jitter within the slop_  |
| Dock to screen bounds instead of the work area | 2 tests fail — the taskbar-on-top and negative-offset cases |

### A shipped behaviour documented rather than changed

`tick 2.5e` advances two ticks. `Number.parseInt` stops at the first non-digit, so the "positive integer" guard passes on trailing garbage. Harmless in a developer console and **not this phase's to change** — 08.0c alters no behaviour. It now has a test that says so by name, so tightening the parse later is a deliberate act with a failing test to prompt it.

---

## Blocking defect found, not introduced

The full suite surfaced a **real over-credit in catch-up** — `PLAN.md` §8 release-gate criterion 14, _"catch-up never over-credits"_:

```
tests/catch-up.test.ts > holds at n = 50,000 across arbitrary farms
AssertionError: expected 12 to be less than or equal to 11
{ seed: 1435051507, path: "5:0:0:1:1:1:5:4:5:5:4:5:5:6:5:9:9" }
Counterexample: one worker, a seed bin, two crops, 10 wheat seeds, 2 turnip seeds
```

Catch-up credited one more harvest than running the ticks for real does.

**It is not 08.0c's.** The counterexample reproduces identically with every 08.0c production change reverted (`git stash` of `docking.ts`, `settings.ts`, `index.ts`, `overlay-window.ts`, then the same pinned seed) — and nothing in this milestone is imported by `src/sim` or `src/persistence` at all.

**Why it appeared now.** The two `assertNeverOver` properties are the only ones in the file with **no pinned seed** — its other five pin 424242, 7, 7, 11, 99. So they sample different farms on every run, and this counterexample had simply never come up. `TESTING.md` §6.2 requires the opposite: _"Always pass an explicit seed."_ The gate has therefore been probabilistic since phase-07d, which is a second finding and arguably the more important one: a release-gate criterion that passes by sampling is not a gate.

**Recommended, not done here** (a simulation-accounting fix is not a coverage phase's work, and the phase's hard constraint forbids it):

1. Fix the over-credit in `catch-up.ts`, with the counterexample above as the regression test.
2. Then pin seeds on both `assertNeverOver` properties per §6.2, and treat new counterexamples as findings to fix rather than as noise between runs.

**Correction to this document's first assessment.** It said 08.0e could not close until this was fixed. That was wrong, and checking `PLAN.md` §8 line by line is what showed it: criterion 14 is a **phase-07d acceptance criterion**, not one of the eight §8 release gates. The eight are save compatibility, performance, coverage, boundaries, docs, ADRs, data loss, and dead code — and an over-credit is not data loss; the player receives more than they earned, not less, and nothing on disk is damaged.

So 08.0 closes on its own terms, and this is carried as debt with a reproduction rather than treated as a blocker it is not. It remains a real defect on a documented invariant (`SAVE_FORMAT.md` §6.5), and it is the recommended next work — it is simply not this phase's gate to fail.

---

## 08.0d — what shipped

`src/sim` cleared its branch gate by **four branches** after 08.0c. Above the floor, and still the fragility this milestone exists to remove — one uncovered `if` in phase-08 eats it. The two weakest pools were both places phase-08 will add code:

**`sim/content` 69.23 → 88.46% branches.** `registry.ts` had **no test file**, though `TESTING.md` §5.1 has required "content registries: registration, lookup, duplicate-ID rejection" since phase-00. It is also the module ADR-019's `PluginApi` wraps: every crop, item, building, and tile kind a third party ever registers passes through its `register`, and the errors it returns become the errors a plugin author reads. `tile-kinds.ts` and `buildings.ts` (50% each) followed.

**`sim/commands` 76.10 → 80.97% branches — the untrusted-input boundary (ADR-010 §5).** Command fields arrive as plain numbers and strings from the renderer, the developer console, a replayed log — and in v0.2 from plugin code, which ADR-003 §3 says to treat as hostile. One property, asserted uniformly: a malformed field is a typed rejection, never a throw and never a mutation, and `world.rng` does not advance — a refused command that consumed randomness would desynchronise two players from one seed.

Content tests 26 → 44, plus 13 boundary tests. **Margin: 4 → 16 branches.**

### Three assertions that were wrong, and the code that was right

Recorded because each was written confidently, and each is a fact the next session would otherwise re-learn:

1. **`asContentId` is not a brand cast — it throws.** So a malformed id cannot reach `register` through it, and the registry's own check is reachable only by an unvalidated cast. That is not contrived: a plugin manifest is JSON, its `id` arrives as a `string`, and the registry is the last place that can refuse it. The helper is named `untrusted` and says so.
2. **A malformed content id and an unregistered one return the same `ErrorCode`** (`UnknownContent`); only the message differs. Worth knowing before phase-08 puts a plugin author on the other end: a loader branching on the code alone cannot tell a manifest typo from an unmet dependency, and those want different advice.
3. **`depositWorker` validates at execution, not dispatch** — it registers `validate: () => ok()`, deliberately, because the worker AI issues it against a target chosen a tick earlier. So a successful dispatch is not a statement that the worker exists. The test pins what actually matters: no throw, no mutation.

### Mutation controls

| Mutation                                  | Result                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Registry accepts duplicate ids            | 6 tests fail                                                                  |
| Tile kinds reordered (water before grass) | 1 test fails — the index-pinning guard, because those bytes are in save files |

---

## 08.0e — the close

**The gate is green.** `npm run test:coverage` exits 0 with no threshold error, on **1,782 tests, all passing**.

| Area                     | At phase start    | At close          | Gate        |
| ------------------------ | ----------------- | ----------------- | ----------- |
| `src/sim`                | 97.36 / 85.08     | **98.21 / 87.54** | 90 / 85     |
| `src/persistence`        | 90.77 / 84.15     | **99.11 / 91.93** | 95 / 90     |
| `src/shared`             | 90.43 / 96.43     | **93.62 / 96.43** | 90 / 85     |
| `src/renderer/app`       | 85.25 / 76.73     | **90.04 / 78.18** | 85 / 75     |
| `src/renderer/render`    | 34.26 / 35.98     | **98.94 / 88.37** | 95 / 85     |
| `src/renderer/bootstrap` | 30.65 / 34.95     | **90.21 / 85.56** | 85 / 75     |
| `src/main`               | 31.42 / 40.00     | **96.09 / 94.12** | 90 / 80     |
| `src/devtools`           | 85.35 / 76.55     | **92.19 / 81.72** | 85 / 75     |
| **Project total**        | **67.29 / 66.48** | **95.26 / 85.95** | **90 / 85** |

Tests grew from **1,607 to 1,782** — +175, in 12 new files. No test was weakened, skipped, or deleted, and every threshold in the table is higher than the one it replaced.

### The eight `PLAN.md` §8 gates, checked individually

| Gate               | Verdict                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Save compatibility | Green — every golden fixture loads; `save-compatibility.test.ts` and `save-fixtures.test.ts` pass                              |
| Performance        | Green — measured at 07.7M, evidence in `docs/perf/`; unchanged by this phase, which ships no runtime behaviour                 |
| Coverage           | **Green — this phase's deliverable**                                                                                           |
| Boundaries         | Green — `check:boundaries` and `check:cycles` clean, 242 modules                                                               |
| Docs               | Green — `TESTING.md` §4 rewritten, `CHANGELOG.md` updated, this document                                                       |
| ADRs               | Green — no architectural change; the criterion and the register live in `TESTING.md`, which owns coverage policy               |
| Data loss          | Green — no known data-loss defect. The catch-up over-credit gives the player more than they earned and damages nothing on disk |
| Dead code          | Green — the audit at 07.7N found no TODO, FIXME, or unreachable setting; no test is skipped                                    |

### What this phase actually fixed

Not a number. The gate read 67.29% against 80% and every earlier close called that "structural" — but the structure was never named, so each phase re-diagnosed it and moved on. It was three things at once, and only the first was visible:

1. **Six of seven published thresholds were never enforced.** The config carried one global pair. Three areas had been below their documented bars for months, and `src/persistence` — the highest bar in the project, the code that protects saves — was one of them.
2. **The measured set was wrong.** 1,378 lines of Pixi and Electron binding sat in the denominator contributing 34 covered lines, dragging `renderer/render`'s row to 34% while its extracted logic sat at 98.94%. That is what made the published numbers _look_ unreachable and made lowering them look reasonable.
3. **Real gaps hid behind the arithmetic.** Once the denominator was right, what was left was not rounding: a registry with no test file, hydration guards with none, quarantine's structure unvalidated, and the developer console — the only way E2E can drive the game — at 3%.

The fix is that all three are now mechanical. `tests/coverage-policy.test.ts` fails if the document and the config disagree, if an exclusion names no detector, or if a detector does not exist.

### One failure observed and not attributed

During the close, one `npm test` run reported **1 failed / 1,781 passed** and the output was not captured. It has not recurred: two full suite runs since are 1,782/1,782, and `tests/catch-up.test.ts` passed 10 of 10 in isolation.

The shape is consistent with debt #13 — the catch-up property is a single test, so it fails exactly one — but **consistent is not the same as proven**, and no evidence survives to say so. `TESTING.md` §6.4 says to diagnose a flake rather than retry it; the diagnosis here is incomplete, and pretending otherwise would be worse than recording it.

Both onward paths are already open as debt: fixing #13 removes the most likely cause, and pinning the seeds (#14) makes any recurrence reproducible instead of a coin toss. **Until #14 lands, a green suite is evidence and not proof** — which is exactly the property a release gate is supposed to have, and the reason #14 is filed as debt rather than a note.

### Debt discharged and debt opened

`phase-07.7-game-feel-polish.md` debt **#1 is resolved** — the register records what changed.

Two items open in its place, both recorded there:

- **The catch-up over-credit** (criterion 14), with its seed and counterexample.
- **`tsconfig.tools.json` is never typechecked.** `npm run typecheck` runs the sim, main, and renderer projects only, so no test file is type-checked in CI — `tsc -p tsconfig.tools.json` reports 210 pre-existing errors, mostly a missing `jsx` flag for `.test.tsx`. Nothing this phase added contributes to that count. A coverage phase that left an unchecked test surface unrecorded would be missing its own point.

---

## What did NOT change

No production source file. No test was weakened, skipped, deleted, or made assertion-free. No threshold went down. `src/sim` and `src/persistence` kept their numbers unchanged.

---

## Findings recorded, not fixed

1. **`src/sim` has no branch margin.** 553 of 650 branches; 85% requires 552.5. One new uncovered branch in phase-08's API work turns the strictest gate in the project red. 08.0d.
2. **`bootstrap/web-audio.ts` is a host binding with no detector**, so the criterion refuses it and it stays measured at 0% (16 lines). ADR-023 replaces it wholesale in phase 13; tests for a module with a scheduled deletion are not the answer, and neither is an exclusion nobody can check.
3. **`tsconfig.tools.json` is never typechecked.** `npm run typecheck` runs the sim, main, and renderer projects only, so no test file is type-checked in CI — `tsc -p tsconfig.tools.json` reports 210 pre-existing errors, mostly a missing `jsx` flag for `.test.tsx` files. Nothing in this phase adds to that count. It is real debt in the testing surface and belongs in the v0.1 debt register, but fixing it is not phase-08.0's scope.

---

## Acceptance

Phase-level, from `ROADMAP.md` §3:

- [x] Every area under `src/` has a declared threshold in `TESTING.md` §4 — and, new, every one of them is enforced
- [x] `npm run test:coverage` completes and meets every declared threshold — **95.26 / 85.95**, exit 0, no threshold error
- [x] All eight `PLAN.md` §8 release gates are green for v0.1 — checked individually in §08.0e
- [x] No test was weakened or skipped to achieve it

08.0a specifically:

- [x] The coverage config enforces per-area thresholds, not one global pair
- [x] `TESTING.md` §4 and the config cannot drift apart without failing a test
- [x] Every excluded file names a detector that exists
- [x] The register test has teeth, shown by mutation
- [x] `plugins/**` is measured before phase 08 fills it
- [x] Typecheck, lint, boundaries, and cycles clean; unit suite green

---

## Files changed (08.0a)

| File                                                | Action | Why                                                       |
| --------------------------------------------------- | ------ | --------------------------------------------------------- |
| `coverage-policy.config.ts`                         | CREATE | The single home for thresholds and the exclusion register |
| `vitest.config.ts`                                  | UPDATE | Derives gates from the policy; measures `plugins/**`      |
| `tests/coverage-policy.test.ts`                     | CREATE | Asserts config and document agree; guards the register    |
| `docs/TESTING.md`                                   | UPDATE | §4 rewritten; §4.2 added                                  |
| `docs/phases/phase-08.0-coverage-reconciliation.md` | CREATE | This document                                             |
