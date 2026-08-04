# Phase 07.8 — Developer Tools

> **Delivers:** A professional in-game developer toolkit — inspectors, monitors, visualisers, time controls, spawn tools, recording.
> **Governing decision:** **ADR-018** (developer tooling). Bound by ADR-001, ADR-005, ADR-008, ADR-010, ADR-017.
> **Hard constraint:** **No gameplay change, no simulation change, no save-format change.** Everything is `FEATURE_DEBUG`-only and compiled out of production.

---

## What already exists

Phase-01.5 built more of this than the brief assumes, and 07.7M added to it. Surveyed before planning, because building a parallel toolkit beside a working one is the mistake this project has now made three times with art and once with CSS.

| Brief asks for           | Already exists                                                                                 | Gap                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| §1 Debug overlay, F3     | `ui/DebugOverlay.tsx`, `metrics/registry.ts`, F3 toggle                                        | 7 of 15 values missing                           |
| §2/§3 Inspectors         | `inspector/registry.ts` (provider pattern, `InspectTarget`, `field()`), `ui/Inspector.tsx`, F4 | no world-tile provider; no pinning               |
| §8 Performance panel     | `metrics/histogram.ts` (p50/p95/p99, 07.7M), `profiler/profiler.ts`, heap metric               | no graphs, no 60 s history                       |
| §9 Time controls         | `SimulationControl`: `pause`, `resume`, `step(count)`, `tick`, `ups`, `fps`, `frameTimeMs`     | **speed scale is not exposed** (the loop has it) |
| §13 Metrics API          | `metrics/registry.ts` — typed, pull-based, read-only                                           | satisfied; extend, do not replace                |
| §12 Recording            | —                                                                                              | none                                             |
| §4/§5 Monitors           | `events.pending()`, `events.subscriberCount()`, `dispatcher.pending()`                         | no UI, no history buffer                         |
| §6/§7 Path & chunk debug | `terrain-chunks.ts` tracker, `astar.ts`                                                        | no visualisation                                 |

**Roughly 40% of the brief is already built.** This phase extends it under ADR-018; it does not start again.

---

## Milestones

Ordered so each depends only on those above it, and so the read-only work lands before the first tool that writes.

| #     | Milestone                   | Delivers                                                                                    | Status        |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| 07.8a | Overlay completion (§1)     | The 7 missing values, through the existing registry                                         | **Delivered** |
| 07.8b | Metrics API hardening (§13) | Typed groups, ordering, and the read-only contract asserted                                 | **Delivered** |
| 07.8c | World inspector (§2)        | Tile provider — coords, state, owner, crop, stage, occupant, path cost — plus pinning       | **Delivered** |
| 07.8d | Entity inspector (§3)       | Worker provider — FSM state, task, energy, carrying, destination, path length               | **Delivered** |
| 07.8e | Event monitor (§4)          | Bounded ring of observed events with filters; **subscribe only** (ADR-018 §10)              | **Delivered** |
| 07.8f | Command monitor (§5)        | Queue depth, outcomes, durations, validation results                                        | Pending       |
| 07.8g | Time controls (§9)          | Expose scale on `SimulationControl`; pause/resume/step/1–16× through the existing scheduler | Pending       |
| 07.8h | Performance panel (§8)      | Change-driven graphs over a 60 s ring                                                       | Pending       |
| 07.8i | Chunk debug (§7)            | Borders, dirty set, redraw counts                                                           | Pending       |
| 07.8j | Pathfinding debug (§6)      | Path, open/closed sets, cost heatmap — opt-in                                               | Pending       |
| 07.8k | Spawn tools (§10)           | Every mutation dispatched as a command (ADR-018 §3)                                         | Pending       |
| 07.8l | Screenshot mode (§11)       | Hide all debug chrome                                                                       | Pending       |
| 07.8m | Recording (§12)             | Observe commands, events, performance; export JSON                                          | Pending       |
| 07.8n | Panel UX (§14)              | Resize, dock, search, filter, remembered layout                                             | Pending       |
| 07.8o | Close-out                   | Budgets re-measured, docs synced, acceptance audit                                          | Pending       |

**07.8k is deliberately late.** It is the first tool that writes, and ADR-018 §3 is the rule most likely to be broken by a shortcut — it lands after the read-only surface is settled, not while it is in flux.

---

## Acceptance criteria

| #   | Criterion                               | How it is proven                                                                       |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Gameplay unchanged                      | Determinism properties; save round-trip; no `src/sim` diff outside read-only accessors |
| 2   | Determinism preserved                   | Same seed + commands → byte-identical world; no `world.rng` consumption                |
| 3   | `FEATURE_DEBUG=false` removes all tools | `tests/devtools-excluded-from-production.test.ts`, marker list extended per tool       |
| 4   | No production bundle increase           | Bundle size compared against the pre-phase build                                       |
| 5   | All mutations use the dispatcher        | Every spawn tool submits through the player source; no store writes in `src/devtools`  |
| 6   | No boundary violations                  | `check:boundaries`, `check:cycles`                                                     |
| 7   | Overlay disabled = zero idle frames     | `render-budget.spec.ts` "a static world draws no frames", unchanged                    |
| 8   | Debug rendering never affects gameplay  | Criterion 2 plus boundary enforcement                                                  |
| 9   | Panels update only on snapshot changes  | Change-driven subscription, not per-frame polling; asserted per panel                  |
| 10  | All tests pass                          | Full gate run                                                                          |

---

## Status

### 07.8a — Overlay completion · Delivered

The seven values the brief names that the overlay did not show: **Visible Sprites, Active Workers, Active Crops, Containers, Buildings, Event Queue Size, Command Queue Size**.

All seven were already reachable read-only — `events.pending()`, `dispatcher.pending()`, and the snapshot slices — so this is registration, not plumbing. Every one is a **pull**: a function the registry calls when a panel asks (ADR-018 §9). None caches, none mutates, and none is a live reference a panel could write through.

**Read from snapshots, not stores.** Worker, crop, and building counts come from the published slices rather than `world.workers` and friends, so the overlay sees exactly what the renderer sees and cannot observe a half-stepped world mid-tick (ADR-005 §2). Container count is the one exception and says so: containers are not projected, so it reads the store's size — a count, never its contents.

Registered under the existing `MetricGroup`s in one place, so the panel needed no change at all.

Gates: typecheck · lint · boundaries · cycles clean. Unit **102 files / 1,306 tests**.

**Criterion 4 is met in substance and missed by 178 bytes, stated exactly.**

The production bundle went from 1,624,295 to 1,624,473 bytes. Zero debug markers appear in it — `Visible sprites`, `Event queue`, `Command queue` and the console label are all absent — so no _tooling_ shipped. The 178 bytes are `WorldView.visibleSpriteCount()`, a read-only accessor on the renderer itself.

The first attempt at this measurement blamed the accessor bag, and folding it behind `FEATURE_DEBUG` (which it now is, correctly — an object literal at the call site is constructed whatever `mountDevTools` does with it) changed nothing. The accessor is the whole of it.

Two defensible positions, and the reason for choosing the second:

- Gate the accessor too, and hit zero. But `visibleTileCount()` and `lastChunkRedraws()` **already ship** in production for exactly the same reason, so gating this one would make the view's introspection API inconsistent with itself.
- Accept 178 bytes as renderer introspection rather than debug code, matching the existing precedent.

The second is taken. Recorded here rather than rounded to "no increase", because a criterion worded _no increase_ that quietly means _no meaningful increase_ stops being a criterion. If exact-zero is required, the fix is to gate all three accessors together — a deliberate change to the view's API, not something to slip into a tooling phase.

### 07.8b — Metrics API hardening · Delivered

§13 was already satisfied in shape — typed, grouped, pull-based, read-only — so this hardened the contract rather than rebuilding it (AI_RULES Rule 1). Three defects, all of them reachable by what the rest of this phase is about to do to the registry, plus the contract ADR-018 §9 states but nothing enforced.

**A stale unregister removed a live metric.** `register()` returned a closure that deleted by id. Unregister `fps`, let something else register `fps`, then call the first closure late — and it deleted the second registration. Harmless while every metric was registered once at boot, which is every registration that exists today. Not harmless from 07.8c on, where panels register and unregister as they mount. The closure now removes **its own** registration and no other.

**A failed batch registered part of itself.** `registerAll` registered as it walked, so a collision half-way through threw with the earlier metrics registered _and their undo functions discarded_ — the throw replaces the return value, so nothing could ever remove them. The batch is now validated whole, including duplicates within itself, before anything is registered.

**An unranked group sorted to the front.** Group order was a list searched with `indexOf`, and `indexOf` returns −1 for a group nobody remembered to add — so a new `MetricGroup` would sort silently ahead of Performance. It is a `Record<MetricGroup, number>` now, which makes a missing rank a compile error. This is the one item here with no present-day symptom: the list was complete, and the change is the guarantee, not a fix.

**And the read-only contract, asserted rather than declared.** `readonly` is a compile-time claim a panel can ignore at runtime, so samples and the sample list are frozen. Sampling also snapshots the registration set _before_ calling any provider: which metrics a sample contains is now decided by the caller, and a provider that registers during its own read — a §9 violation, but one this should survive — can no longer appear in the sample it is corrupting.

Deliberately **not** built: a numeric channel for 07.8h's graphs. It has no consumer yet, and Rule 5 is explicit about abstracting in anticipation. 07.8h adds what 07.8h needs.

Gates: typecheck · lint · boundaries · cycles clean. Unit **102 files / 1,314 tests** (+8). E2E 38 passed, 4 skipped — including criterion 7, a static world still draws no frames.

**Criterion 4: zero.** Production main chunk 1,624,473 bytes — the 07.8a figure, unchanged. Everything here is inside `src/devtools`, which does not ship.

### 07.8c — World inspector · Delivered

Every fact §2 names, for the tile under the pointer: coordinates and the flat index, terrain kind, derived state, ownership, walkability, the A\* enter cost, the crop with its age and stage, and whoever is standing there. Registered through the provider API phase-01.5 built for exactly this, so `Inspector.tsx` needed no change to display it.

**It reads the world, not a snapshot, and that is the honest option rather than the convenient one.** 07.8a took its counts from published slices wherever a slice existed. Almost nothing here has one: tiles are not projected at all, and the crops slice deliberately carries a resolved sprite key rather than an id, an age, or a stage — projecting those would republish it every tick (`crops-slice.ts` says so). So the provider calls the sim's own pure queries — `tileStateAt`, `isWalkable`, `enterCost`, `stageFor` — which is the channel the terrain renderer already uses: `WorldView` is handed the world and reads `world.tiles` to draw it. No new sim→view channel is opened, and `TileInspectSource` declares only the fields it reads.

**It lives in `bootstrap`, not `devtools`**, because it needs the render layer's screen→tile picking and `devtools` may not import `render` — the same reason the phase-02 render metrics are registered there. Devtools receives a finished provider and, through it, only strings.

**Pinning fixes which tile is read, not what it said.** The panel used to read only on `pointermove`, which made every value a screenshot of the instant the pointer last moved: hold still over a ripening crop and it stayed `growing` forever. Pinning would have made that permanent. So the pointer position moved into a ref and the reading is taken at 4 Hz — the overlay's rate, for the overlay's reason — and pinning simply detaches the pointer listener. The sampler keeps running, so a pinned tile stays live.

**That sampling is committed only when it changes** (`sectionsEqual`, the same shape as `cropsEqual`), so a still world repaints nothing and criterion 9 holds: React bails out when `setState` returns the object it already has. The tests assert both halves — that the panel keeps reading, and that the DOM does not move while the readings agree.

Two smaller things, both from precedent already in the tree. `P` is ignored while a field has focus, because the developer console is one keypress away and `App.tsx` records exactly that defect for Space. And the panel distinguishes **`none`** from **`Unavailable`**: read-and-absent is not the same as could-not-read, and a tile with no crop should not look like a broken one.

**Deliberately not surfaced:** `moisture`. The field exists on the grid, and no system reads it — showing a number nothing consumes would invent meaning the game does not have.

Gates: typecheck · lint · boundaries · cycles clean. Unit **104 files / 1,351 tests** (+37). E2E **40 passed, 4 skipped** — including two new specs, because the unit tests cannot prove the wiring: that the provider is registered, that the picking is hooked to the live camera, and that the world it reads is the world on screen.

**Criterion 3:** the marker list gains `Enter cost`, `Occupants`, `PINNED`. This tool is the case that rule most needed — it lives in a module production _does_ ship, so only the `FEATURE_DEBUG` fold keeps it out.

**Criterion 4: zero.** Production main chunk 1,624,473 bytes with an unchanged content hash — byte-identical to 07.8b. Rollup dropped the whole provider.

### 07.8d — Entity inspector · Delivered

All six facts §3 names, for the worker under the pointer: FSM state, claimed task, energy against its maximum, what it is carrying against the hold it fills, where it is headed, and how far along that route it has walked. Same provider API, so the panel again needed no change.

**Picked by what is drawn, described by what the simulation holds.** The two halves read different sources deliberately, and the split is the design rather than a compromise:

- Picking uses the published `WorkerView`s through the renderer's own `workerAtTile`, so pointing at a worker selects the one a player can see — including a worker drawn mid-step between two tiles, which that function already accounts for. Restating the rule here would have been a second copy of it, free to drift from the first.
- The facts come from the `Worker` record, because three of the six are not projected at all: a view carries no `carrying`, no `path`, and no cursor. Projecting them would be worse than reading them — `path` changes as the worker walks, so a slice carrying it would republish every tick (ADR-005 §2). This is the same conclusion 07.8c reached, arrived at from the opposite direction: there nothing was projected, here the useful half is.

**A worker the view knows and the store does not is reported as nothing at all.** A slice outlives a removed worker by one publish, and filling that gap with a default-valued entity would invent a worker with no tile and no energy. Tested, because it is the one case where the two sources genuinely disagree.

**Two readability decisions.** Energy is shown against `MAX_ENERGY` — `42` alone says nothing about whether this worker is about to go and rest. And a tile is named `28,29 (#1852)`: an index alone is unreadable, and coordinates alone cannot be matched against a log line.

**The `@render` alias was missing from `vitest.config.ts`** and is now present. It is declared by `electron.vite.config` and both renderer tsconfigs; no test had yet imported a _runtime_ module through it, only types, which erase before resolution. An alias the build honours and the tests do not is a module the tests cannot cover — found by this milestone rather than designed around it.

Gates: typecheck · lint · boundaries · cycles clean. Unit **105 files / 1,377 tests** (+26). E2E **41 passed, 4 skipped**, including a third inspector spec. That spec **pauses the simulation** before hovering: a worker that can walk out from under the pointer between the hover and the assertion is a race, and this suite runs with no retries because a flaky overlay test is a real bug (`TESTING.md` §6.4).

**Criterion 3:** the marker list gains `Carrying` and `tiles · `. **Criterion 4: zero** — 1,624,473 bytes, unchanged content hash, for the third milestone running.

### 07.8e — Event monitor · Delivered

**F2.** A bounded ring of what the bus dispatched, with per-type filters, and — the part that matters — **no path by which it could publish**. `observer.ts` is the whole of the subscription: it calls `subscribe`, returns a disposer, and `publish` appears nowhere in the directory. That is asserted rather than promised: a test spies on the bus and proves the observer never calls it.

**Bounded in both directions.** The entry count is capped at 200, and so is each entry: a bounded count of unbounded records is unbounded, so a payload is summarised and truncated at record time. The panel reports **observed / kept / shown** separately, because a monitor that saw four thousand events, kept two hundred, and says "200" is lying about what it saw.

**`simulationTick` is deliberately not observed.** It fires 20 times a second; a ring recording it would hold ten seconds of heartbeat and nothing else — a monitor whose default configuration destroys what it monitors. Nothing is lost: every entry carries the tick it was observed on, so recording the tick _event_ would add nothing the records already say. The observed set is declared explicitly rather than derived from `SimEventMap`, so the next per-frame event added is a decision rather than an accident.

**It subscribes rather than polls.** `useSyncExternalStore` over the ring's own listener, so the panel re-renders exactly when an event is observed and never otherwise — criterion 9 satisfied by construction rather than by a change test. The ring rebuilds its entries immutably, which is what makes the identity comparison correct.

**It records while closed**, which is the point: opening F2 after something goes wrong shows the run-up to it. The E2E asserts exactly that, tilling a tile before ever opening the panel.

#### The defect the E2E found — and a second one behind it

The filter test failed, and not for the reason the assertion suggested. Clicking a filter chip **tilled the tile behind the panel**.

`pointer-actions` is attached to `document.body` and treats any press that did not start over a `[data-interactive]` element as a tile action. The monitor is the first devtools panel that is _interactive_ — the overlay and inspector are `pointer-events: none` — and it did not carry the attribute. A debug tool was changing the world by accident, which is precisely what ADR-018 §2 exists to forbid, arrived at by omission rather than by a shortcut.

Fixing it exposed the same omission in the **developer console**, where it is worse. `app/hit-test.ts` keeps the mouse only while it is over a `[data-interactive]` element; the console carried none, so with a real mouse the window went click-through over it and **the console input could not be clicked into at all**. Neither test layer could see it, and `hit-test.ts` already says why: Playwright synthesises events inside the renderer, where OS-level mouse ignoring does not exist. The console's own specs reach it by keyboard, because F1 autofocuses the input. Both panels now carry the attribute, and both have a test asserting it — the attribute is the entire contract, so the attribute is what is asserted.

Gates: typecheck · lint · boundaries · cycles clean. Unit **108 files / 1,405 tests** (+28). E2E **43 passed, 4 skipped**. **Criterion 3:** markers `No events observed` and `event-monitor` — which double as the check that no debug _subscriber_ ships, since one would make the event graph differ between builds. **Criterion 4: zero**, fourth milestone running.

### Remaining

07.8f–07.8o, in the order above.
