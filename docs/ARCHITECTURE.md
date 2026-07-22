# ARCHITECTURE

> **Status:** Authoritative for modules, boundaries, and data flow.
> **Owns:** System composition, layer responsibilities, data flow, extension points.
> **Does not own:** The file tree (`PROJECT_STRUCTURE.md`), the reasoning behind major choices (`docs/decisions/`), code-level rules (`CODE_STYLE.md`).

This document describes _what the parts are and how they talk_. Every significant choice here is a consequence of an ADR, cited inline.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS  (Node)                                               │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ Overlay      │ │ Tray &       │ │ Save I/O  │ │ IPC router    │  │
│  │ window mgr   │ │ single-inst  │ │ (atomic)  │ │ + validation  │  │
│  └──────────────┘ └──────────────┘ └───────────┘ └───────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  typed IPC (contextBridge)
┌───────────────────────────────┴─────────────────────────────────────┐
│  RENDERER PROCESS                                                   │
│                                                                     │
│   ┌──── VIEWS (disposable, no authoritative state) ─────────────┐   │
│   │  ┌───────────────────┐        ┌──────────────────────────┐  │   │
│   │  │ app/  React UI    │        │ render/  PixiJS world    │  │   │
│   │  │ panels, HUD       │        │ 7 layers, dirty-gated    │  │   │
│   │  └─────────┬─────────┘        └────────────┬─────────────┘  │   │
│   └────────────┼───────────────────────────────┼────────────────┘   │
│        commands│                       snapshots│                    │
│                ▼                               ▲                    │
│   ┌────────────────────────────────────────────┴────────────────┐   │
│   │  SIM  (pure · deterministic · headless)                     │   │
│   │  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌─────┐ ┌───────────┐  │   │
│   │  │ world  │ │ systems │ │ content  │ │ rng │ │ event bus │  │   │
│   │  │ stores │ │ ordered │ │registries│ │seed │ │  typed    │  │   │
│   │  └────────┘ └─────────┘ └──────────┘ └─────┘ └───────────┘  │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                    ▲                            ▲
        persistence │                   plugins/ │  (v0.2 loader;
        (serialize, migrate)            registers via public API)
```

---

## 2. Layers and Responsibilities

| Layer             | Responsibility                                           | Holds truth? | Disposable? |
| ----------------- | -------------------------------------------------------- | ------------ | ----------- |
| `shared`          | Types, constants, IPC contracts, `Result`                | No           | —           |
| `sim`             | The game. World state, systems, content, RNG, events     | **Yes**      | No          |
| `persistence`     | Serialize, deserialize, migrate, catch-up orchestration  | No           | No          |
| `renderer/render` | Draw the world with PixiJS                               | No           | **Yes**     |
| `renderer/app`    | Draw the UI with React                                   | No           | **Yes**     |
| `main`            | Window, overlay behavior, tray, disk I/O, IPC validation | No           | No          |
| `preload`         | Typed bridge between renderer and main                   | No           | —           |
| `devtools`        | Debug overlay, console, profiler, inspector, logger      | No           | **Yes**     |

**`devtools` is one-directional.** It may read `shared` and `sim`; nothing in the game may import it (phase-01.5 deliverable 8), and it is stripped from production builds entirely. A game system that needs a devtools type has a design problem, not an import problem.

The import matrix that enforces this is in `CODE_STYLE.md` §8.1 and is verified by `npm run check:boundaries`. Rationale: ADR-003 §4.

### 2.1 The invariant that everything depends on

> **`src/sim` is a headless, deterministic TypeScript library. It imports only `shared`. It runs under Vitest with no DOM, no Electron, and no PixiJS.**

Enforced three ways: the boundary linter, a dedicated `tsconfig` with neither DOM nor Node libs (`TECH_STACK.md` §3.1), and a CI test that imports every sim module in a bare Node environment.

This single invariant is what makes the game testable at 90% coverage, savable (ADR-002), collapsible with a full GPU teardown (ADR-001 §2), and portable to a worker or server later (ADR-003 §2).

---

## 3. The Simulation

### 3.1 World composition

`World` is a struct of stores, not an object graph (ADR-004 §2):

| Store                 | Layout                                              | Why                                                   |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `tiles`               | Parallel flat typed arrays, indexed `y * width + x` | Dense, uniform, cache-friendly, directly serializable |
| `crops`               | `Map<TileIndex, Crop>`                              | Sparse — most tiles have no crop                      |
| `workers`             | `Map<WorkerId, Worker>`                             | Sparse, irregular, few                                |
| `buildings`           | `Map<BuildingId, Building>`                         | Sparse                                                |
| `inventory`, `wallet` | Single records                                      | Singletons                                            |
| `commands`            | FIFO queue behind a dispatcher                      | Drained each tick by `commandSystem` (ADR-010)        |
| `events`              | Typed bus                                           | Flushed each tick by `eventFlushSystem`               |
| `rng`                 | Seeded PRNG                                         | Deterministic; `Math.random()` is banned              |

`inventory`, `wallet`, worker holds, and every future storage are **containers** under one model (ADR-011): a resource is a conserved integer quantity of a content-defined item, held in exactly one owner-tagged container, moved only by an explicit command-driven transfer between containers — never a free-standing world entity. That single model governs harvesting, carrying, storage, economy, and eventual loot alike.

### 3.2 The tick

Fixed 20 Hz, accumulator-driven, decoupled from render (ADR-007). System order is declared once:

```
commandSystem → growthSystem → workerSystem → movementSystem
              → harvestSystem → economySystem → eventFlushSystem → snapshotSystem
```

Correctness-critical orderings (`commandSystem` first, `growthSystem` before `harvestSystem`, `snapshotSystem` last) are documented in ADR-007 §4 and ADR-010 §3, and covered by tests.

### 3.3 Systems

A system is a free function `(world: World) => void`. It may mutate stores it owns (`CODE_STYLE.md` §2.2) — and since ADR-010, **only through a command handler** (§3.3a), never by writing a store directly. It must not:

- read a clock or call `Math.random()`
- perform I/O or log
- mutate a store owned by another system
- allocate per-entity in its hot loop

| System             | Owns                               | Reads                                |
| ------------------ | ---------------------------------- | ------------------------------------ |
| `commandSystem`    | the command queue                  | everything (validates, then applies) |
| `growthSystem`     | `crops.growth`, `crops.stage`      | `tiles` (moisture)                   |
| `workerSystem`     | `workers.state`, `workers.task`    | `crops`, `tiles`, `buildings`        |
| `movementSystem`   | `workers.position`, `workers.path` | `tiles` (walkability)                |
| `harvestSystem`    | `inventory`, `crops` (removal)     | `workers`                            |
| `economySystem`    | `wallet`, price state              | `inventory`                          |
| `eventFlushSystem` | `events`                           | —                                    |
| `snapshotSystem`   | snapshot slices                    | everything (read-only)               |

### 3.3a Commands — the only write path

> **Status: BUILT (phase-03.5).** ADR-010 records the decision.

`World` and its stores are readable from anywhere and **writable only from a command handler**. Player input, worker AI, automation, and replay all go through one dispatcher; none gets a shortcut.

```
dispatch(command)                       commandSystem (preUpdate, FIRST)
  ├─ validate  ── pure, no mutation       ├─ re-validate
  ├─ rejected ──► CommandResult           ├─ execute  ── mutates
  │               world untouched         └─ publish  ── queued to the bus
  │               nothing published
  └─ accepted ──► queued                          ↓
                                          eventFlush (postUpdate)
```

Four properties this buys, each asserted by test:

| Property                             | Why it matters                                                  |
| ------------------------------------ | --------------------------------------------------------------- |
| Dispatch never mutates               | A rejected command leaves the world byte-identical              |
| Execution is on a tick boundary      | Outcome no longer depends on where in a frame the call happened |
| Events publish only on success       | The event stream stays a record of facts (ADR-008 §2)           |
| Commands are plain serializable data | `seed + ordered command stream` is a replay format for free     |

**Validation is two-stage on purpose.** `dispatch` validates against _committed_ state so the caller gets immediate feedback; handlers re-validate at execution because the world can change in between. A command whose precondition only a still-queued command would satisfy is therefore rejected at dispatch — the caller re-issues once it lands.

The rule "nothing outside `src/sim/commands/` writes to a world store" is not expressible to the boundary linter, which sees imports rather than mutations. It is held by convention, review, and the mechanical aid that mutating code is confined to one directory (ADR-010 §1).

### 3.4 Content registries

Content **definitions** are separate from **instances** (ADR-004 §5). Definitions register at startup through a typed API — the same API plugins will use (ADR-003 §6):

```ts
registerCrop({ id: 'core:wheat', growthTicks: 2400, stageSprites: [...], yields: [...] });
```

Registries: `crops`, `items`, `buildings`, `tileKinds`, `workerRoles`.

**Systems never hardcode content.** No `switch (cropId)` anywhere. A system asks the registry for a definition and acts on its data. This is what makes a plugin-added crop work with zero core changes, and it is the rule most likely to be violated by a session taking a shortcut.

### 3.4a Simulation time

`src/sim/time/game-clock.ts` is the authoritative conversion between ticks and
human time. `world.tick` remains the only notion of time the simulation has
(ADR-007 §1); the clock owns the derivation so it lives in one place.

**Rendering timing is independent.** The render loop measures real elapsed
milliseconds for interpolation (ADR-007 §5) and does not route through the
clock — presentation timing and simulation time are different concerns.

Extension points (game days, seasons, offline catch-up) are documented in
`docs/phases/phase-01.6-hardening.md` §1 rather than stubbed, because each needs
semantics that only its owning system can define.

### 3.5 Events

> **Status: BUILT (phase-02.5).** ADR-008 records the decision. Queue-and-flush,
> per-world, no global state. `appStarted` and `simulationTick` are the initial
> events; `cropHarvested` (phase-03), `workerIdle` (phase-04),
> `inventoryChanged` (phase-05) and `worldLoaded`/`worldSaved` (phase-07) each
> arrive with a real producer and consumer.
>
> Historical note, retained deliberately: The bus lands in **phase-03**, where
> `harvestSystem` produces the first real event (`cropHarvested`) and inventory
> consumes it. It was deliberately not built earlier: with one system in
> existence there were no producers, no consumers, and no cross-system calls to
> replace, so the API would have been designed against imagined use cases.
> See `docs/phases/phase-01.6-hardening.md` §3.

A typed, synchronous, in-simulation bus. Events are **queued during the tick and flushed by `eventFlushSystem`**, never dispatched mid-system — dispatching mid-system would let a listener mutate state another system is iterating.

```ts
type SimEvent =
  | { type: 'cropHarvested'; tile: TileIndex; crop: ContentId; yield: readonly ItemStack[] }
  | { type: 'itemSold'; item: ContentId; qty: number; coins: number }
  | { type: 'workerHired'; worker: WorkerId };
```

Core uses the bus for its own decoupling in v0.1, so the hook points are real and exercised before plugins depend on them.

---

## 4. Data Flow

### 4.1 Commands down

```
Click / keypress
  → input layer maps (tool, tile) to a Command    { type: 'plantCrop', tile: 4172, cropId: 'core:wheat' }
  → dispatch() validates purely → accepted or rejected IMMEDIATELY
  → accepted: queued; world untouched, nothing published
  → next tick: commandSystem re-validates → executes → publishes events
  → rejection surfaces as a UI notification; state is untouched
```

Applying commands **on a tick boundary** is what preserves determinism (ADR-007 §1), and because a command is plain serializable data, every player action is already in the shape a replay or network layer would need (ADR-010 §5). Worker AI and automation emit the same commands through the same dispatcher — §3.3a.

**Every source pushes.** A `CommandProducer` decides intent and submits; nothing polls it for a buffer. The player submits from an event handler, a tick-driven source submits from inside its system, and both reach the identical dispatcher.

**The input layer holds no rules.** It maps (selected tool + clicked tile) to a command and stops. Whether the tile is owned, tilled, or ripe is the validator's answer — duplicating those checks in the UI would give the player and worker AI two rule sets that drift, which is the failure ADR-010 §6 exists to prevent.

**Interaction state is presentation state.** Tool, hover, and selection live in the renderer and never enter `World`. Hover changes at pointer rate; if the tick could see it, mouse movement would be a simulation input and determinism would be gone.

### 4.2 Snapshots up

```
snapshotSystem (end of tick)
  → for each slice: if changed, publish a new immutable version
  → SnapshotStore (per-slice version counters)
      ├─→ render layer: diff → mark scene dirty (ADR-001 §1) → draw if dirty
      └─→ React: useSyncExternalStore, coalesced to ≤10 Hz on rAF (ADR-005 §2)
```

Slices: `wallet`, `inventory`, `tilesViewport`, `crops`, `workers`, `selection`, `notifications`, `stats`.

**A slice that republishes every tick is a defect.** Most ticks change nothing a human is watching, so most ticks publish nothing and both views do zero work. This is the mechanism behind the idle CPU budget.

### 4.3 Persistence across processes

```
Save:  renderer: serialize(world) → plain object
       → IPC → main: validate → atomic write (ADR-002 §2)

Load:  main: read + parse + fallback to .bak on failure
       → IPC → renderer: migrate chain → validate → hydrate world
       → compute offline catch-up → present summary
```

Disk I/O never happens in the renderer (ADR-003 §3).

---

## 5. Rendering

Seven named layers with fixed order (ADR-001 §Layers): `terrain`, `terrainOverlay`, `objects`, `entities`, `effects`, `lighting`, `worldUi`. Layers 4–5 exist and are empty in v0.1.

Three mandatory behaviors, each from ADR-001:

1. **Render-on-demand** — draw only when `sceneDirty || animatingEntityCount > 0`.
2. **Collapsed-mode teardown** — destroy the Pixi application entirely when the overlay collapses.
3. **Atlased textures only** — via the generated manifest (ADR-006 §4).

Terrain renders into cached 16×16-tile `RenderTexture` chunks, re-rendered only when a contained tile changes.

The render layer holds **no authoritative state**. It maps `snapshot → scene graph`. Destroying and rebuilding it at any moment is lossless — this is what makes behavior 2 possible.

---

## 6. UI

React renders panels only, in a DOM tree sibling to the canvas (ADR-005 §1). It subscribes to snapshot slices, dispatches commands, and never imports from `src/sim/systems/` or `pixi.js`.

The UI root is pointer-transparent except over actual controls, which combined with the main process's `setIgnoreMouseEvents(..., { forward: true })` is what makes click-through work (phase-01).

---

## 7. Main Process

| Concern         | Notes                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Overlay window  | Frameless, transparent, always-on-top, `skipTaskbar`, docked to `workArea` bottom edge |
| Click-through   | `setIgnoreMouseEvents` toggled from renderer hit-testing                               |
| Display changes | Re-dock on resolution, DPI, monitor add/remove                                         |
| Tray            | Show/hide, collapse/expand, quit                                                       |
| Single instance | `requestSingleInstanceLock` — two instances would race on the save file                |
| Save I/O        | Atomic write, `.bak` rotation, backups (ADR-002 §2)                                    |
| IPC             | Every payload validated on receipt; renderer treated as untrusted                      |

---

## 8. Extension Points

Reserved in v0.1, implemented in v0.2+ (ADR-003 §6). This list is **exhaustive** — anything not here is not paid for in v0.1 (`VISION.md` §4.2).

| Extension point             | v0.1 state                                          | Enables                                                 |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Namespaced content IDs      | Used from the first crop                            | Mods, content packs                                     |
| Content registries          | Core registers through the public API               | Plugin-added content, no core change                    |
| Typed event bus             | Used by core for decoupling                         | Plugin hooks                                            |
| Save namespacing            | `plugins: {}` present, absent-plugin data preserved | Mod state that survives uninstall                       |
| `plugins/` directory        | Contains `core/` + manifest schema                  | The v0.2 loader                                         |
| Render layers 4–5           | Created, empty                                      | Particles, weather, lighting                            |
| `catchUp` per system        | Implemented for accruing systems                    | Offline progress for any future system                  |
| Snapshot slices             | Sliced from the start                               | New panels without re-plumbing                          |
| Devtools metric registry    | Populated with runtime metrics                      | Phase-02 camera/chunks/tiles, phase-04 entities         |
| Devtools command registry   | 12 working commands                                 | Phase-03 `spawn`, phase-04 `teleport`, phase-06 `money` |
| Devtools inspector registry | Runtime provider                                    | Phase-02 tile hover, phase-04 entity click              |

### 8.1 Why `plugins/core/` matters

First-party content registers through the **public plugin API** but is statically imported. This proves the API is sufficient before any third party depends on it, and means the v0.2 loader changes _how content arrives_, not the shape of the content system.

---

## 9. Adding Things — Checklists

### A new system

1. Create `src/sim/systems/<name>.ts` as `(world: World) => void`
2. Insert into `TICK_SYSTEMS` at a deliberate position; comment any ordering dependency
3. Declare which stores it owns (§3.3 table)
4. Add `catchUp` if it accrues over time (ADR-007 §6)
5. Add unit tests, including a determinism test

### A new gameplay action

1. Add a member to the `Command` union in `src/sim/commands/types.ts` — plain data, primitive fields only
2. Write its `validate` (pure) and `execute` (mutates, re-validates) halves in `src/sim/commands/`
3. Register it explicitly; never rely on discovery (ADR-010 §8)
4. Add tests for accept, reject, queued execution, and "rejected publishes nothing"
5. Never add an exported mutator instead — that is the failure mode ADR-010 exists to prevent

### A new content type

1. Define the definition type in `src/sim/content/`
2. Create its registry and the `register<Thing>` function
3. Register core content in `plugins/core/`
4. Add instance storage to `World` if instances exist (ADR-004 §Consequences)
5. Add serialization + migration (ADR-002)
6. Add sprites to an atlas group (ADR-006 §3)

### A new UI panel

1. Component in `src/renderer/app/panels/`
2. Subscribe only to the slices it reads; add a slice if needed, with its change condition
3. Dispatch commands; never mutate
4. Verify no re-render occurs on a static world (ADR-005 §Validation)

### A new IPC channel

1. Add to the typed contract in `src/shared/ipc/`
2. Expose through preload's enumerated surface — never expose `ipcRenderer`
3. Validate the payload in main on receipt
4. Return a `Result`, never throw across the boundary

---

## 10. Known Architectural Risks

| Risk                     | Watch for                                    | Response                                                                |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- |
| Boundary erosion         | One "harmless" import from sim into a view   | Linter blocks it; treat a request to disable the rule as a design smell |
| Render-on-demand decay   | An animation increments without decrementing | The zero-rAF idle test (ADR-001) fails                                  |
| Snapshot over-publishing | A slice republishing every tick              | The zero-React-commit idle test (ADR-005) fails                         |
| Sim thread contention    | p99 tick > 3 ms                              | Move sim to a worker (ADR-003 §2)                                       |
| Content hardcoding       | `switch (cropId)` in a system                | Review gate; breaks plugin support silently                             |
| Write-path erosion       | A store mutated outside `src/sim/commands/`  | Review gate; replay stops reproducing before anything visibly fails     |
| Save schema drift        | Persisted shape changed without a migration  | Golden-fixture tests fail (ADR-002)                                     |

Each risk has a mechanical detector. That is deliberate — architectural invariants that rely on vigilance decay, and the ones here have to survive a hundred sessions.
