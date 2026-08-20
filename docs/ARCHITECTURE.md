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
| `renderer/app`    | Draw the UI with React; own the sound bus (ADR-016)      | No           | **Yes**     |
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

Fixed 20 Hz, accumulator-driven, decoupled from render (ADR-007). System order is declared once, in `src/sim/systems/index.ts`:

```
commandSystem → workerSystem → movementSystem → economySystem
              → tickEventSystem → eventFlushSystem → snapshotSystem
```

**There is no growth system, and there is no harvest system.** Crop maturity is derived from `tick − plantedTick` (ADR-009 §2), so there is nothing to advance each tick; harvesting is a command, not a system. Earlier revisions of this document listed both — they were the phase-0 sketch and never shipped. Corrected in the v0.2 Phase 0 documentation pass.

Correctness-critical orderings (`commandSystem` first, `movementSystem` after `workerSystem` so a worker acts on the tick it decides, `snapshotSystem` last) are documented in ADR-007 §4 and ADR-010 §3, and covered by tests.

### 3.3 Systems

A system is a free function `(world: World) => void`. It may mutate stores it owns (`CODE_STYLE.md` §2.2) — and since ADR-010, **only through a command handler** (§3.3a), never by writing a store directly. It must not:

- read a clock or call `Math.random()`
- perform I/O or log
- mutate a store owned by another system
- allocate per-entity in its hot loop

| System             | Owns                               | Reads                                |
| ------------------ | ---------------------------------- | ------------------------------------ |
| `commandSystem`    | the command queue                  | everything (validates, then applies) |
| `workerSystem`     | `workers.state`, `workers.task`    | `crops`, `tiles`, `buildings`        |
| `movementSystem`   | `workers.position`, `workers.path` | `tiles` (walkability)                |
| `economySystem`    | `wallet`, price state              | `inventory`, containers              |
| `tickEventSystem`  | —                                  | `tick` (publishes `simulationTick`)  |
| `eventFlushSystem` | `events`                           | —                                    |
| `snapshotSystem`   | snapshot slices                    | everything (read-only)               |

**v0.2 adds no system to this table.** The calendar, the season, the weather, and tile wetness are all _derived_ (ADR-020 §1, ADR-021 §1, ADR-022 §1, §3) — pure functions over `world.tick` and stored facts. ADR-022 §2 makes that a detector rather than a preference: **if weather needs a tick slot, the design is wrong.** Worker scheduling (ADR-024) extends `workerSystem`'s selection pipeline rather than adding a stage to the tick.

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

Extension points (game days, seasons, offline catch-up) were documented in
`docs/phases/phase-01.6-hardening.md` §1 rather than stubbed, because each needs
semantics that only its owning system can define. **v0.2 defines them, and every
one turns out to be a derivation rather than a system** (`ROADMAP.md` §6–§8):

| Concept        | Derived from                   | New mutable state          | ADR     |
| -------------- | ------------------------------ | -------------------------- | ------- |
| Day, day phase | `tick`, `ticksPerDay`          | None                       | ADR-020 |
| Season         | `day`, `daysPerSeason`         | None                       | ADR-021 |
| Weather        | `seed`, weather period, season | None                       | ADR-022 |
| Tile wetness   | `wateredAt` + derived rainfall | None (replaces `moisture`) | ADR-022 |

Only the _constants_ are persisted, and only because changing them on a live
world would silently renumber its past (ADR-020 §2). Everything else follows
ADR-009 §2's precedent: the tick is already the accumulator, so a second one is
a second source of truth.

**Day phases are quantized, not continuous.** A named phase changes a handful of
times per day; a continuous fraction would republish a slice 20 times a second
forever, which ADR-005 §2 names a defect and ADR-001 §1 would pay for in frames.
This is the same move `CropStage` makes, for the same reason.

**Views read the `time` slice, never the clock.** `projectTime` publishes
`{ day, phase }` from `world.tick` and `world.ticksPerDay`, and the slice
republishes only when one of them changes — four times a day on the shipped
phase set. A view calling `phaseFor` itself would have to be told when to call
it, which is the subscription the slice already is. The projection deliberately
carries no `timeOfDay`: it would be correct, cheap, and would republish on every
one of a day's 24,000 ticks (phase-10b).

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

Disk I/O never happens in the renderer (ADR-003 §3). Three authorities divide persistence: ADR-002 owns the **mechanism** (JSON, atomic writes, the linear chain), ADR-015 owns the **contract** (save identity, version separation, the compatibility matrix, migration governance, failure policy), and `SAVE_FORMAT.md` owns the field-by-field **schema**.

What the delivered pipeline actually guarantees — the compatibility rules, the determinism evidence, the migration framework's properties, the failure matrix, the measured budgets, and the known limitations — is recorded in `save-compatibility-report.md`, verified by `tests/save-compatibility.test.ts`. It states behaviour rather than deciding it: the four documents above remain the authorities.

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

| Concern           | Notes                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlay window    | Frameless, transparent, **always-on-top** (`'floating'` level — restored by the 2026-07-23 livability verdict, ADR-014 amendment; still never focused), `skipTaskbar`, docked to `workArea` bottom edge                                                       |
| Click-through     | `setIgnoreMouseEvents` toggled from renderer hit-testing; a companion **mode** (`Ctrl+Shift+C`) overrides hit-testing entirely (ADR-014 §2)                                                                                                                   |
| Desktop companion | Global hotkeys via the centralized `ShortcutManager` — stable `ShortcutAction`s bound to a one-place default table (`shared/shortcuts.ts`, ADR-014 §5 amended); window opacity; quick hide; work mode broadcast. The simulation never learns any of it exists |
| App settings      | Categorized application settings model (`settings-schema.ts`: `overlay`, `desktop`, `audio`, `motion`, `update`; future input/graphics) in `settings.json` — never save data; the save system may never touch it (ADR-014 §4)                                 |
| Display changes   | Re-dock on resolution, DPI, monitor add/remove                                                                                                                                                                                                                |
| Tray              | Show/hide, collapse/expand, quit                                                                                                                                                                                                                              |
| Single instance   | `requestSingleInstanceLock` — two instances would race on the save file                                                                                                                                                                                       |
| Save I/O          | Atomic write, `.bak` rotation, backups (ADR-002 §2); versioning, compatibility & migration contract per ADR-015                                                                                                                                               |
| IPC               | Every payload validated on receipt; renderer treated as untrusted                                                                                                                                                                                             |

---

## 8. Extension Points

Reserved in v0.1, implemented in v0.2+ (ADR-003 §6). This list is **exhaustive** — anything not here is not paid for in v0.1 (`VISION.md` §4.2).

| Extension point             | Delivered state                                       | Enables                                                 |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| Namespaced content IDs      | ✅ Used from the first crop                           | Mods, content packs                                     |
| Content registries          | ✅ Generic, typed, duplicate-rejecting                | Plugin-added content, no core change                    |
| Typed event bus             | ✅ Used by core for decoupling                        | Plugin hooks                                            |
| Save namespacing            | ✅ `plugins: {}` present, absent data preserved       | Mod state that survives uninstall                       |
| Save quarantine             | ✅ Built in phase-07b, unknown content preserved      | Content removal that destroys nothing (ADR-026 §3)      |
| `plugins/` boundary zone    | ✅ Lint zone configured and enforced                  | A source that cannot reach past its boundary            |
| `plugins/` directory        | ⚠️ **Manifest schema only — `core/` was never built** | Phase 08 closes it (see §8.1)                           |
| The public plugin API       | ❌ **Never built** — core registers from `src/sim`    | Phase 08 (ADR-019 §2)                                   |
| Render layers 4–5           | Layer 4 claimed in 07.5b; layer 5 created, empty      | Weather (Phase 12), lighting (Phase 10)                 |
| `catchUp` per system        | ✅ Implemented for accruing systems                   | Offline progress for any future system                  |
| Snapshot slices             | ✅ Sliced from the start                              | New panels without re-plumbing                          |
| `CropDefinition.seasons`    | ✅ Declared as data, empty in v0.1                    | Phase 11 reads it with no shape change                  |
| Devtools metric registry    | ✅ Populated with runtime metrics                     | Phase-02 camera/chunks/tiles, phase-04 entities         |
| Devtools command registry   | ✅ 12 working commands                                | Phase-03 `spawn`, phase-04 `teleport`, phase-06 `money` |
| Devtools inspector registry | ✅ Runtime provider                                   | Phase-02 tile hover, phase-04 entity click              |

### 8.1 `plugins/core/` — the gap, and why Phase 08 exists

ADR-003 §6's load-bearing design point was:

> **`plugins/core/` is registered through the public plugin API but statically imported.** The API is therefore proven sufficient by first-party content before any third party depends on it.

**That did not ship.** `plugins/` holds a README and a manifest schema; core content registers through `registerCoreCrops(cropRegistry)` and its three siblings, called from `src/sim/world/world.ts`. There is no `PluginApi` object in the repository.

Most of the hard part _did_ ship — namespaced permanent IDs, generic typed registries, the event bus, the command dispatcher, save partitioning with quarantine, and the lint boundary zone. Only the seam is missing, which is why Phase 08 is a migration rather than a rewrite: it moves the four registrations behind the public API with **no behaviour change, no save change, and no test change** (ADR-019 §2).

The gap is recorded rather than quietly fixed because it is the evidence for ADR-003 §6's own prediction: a reserved-but-unused seam does not stay honest.

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

---

## 12. The motion layer (phase-07.7, ADR-017)

Game feel is presentation, and it lives entirely inside `src/renderer/render`.
The simulation gained nothing in phase-07.7 — no field, no system, no event it
did not already have — and `check:boundaries` enforces that rather than trusting
it.

### Two classes of motion, and only two

| Class       | Holds a lease                              | Default | Examples                                                                                                                              |
| ----------- | ------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Finite**  | for its own duration, then releases        | on      | till puff, seed bounce, stage pulse, harvest pop, coin burst, floating numbers, worker swing, arrival easing, camera shake, HUD press |
| **Ambient** | indefinitely, so it is bounded another way | **off** | plant sway, worker breathing and fidgets                                                                                              |

Finite motion is free at idle by construction: no event, no lease, no frame.

Ambient motion cannot be, because it never finishes. It is permitted only under
four conditions — off by default, never while collapsed, never in work mode, and
**surrendered when the pointer has been idle for `AMBIENT_IDLE_TIMEOUT_MS`**.
That last condition is the mechanism (`ambient-presence.ts`) that makes the
exception an amendment to ADR-001 rather than a hole in it: when the world is
static _and_ the player is absent, no frame is drawn. It is measured, not
asserted — see `PERFORMANCE.md` §11, criterion 8.

### Four rules the layer holds itself to

1. **Every moving thing takes a lease through `bindAnimationLease`.** The gate's
   animation count is what keeps render-on-demand honest, and `dirty-gate.ts`
   calls it "the fragile half". Two call sites once carried that bookkeeping by
   hand; the binding owns the transitions so no call site can forget.
2. **Everything visual is pooled and allocates nothing after construction.**
   Particles, floating numbers, and digit sprites come from fixed-capacity
   pools; a full pool recycles its oldest entry rather than growing.
3. **Randomness is derived, never rolled.** Scatter, drift, fidget choice and
   sway phase all hash presentation inputs through `presentation-rng.ts`.
   Consuming `world.rng` would advance the stream a saved game resumes from and
   desynchronise every future tick — a decorative particle corrupting
   determinism.
4. **Animation reads snapshots and real time, and writes neither back.** The
   renderer interpolates between the last two snapshots (ADR-007 §5); nothing it
   computes re-enters the simulation.

### Where the settings live

The six accessibility controls are application preferences under the ADR-014 §4
model: `settings.json`, never a save, resolved once through `effectiveMotion`
and carried to the renderer over `CompanionState`. Reduced Motion and work mode
**override without overwriting**, so a toggle never destroys what the player
chose. The resolved state also reaches CSS through a root attribute, because the
HUD's own feel is CSS transitions rather than React state.

---

## 13. Developer tooling (ADR-018)

Tooling is **diagnostic instrumentation, not a feature**. It lives entirely in
`src/devtools` and the renderer, and it is compiled out of production builds
rather than disabled in them.

### The boundary

| May import                                                           | May not import            |
| -------------------------------------------------------------------- | ------------------------- |
| `src/devtools` → `src/shared`, and `src/sim` **types and snapshots** | anything → `src/devtools` |

`src/sim`, `src/persistence`, and `src/main` never reference tooling. The
boundary linter enforces this, because v0.2 runs plugin code in the renderer
(ADR-003 §6) and a plugin-contributed panel is untrusted by construction.

### Four rules that are easy to break by accident

1. **Nothing debug mutates the world directly.** Every gameplay mutation — spawn,
   remove, reset, grant — submits a command through the ordinary player source
   and is validated and rejectable like any other (ADR-010 §6). The console's
   `money` command is the existing model. The payoff is that a debug action is
   replayable, rejectable, and indistinguishable from a player's downstream, so
   a bug reproduced with debug tools is a real reproduction.
2. **Metrics are pull-based, read-only snapshots.** A metric is a function the
   registry calls; it caches nothing into simulation state and mutates nothing
   to compute itself. Observation must not perturb the observed.
3. **Tooling consumes events and never produces them.** A debug-produced event
   would make the event graph differ between builds — so a bug that depends on
   event ordering would stop reproducing in the only build equipped to diagnose
   it. Recording is subscription; replay (future) goes through the dispatcher.
4. **Debug rendering obeys render-on-demand.** A closed overlay costs nothing;
   an open one takes an animation lease like anything else that moves
   (ADR-017 §1). Live graphs are the trap: a 60-second history repainting at
   60 Hz makes the thing it measures worse and its own readings untrustworthy.

### The gate

`FEATURE_DEBUG` is a Vite-injected **literal**, so `if (FEATURE_DEBUG)` folds to
`if (false)` and Rollup drops the branch and everything reachable only through
it. Sub-flags (`FEATURE_PROFILER`, `FEATURE_CONSOLE`, `FEATURE_INSPECTOR`) may
refine a debug build but are all false whenever `FEATURE_DEBUG` is, and none can
re-enable tooling in a release. Removal is asserted against a real built
artifact by `tests/devtools-excluded-from-production.test.ts`.

---

## 14. The content-source system (v0.2, ADR-026 and ADR-019)

> **Status: DESIGNED (v0.2 Phase 0). Built in Phases 08–09.** This section
> describes the target composition; §8.1 records what exists today.

v0.2 turns the reserved plugin architecture into a specified, versioned public
API. Nothing about the layers in §2 changes — a content source is a new _source
of content_, not a new layer.

### 14.1 One model for five kinds of content

Built-in, official packs, third-party plugins, generated packs, and DLC are all
**content sources**: one manifest, one API, one set of rules (ADR-026 §1). A
source declares a **provenance**, which the engine records for player-facing
display, the load-time trust decision, and diagnostics — and which **no
simulation system, command, registry lookup, or save-format rule may read**
(ADR-026 §2). First-party content earns no runtime privilege. That is what makes
"official and third-party share one extension model" true rather than a slogan.

### 14.2 The API is versioned; the engine is not

```
PLUGIN_API_VERSION = 1
```

A source targets an **API version**, never a game version, because engine
releases move for reasons no source can observe (ADR-019 §1). The engine
supports every API version it has ever shipped; withdrawing one needs a
successor ADR, exactly as dropping a migration link does.

The full capability surface is _specified_; **version 1 declares the subset that
executes no plugin code** — content, assets, audio, localization, configuration,
effects, and declarative behaviours. Commands, event listeners, UI panels, and
service consumption are API v2, and `PLUGIN_API.md` §10 names the four questions
a successor ADR must answer first.

**Why v1 is data-only.** The renderer runs under `script-src 'self'` with no
`unsafe-eval`, and ADR-001's implementation note records that the CSP stayed
strict _specifically because_ plugins run in the renderer. Data-only means the
CSP is untouched, determinism is structural rather than promised, and ADR-026's
isolation invariant holds without trusting the source to behave.

### 14.3 The isolation invariant

> **Removing a content source may affect only entities, containers,
> side-tables, and save partitions in namespaces that source owns. Nothing
> else in the save may change.**

One sentence, stated as a property test (ADR-026 §3). It generalises
`SAVE_FORMAT.md` §8 and ADR-015 §4 from two adjacent rules about mods into one
rule about content, and ADR-027 §5 asserts it at _every_ version in the
migration chain rather than once.

### 14.4 What a source may never do

Each prohibition names its enforcement, because a rule with no detector is a
wish (ADR-019 §5): no direct mutation, no dispatcher bypass, no world writes
outside a command, no replacing an engine service, no modifying a core registry
(`register` rejects duplicates and has no update or delete), no patching engine
internals (the lint zone), and no private APIs (`PLUGIN_API.md` is the surface).

### 14.5 Load order is world state

Resolution is dependency-topological with ties broken by namespace ascending —
**never filesystem enumeration order**, which varies by platform. This matters
because ADR-008 §4 guarantees subscribers run in registration order and
ADR-010 §8 forbids runtime discovery for exactly this reason. The resolved order
is recorded in the save's source manifest, so a world resolves its sources the
same way tomorrow as today (ADR-019 §6, ADR-026 §4).

### 14.6 Enablement is world state, not a preference

A world records which sources and features are enabled, **in the save** rather
than in `settings.json` (ADR-019 §7). This follows ADR-014 §4's boundary rather
than breaking it: opacity changes what the player _sees_; disabling seasons
changes what the world _does_, and two players with one seed and different
enablement sets have different worlds. Changing the set carries §14.3's
guarantee — disabling isolates, re-enabling restores.

---

## 15. The v0.4 systems (automation & exploration)

Five systems arrived in v0.4, and one architectural rule ties them together:
**what is derivable is derived.** The version added factories, logistics, a
wilderness and expeditions, and grew the save by four collections and one grid
re-lay. §14's derive-don't-store discipline is now the version's signature
rather than a weather-and-residents special case.

### 15.1 Production is content, not a building subclass

A recipe **names its building**, never the reverse (ADR-035 §1). There is no
`isFactory` flag: a building is a factory because some recipe targets it — the
same shape ADR-030 §4 settled when it refused to make "town" a subclass.

The consequence a content author cares about: `barleymod:grind_barley` can
target `core:mill` and the mill gains it with **no core edit**, which is
exactly the freedom ADR-019 exists to provide and which a recipe list on the
building would have removed.

A factory holds **two containers** — input and output — and the asymmetry is
what makes a chain possible: with one container a hauler would take back the
flour it had just delivered.

### 15.2 A stall is not a jam, and nothing records that a factory stopped

ADR-035's Rule E, and the reason the eight-hour criterion is reachable: a
**stall** is a chain stopped by a full downstream, which is correct and
self-clearing; a **jam** is a stall that outlives its cause.

Nothing in the production model records that a factory was ever blocked —
which is precisely why it cannot stay blocked. Every tick asks the same
question from scratch.

### 15.3 A reservation is a task, not a record

ADR-036 specified a reservation record and a per-tick sweep to catch leaks.
Implementation found a stronger form and the ADR carries the amendment: a
worker holding a `Haul` task for route R has, **by that fact alone**, claimed
goods at R's source.

Nothing is recorded, so nothing can leak. Release on every exit path becomes
structural rather than disciplined, reservations survive save/load for free
because tasks already do, and the sweep was **withdrawn** — a sweep over
derived state can only ever find nothing.

### 15.4 The wilds are a hash

Node existence is `nodeAt(seed, tile)`, a pure function (ADR-037 §3). Two
thousand tiles of wilderness cost the save **zero bytes**, need no migration,
and resolve exactly after any absence, because "is this available at tick T" is
arithmetic.

The hash consumes **no RNG draw**, for the reason `world.rng` is save state:
a draw would make what grows in the wilds depend on how many other things had
happened first.

The one stored fact is `harvestedAt`, pruned on regrowth so it scales with
world size rather than playtime.

### 15.5 Expeditions apply that model to time instead of space

Only `{ worker, destination, departedTick }` is stored (ADR-038 §3). The return
tick, the haul, and the time remaining are arithmetic on it — which is what
lets the longest-running mechanic in the game need no offline catch-up model at
all.

A worker who is away is in `WorkerState.Away` and is **absent from the workers
slice**, not present with a flag — ADR-031's shape for the sleeping town, so no
view can draw a hand who is not there.

That decision has a consequence worth recording next to it, because it cost
three defects to learn: **anything that was counting workers has to be told.**
The hire price, the status bar, and offline catch-up all read a count that
silently stopped including travellers.

### 15.6 The renderer's boundary is named

`world-view.ts` took a `World` — the whole simulation — until phase 29. It now
takes a **`WorldRenderSource`**: the seed and registries (immutable setup), the
snapshot (the sanctioned boundary), and the tile grid (the one mutable
structure read directly).

This is not a severance, and ADR-039 says so: `World` still satisfies the
interface structurally. It is enumerability — the answer to _what does the
renderer depend on?_ is now a file rather than a reading of every view — and it
scopes ADR-003 §2's worker-thread migration to **one field**.

`tests/renderer-world-boundary.test.ts` reads the source so that widening the
boundary fails a named test rather than passing quietly.

### 15.7 The tick order these added

`TICK_SYSTEMS` gained two entries, both placed for a stated reason:

- **`expedition`, in the `workers` phase and BEFORE `worker`** — a hand who
  lands this tick is given work on this tick rather than standing in the yard
  for one.
- **`production`, first in the `economy` phase** — after the workers who
  deliver to a factory, so a delivery made this tick is visible to this tick's
  craft, and ahead of the market sweep, so a craft that completes this tick can
  be sold on it.

---

## 16. The v0.5 world model (ADR-042)

v0.5 added no system. It changed what a _thing in the world_ is allowed to be.

Through v0.4 the renderer held an assumption nothing had ever written down:
**one tile, one object, one sprite, centred.** Every building was a 32-px icon
in a 32-px cell, so the player was looking at a spreadsheet with pictures in
it. ADR-042 separates the grid the simulation needs from the world the player
sees, without taking the grid away.

### 16.1 The grid stayed; the renderer stopped exposing it

Pathfinding, occupancy, collision, farming, logistics, worker AI and the save
format are all unchanged. `TileIndex` is still the world's address. What
changed is that a building's tile is now its **origin**, not its extent.

### 16.2 A footprint is content, and it is derived

`src/sim/content/footprint.ts` defines `Footprint { width, height }`, and a
building definition may declare one:

| Building     | Footprint | Note                           |
| ------------ | --------- | ------------------------------ |
| Storage shed | 2×2       |                                |
| Rest hut     | 2×2       |                                |
| Seed bin     | 1×1       | declares nothing — the default |
| Market stall | 3×2       |                                |
| Mill         | 3×3       |                                |
| Kitchen      | 3×2       |                                |
| Cottage      | 2×2       | town content                   |
| Castle       | 4×3       | town content                   |

`footprintOf(definition)` returns `SINGLE_TILE` when none is declared, so a
content pack written against v0.4 keeps working with no change and no
migration.

**Nothing about this is in the save.** A saved building records the definition
id and the origin tile it always recorded; the rectangle is looked up from
content on load. That is ADR-009 §1's rule applied again — the same argument
that keeps tilled soil, tile variants and worker rigs out of the file — and it
is why v0.5 changed the world's appearance without adding a schema version.

### 16.3 The origin is the bottom-left, and rectangles grow up and right

`footprintTiles(origin, footprint)` grows from the origin row **upward** (to
smaller indices) and rightward. The origin is where the building STANDS, which
is the row the player clicked and the row the art sits on.

It returns `null` rather than clamping at the map edge. A building that
silently shrank to fit would block fewer tiles than its art covers, and a
worker would walk through its wall.

Every write path loops the whole rectangle: placement validates each covered
tile with its own typed rejection, selling clears the rectangle and then
re-blocks any tile another building still covers, and load and town-founding
rebuild occupancy across footprints rather than origins.

### 16.4 One sorted layer, one sort key, one anchor

`layers.ts` names six layers — `terrain`, `terrainOverlay`, `world`,
`effects`, `lighting`, `worldUi` — and exactly one of them sorts:

```
sortableChildren = ySorted.has(name)   // ySorted = { 'world' }
```

Buildings, characters, trees, props and resource nodes all live in `world` and
are ordered against each other by depth. Ground is below them by layer;
weather and UI are above by layer. **A sort that only has to be right within
one container is a sort that can be reasoned about.**

`depth.ts` is the only place a sort key is computed:

- `tileDepth(tile)` — for anything whose base is a tile
- `positionDepth(worldY)` — for anything moving between tiles
- `biasDepth(depth, bias)` — for the deliberate exception, stated at its call site

Both return **the base's position in world pixels**, so a walking worker and a
standing building are measured on the same scale and neither needs to know the
other exists.

The anchor convention is one line: `sprite.anchor.set(0.5, 1)` — bottom-centre.
A multi-tile building centres on its rectangle (`col + width / 2`) and sits on
its origin row, so art may be as tall as it likes and grows upward out of the
footprint rather than out of the world.

### 16.5 Visual size is not collision size

The buildings slice publishes `footprintWidth` and deliberately **not**
`footprintHeight`. Width is needed to centre the sprite; height is not, because
the sprite is bottom-anchored — it hangs from the origin row and its pixel
height is the art's business. A tree's canopy overlapping the tiles above it
costs the simulation nothing, because the simulation was never told about the
canopy.

### 16.6 What this does not license

ADR-042 §5 is explicit: no free placement, no pixel collision, no
per-object z-index, no second sort key, and no visual state in the save. The
grid remains the authority. The renderer simply stopped drawing it.

---

## 17. v0.6 — the version that changed no architecture, and what that exposed

**Nothing in this document needed editing for v0.6.** No new system, no new
command kind, no new save field, no new extension point, no new boundary. That
was the version's defining constraint (ADR-046 §1) rather than a happy outcome,
and it is the first time a milestone has closed without touching a structural
decision.

**What it proves.** The content model has been claiming since phase 00 that
adding content is a data edit (ADR-004 §5) and that first-party content goes
through the same public API a third party would (ADR-019 §2). v0.6 roughly
tripled every registry — twelve crops, nine recipes, thirty-six items, six
destinations — and both claims held: `plugins/core` grew, `src/sim` did not.

That is the first VOLUME test either claim has had. Before this the API had only
ever carried a demo-sized table, and "sufficient for real content" was an
inference from "sufficient for a sample of it".

### 17.1 Two hardcodes the content pass walked into, neither fixed

A content version is unusually good at finding places where a system branches on
an id instead of reading data, because it is the version that adds the ids.

**`worker.ts:68` recognises the Rest Hut by name.**

```ts
if (building.buildingId === CORE_REST_HUT) return true;
```

§3.4 of this document forbids exactly that: _"A system asks the registry and acts
on the definition's data — no `switch (id)` anywhere."_ The consequence is
concrete rather than theoretical: **a second rest building is impossible as
content**, because nothing in a `BuildingDefinition` says how fast a worker
recovers near it. Phase 57's ladder has two kinds on it — storage and factory —
where it would otherwise have had three.

The fix is a `restRecovery` field and a registry lookup. It is engine work, so
ADR-046 §1 put it outside v0.6.

**`SimEventMap` has no event for a craft finishing or an expedition returning.**

The renderer can only attach a sound or an effect to something the simulation
says happened, and those two are the longest waits in the game — up to four
minutes of machine time, up to ten minutes away. Both are currently silent, and
for an idle game the completion signal is the entire mechanism by which the
product rewards absence rather than attention (`VISION.md` §2.2).

`events/types.ts` notes that _"adding a member here is all a new event needs"_,
so the cost is small. The scope is what stopped it, not the difficulty.

**Both are recorded rather than repaired**, and both are the kind of finding that
only appears when somebody tries to add content and discovers the seam is not
there. That is worth more than the version's own line count.
