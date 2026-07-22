# Phase 04 — Worker AI

> **Delivers:** Autonomous workers that farm on their own. **The emotional core of v0.1.**
> **Runnable at completion:** A hired worker walks to a mature crop, harvests it, plants a new seed, and keeps going without input. Stage 2 of the progression arc.

---

## Delivery status

This phase is built in three sequenced milestones, each independently verifiable.

| Milestone | Scope                                                                                    | Status        |
| --------- | ---------------------------------------------------------------------------------------- | ------------- |
| **04a**   | Worker entity, hiring, task selection, the never-jam FSM, energy — headless, teleporting | **Delivered** |
| **04b**   | Deterministic A* pathfinding, real movement at §4.3 timings                              | **Delivered** |
| **04c**   | Snapshot slice, entity rendering + animation, worker selection, HUD hire button, art     | Pending       |

**04a delivered** — the autonomous farm loop runs headlessly through the command dispatcher:

- `src/sim/world/worker.ts` — `Worker` record, five-state enum, `WorkerStore`, energy math
- `src/sim/ai/worker-tasks.ts` — pure fixed-priority, nearest-first, lowest-index tie-break selection
- `src/sim/systems/worker.ts` — the FSM driver; workers act only as `worker`-tagged commands
- `src/sim/commands/worker-commands.ts` — `hireWorker`; cost `floor(150 × 1.6^n)`
- Actions submit through the same dispatcher and validators as the player (no privileged path)
- Criteria met: **3, 4, 5, 6, 7, 8, 17, 18, 19, 23, 24** (never-jams, claiming, energy, hire cost, 8-hour unattended, 100k-tick determinism). Criteria 1–2 pass headlessly; their E2E verification lands in 04c.
- Deferred with rationale: `workerHired` event waits for its HUD consumer in 04c; `carrying`/deposit is a reserved field until inventory exists (phase-05).

**04b delivered** — workers now walk their routes instead of teleporting:

- `src/sim/pathing/astar.ts` — 4-directional A*, deterministic (lowest-index tie-break, fixed N/E/S/W order), explicit `PathUnreachable` failure
- `src/sim/systems/movement.ts` — advances `Moving` workers at §4.3 timings; recomputes the route when the grid changes; abandons cleanly to Idle if the goal is sealed
- `core:path` tile kind registered (0.7 move cost → 7 ticks vs grass's 10, the §2.2 1.5× speed); no path-laying mechanic ships in v0.1
- Movement runs after the decision in the same `workers` phase, so deciding to work costs no wasted tick; energy drains while moving
- Criteria met: **9, 10, 11, 12, 13, 14, 15**, and criterion 24 re-verified with real movement. Criterion 16 (60 FPS render) is manual, arriving with rendering in 04c.

---

## Objectives

1. Deliver the moment the player stops _performing_ the loop and starts _designing_ it (`VISION.md` §3.4).
2. Build a worker FSM that **can never deadlock**.
3. Implement deterministic pathfinding.
4. Prove smooth interpolated movement at 20 Hz.

### Why this phase matters most

`VISION.md` §6.3 makes the first worker hire a success criterion for the whole version. Everything before this phase exists to make that moment feel earned; everything after exists to prove the promise was real.

It is also where the "never punish absence" rule (`VISION.md` §2.2) becomes load-bearing: automation that jams while the player is away is the exact failure the product cannot have.

---

## Deliverables

### Worker entity

- [ ] `src/sim/world/worker.ts` — `Worker` record (ADR-004 §1)
- [ ] `workers: Map<WorkerId, Worker>` sparse store
- [ ] Fields: position, state, task, path, pathCursor, actionProgress, energy, carrying
- [ ] Branded `WorkerId`

### State machine

- [ ] Five states: `IDLE`, `MOVING`, `WORKING`, `SEEKING_REST`, `REST` (`GAME_DESIGN.md` §4.2)
- [ ] Every transition implemented and individually tested
- [ ] **No state can deadlock** — with no task, a worker returns to `IDLE` and waits
- [ ] A worker with no reachable rest point rests where it stands

### Task system

- [ ] Fixed priority: harvest → plant → till → water → deposit (`GAME_DESIGN.md` §4.4)
- [ ] Nearest-first within a priority band
- [ ] **Ties break by lowest tile index — never by RNG** (determinism, ADR-007)
- [ ] Task claiming prevents two workers targeting the same tile
- [ ] A task whose target becomes invalid mid-execution is abandoned cleanly

### Pathfinding

- [ ] `src/sim/pathing/astar.ts` — A* over the walkability grid
- [ ] `core:path` tiles cost less (1.5× speed, `GAME_DESIGN.md` §2.2)
- [ ] Unreachable targets return an explicit failure, never hang
- [ ] **Deterministic**: identical inputs → identical path, including tie-breaks
- [ ] Path recomputed if the grid changes beneath a moving worker

### Movement

- [ ] `movementSystem` advancing along the path at the §4.3 timings
- [ ] Renderer interpolates between tiles using `alpha` (ADR-007 §5)
- [ ] **Interpolated positions never re-enter the simulation**

### Energy

- [ ] 0–100; consumed 1 per 20 ticks working or moving
- [ ] Recovered 2 per 20 ticks resting, 4 at a Rest Hut
- [ ] **Energy never causes failure** — only throttles (`GAME_DESIGN.md` §4.5)

### Actions

- [ ] Workers perform till, plant, water, harvest using the **same validation as player intents**
- [ ] `actionProgress` accumulates to the §4.3 durations
- [ ] Carrying capacity 20; deposits when full

### Hiring

- [ ] `hireWorker` intent; cost `floor(150 × 1.6^(n-1))`
- [ ] Worker spawns at the plot center
- [ ] `workerHired` event emitted

### Rendering

- [ ] Workers render in the `entities` layer, y-sorted
- [ ] Walk animation, four directions, frames in ticks (`ASSETS.md` §7)
- [ ] **Animation registers and releases `animatingEntityCount`** (ADR-001 §1)
- [ ] Animation pauses on culled workers
- [ ] Selected worker highlighted in `worldUi`

### UI

- [ ] Worker count in the HUD
- [ ] Click a worker to select; show its state and current task
- [ ] Hire button with cost and affordability state

### Art

- [ ] Idle + walk sprites, four directions, in the `entities` atlas
- [ ] `worker.anim.json` per `ASSETS.md` §7

---

## Out of Scope

- Player-configurable task priority — fixed list in v0.1 _(v0.2)_
- Worker specialization, skills, or leveling _(v1.0)_
- Worker naming or personality _(v0.3)_
- Storage buildings — deposit goes to player inventory _(phase-05)_
- Rest Hut building — base rest rate only _(phase-06)_
- Multi-tile or diagonal movement — 4-directional grid movement only
- Worker-to-worker interaction _(v0.3)_
- Combat _(v1.0)_

---

## Acceptance Criteria

| #   | Criterion                                                            | Verified by        |
| --- | -------------------------------------------------------------------- | ------------------ |
| 1   | A hired worker autonomously harvests a mature crop                   | E2E                |
| 2   | A worker plants on tilled soil when seeds exist                      | E2E                |
| 3   | A worker tills empty owned grass                                     | Unit test          |
| 4   | Priority order is respected exactly                                  | Unit test          |
| 5   | **A worker with no available task returns to `IDLE` and never jams** | Unit test          |
| 6   | **No FSM state can deadlock** — exhaustive transition test           | Unit test          |
| 7   | Two workers never claim the same tile                                | Unit test          |
| 8   | A task invalidated mid-execution is abandoned cleanly                | Unit test          |
| 9   | Pathfinding produces optimal paths on an open grid                   | Unit test          |
| 10  | Pathfinding routes around obstacles                                  | Unit test          |
| 11  | An unreachable target fails explicitly and does not hang             | Unit test          |
| 12  | **Identical inputs produce identical paths**                         | Property test      |
| 13  | Path tie-breaks are deterministic, never RNG                         | Code review + test |
| 14  | Movement matches §4.3 timings exactly                                | Unit test          |
| 15  | Path tiles give 1.5× movement speed                                  | Unit test          |
| 16  | Movement renders smoothly at 60 FPS                                  | Manual             |
| 17  | Energy depletes and recovers at the specified rates                  | Unit test          |
| 18  | **A worker at 0 energy rests and resumes; never stops permanently**  | Unit test          |
| 19  | Hire cost matches the escalation formula                             | Unit test          |
| 20  | **Every walk animation start has a matching stop**                   | Unit test          |
| 21  | Idle CPU within budget with 5 workers idle                           | Measured           |
| 22  | Active CPU within budget with 5 workers moving                       | Measured           |
| 23  | **8 hours unattended: no jam, no stall, no lost value**              | Long-run test      |
| 24  | Determinism holds over 100k ticks with 5 workers                     | Property test      |

**Criteria 5, 6, 18, and 23 are one requirement stated four ways: automation must never jam.** `GAME_DESIGN.md` §4.2 makes this a hard product rule because a worker that deadlocks while the player is at work destroys the product thesis — and it is precisely the kind of bug that never appears in a five-minute test.

**Criterion 20** is the most likely way render-on-demand decays (ADR-001 §Consequences): an animation that starts and never releases its count means permanent frame cost.

---

## Testing Checklist

### Automated

- [ ] Every FSM transition, individually
- [ ] Every state, exhaustively, for reachability of `IDLE`
- [ ] Task selection at each priority level
- [ ] Task selection with mixed availability
- [ ] Nearest-first within a band
- [ ] Deterministic tie-breaking
- [ ] Task claiming and release
- [ ] Target invalidated mid-path
- [ ] Target invalidated mid-action
- [ ] A*: open grid, obstacles, unreachable, same-tile, adjacent
- [ ] A*: determinism across repeated runs (property)
- [ ] Path invalidation when a building is placed on the route
- [ ] Movement timing, with and without path tiles
- [ ] Energy: depletion, recovery, rest cycle, zero-energy behavior
- [ ] Carrying: fill, deposit, deposit with no storage
- [ ] Hire cost escalation across 10 workers
- [ ] Animation counter pairing (20)
- [ ] Property: determinism with 5 workers over 100k ticks
- [ ] **Long-run: 8 simulated hours, 5 workers — assert continuous progress and no state stuck**
- [ ] E2E: hire a worker, observe autonomous farming

### Manual

- [ ] Watch a worker for 10 minutes — behavior should look sensible, not robotic-broken
- [ ] Confirm the hire moment is satisfying (`VISION.md` §6.3)
- [ ] Place obstacles mid-path; confirm graceful repathing
- [ ] Run 5 workers for an hour; check for drift or jams
- [ ] Measure CPU with workers idle and active

---

## Future Dependencies

| Deliverable           | Depended on by                                                    |
| --------------------- | ----------------------------------------------------------------- |
| Worker FSM            | 06 (auto-replant, auto-sell tasks), **v0.3 NPCs generalize this** |
| Pathfinding           | 05, 06 (storage/building routing), v0.4 (logistics)               |
| Task priority         | v0.2 — player-configurable priorities build on this               |
| Energy                | 06 (Rest Hut gives it purpose)                                    |
| Deposit behavior      | 05 (storage buildings)                                            |
| Interpolated movement | v0.3 (NPCs), v1.0 (combat entities)                               |
| Worker catch-up shape | 07 — statistical offline progress (`SAVE_FORMAT.md` §6.4)         |

---

## Notes

**The 8-hour unattended test (criterion 23) is the most important test in this phase**, and the easiest to skip because it is slow. Run it accelerated in the simulation, not in real time — the sim is headless and deterministic, so 8 hours of ticks runs in seconds.

Build the FSM before pathfinding. A worker that teleports but never deadlocks is a better foundation than one that walks beautifully into a jam.

**Do not use RNG for tie-breaking anywhere.** It is tempting for "natural-looking" behavior and it breaks determinism (ADR-007), which several other systems depend on.
