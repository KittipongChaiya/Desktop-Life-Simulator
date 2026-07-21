# ADR-007: 20 Hz Fixed-Timestep Simulation, Decoupled from Rendering

|                   |                               |
| ----------------- | ----------------------------- |
| **Status**        | Accepted                      |
| **Date**          | 2026-07-21                    |
| **Deciders**      | Project owner, lead architect |
| **Supersedes**    | —                             |
| **Superseded by** | —                             |

---

## Context

The tick model determines determinism, save correctness, offline-progress accuracy, animation smoothness, and CPU cost. It is also nearly impossible to change later: once content is balanced in tick units and saves record tick counts, altering the rate changes every growth time, every price accrual, and the meaning of every stored `lastTick`.

Requirements pulling on the decision:

- **Determinism.** ADR-002, ADR-003, and ADR-004 all depend on identical inputs producing identical state — for save round-trips, reproducible bugs, and eventual multiplayer.
- **Idle cost.** `VISION.md` §2.1 makes background CPU a product feature. Tick cost is paid every second for eight hours, whether or not anyone is looking.
- **Responsiveness.** The tick is the granularity of player action; ADR-003 §5 applies intents on tick boundaries. Tick period is a floor on input latency.
- **Movement quality.** Workers walking between tiles are the most visible continuously-moving thing in v0.1. Tick rate sets how much interpolation must cover.
- **Roadmap headroom.** v1.0 adds combat, projectiles, and city defense — systems with meaningfully tighter timing needs than crop growth.

---

## Decision

**The simulation advances at a fixed 20 Hz (50 ms per tick). Rendering runs independently, uncapped, targeting the display refresh rate, and interpolates between the last two simulation states.**

```ts
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 50;
export const MAX_CATCHUP_TICKS = 5;
```

### 1. Fixed timestep, never variable

Systems never receive a delta time. A tick is a tick.

```ts
export function growthSystem(world: World): void; // note: no dt parameter
```

Variable timesteps make identical inputs produce different results depending on frame timing, which destroys determinism and therefore save correctness, reproducibility, and any future networking. Passing `dt` into a system is a defect, not a style preference.

Time inside the simulation is **the tick counter and nothing else**. `Date.now()` and `performance.now()` are unavailable in `src/sim` by compile configuration (`TECH_STACK.md` §3.1).

### 2. Why 20 Hz

| Rate      | Tick budget for movement | Assessment                                                                                                   |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1 Hz      | 1000 ms                  | Fine for growth, unusable for anything that moves                                                            |
| 10 Hz     | 100 ms                   | Adequate for v0.1; 100 ms input latency is perceptible; heavy interpolation load; too coarse for v1.0 combat |
| **20 Hz** | **50 ms**                | **Chosen.** Imperceptible input latency, smooth interpolation, ample headroom, still cheap                   |
| 60 Hz     | 16.7 ms                  | 3× the CPU for no gameplay benefit; ties sim to display rate                                                 |

20 Hz is the rate at which the tick stops being a felt constraint on design while remaining a negligible cost. At the entity counts in ADR-004 (~10,000 entity-ticks/sec at v0.1), a tick is expected in the tens of microseconds — roughly 0.1% of one core.

It is also a familiar interval: 20 Hz is Minecraft's tick rate, and content authors and future sessions reason about "ticks" in units that map cleanly to seconds (20 ticks = 1 second, 1200 ticks = 1 minute).

**Doubling from 10 Hz doubles a cost that is negligible and buys headroom in the dimension the roadmap actually needs.** That is the trade being made.

### 3. Accumulator loop with a spiral-of-death guard

```ts
let accumulator = 0;
let previous = performance.now();

function frame(now: number): void {
  accumulator += Math.min(now - previous, MAX_CATCHUP_TICKS * TICK_MS);
  previous = now;

  let ticked = 0;
  while (accumulator >= TICK_MS && ticked < MAX_CATCHUP_TICKS) {
    stepSimulation(world); // exactly one fixed tick
    accumulator -= TICK_MS;
    ticked += 1;
  }

  renderIfDirty(world, accumulator / TICK_MS); // alpha for interpolation
}
```

`MAX_CATCHUP_TICKS = 5` (250 ms) caps how much a stall can be made up in one frame. Without it, a long pause makes the next frame run hundreds of ticks, which takes longer than a frame, which grows the backlog further — the classic spiral of death. Time beyond the cap is **discarded**, not accumulated; a gap longer than 250 ms is a stall, and stalls longer than a threshold are handled by the offline-progress path instead (§6).

**Note the ordering:** the accumulator drives ticks, and rendering happens after, gated by ADR-001's dirty check. Ticking does not force a render. A tick where nothing visible changed renders nothing.

### 4. Fixed, explicit system order

Order is data, declared in one file, not implied by registration:

```ts
export const TICK_SYSTEMS = [
  intentSystem, // apply queued player intents on the tick boundary
  growthSystem, // crops advance
  workerSystem, // AI decisions, task assignment
  movementSystem, // pathing steps
  harvestSystem, // completed harvests → inventory
  economySystem, // prices, accrual
  eventFlushSystem, // dispatch queued events to listeners
  snapshotSystem, // publish changed slices to views
] as const;
```

Correctness-critical orderings are documented and tested:

- `intentSystem` first — a player's action takes effect on the tick it lands, not the next.
- `growthSystem` before `harvestSystem` — a crop maturing this tick is harvestable this tick.
- `snapshotSystem` last — views observe a fully settled state, never a half-stepped one.

#### 4a. The scheduler (phase-02.5)

`TICK_SYSTEMS` is executed by a **`SimulationScheduler`**. Systems register into
a **named phase**; the phase array is the authoritative order.

```
PHASE_ORDER = preUpdate → world → crops → workers → economy → postUpdate
```

**Registration associates a system with a phase. It never decides where that
phase runs.** This is the whole point: if execution order were the order systems
happened to register, it would become a function of import order, bundler
behaviour, and filenames — and determinism would be an accident rather than a
guarantee.

Within a phase, order is registration order, which is itself deterministic
because registration happens from one explicit list at startup.

The scheduler **validates at construction and fails fast**: a duplicate system
name or an unknown phase throws while the world is being built, not on tick
40,000. `tickOrder()` exposes the resolved order so tests assert it directly —
`snapshot` last, `eventFlush` before it, `tickEvent` before that.

#### 4b. Pause and resume (phase-02.5)

Pause is a **development capability**, not a game feature. There is no pause in
the shipped product: an idle game you can pause is a contradiction, and
`VISION.md` §2.2 makes running-while-away the entire premise.

Paused means the accumulator still drains but no tick is stepped, so unpausing
does **not** replay the paused duration as a burst. `step(n)` advances an exact
number of ticks while paused, which is what makes the devtools `tick 40` command
deterministic.

#### 4c. Time scaling (phase-02.5)

Scaling multiplies **how many ticks a frame produces**. It never changes
`TICK_MS`.

That distinction is the entire design. A scale that stretched tick duration
would make tick counts stop mapping to game time, silently corrupting every
authored duration, every stored `lastTick`, and the offline-progress maths
(§6, §7). Multiplying tick count means a scaled run visits **exactly the same
tick states** as an unscaled one, just sooner — verified by a test asserting
identical RNG state after 4x-for-1s versus 1x-for-4s.

The accumulator's `MAX_CATCHUP_TICKS` cap still applies, so no scale can defeat
the spiral-of-death guard (§3).

Development and testing only.

### 5. Rendering interpolates; it never simulates

The renderer receives `alpha ∈ [0, 1)` — the fraction of a tick elapsed — and interpolates positions between the previous and current simulation state. A worker crossing a tile in 50 ms renders smoothly at 144 Hz without the simulation knowing the display exists.

**Interpolation is a rendering concern only.** Interpolated values never re-enter the simulation. This is what keeps the sim authoritative and the renderer disposable (ADR-003 §4).

Render rate is uncapped and gated by ADR-001's dirty check, so it is _display refresh when something moves, and zero when nothing does_.

### 6. Offline and long-stall progress is computed, not ticked

Above a threshold gap — app suspended, machine slept, save loaded after hours — running the missed ticks is forbidden (ADR-002 §6). Eight hours is 576,000 ticks; replaying them would hang the app on launch.

Each accruing system implements:

```ts
catchUp(state: SystemState, ticks: number): void
```

as a closed-form computation with a documented accuracy contract. Specification and per-system contracts: `SAVE_FORMAT.md` §Offline Progress.

The threshold, the accuracy contract, and the tests asserting that `catchUp(n)` stays within bounds of `n` real ticks are all part of phase-07.

### 7. Content is authored in ticks

Growth times, cooldowns, and accrual rates are expressed in ticks, with `TICKS_PER_SECOND` used to convert at authoring time for readability:

```ts
growthTicks: 60 * TICKS_PER_SECOND,   // 60 seconds — reads clearly, stores as 1200
```

Storing seconds and converting at runtime would introduce floating-point drift into the simulation and break determinism.

**Consequence, stated plainly: `TICKS_PER_SECOND` is effectively frozen once content ships.** Changing it later rescales every balance number and invalidates the meaning of every stored tick count. It would require a save migration touching nearly every field. This is precisely why the rate is being decided now, before content exists, rather than discovered later.

---

## Alternatives Considered

### A. 10 Hz fixed timestep

- **For:** half the CPU; sufficient for crop growth and the v0.1 loop.
- **Against:** 100 ms input latency is perceptible on a click. Interpolating movement across 100 ms tolerates less error before looking wrong. Too coarse for v1.0 combat, and the rate cannot be raised later without invalidating all content and saves (§7).
- **Rejected because:** the CPU saving is negligible in absolute terms while the ceiling is permanent.

### B. 60 Hz fixed timestep

- **Rejected because:** 3× the cost of 20 Hz for gameplay that needs none of it, in an app whose defining constraint is idle cost. It also invites tying simulation to display rate, which is the anti-pattern in alternative D.

### C. Variable timestep (`dt` passed to systems)

- **Rejected because:** it destroys determinism, and with it save round-trip correctness, reproducible bug reports, property-based testing, and any future networking. This is not a tradeoff — it forfeits properties several other ADRs depend on.

### D. Render-driven ticking (one tick per animation frame)

- **Rejected because:** simulation speed would depend on the display's refresh rate, so a 144 Hz monitor would run the game 2.4× faster than a 60 Hz one. It also breaks entirely under ADR-001's render-on-demand, where frames stop when nothing is visibly changing — the simulation would simply halt.

### E. Adaptive tick rate (slow down when idle, speed up when active)

- **For:** superficially attractive for an idle game — why tick 20 times a second on a farm where nothing happens?
- **Against:** it makes tick duration variable, so tick counts no longer map to real time, which breaks §7's content model, save `lastTick` semantics, and offline math. It reintroduces alternative C's problems in a subtler, harder-to-debug form.
- **Rejected because:** the correct solution to "nothing is happening" is a cheap tick, not a variable one. A tick over a sleeping world should cost near zero because its systems iterate nothing — that is a data-structure question (ADR-004), not a scheduling one.

---

## Tradeoffs Accepted

| We accept                                   | To gain                                               | Mitigation                                                     |
| ------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| 2× the tick cost of 10 Hz                   | Latency headroom, smooth interpolation, room for v1.0 | Absolute cost is ~0.1% of a core; budgeted in `PERFORMANCE.md` |
| `TICKS_PER_SECOND` is effectively immutable | Deterministic, drift-free content                     | Decided before any content exists; §7 states the consequence   |
| Interpolation complexity in the renderer    | Smooth motion decoupled from tick rate                | Confined to the render layer; sim unaffected                   |
| Discarding time past the catch-up cap       | No spiral of death                                    | Long gaps routed to offline catch-up (§6)                      |
| Every accruing system needs a `catchUp`     | Instant load after hours away                         | Required by ADR-002 anyway; contracts tested                   |
| Manual system ordering                      | Explicit, deterministic, debuggable                   | One declaration site; critical orderings tested                |

---

## Consequences

### Immediate

- `TICKS_PER_SECOND`, `TICK_MS`, and `MAX_CATCHUP_TICKS` live in `src/shared/constants.ts` and are imported everywhere. No literal `20` or `50` in tick-related code.
- The accumulator loop is built in phase-00 alongside the headless sim harness, before any system exists.
- The seeded RNG (`VISION.md` §4.2) is injected into `World` from the first tick.
- Every content definition expresses durations in ticks (§7).

### Ongoing

- No system takes `dt`. No system reads a clock.
- A new system that accrues value over time must implement `catchUp` in the same commit.
- A new system is inserted into `TICK_SYSTEMS` at a deliberate position, with any ordering dependency commented and tested.
- Tick duration is a tracked budget line; p99 tick time above 3 ms triggers the worker migration in ADR-003 §2.

### Validation

- **Determinism test:** identical seed and intent sequence produce byte-identical world state after 100,000 ticks. This is the single most important test in the repository — it is the property ADR-002, ADR-003, and ADR-004 all build on.
- **Order test:** a crop maturing on tick N is harvestable on tick N.
- **Schedule test:** `tickOrder()` ends with `snapshot`, and `eventFlush`
  precedes it. Phase order is independent of registration order.
- **FPS-independence test:** 30 fps and 144 fps produce an identical tick count
  over the same wall-clock span.
- **Scaling test:** a scaled run reaches the same RNG state as an unscaled run
  covering the same simulated time.
- **Catch-up accuracy test:** `catchUp(state, n)` stays within each system's documented tolerance of running `n` real ticks.
- **Spiral guard test:** a simulated 10-second stall advances at most `MAX_CATCHUP_TICKS` in the following frame and does not compound.
- **Occlusion test** (from ADR-003): ticks continue while the window is fully covered.

### Revisit if

- v1.0 combat demands sub-50 ms resolution → prefer sub-tick interpolation within combat systems over raising the global rate, given §7.
- p99 tick exceeds 3 ms → move the simulation to a worker (ADR-003 §2). Do **not** lower the tick rate to compensate; that trades a fixable engineering problem for a permanent design constraint.
