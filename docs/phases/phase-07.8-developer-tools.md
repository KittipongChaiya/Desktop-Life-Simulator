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
| 07.8f | Command monitor (§5)        | Queue depth, outcomes, durations, validation results                                        | **Delivered** |
| 07.8g | Time controls (§9)          | Expose scale on `SimulationControl`; pause/resume/step/1–16× through the existing scheduler | **Delivered** |
| 07.8h | Performance panel (§8)      | Change-driven graphs over a 60 s ring                                                       | **Delivered** |
| 07.8i | Chunk debug (§7)            | Borders, dirty set, redraw counts                                                           | **Delivered** |
| 07.8j | Pathfinding debug (§6)      | Path, open/closed sets, cost heatmap — opt-in                                               | **Delivered** |
| 07.8k | Spawn tools (§10)           | Every mutation dispatched as a command (ADR-018 §3)                                         | **Delivered** |
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

### 07.8f — Command monitor · Delivered

**F5.** Every command the player submits, with its outcome, the validation error that refused it, what the dispatch cost, and the queue depth at the moment it was submitted. Plus execution-time failures from **any** source, through the hook the dispatcher already had.

**Observing a command must not change it.** The wrapper returns the producer's result — the same object, not a copy — rethrows exactly what it threw, and adds no validation, no retry, no second path into the dispatcher. A debug build dispatches identically to a release one, or a bug reproduced with the tools open is not a reproduction. The identity of the returned result is asserted, not the equality.

**What it cannot see, stated rather than implied.** This is the milestone where the brief asks for something the phase's own constraint forbids, so the boundary is worth naming precisely:

| §5 asks for        | Delivered                                                                | Why not more                                                                     |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Outcomes           | Accepted, rejected, failed — every player command, any source's failures | —                                                                                |
| Validation results | The error code that refused it, per row                                  | —                                                                                |
| Queue depth        | Recorded per row, at that command's dispatch                             | A live depth needs a timer; it is already on the F3 overlay (`sim.commandQueue`) |
| Durations          | **Dispatch only** — validation and queueing                              | Execution happens inside `drain`, and instrumenting it is a simulation change    |

Worker commands are dispatched inside the simulation and pass no boundary the renderer can wrap, so the monitor sees them only when they _fail_. Adding an `onExecuted` seam would be simulation surface built for a debug tool — ADR-018 §1 refuses it and this phase's hard constraint forbids it outright. ADR-018's own consequences say the quiet part: _some tools will be impossible to build honestly, and must then not be built._ The honest subset is built, and the table says which part is missing and why.

**A second ring, not a generalisation of the first.** The buffer mechanics match `events/ring.ts`; the records do not — a command has an outcome, an error code, a cost, and a depth, none of which an event has. Rule 5 says abstract on the **third** occurrence, so the duplication is deliberate and the module says so: if 07.8m's recorder wants a third bounded buffer, that is when the buffer gets extracted.

**Named `commandLog`, not `commands`,** because `host.commands` is already the console's command registry — two unrelated meanings of one word, and this is the one that would have been silently wrong.

The panel carries `data-interactive` from the start, with a test, because 07.8e found what its absence costs.

#### Criterion 4 did its job again, and taught something specific

The first build after wiring came back **+53 bytes**, then **+10**, before reaching zero. Neither figure was debug _code_ — `queueDepth`, `dispatchMs`, `observeCommands` and every other tooling symbol were absent from the bundle throughout. The bytes were **names**.

**This production bundle is not minified.** It ships formatted, readable JavaScript with original identifiers; only comments are stripped. So a variable name is bytes, and an unused parameter name is bytes:

- **53** — a `rawPlayerSource` binding introduced to share the unwrapped source between two arms of a conditional. The fold was working perfectly; the _variable_ was the entire cost. Repeating `createPlayerInputSource(world.commands)` in both arms removed it.
- **10** — exactly `, metadata`, the third parameter the debug arm of `onExecutionRejected` needs and the release arm does not. Splitting the handler into two flag-selected arms removed it.

A related lesson worth stating plainly: **`FEATURE_DEBUG` folds, a variable derived from it does not.** Branching on `commandLog !== null` alone does not fold, because Rollup will not propagate a module-level `const` into a function body; branching on `FEATURE_DEBUG && …` does. This is 07.8a's accessor-bag lesson in a second form, and the code now carries it in a comment where the next author will meet it.

Final: **1,624,473 bytes with the original content hash restored** — byte-identical to every milestone since 07.8a.

Gates: typecheck · lint · boundaries · cycles clean. Unit **110 files / 1,429 tests** (+24). E2E **45 passed, 4 skipped** — the two new specs drive the HUD rather than the console, because the wrapper's whole point is that it sits on the path a _player_ uses. **Criterion 3:** markers `No commands observed` and `command-monitor`; the wrapper sits on the dispatch path, so they double as the check that a release build dispatches through no debug indirection.

### 07.8g — Time controls · Delivered

**F6.** Pause, resume, step by 1 or 10, and 1×/2×/4×/8×/16× — every one of them calling a control the loop has had since phase-01.

**The milestone was a declaration, not a feature.** `GameLoop` already implemented `setTimeScale` with validation, and `game-loop.test.ts` already covered it. What was missing is that `SimulationControl` — the interface devtools actually receives — declared `pause`, `resume`, `step`, `tick`, `ups`, `fps` and `frameTimeMs`, and not the scale. The loop had the capability; the tooling could not name it. Moving those two members onto the shared interface is the whole of the plumbing, and it is where they belonged: that file's own header calls itself the development control surface and says pausing is a development capability, not a game feature. Pause and step were always there. The scale was the odd one out.

**The panel is thin on purpose.** It schedules nothing, wraps nothing, and adds no time model of its own. Scaling multiplies the number of ticks per frame and never the tick duration — `TICK_MS` is frozen (ADR-007 §7) — so a scaled run visits exactly the same tick states as an unscaled one, just sooner. That is what keeps determinism, save `lastTick` semantics, and tick-authored content intact at 16×, and the reason no control here needed inventing.

**It samples, because something else can change what it shows.** The console has had `pause` and `resume` since phase-01.5, so a panel that reported "running" merely because it was not the one that pressed the button would be worse than no panel. 4 Hz while open, the overlay's rate, and a reading is committed only when it differs — so a **paused world leaves the panel completely still**, which is asserted.

**Not built: a `speed` console command.** The console owns `pause`, `resume` and `tick`, so a scale command belongs there too — but `builtins.ts` has no test harness at all today, and adding an untested command would breach `AI_RULES.md` §3.3 to save a developer one keystroke. It needs the harness first, and that is not this milestone. Stated here rather than left as a silent gap.

Gates: typecheck · lint · boundaries · cycles clean. Unit **111 files / 1,439 tests** (+10). E2E **48 passed, 4 skipped** — three new specs, because the unit tests drive a fake and only the real app proves the panel is wired to the loop: pausing stops the tick advancing, `+10` advances a paused world by exactly ten, and the scale set is the scale reported back.

**Criterion 4: zero**, sixth milestone running — notable here because the scale is now declared on an interface production _does_ ship. Declaring a method costs nothing; only the controls that call it are debug code, and the marker list gains `time-controls` to assert exactly that.

### 07.8h — Performance panel · Delivered

**F7.** Sixty seconds of FPS, frame time and heap, plotted as SVG polylines with the current value beside each — a trend with no scale beside it says something changed and not what it changed to.

**This is the panel ADR-018 §8 names as the trap**, in those words: _"a 60-second history that repaints at 60 Hz while nothing changes is a debug tool that makes the thing it measures worse, and its own readings untrustworthy."_ Three properties answer it, and all three are asserted:

1. **Closed costs nothing.** No interval is scheduled while hidden, so not one accessor is read — asserted with a spy, and again on close.
2. **It samples at 2 Hz, never per frame.** Sixty seconds of history is 120 points, and a point every 500 ms is what that means. The panel takes **no animation lease** and never requests a frame.
3. **A uniform window stops repainting entirely.** The committed series is compared element-wise, so once the whole window holds one value, every further sample rebuilds the series already on screen and nothing commits. An idle farm settles into complete stillness rather than redrawing a flat line forever — and that falls out of the comparison rather than an `isIdle` special case.

The E2E asserts the property the unit tests structurally cannot: with the panel **open**, a static world still reports ~0 FPS on the overlay. If the panel were animating its own graphs it would be measuring itself, and the number it plots would be its own artefact.

**07.8b's deferred numeric channel was never needed.** That milestone declined to add one to the metric registry with no consumer, noting "07.8h adds what 07.8h needs". What 07.8h needed was the accessors the metrics already read — `fps()`, `frameTimeMs()`, and the heap — so the panel reads those directly and the registry stays as it was. The deferral was right, and the abstraction it would have bought would have had exactly one user.

**The heap read was extracted, on its third occurrence.** `host.ts` and `devtools-mount.ts` each carried their own copy and **had already drifted** — one reporting `Unavailable`, the other `unavailable`, for the same condition. The panel would have been the third, which is precisely the threshold Rule 5 names, so `perf/heap.ts` now owns it and both call sites use it. Absent reports as **null**, not zero: a graph plotting 0 MB reads as a heap that was just freed.

One bug the tests caught before it could mislead anyone: a flat series was drawn along the **bottom** of its box, because widening a zero span upwards puts every point at the floor. A steady 60 fps rendered as a line on the floor reads as a stall. The span is widened symmetrically now, so a flat series draws through the middle.

Gates: typecheck · lint · boundaries · cycles clean. Unit **113 files / 1,464 tests** (+25). E2E **50 passed, 4 skipped**. **Criterion 4: zero**, seventh milestone running — notable because this one edited two modules production ships, replacing their inline heap reads with a shared helper; the hash is unchanged.

### 07.8i — Chunk debug · Delivered

**F8.** Chunk borders, the stale set filled amber, and a per-chunk redraw tally drawn on each chunk. The first debug tool that draws into the **scene** rather than the DOM, which brought two problems no panel had.

**It never asks for a frame.** The overlay is updated from inside the existing draw path and marks nothing dirty. A stale chunk has already dirtied the gate for the terrain cache's own reasons, so the overlay rides the frame that was happening anyway. An overlay that dirtied the gate to keep its numbers fresh would hold the render loop awake forever — and would do it in the one build where that looks like the tool working. The E2E asserts it: with the overlay **on**, a settled world still reports 0 chunk redraws and ~0 FPS.

**Redraw counts are counted in the overlay, not the tracker.** A per-chunk tally in `ChunkTracker` would be production code on the terrain path. Instead the count comes from the stale set sampled immediately _before_ `TerrainRenderer.update` runs: every chunk in that set is about to be redrawn, so the tally is exact rather than inferred.

The toggle is held **outside** the view, because collapsing destroys the whole scene (ADR-003 §4) and an overlay that switched itself off on collapse would read as broken. The second E2E collapses and expands with it on, and asserts the rebuilt scene settles back to zero redraws — the destroy/rebuild path is where a scene-drawing tool leaks GPU objects.

#### `FEATURE_DEBUG` moved to `shared`, and why it had to

`render` may import only `shared`, `sim` and `render` — the boundary phase-01.5 deliverable 8 exists to enforce. So the render layer had **no literal to fold against**, and the overlay's hook and null check shipped: **557 bytes measured**. Declaring `FEATURE_DEBUG` in `shared/build-flags.ts`, with `devtools/flags.ts` re-exporting it, gives every layer a boundary-legal way to compile debug code out. ADR-018 §7 is unchanged — one master switch, still a compile-time literal, now with one declaration and two places allowed to read it. 07.8j draws in-world too and would have hit the same wall.

#### Criterion 4: **+51 bytes**, stated exactly

Not zero, for the first time since 07.8a. No tooling shipped — `chunk-debug.ts` is absent from the bundle entirely, and the world-view hook folds away completely. The 51 bytes are one option forwarded through `world-mount` (`chunkDebug: options.chunkDebug`) plus the `...{}` a folded spread leaves behind.

Getting there took four measurements and taught two rules, now recorded in `chunk-debug.ts` where they cost nothing:

- **Statement-level gating folds; expression-level gating does not.** `if (FEATURE_DEBUG) …` is eliminated after Rollup inlines the constant. `...(FEATURE_DEBUG ? { x } : {})` is not, unless the whole condition is knowable inside the module at transform time — which is why the identical shape folded in `start.tsx` (its other operand is a local `const … = null`) and not in `world-mount`.
- **Comments in surviving code are bytes.** This bundle is not minified: it ships formatted source with original identifiers and comments intact. Two comment lines beside a folded spread cost 145 bytes, and one of them tripped the marker test by containing the string `chunk-debug` in prose — the exclusion test failing on a _comment_ while the code it described was correctly absent.

The residue is forwarding, not tooling, and the honest options for the last 51 bytes are worse than the bytes: a second locally-declared flag, or restructuring the mount around a named options binding that costs its own name.

Gates: typecheck · lint · boundaries · cycles clean. Unit **114 files / 1,475 tests** (+11). E2E **52 passed, 4 skipped**. **Criterion 3:** marker `chunk-debug` — which caught the comment leak on its first run.

### 07.8j — Pathfinding debug · Delivered

**F9 cycles: off → routes → routes and heatmap → off.** Each walking worker's remaining route drawn as a polyline with its destination ringed, and a heatmap of what every visible tile costs to enter — the pathfinder's own `enterCost`, not a second opinion.

**The open and closed sets are not drawn, and that is the whole of §6 that is missing.** They exist only as locals inside `findPath` while a search runs, and the search is over before any frame is drawn. Reaching them needs an observer parameter on the pathfinder — a behaviour change to `src/sim` made for a debug tool, which this phase's hard constraint forbids and ADR-018 §1 refuses on principle. Re-implementing A\* in the overlay to reproduce them would be worse: a second copy of the pathfinder, free to disagree with the one the game uses, which is the drift `astar.ts` itself warns about. So the two reachable halves are drawn and the third is **named rather than faked** — the same call 07.8f made about execution timing, for the same reason.

The route is not projected either: `WorkerView` carries a tile and a next tile, never the plan. It comes from the `Worker` record, the source and reasoning 07.8d established. Only the part still to be walked is drawn — a worker four tiles into a six-tile route is walking two, and drawing the whole plan would make a nearly-finished trip look like a new one.

**One debug port, not one per tool.** 07.8i measured what an option costs: a property forwarded through `world-mount` survives into the release bundle even when everything behind it folds, because a property copy is an expression and expressions do not fold. A second tool would have bought a second copy of that. So `world-debug.ts` composes every in-world overlay behind a single `debug` port, and the view knows about one. It also gives 07.8l one place to hide all in-world debug chrome at once.

**Criterion 4: 1,624,514 bytes — 10 fewer than 07.8i, and +41 on the 07.8a baseline.** A second scene-drawing tool cost _less than nothing_, because consolidating two options into one replaced `chunkDebug` with the shorter `debug` in the one line that survives. The residue is still forwarding, not tooling: both overlay modules are absent from the bundle.

The E2E takes the heatmap seriously as the worst case — it fills every visible tile, so if any in-world drawing were going to hold the render loop awake it would be this one. Through all three cycle states, a settled world still reports ~0 FPS.

Gates: typecheck · lint · boundaries · cycles clean. Unit **115 files / 1,489 tests** (+14). E2E **54 passed, 4 skipped**. **Criterion 3:** marker `path-debug`.

### 07.8k — Spawn tools · Delivered

`spawn worker [count]`, `spawn crop <id> <x,y>`, `spawn building <id> <x,y>` — in the console, which is where ADR-018 §3's own cited precedent lives: the `money` command that dispatches `grantCoins` rather than touching the wallet.

**The first tool that writes, and the rule is kept structurally rather than carefully.** `createSpawnCommands` receives exactly one capability — `submitCommand`, the ordinary player source. A store, a grid, an entity: not merely off-limits, not in scope. There is nothing there to write through even by accident, which is a stronger guarantee than a rule someone has to remember.

**A batch is N commands, never one command with a count.** Each is validated against the world as it stands, so the third worker can be refused for want of coins while the first two are hired — and the tool reports both halves (`hired 2 of 3` _and_ the reason). Reporting only the failure would hide the two that landed.

The three properties §3 promises are asserted in the real app rather than argued: a spawned worker reaches the HUD through validation, queue, tick and snapshot like any hire; an illegal placement is **refused**; and the spawn appears in the command monitor **as `player`**, which is only possible because it went through the source 07.8f wraps.

#### Criterion 5 now has a test, and it found something on its first run

`tests/devtools-writes-only-through-commands.test.ts` scans `src/devtools` and asserts **every `sim` import is type-only**. Types are erased, so a type-only import cannot call anything; if no sim function can be called from the tooling, no sim store can be mutated by it. The boundary linter already stops `sim` importing `devtools` — this is the other direction, which the linter permits and nothing else constrained.

Its first run failed on the console's `time` command, which calls `ticksToSeconds` — a pure conversion between two numbers. Refusing that would have been dogma, so the rule is stated precisely instead: type-only, **except an explicit allowlist of modules that hold no state**, with one entry and a test that the list stays short enough to still be read. A control nobody reads is not a control.

Gates: typecheck · lint · boundaries · cycles clean. Unit **117 files / 1,507 tests** (+18). E2E **57 passed, 4 skipped**. **Criterion 4: 1,624,514** — unchanged from 07.8j; spawn tools are console-only and compile out entirely.

**One flake observed, and not swept up.** The first full E2E run of this milestone failed `criterion 8: ambient motion returns to a zero-frame idle` — a 07.7 perf spec with 14-second waits and pointer-driven presence. It passed alone, passed on a clean full re-run, and nothing in 07.8k touches ambient motion or the frame loop. Recorded because `TESTING.md` §6.4 treats a flaky test as a real bug and this suite runs no retries: it is a pre-existing timing sensitivity in that spec, and 07.8o should decide whether to make it deterministic or accept it in writing.

### Remaining

07.8l–07.8o, in the order above.
