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

| Invariant                                                              | Test                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| No `requestAnimationFrame` fires when the world is static (ADR-001 §1) | `tests/e2e/idle-cost.spec.ts` — zero callbacks over 10 s |
| No React commit occurs when no snapshot slice changed (ADR-005 §2)     | Same file — zero commits over 10 s                       |

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

The draw-call ceiling is the direct measurement of whether atlasing works (ADR-006 §3). A static 64×64 farm should cost ~16 terrain chunk quads plus a handful of sprite batches — if it costs hundreds, textures are not batching and the reason for choosing PixiJS has evaporated.

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

> **`v1-mature-farm`** — 16×16 owned plot, 200 planted crops of mixed types, 5 workers, 4 buildings, ~40 inventory stacks, 8 hours of playtime.

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
