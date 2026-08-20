# PERFORMANCE

> **Status:** Authoritative for budgets and gates. Ceilings here are **blocking** — a change that exceeds one does not merge (`AI_RULES.md` §2.3).
> **Owns:** Performance targets, memory/CPU/render budgets, measurement methodology, optimization policy.
> **Does not own:** Why the architecture is shaped this way (`docs/decisions/`).

**Every number below is marked with its validating phase.** Numbers not yet measured are labeled _provisional_ and become binding when that phase measures them. Provisional numbers are estimates, not observations — do not cite one as evidence.

---

## 1. Why This Document Blocks Merges

`VISION.md` §2.1 makes background cost a **product feature**, not an optimization. This is the one non-negotiable claim the product makes: a game you can leave running all day beside real work.

A desktop overlay that makes the fan spin gets uninstalled, no matter how good the game is. Performance here is not polish applied at the end — it is the requirement the architecture was designed around (ADR-001's render-on-demand, ADR-003's process layout, ADR-005's throttled bridge all exist to satisfy it).

---

## 2. Reference Hardware

Budgets are stated against a deliberately modest baseline — not a developer machine.

|         | Baseline                           | Minimum         |
| ------- | ---------------------------------- | --------------- |
| CPU     | 4-core, ~2.5 GHz (2019-era laptop) | 2-core          |
| RAM     | 8 GB                               | 4 GB            |
| GPU     | Integrated (Intel UHD / AMD Vega)  | Integrated      |
| Display | 1920×1080 @ 60 Hz                  | 1366×768        |
| OS      | Windows 11                         | Windows 10 21H2 |

**"% CPU" throughout means percent of one core**, not of the whole package. 1% CPU = 1% of a single core = 0.25% of a 4-core package.

ADR-001 sets `powerPreference: 'low-power'` specifically so a laptop's discrete GPU is not woken for a farm sim.

---

## 3. The Three States

The app has three distinct cost profiles, and conflating them makes every number meaningless.

| State               | Description                                      | Share of an 8-hour day |
| ------------------- | ------------------------------------------------ | ---------------------- |
| **Collapsed**       | Status bar only; Pixi destroyed (ADR-001 §2)     | ~85%                   |
| **Expanded idle**   | World visible, nothing moving or growing visibly | ~13%                   |
| **Expanded active** | Workers moving, player interacting, panels open  | ~2%                    |

**Collapsed is the state that matters.** It is where the product lives, and it is the state most easily neglected in testing because it is the least interesting to look at.

---

## 4. CPU Budget

| State                  | Target | **Ceiling**        | Validated in             |
| ---------------------- | ------ | ------------------ | ------------------------ |
| Collapsed              | < 0.3% | **0.8%**           | phase-01 _(provisional)_ |
| Expanded idle          | < 1.0% | **2.0%**           | phase-02 _(provisional)_ |
| Expanded active        | < 3.0% | **5.0%**           | phase-04 _(provisional)_ |
| During save            | —      | **< 30 ms spike**  | phase-07 _(provisional)_ |
| During load + catch-up | —      | **< 500 ms total** | phase-07 _(provisional)_ |

### 4.1 Component budgets

| Component                    | Budget                           | Notes                                                  |
| ---------------------------- | -------------------------------- | ------------------------------------------------------ |
| Simulation tick (v0.1 scale) | **< 0.5 ms** avg, **< 3 ms** p99 | p99 > 3 ms triggers the worker migration in ADR-003 §2 |
| Snapshot projection          | < 0.2 ms                         | Only for changed slices                                |
| Render frame (active)        | < 6 ms                           | Leaves headroom in a 16.6 ms frame                     |
| React commit                 | < 3 ms                           | Throttled to ≤ 10 Hz (ADR-005 §2)                      |

At 20 Hz, a 0.5 ms tick costs 1% of a core. This is the single largest fixed cost in collapsed mode, and it is why ADR-007 §Alternatives rejects raising the tick rate as a solution to anything.

### 4.2 The two zero-work invariants

These are the mechanisms that make the collapsed and idle budgets achievable. Both are enforced by automated tests, and **deleting or skipping either test invalidates ADR-001 or ADR-005 respectively.**

| Invariant                                                                                                 | Test                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No `requestAnimationFrame` fires when the world is static (ADR-001 §1)                                    | `tests/e2e/render-budget.spec.ts` — "a static world draws no frames"                        |
| No React commit occurs when no snapshot slice changed (ADR-005 §2)                                        | Same file                                                                                   |
| Ambient motion enabled, pointer idle past `AMBIENT_IDLE_TIMEOUT_MS` → still zero (ADR-017 §2 condition 4) | `tests/e2e/perf-harness.spec.ts` — criterion 8                                              |
| A debug overlay drawn INTO the world does not hold the loop open (ADR-018 §8)                             | `tests/e2e/chunk-debug.spec.ts`, `tests/e2e/path-debug.spec.ts`                             |
| An open performance panel does not inflate the frame rate it plots (ADR-018 §8)                           | `tests/e2e/performance-panel.spec.ts`                                                       |
| A day/night phase transition releases its animation lease and stops (ADR-020 §3)                          | `src/renderer/render/lighting-view.test.ts` — "RELEASES the lease once the transition ends" |

**Why the lighting row is a unit test and not an e2e one (phase-10c).** A phase
boundary is 6,000 ticks away — five real minutes at 20 Hz — so an e2e assertion
across one would have to sit idle for five minutes or acquire a way to fast-forward
the simulation from the harness, which does not exist. The unit test runs against
the **real** `createDirtyGate`, so `animationCount()` is the same number the render
loop consults and the same one the debug overlay reports as `0 anim`. It also drives
ten seconds of frames past the settled transition and asserts the scene never goes
dirty again. Mutating `lease.sync(running)` to `lease.sync(true)` fails six tests.

> **Corrected 2026-08-01 (phase-07.7k).** The first two rows named
> `tests/e2e/idle-cost.spec.ts`, which does not exist and never has. Both
> invariants ARE enforced, in `render-budget.spec.ts` under "a static world
> draws no frames" and the collapse-cycle leak test — but a reader checking the
> named file would have found nothing and reasonably concluded the invariants
> were unguarded.
>
> **Corrected again 2026-08-05 (phase-07.8o).** The third row still read "NOT
> YET TESTED" while the note directly beneath it said the opposite. It now
> names the spec. Two rows were added for phase-07.8: an overlay that draws
> into the scene, and a panel that plots the frame rate, are the two ways
> tooling could quietly hold the render loop open, and both are asserted
> end-to-end.
>
> **The third row was closed in 07.7M.** Ambient motion is the one thing that
> can hold the frame loop open, and its surrender-on-idle behaviour is now
> asserted end-to-end against a real window as well as in
> `ambient-presence.test.ts`: 100 FPS with one animation lease while the
> pointer is active, and 0 FPS with 0 leases after 14 s untouched. It could not
> be measured until 07.7L made the setting reachable.

A tick over a sleeping world should iterate almost nothing (ADR-004) and publish nothing. When both hold, idle cost approaches the tick alone.

---

## 5. Memory Budget

| Measurement            | Target   | **Ceiling** | Validated in             |
| ---------------------- | -------- | ----------- | ------------------------ |
| Total RSS, collapsed   | < 160 MB | **220 MB**  | phase-01 _(provisional)_ |
| Total RSS, expanded    | < 260 MB | **340 MB**  | phase-02 _(provisional)_ |
| Peak (load + catch-up) | —        | **400 MB**  | phase-07 _(provisional)_ |
| Growth over 8 hours    | < 10 MB  | **25 MB**   | phase-07 _(provisional)_ |

### 5.1 Breakdown (expanded)

| Component                                 | Estimate   |
| ----------------------------------------- | ---------- |
| Electron baseline (main + renderer + GPU) | 110–150 MB |
| World state (v0.1 scale)                  | < 2 MB     |
| Texture memory (atlases)                  | 25–50 MB   |
| Pixi scene graph                          | 5–15 MB    |
| React tree + DOM                          | 10–20 MB   |
| Snapshot buffers                          | < 1 MB     |

Electron's baseline dominates and is not reducible — it is the accepted cost in ADR-003 §Tradeoffs. **The budget is therefore mostly about not adding to it**, and about ADR-001 §2's collapsed-mode teardown reclaiming the GPU-side share.

### 5.2 Leak policy

The 8-hour growth ceiling is the real memory test. An idle game that leaks 5 MB/hour is unusable by design regardless of its baseline.

Most likely sources, in order: undestroyed Pixi display objects (`CODE_STYLE.md` §10), snapshot slices retained by stale subscribers, event listeners not removed on panel unmount, and unbounded collections in world state.

**A collection that grows with playtime rather than world size needs a documented bound** (`SAVE_FORMAT.md` §3.4).

---

## 6. Rendering Budget

| Metric                   | Target            | **Ceiling**  | Validated in             |
| ------------------------ | ----------------- | ------------ | ------------------------ |
| Frame time (active)      | < 8 ms            | **16 ms**    | phase-02 _(provisional)_ |
| FPS while animating      | 60                | **≥ 30 min** | phase-04 _(provisional)_ |
| FPS while static         | **0** (no frames) | 0            | phase-02                 |
| Draw calls, static farm  | < 15              | **30**       | phase-02 _(provisional)_ |
| Draw calls, active       | < 30              | **60**       | phase-04 _(provisional)_ |
| Texture memory           | < 50 MB           | **80 MB**    | phase-02 _(provisional)_ |
| Pixi init (expand)       | < 150 ms          | **300 ms**   | phase-02 _(provisional)_ |
| Pixi teardown (collapse) | < 50 ms           | **100 ms**   | phase-02 _(provisional)_ |

**"FPS while static = 0" is not a typo.** Rendering nothing when nothing changed is the design (ADR-001 §1), and a nonzero number here is a defect, not a healthy frame rate.

The draw-call ceiling is the direct measurement of whether atlasing works (ADR-006 §3). A static 80×64 world (ADR-030) should cost ~20 terrain chunk quads plus a handful of sprite batches — if it costs hundreds, textures are not batching and the reason for choosing PixiJS has evaporated.

---

## 7. Responsiveness

The overlay is judged against the player's real work. These are perceptual thresholds, not throughput numbers.

| Interaction                   | Target   | **Ceiling** | Validated in |
| ----------------------------- | -------- | ----------- | ------------ |
| Click → visible feedback      | < 50 ms  | **100 ms**  | phase-03     |
| Collapse / expand             | < 200 ms | **400 ms**  | phase-01     |
| Panel open                    | < 100 ms | **200 ms**  | phase-05     |
| App cold start → interactive  | < 2.0 s  | **3.5 s**   | phase-01     |
| Save → interactive            | < 30 ms  | **100 ms**  | phase-07     |
| Load + catch-up → interactive | < 500 ms | **1.5 s**   | phase-07     |

### 7.1 Non-negotiable behaviors

Independent of the numbers above:

- **Never block the player's input to other applications**, even momentarily.
- **Never steal focus.** Not on launch, not on save, not on an event.
- **Never raise above a fullscreen application.**
- **Never stutter another application's video or games.** The overlay is a guest.

These are pass/fail, tested manually each phase against a fullscreen video and a fullscreen game.

---

## 8. Disk and Startup

| Metric                 | Target           | **Ceiling**                      |
| ---------------------- | ---------------- | -------------------------------- |
| Save file, mature farm | < 400 KB         | **2 MB** (`SAVE_FORMAT.md` §3.4) |
| Save write             | < 20 ms          | **100 ms**                       |
| Installer size         | < 90 MB          | **150 MB**                       |
| Installed size         | < 300 MB         | **450 MB**                       |
| Disk writes at idle    | 1/min (autosave) | **2/min**                        |

Idle disk writes matter more than they appear: an app writing continuously prevents drive spin-down and burns SSD endurance over months of all-day use.

### 8.1 Measured — v0.1 (phase-07e)

On the reference save (`tests/fixtures/saves/v1-mature-farm.json`: a 16×16 plot, all four buildings, three workers, stocked containers, 500 real ticks behind it), gated by `tests/save-performance.test.ts` and `tests/memory-longrun.test.ts`.

| Metric                                | Measured         | Ceiling | Headroom |
| ------------------------------------- | ---------------- | ------- | -------- |
| Save file, mature farm                | **38,730 bytes** | 2 MB    | 54×      |
| Save serialization (§7.1 step 1)      | **0.64 ms**      | 100 ms  | 156×     |
| Load + catch-up at the 8-hour cap     | **1.35 ms**      | 1.5 s   | 1,100×   |
| Memory growth, accelerated 8-hour run | **10,112 bytes** | 25 MB   | 2,600×   |

Steps 2–7 of the write are fixed-cost filesystem calls, exercised live in the Playwright suite rather than measured here. The memory gate runs 576,000 real ticks and takes minutes; it carries its own timeout so the cost is attributed to the gate that incurs it.

---

## 9. Measurement Methodology

Numbers without a stated method are not evidence.

### 9.1 Standard procedure

```
1. Build production (npm run build) — never measure a dev build
2. Launch, load the reference save (tests/fixtures/saves/v1-mature-farm.json)
3. Let it settle 60 s
4. Measure over 5 minutes minimum
5. Report median and p99, never a single sample
6. Record hardware, OS build, and app version
```

Dev builds carry HMR, source maps, and React DevTools hooks. Measuring one produces numbers that are wrong in an unhelpful direction.

### 9.2 Tools

| Tool                                    | Use                                          |
| --------------------------------------- | -------------------------------------------- |
| Chrome DevTools Performance             | Renderer CPU, frame timing, React commits    |
| `process.getProcessMemoryInfo()`        | Per-process memory, logged periodically      |
| Pixi devtools                           | Draw calls, texture memory, scene graph size |
| Windows Task Manager / Process Explorer | Whole-app CPU and RSS as the player sees it  |
| Playwright + CDP                        | Automated regression assertions              |

### 9.3 Reference scenario

The same fixture is used for every measurement, so numbers are comparable across phases and sessions:

> **`v1-mature-farm`** — **12×12 owned plot (2 expansions), 24 planted crops of wheat, 3 workers, 4 buildings, 2 inventory stacks, tick 500.**

**Corrected in phase-24, and worth stating plainly.** From v0.1 until then this section described that fixture as _"16×16 owned plot, 200 planted crops of mixed types, 5 workers, 4 buildings, ~40 inventory stacks, 8 hours of playtime"_. Every quantity in that sentence was wrong except the building count. The fixture is roughly **eight times lighter in crops** than the document claimed, with three fifths of the workers.

This does not invalidate any published number — each was a real measurement of a real farm, and all of them sit far inside their budgets — but it does mean the **headroom was being read against a scenario that did not exist**, and the discrepancy is exactly the shape of defect phase-08.0 found in the coverage gate: a document describing behaviour the artefact never had.

**The fixture is not the thing to change.** `v1-mature-farm.json` is also the **v1 anchor of the save-compatibility chain** (ADR-015, `SAVE_FORMAT.md` §4.4): regenerating it would rewrite the evidence that every migration link is exercised against real v1 data. It stays exactly as it is.

#### 9.3.1 The constructed heavy scenario

Where a measurement needs the load §9.3 used to claim, the harness **builds it on top of the fixture**, deterministically, and says so in the test:

> **`v1-mature-farm` + construction** — 16×16 owned plot, 200 mature wheat crops, 5 workers, 4 buildings, a deep seed stock.

Used by criterion 13. The reason is not tidiness: a 24-crop farm worked by 3 workers is **supply-limited** — the crew drains it faster than it replants, so the load decays measurably within a minute. Any measurement that compares two states sequentially on that farm is reading the decay, not the states. At 200 crops the farm is **worker-limited**, the harvest rate is flat, and sequential arms become comparable. Criterion 13's first two executions each failed on exactly this, and both are kept beside it as `.INVALID-*.json`.

---

## 10. Regression Gates

### 10.1 Automated (CI, every PR)

| Gate               | Fails when                                        |
| ------------------ | ------------------------------------------------- |
| Idle rAF count     | Any frame fires over 10 s with a static world     |
| Idle React commits | Any commit occurs over 10 s with no slice change  |
| Tick duration      | p99 > 3 ms on the reference scenario              |
| Draw calls         | Static farm exceeds 30                            |
| Bundle size        | Renderer bundle grows > 10% without justification |
| Save size          | Reference save exceeds 2 MB                       |
| Memory growth      | > 25 MB over an accelerated 8-hour simulation     |

### 10.2 Manual (each phase)

- Collapsed CPU over 5 minutes on baseline hardware
- Expanded idle CPU over 5 minutes
- RSS in all three states
- Cold start to interactive
- The four §7.1 behaviors, against a fullscreen video and a fullscreen game

Results are recorded in the phase document. **A phase does not complete with an unmeasured budget.**

---

## 11. Optimization Policy

### 11.1 Measure, then optimize

Speculative optimization is banned (`AI_RULES.md` §1.5). Optimizing without a profile produces complexity in the wrong place and hides the real cost.

The correct sequence: reproduce on the reference scenario → profile → identify the dominant cost → fix that one thing → re-measure → report before/after in the commit message.

### 11.2 Architectural before micro

Order of attack, most effective first:

1. **Do nothing** — render-on-demand, change-gated snapshots. Not doing work always beats doing it faster.
2. **Do it less often** — throttle, coalesce, cache.
3. **Do less work** — better data structures, tighter iteration.
4. **Do it elsewhere** — move to a worker (ADR-003 §2).
5. **Micro-optimize** — last resort, and only with a profile.

Nearly every win available in this project is at levels 1–2. That is not an accident; ADR-001, ADR-005, and ADR-007 were chosen to put the wins there.

### 11.3 Readability cost

An optimization that makes code harder to read must state its measured gain in a comment (`CODE_STYLE.md` §6.2). A "faster" version with no measurement gets reverted.

### 11.4 Known accepted costs

Documented so no future session tries to "fix" a deliberate decision:

| Cost                        | Why accepted                                                   |
| --------------------------- | -------------------------------------------------------------- |
| Electron's ~130 MB baseline | ADR-003 §Tradeoffs; Tauri exit criteria stated there           |
| GPU context while expanded  | ADR-001; destroyed on collapse                                 |
| 20 Hz tick even when idle   | ADR-007; the tick iterates near-nothing when nothing is active |
| React runtime (~45 KB)      | ADR-005 §Tradeoffs                                             |
| Whole-file save rewrite     | ADR-002 §Tradeoffs; file is small                              |

---

## 12. Escalation

| Symptom                                              | Response                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Collapsed CPU over ceiling                           | Check §4.2 invariants first — almost always a render or snapshot leak                    |
| Expanded idle CPU over ceiling                       | Profile snapshot publishing; find the slice republishing every tick                      |
| p99 tick > 3 ms                                      | Move sim to a worker (ADR-003 §2). **Do not lower the tick rate** — ADR-007 §Revisit     |
| Memory growth over ceiling                           | Heap snapshot at 0 h and 8 h; diff retained objects. Suspect Pixi objects first          |
| Draw calls over ceiling                              | Atlas grouping is wrong (ADR-006 §3) — sprites drawn together are in different atlases   |
| Memory ceiling unreachable after honest optimization | Escalate to ADR-003's Tauri exit criteria. This is a decision, not an implementation fix |

---

## 13. Phase-07.7 game-feel measurements

Taken 2026-08-01 with the harness in `tests/e2e/perf-harness.spec.ts`, which
writes each result to `test-results/perf/*.json`. **Every number below was read
from a running window.** Nothing here is estimated, and a criterion with no
measurement says so.

### Environment

|        |                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------- |
| CPU    | Intel Core i7-14700F, 28 logical cores                                                                  |
| Memory | 31.8 GB                                                                                                 |
| OS     | Windows 11 Pro (10.0.22000)                                                                             |
| Node   | v22.21.0                                                                                                |
| Build  | `VITE_FEATURE_DEBUG=true npm run build` — a debug build, since every metric is read from the F3 overlay |

A fast desktop. These figures are a **ceiling check, not a floor**: they show
the budgets are not being approached, and they do not tell you what a 2018
laptop does. The budgets themselves are unchanged.

### Criterion 5 — p99 simulation tick

`test-results/perf/criterion-5-tick.json`, 1,287 tick batches over 60 s.

| Statistic | Measured     | Budget     |
| --------- | ------------ | ---------- |
| p50       | 0.000 ms     | —          |
| p95       | 0.100 ms     | —          |
| **p99**   | **0.100 ms** | **< 3 ms** |
| mean      | 0.024 ms     | —          |
| max       | 0.500 ms     | —          |

**PASS**, roughly thirty times inside budget.

**Read the p50 honestly:** `performance.now()` is coarsened to 0.1 ms in this
build, so `0.000 ms` means _below the clock's resolution_, not _instant_. The
resolution floor is 0.1 ms, which is also why p95 and p99 report the same
value — the distribution is compressed against the floor rather than flat.
A finer measurement would need a different clock, and there is no reason to
want one while the budget has this much room.

### Criterion 8 — ambient motion returns to a zero-frame idle

`test-results/perf/criterion-8-ambient-idle.json`. Ambient animation switched
on through the real settings bridge, pointer moved, then left alone for 14 s
(`AMBIENT_IDLE_TIMEOUT_MS` is 8 s).

| State                         | FPS   | Animation leases |
| ----------------------------- | ----- | ---------------- |
| Ambient on, pointer active    | 100   | 1                |
| Ambient on, pointer idle 14 s | **0** | **0**            |

**PASS.** This is ADR-017 §2 condition 4 proven end to end rather than argued:
the frame loop genuinely stops, the lease is genuinely released, and the
overlay returns to drawing nothing while the setting stays on. It is the
measurement that makes the ambient-motion exception legitimate rather than a
hole in ADR-001, and it could not be taken until 07.7L made the setting
reachable.

### Criterion 9 — ambient audio returns to silence

`docs/perf/criterion-9-ambient-audio.json`. The audible twin of criterion 8,
and the condition ADR-016 §4 deferred continuous audio for: the deferral asked
for a measurement, so a number was owed before ambience could ship.

Taken against a farm whose weather is not left to chance. A seed that is
already raining is found, serialized, and planted in the profile **before** the
app starts — a bed that is off because there is no rain proves nothing, and
that vacuous pass is the likeliest way this measurement could lie.

Sound unmuted and the ambient category raised to 100 through the real IPC
bridge, pointer moved, then left alone for 14 s (`AMBIENT_IDLE_TIMEOUT_MS` is
8 s).

| State                          | Ambient bed  |
| ------------------------------ | ------------ |
| Raining, pointer active        | on, gain 0.6 |
| Raining, pointer idle for 14 s | **off**      |

**Ceiling: the bed must read `off` within `AMBIENT_IDLE_TIMEOUT_MS` + one
update tick (9 s) of the last pointer input, at any weather.** "Off" is a
stronger claim than "quiet": a gain of zero stops the source rather than
playing silence, so the audio thread has nothing left to run. A silent-but-
running bed would satisfy a loudness ceiling and fail this one, which is why
the ceiling is stated over the source's existence rather than over a level.

**PASS.** ADR-023 §5's five conditions are each independently sufficient to
silence the bed — proven in `ambience.test.ts` — and this is the fourth of
them proven end to end in a real process rather than argued. It is what makes
continuous audio an amendment to ADR-016 §4 rather than a reversal of it.

---

## 14. Phase-17 combined measurement (criterion 12)

Taken 2026-08-15 with the same harness and on the same machine as §13 — a
fast desktop, so the same caveat holds: this is a ceiling check, not a floor.
Evidence: `docs/perf/criterion-12-combined.json`. It closes the item
phase-16 left open: _"Performance budgets hold with weather, lighting, and
audio active — individually yes. Together, unmeasured."_

**Scenario — everything at once, on the reference farm.** The
`v1-mature-farm` fixture, loaded through the real pipeline and stepped to the
start of a weather period that rains (derived from the seed — rain then holds
for the full five-minute period, longer than the measured window). Overlay
expanded (lighting layer live), ambient bed unmuted and raised to 100, every
motion class on including both unbounded ones, pointer kept active for 90 s.

### The tick, under combined load

| Statistic | Measured     | Budget     |
| --------- | ------------ | ---------- |
| p50       | 0.200 ms     | —          |
| p95       | 0.300 ms     | —          |
| **p99**   | **0.500 ms** | **< 3 ms** |
| mean      | 0.168 ms     | —          |
| max       | 2.400 ms     | —          |
| samples   | 1,937        | > 500      |

**PASS**, six-fold inside budget. This is the v0.3 baseline: NPCs, a
settlement, and contracts all grow this number, and `PLAN.md` §4 requires
profiling against it before entities are added.

### The surrender, under combined load

| State                      | Ambient bed  | Animation leases |
| -------------------------- | ------------ | ---------------- |
| Raining, pointer active    | on, gain 0.6 | 5                |
| Raining, pointer idle 14 s | **off**      | 3                |

**PASS** for the presence-gated systems: the bed silenced while it was still
raining (so "off" can only mean presence expired), and rain plus decor sway
released their leases. Rain's visual surrender is additionally pinned against
the real dirty gate in `src/renderer/render/rain-view.test.ts`.

### The finding: no zero-frame idle on a mature farm

FPS read **100 in both states** — the frame loop did not stop when the
pointer left, and that is not a regression of the §4.2 invariants. Workers
keep farming unwatched; every harvest re-arms a transient gameplay animator
(crop departure, floating numbers, particles) faster than the last finishes,
and worker movement marks the gate dirty every tick regardless. The §4.2
zero-frame invariants are claims about a **static** world and still hold
(criteria 8 and 9 prove them where nothing else moves).

Consequence for this document: §3's "expanded idle" state does not occur on
a mature farm — an expanded, unattended farm runs in the "expanded active"
cost profile indefinitely. Collapsed mode is unaffected (Pixi destroyed,
ADR-001 §2). Whether gameplay-feedback animators should be presence-gated
like ambient motion is an open design question assigned to v0.3's NPC work —
`docs/phases/phase-17-v03-baseline.md` §3 states it with the data.

> **Re-measured 2026-08-15 (phase-18)** on the widened 80×64 world with the
> founded village standing: p99 tick **0.4 ms**, mean 0.153 ms, surrender
> intact — inside the phase-17 baseline, differing by less than the clock's
> 0.1 ms coarsening, so the honest claim is "unchanged". The evidence file
> also now records `awayPointerMoves`: the surrender assertion is skipped as
> environment-blocked when a real pointer crossed the window during the away
> wait, because a watched farm keeping its bed on is the feature working.

### Criterion 11 — heap under sustained effect density

`docs/perf/criterion-11-heap.json`. 30 minutes, 298 samples at 5 s, every motion
setting on including both unbounded classes, with the pointer nudged every
1.5 s so ambient motion stayed alive throughout.

|                             | Measured   |
| --------------------------- | ---------- |
| Soak length                 | 30 min     |
| Samples with motion running | **99.7%**  |
| Heap, first quarter         | 11.3 MB    |
| Heap, last quarter          | 14.5 MB    |
| **Growth**                  | **3.2 MB** |
| Peak                        | 14.5 MB    |
| Ceiling                     | 25 MB      |

**PASS against the ceiling**, with the shape recorded because the shape is the
actual finding:

```
11.3 MB ── flat for 20.0 min (198 samples)
            └─ one step at t=19.99 min
14.5 MB ── flat for 10.0 min (100 samples)
```

**One step, then flat — not a trend.** A per-frame or per-effect leak produces
progressive growth; twenty minutes flat, a single step, then ten minutes flat is
the signature of a one-time allocation, a V8 heap-growth heuristic, or the
quantised reading crossing a bucket boundary. Extrapolating the 3.2 MB linearly
to eight hours would give ~51 MB and breach the ceiling, and that extrapolation
would be **wrong**: the data shows it is not linear.

#### Two limitations, stated rather than smoothed over

**The instrument is quantised.** `performance.memory.usedJSHeapSize` reported
exactly two distinct values across 298 samples (11.3 and 14.5). Chromium
deliberately coarsens this figure, so the measurement can bound growth below its
bucket size but cannot demonstrate byte-level stability, and cannot distinguish a
real 3.2 MB allocation from a single bucket crossing. `tests/memory-longrun.test.ts`
measures the SIMULATION heap byte-precisely with `process.memoryUsage()`; the
renderer has no equivalent in-page. The better instrument is CDP
`Runtime.getHeapUsage` through a Playwright session, and that is the improvement
to make before this number is trusted more finely than "well under 25 MB".

**The first attempt at this soak was invalid, and is kept.** It moved the pointer
once per 5 s sample, and the four IPC metric reads in each iteration pushed the
gap past the 8 s presence timeout — so **66% of that run was idle** and it
measured the cheap state the test exists to avoid, while still reporting a
confident 0.00 MB. It is preserved as
`criterion-11-heap.INVALID-33pc-active.json` because a measurement that looked
clean and measured the wrong thing is worth more as a warning than as a deleted
file. The harness now reports `activeShare` and asserts it exceeds 0.8, so the
same mistake fails loudly instead of passing quietly.

---

## 15. Phase-27 measurement — what the wilds cost the tick

Headless, `stepSimulationBy` in 100-tick batches, 120,000 ticks, three workers,
seed 4242 — a plain farm crew against a crew of foragers, so the delta is the
gathering band and nothing else.

| Crew    | mean      | p50    | p95    | p99        | max    |
| ------- | --------- | ------ | ------ | ---------- | ------ |
| Farm    | 0.0341 ms | 0.0329 | 0.0433 | **0.0663** | 0.2116 |
| Forager | 0.0317 ms | 0.0310 | 0.0408 | **0.0477** | 0.6564 |

**PASS**, both roughly fifty times inside the 3 ms p99 budget (§65's row).

**The forager crew is cheaper, and that is the expected direction.** Foragers
spend most of their time walking, and walking a path is cheaper per tick than
the full-farm harvest scan a farmhand runs on every replan. The wild scan is
bounded to the 32-column band rather than the world, runs at most once per
`IDLE_REPLAN_TICKS`, and — since ADR-037 §4's amendment made gathering
last-resort — runs only when every nearer band came back empty.

`harvestedAt` finished the forager run at **132 entries**, which is the
bounded-by-regrow-period claim measured rather than asserted: it is bounded by
how many nodes were worked in the last regrow window, never by how long the
game has been running (`SAVE_FORMAT.md` §11.1).

### What this measurement does not cover

**The renderer's half.** This is `process`-side only: the node layer adds ~276
static sprites in one atlas and one batch, holds no animation lease, and writes
to a sprite only when the `wilds` slice republishes — but none of that is
measured here. Phase 30's RC gate set measures the running app; phase 29 weighs
the combined tick against ADR-003 §2's worker-migration trigger.

**Any world older than 120,000 ticks.** The bound on `harvestedAt` is
structural (an entry is pruned when its node regrows), and 120,000 ticks is
about 100 minutes of play. The long-run suites cover eight hours; this one does
not claim to.

---

## 16. Phase-28 measurement — the tick under a real v0.4 farm

Headless, `stepSimulationBy` in 100-tick batches, 200,000 ticks, three hands,
twenty-four crops in the ground, a shed, seed 4242. This is the load phase 27's
measurement did not have: an **empty** farm measures an idle simulation.

| Crew     | mean      | p50    | p95    | p99        | max    |
| -------- | --------- | ------ | ------ | ---------- | ------ |
| All home | 0.3920 ms | 0.3863 | 0.4349 | **0.5261** | 0.7663 |
| One away | 0.4255 ms | 0.4012 | 0.5581 | **0.8359** | 0.9281 |

**PASS** — p99 **0.53 ms** against §65's 3 ms budget, roughly six times inside
it, and the same number ADR-003 §2 names as the worker-migration trigger.
**The trigger is not met.**

### Two things this measurement is honest about

**The jump from phase 27's 0.048 ms is the CROPS, not the expeditions.** Phase
27 profiled a farm with nothing planted, which measures an idle world; growth,
harvest scanning, and the deposit path are what the ten-fold difference buys.
Comparing the two numbers directly would be comparing two different farms.

**The second row is not a clean comparison.** The river delta trip is 3,600
ticks and the run is 200,000, so the hand is home for 98% of it — the gap
between the rows is run-to-run variance, not a measured cost of being away. It
is kept rather than dropped because a phase that reports only its conclusive
measurements is reporting a selection.

### What it does not cover

The renderer, and the running app. This is `process`-side only. Phase 29 owns
the combined figure against ADR-003 §2, and phase 30's RC gate set measures the
app.

---

## 17. Phase-29 measurement — the v0.4 tick against ADR-003 §2's trigger

**This is the measurement that decided phase 29.** ADR-003 §2 pre-committed the
condition for moving the simulation off the main thread, and `PLAN.md` §5.1
sequenced the phase last in v0.4 so the version's own load would exist to test
it against.

`docs/perf/phase-29-v04-tick.json`, taken in the **running app**, on a save the
game could genuinely have written: 36 crops, 6 hands, 13 buildings, a
three-step chain with **both links routed**, a forager working the wilds, a
hand away on an expedition, contracts on the docket. Expanded, every motion
class on, the debug overlay open — criterion 12's presentation load.

| Statistic | Measured     | Trigger  |
| --------- | ------------ | -------- |
| p50       | 0.200 ms     | —        |
| p95       | 0.300 ms     | —        |
| **p99**   | **0.400 ms** | **3 ms** |
| mean      | 0.187 ms     | —        |
| max       | 6.900 ms     | —        |
| samples   | 1,272        | > 500    |
| FPS       | 93.1         | —        |

**PASS, and the trigger is NOT MET** — the p99 is roughly seven times inside
it. The second clause, _tick execution measurably delaying frame
presentation_, is not met either: the renderer held 93 FPS with the simulation
ticking at 20 Hz on the same thread.

### The 6.9 ms max, stated rather than buried

One sample in 1,272 crossed the budget by more than double. The p95 and p99 sit
at 0.3 and 0.4 ms, so the distribution is not approaching the ceiling from
below — it has one outlier a long way from the body, which is what a
garbage-collection pause looks like rather than a tick that does more work. The
trigger is written on the p99 for exactly this reason.

It is worth re-reading at the RC, and FPS is measured alongside for the same
reason: if the outliers ever became a pattern, the frame-presentation clause is
the one that would catch them.

### Three runs, and the number is a range

| Run                        | p50 | p95 | p99     | max | FPS  |
| -------------------------- | --- | --- | ------- | --- | ---- |
| Before the boundary change | 0.2 | 0.3 | 0.5     | 7.0 | 94.0 |
| After the boundary change  | 0.2 | 0.3 | **0.4** | 6.9 | 93.1 |
| At the RC (frozen code)    | 0.2 | 0.3 | **0.5** | 8.0 | 93.5 |

**p99 is 0.4–0.5 ms across three runs**, and the differences are run-to-run
variance rather than an improvement or a regression — moving two reads from the
live world to the snapshot removes two property lookups per frame, which is not
measurable and was never claimed to be. All three are recorded so the number is
a range rather than a single flattering sample.

The max drifts 6.9–8.0 ms across the same three runs, always one sample in
~1,270, always with p95 and p99 an order of magnitude below it. That is the
shape of a GC pause and not of a tick doing more work.

### v0.4 criterion 3 — entity and building counts

Read from the same overlay in the same run as the tick, so the figure and the
scene it was measured on are one measurement:

| Metric          | Measured |
| --------------- | -------- |
| Visible sprites | **515**  |
| Buildings       | 13       |
| Workers (live)  | 5        |
| Crops           | 3        |
| Containers      | 7        |

**PASS.** 515 sprites is a scene that batches — the wilds' ~276 static nodes
are the bulk of it, and they hold no animation lease, so they cost nothing per
frame once drawn.

**The worker count is 5 against a save holding 6**, and that is the design
showing up in a metric rather than a discrepancy: a hand on an expedition is
absent from the workers slice (ADR-038 §2), and the overlay reads the slice.
The crop count is 3 because the crew harvested the other 33 during the 60-second
settle, which is the farm working.

---

## 18. Phase-52 measurement — the v0.5 cost, and a correction

Every number below was taken fresh for the v0.5 release candidate, in the
running app, on an otherwise idle machine. The artefacts are the ones the E2E
criteria write: `docs/perf/criterion-5-tick.json`,
`criterion-13-unattended-farm-cost.json`, `criterion-12-combined.json` and
`phase-29-v04-tick.json`.

### 18.1 The headline: phase 46's regression does not reproduce

Phase 46 measured the world track's cost and reported a real regression — the
tick average up 65% and unattended CPU roughly doubled. **Re-measured at the
RC, it is not there.**

| Measure                     | Before the world track | Phase 46 | **RC (fresh)** |
| --------------------------- | ---------------------- | -------- | -------------- |
| Tick average (criterion 5)  | 0.063 ms               | 0.104 ms | **0.060 ms**   |
| Tick p99 (criterion 5)      | 0.2 ms                 | 0.3 ms   | **0.2 ms**     |
| Unattended CPU, mean        | 0.595%                 | 1.058%   | **0.533%**     |
| Unattended CPU, max         | 0.835%                 | 2.013%   | **0.818%**     |
| Tick average (criterion 12) | 0.175 ms               | —        | **0.172 ms**   |
| Heap, unattended farm       | 12.8 MB                | 13.6 MB  | **14.5 MB**    |

The same load measured against v0.4's own scenario says the same thing:
`phase-29-v04-tick` — six workers, 36 crops, 13 buildings, a routed chain, a
forager, an expedition out — was **0.187 ms average / 0.400 p99** at v0.4 and
is **0.145 ms average / 0.400 p99** now, with 547 visible sprites where v0.4
had fewer.

### 18.2 What phase 46 actually measured

Its own record says the first reading was worse still (0.133 ms) and was taken
**while the machine was building**, and that re-measuring idle gave 0.104. The
RC reading says the load was not partly responsible — it was responsible.

The hypothesis phase 46 offered for a real component — that a 3×3 mill blocks
nine tiles where it blocked one, so routes explore more grid — was plausible,
was explicitly **stated as unproven rather than bisected**, and is not
supported by any measurement now available. It is withdrawn rather than
quietly dropped: a hypothesis that shaped a written conclusion should be
withdrawn in the same place.

**The lesson is about method, not about footprints.** A performance number
taken on a busy machine is not a performance number. Phase 46 knew that,
re-measured once, and still reported a regression built on a reading taken
minutes after a build. Every number in this section was taken with nothing
else running, which is why they disagree.

### 18.3 The one thing that did go up

**Heap, 12.8 → 14.5 MB on the unattended farm** — about 13%, consistent across
readings, and by far the most likely candidate for a genuine v0.5 cost: the
art set went from 166 sprites to 237 across the same five atlases, and the
renderer holds them.

Against `memory-longrun`'s 25 MB ceiling that is comfortable, and the
576,000-tick heap-growth soak still passes. It is stated here so that the next
version's measurement has something to compare against rather than
rediscovering it.

### 18.4 Every budget, at the RC

| Budget                              | Limit | Measured                     | Verdict |
| ----------------------------------- | ----- | ---------------------------- | ------- |
| Simulation tick p99                 | 3 ms  | 0.2 ms                       | PASS    |
| Simulation tick p99, full v0.4 load | 3 ms  | 0.4 ms                       | PASS    |
| Unattended CPU                      | —     | 0.533%                       | PASS    |
| Heap, unattended farm               | 25 MB | 14.5 MB                      | PASS    |
| Idle frame loop                     | quiet | no dirty frames, leases only | PASS    |

**ADR-003 §2's trigger for moving the simulation off the main thread (p99 > 3
ms) remains unmet, by roughly an order of magnitude**, which is why phase 29
stayed CONDITIONAL and stays so.

---

## 19. Phase-61 measurement — what v0.6's content costs the tick loop

**One number, measured, and it is a runner number rather than a game one.**

`tests/memory-longrun.test.ts` steps a reference farm through 576,000 ticks —
eight accelerated hours — and asserts heap growth stays under 25 MB. At the v0.6
content freeze:

|                                      |                                               |
| ------------------------------------ | --------------------------------------------- |
| Wall-clock, alone on an idle machine | **502 s**                                     |
| Wall-clock, inside the full suite    | **605 s** (timed out at the old 600 s budget) |
| Heap growth                          | **inside the 25 MB ceiling**                  |

**The ceiling passed. The stopwatch did not.** That distinction is the whole of
this section: v0.6 did not make the simulation leak, it made it slower to
simulate — twelve crops where there were four, twenty-nine items where there
were thirteen, nine recipes where there were two. The tick loop resolves more
content per tick, and 576,000 ticks multiply it.

**What is NOT claimed here.** This is not a per-tick cost measurement. It is a
wall-clock figure for a test harness under Vitest, and §10.1's rule stands: the
simulation's real cost is measured deliberately, uninstrumented, on a quiet
machine. What this number is good for is sizing a timeout, and that is what it
was used for — the budget went to 900 s, with the measurement recorded beside
the constant.

**What would be worth measuring next**, and is not measured here: whether the
per-tick cost of the market scales with the ITEM COUNT. Twenty-nine items is
still small, but the shape of that relationship decides whether a v0.7 content
pass is free or expensive, and nothing currently answers it.

---

## 20. Phase-63 measurement — the v0.6 RC, on a quiet machine

**Taken twice, and only the second reading is reported.** The first was taken
while six commits ran lint-staged in the background, which is precisely the
mistake §18.2 was written about after phase 46 reported a regression built on a
reading taken minutes after a build:

> **A performance number taken on a busy machine is not a performance number.**

Those artefacts were discarded rather than published. Everything below was
measured with nothing else running.

### 20.1 Against v0.5

| Measure                      | v0.5 RC  | **v0.6 RC**                | Budget           |
| ---------------------------- | -------- | -------------------------- | ---------------- |
| Tick average (criterion 5)   | 0.060 ms | **0.106 ms**               | < 0.5 ms avg     |
| Tick p99 (criterion 5)       | 0.2 ms   | **0.3 ms**                 | < 3 ms p99       |
| Tick average (criterion 12)  | 0.172 ms | **0.269 ms**               | < 0.5 ms avg     |
| Tick average, full v0.4 load | 0.145 ms | **0.280 ms**               | < 0.5 ms avg     |
| Tick p99, full v0.4 load     | 0.400 ms | **0.600 ms**               | < 3 ms p99       |
| Unattended CPU, **mean**     | 0.533%   | **0.975%**                 | < 1.0% target    |
| Unattended CPU, **max**      | 0.818%   | **2.026%**                 | **2.0% ceiling** |
| Heap, unattended farm        | 14.5 MB  | **12.8 MB**                | 25 MB            |
| Idle frame loop              | quiet    | **0 fps, no dirty frames** | quiet            |

### 20.2 The tick roughly doubled, and that is content

Every tick figure is up by 70–95%: the loop resolves twelve crops where it
resolved four, thirty-six items where it resolved thirteen, nine recipes where
it resolved two. That is the cost of the version, it is visible in four
independent scenarios, and it is **still five times inside the average budget
and ten times inside the p99 one.**

**ADR-003 §2's trigger for moving the simulation off the main thread — p99 above
3 ms — remains unmet by a factor of five**, so phase 29 stays CONDITIONAL. It is
worth noting that v0.6 halved the margin: 0.3 ms against 0.2 ms. Another
doubling of content would still clear it; three more would not.

### 20.3 The one number over its ceiling, reported rather than rounded

**Unattended CPU max read 2.026% against a 2.0% ceiling.** It is over by
0.026 percentage points — 1.3% relative — on one sample of sixty, and it is
still reported as over, because a ceiling that gets rounded down when it is
nearly met is not a ceiling.

**What is known about it:**

- The **mean is inside its target** at 0.975% against < 1.0%, which is the
  figure that describes what the machine actually spends over 90 seconds.
- This exact reading has appeared before. Phase 46 measured **2.013% max** and
  the v0.5 RC measured **0.818%** — so this number is spiky rather than steady,
  and one sample in sixty is setting it.
- Nothing identifies the spike. It could be a GC pause, an autosave landing
  inside a sample window, or a snapshot republish; **none of those has been
  bisected**, and guessing here is what §18.2 warns against.

**Verdict: PARTIAL.** Every other budget passes with room. This one is a
marginal, reproducible-looking breach of a ceiling by a single sample, on a
metric whose mean is inside target — and characterising it properly needs more
samples than a release gate takes, which is work rather than a decision.

### 20.4 Heap went DOWN, which was not expected

12.8 MB against v0.5's 14.5 MB on the same unattended-farm scenario, with 56
more sprites in the atlases. §18.3 attributed v0.5's 12.8 → 14.5 MB rise to the
art set growing, and predicted the next version would want something to compare
against. It now has one, and it points the other way.

**No explanation is offered**, because none has been measured. It is recorded so
the next version inherits the observation rather than the assumption.
