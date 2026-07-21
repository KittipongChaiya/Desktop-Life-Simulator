# PROJECT_STRUCTURE

> **Status:** Authoritative for the file tree. This document is the single source of truth for where things live.
> **Owns:** Directory layout, file placement rules, naming of directories, config file locations.
> **Does not own:** Module responsibilities and data flow (`ARCHITECTURE.md`), code naming conventions (`CODE_STYLE.md` §3).

**Before creating a file, find its directory here.** If no directory fits, that is a signal the architecture needs a decision — not that you should invent a folder.

---

## 1. Top-Level Layout

```
desktop-life-simulator/
├── .github/workflows/          CI pipelines
├── .husky/                     Git hooks (pre-commit)
├── assets/                     Art and audio  →  §5
│   ├── src/                    Authored sources        [committed]
│   └── dist/                   Generated atlases       [gitignored]
├── docs/                       This documentation set  →  §6
│   ├── decisions/              ADRs
│   └── phases/                 Phase specifications
├── plugins/                    Content packs  →  §4
│   └── core/                   First-party content     [v0.1]
├── scripts/                    Build and dev tooling
├── src/                        Application source  →  §2
├── tests/                      Cross-cutting tests  →  §3
├── .gitattributes              LF normalization (Windows-primary repo)
├── .gitignore
├── electron-builder.yml        Packaging config
├── electron.vite.config.ts     Build config (3 entry points)
├── eslint.config.js            Flat config incl. boundary rules
├── package.json
├── package-lock.json           [committed]
├── tsconfig.json               Solution file — references the three below
├── tsconfig.main.json          main + preload (Node, no DOM)
├── tsconfig.renderer.json      renderer (DOM, no Node)
├── tsconfig.sim.json           sim + shared + persistence (NEITHER)
└── vitest.config.ts
```

The three `tsconfig` files are not organizational preference — `tsconfig.sim.json` deliberately omits both DOM and Node libs so that `document`, `window`, `fs`, and `process` do not exist inside `src/sim`. This turns the purity rule (`AI_RULES.md` §2.1) into a compile error. See `TECH_STACK.md` §3.1.

---

## 2. `src/` — Application Source

```
src/
├── shared/                     Depended on by everything; depends on nothing
│   ├── constants.ts            TICKS_PER_SECOND, TICK_MS, budgets
│   ├── result.ts               Result<T, E>, ok(), err()
│   ├── errors.ts               AppError taxonomy
│   ├── ids.ts                  Branded ID types
│   ├── geometry.ts             TilePosition, Rect, index↔coord helpers
│   └── ipc/
│       ├── contract.ts         Typed channel definitions
│       └── schemas.ts          Runtime validators for IPC payloads
│
├── sim/                        PURE · DETERMINISTIC · HEADLESS
│   ├── world/
│   │   ├── world.ts            World type, createWorld()
│   │   ├── tile-grid.ts        Flat typed-array grid
│   │   ├── crop.ts             Crop record
│   │   ├── worker.ts           Worker record + states
│   │   ├── building.ts         Building record
│   │   ├── inventory.ts        Inventory store
│   │   └── wallet.ts           Currency store
│   ├── systems/
│   │   ├── index.ts            TICK_SYSTEMS — the ordered list
│   │   ├── intent.ts
│   │   ├── growth.ts
│   │   ├── worker.ts
│   │   ├── movement.ts
│   │   ├── harvest.ts
│   │   ├── economy.ts
│   │   ├── event-flush.ts
│   │   └── snapshot.ts
│   ├── content/
│   │   ├── registry.ts         Generic registry primitive
│   │   ├── crops.ts            registerCrop + CropDefinition
│   │   ├── items.ts
│   │   ├── buildings.ts
│   │   ├── tile-kinds.ts
│   │   └── worker-roles.ts
│   ├── intents/
│   │   ├── types.ts            Intent union
│   │   └── queue.ts
│   ├── events/
│   │   ├── types.ts            SimEvent union
│   │   └── bus.ts
│   ├── snapshot/
│   │   ├── slices.ts           Slice definitions + change conditions
│   │   └── project.ts          World → slice projection
│   ├── rng/
│   │   └── rng.ts              Seeded PRNG. The ONLY randomness source.
│   ├── pathing/
│   │   └── astar.ts
│   └── tick.ts                 stepSimulation(world)
│
├── persistence/
│   ├── serialize.ts            World → SaveDocument (explicit, by hand)
│   ├── deserialize.ts          SaveDocument → World
│   ├── validate.ts             Post-migration structural + semantic checks
│   ├── catch-up.ts             Offline progress orchestration
│   ├── schema.ts               Current SaveDocument type
│   └── migrations/
│       ├── index.ts            Ordered chain
│       └── v1-to-v2.ts         (added as versions accrue)
│
├── renderer/
│   ├── index.html
│   ├── main.tsx                Renderer entry: boot sim, render, UI
│   ├── bootstrap/
│   │   ├── loop.ts             Accumulator loop (ADR-007 §3)
│   │   ├── snapshot-store.ts   Sliced store + throttling (ADR-005 §2)
│   │   └── intent-dispatch.ts
│   ├── render/                 PixiJS only — no React
│   │   ├── app.ts              Pixi init, teardown, render-on-demand gate
│   │   ├── layers.ts           The 7 named layers
│   │   ├── camera.ts
│   │   ├── terrain-chunks.ts   RenderTexture chunk cache
│   │   ├── sprites/
│   │   │   ├── crop-view.ts
│   │   │   └── worker-view.ts
│   │   ├── interpolate.ts      Alpha-based position interpolation
│   │   ├── assets.ts           Atlas loading via generated manifest
│   │   └── fallback/
│   │       └── canvas2d.ts     Degraded backend (ADR-001 §Fallback)
│   └── app/                    React only — no PixiJS
│       ├── App.tsx
│       ├── hooks/
│       │   ├── use-slice.ts    useSyncExternalStore wrapper
│       │   └── use-intent.ts
│       ├── panels/
│       │   ├── InventoryPanel.tsx
│       │   ├── ShopPanel.tsx
│       │   ├── WorkerPanel.tsx
│       │   └── SettingsPanel.tsx
│       ├── hud/
│       │   ├── StatusBar.tsx   Collapsed-mode view
│       │   └── CoinCounter.tsx
│       ├── components/         Shared primitives (Button, List, Modal)
│       └── styles/             CSS Modules
│
├── main/                       Electron main process
│   ├── index.ts                Entry
│   ├── overlay-window.ts       Frameless, transparent, docked, always-on-top
│   ├── docking.ts              workArea geometry, multi-monitor, DPI
│   ├── click-through.ts        setIgnoreMouseEvents management
│   ├── tray.ts
│   ├── single-instance.ts
│   ├── save-io.ts              Atomic write, .bak rotation (ADR-002 §2)
│   └── ipc/
│       └── handlers.ts         Validated channel handlers
│
└── preload/
    └── index.ts                contextBridge — narrow, enumerated, typed
```

### 2.1 Placement rules

| If the code… | It goes in |
|---|---|
| decides what happens in the game | `src/sim/systems/` |
| defines game state shape | `src/sim/world/` |
| defines a *kind* of thing (a crop type) | `src/sim/content/` |
| draws the world | `src/renderer/render/` |
| draws a panel or control | `src/renderer/app/` |
| touches the filesystem | `src/main/` |
| touches `BrowserWindow` or `screen` | `src/main/` |
| converts world ↔ save | `src/persistence/` |
| is a type or constant used by two layers | `src/shared/` |

If it seems to belong in two places, it is two things. Split it.

### 2.2 Co-located tests

Unit tests sit beside their subject:

```
src/sim/systems/growth.ts
src/sim/systems/growth.test.ts
```

Cross-cutting tests live in `tests/` (§3). Rationale and structure: `TESTING.md`.

---

## 3. `tests/`

```
tests/
├── e2e/                        Playwright — launches the real app
│   ├── overlay.spec.ts         Docking, always-on-top, click-through, DPI
│   ├── background-tick.spec.ts Tick continues while occluded (ADR-003)
│   └── idle-cost.spec.ts       Zero rAF / zero React commits when static
├── integration/
│   ├── save-round-trip.test.ts
│   ├── migration-chain.test.ts
│   └── determinism.test.ts     Same seed + intents → identical state
├── property/                   fast-check
│   ├── save.property.test.ts
│   └── catch-up.property.test.ts
└── fixtures/
    └── saves/
        ├── v1-mature-farm.json     Golden fixtures — COMMITTED, NEVER EDITED
        └── v1-empty.json
```

**`tests/fixtures/saves/` is append-only.** These files represent saves that exist on real players' disks. Editing one to make a test pass defeats the entire purpose of the migration chain (ADR-002 §3).

---

## 4. `plugins/`

```
plugins/
├── README.md                   Plugin API documentation
├── manifest.schema.json        Manifest schema (v0.2 loader consumes this)
└── core/                       First-party content — statically imported in v0.1
    ├── manifest.json
    ├── index.ts                register() entry point
    └── content/
        ├── crops.ts            core:wheat, core:carrot, …
        ├── items.ts
        ├── buildings.ts
        └── tile-kinds.ts
```

`plugins/core/` registers through the **public plugin API** while being statically imported (ADR-003 §6). This proves the API is sufficient before third parties depend on it.

**No plugin loader exists in v0.1.** `plugins/core/index.ts` is imported directly by the sim bootstrap. Adding the v0.2 loader changes *how* content arrives, not the content system's shape.

---

## 5. `assets/`

```
assets/
├── src/                        [committed]
│   ├── terrain/
│   ├── crops/
│   ├── entities/
│   ├── buildings/
│   ├── ui-world/
│   ├── audio/                  v0.2+
│   └── ATTRIBUTION.md          Source, author, license for every asset
└── dist/                       [gitignored — reproducible via npm run assets]
    ├── <atlas>.png
    ├── <atlas>.json
    └── manifest.ts             GENERATED typed sprite keys
```

Directory names under `src/` correspond to atlas groups (ADR-006 §3). Adding a directory means adding an atlas group — a decision with a draw-call cost, not a filing preference.

Full pipeline: `ASSETS.md`.

---

## 6. `docs/`

```
docs/
├── VISION.md              Product intent, philosophy, non-goals
├── PLAN.md                Roadmap, milestones, success criteria
├── ARCHITECTURE.md        Modules, boundaries, data flow
├── PROJECT_STRUCTURE.md   This file — the tree
├── TECH_STACK.md          Dependencies and why each exists
├── GAME_DESIGN.md         Mechanics, numbers, tables
├── AI_RULES.md            Rules binding on every session
├── CODE_STYLE.md          TypeScript, naming, imports, boundaries
├── PERFORMANCE.md         Budgets and gates
├── SAVE_FORMAT.md         Save schema, migrations, offline progress
├── ASSETS.md              Asset pipeline and conventions
├── TESTING.md             Strategy, tooling, coverage gates
├── CHANGELOG.md           Semantic-versioned change history
├── decisions/             ADR-001 … ADR-007
└── phases/                phase-00 … phase-07
```

---

## 7. Runtime Paths (Not in the Repo)

Written by the app on the user's machine:

```
%APPDATA%/desktop-life-simulator/
├── saves/
│   ├── slot-0.json             Current save
│   ├── slot-0.json.bak         Previous good save (ADR-002 §2)
│   └── backups/                Three most recent autosaves
├── settings.json               UI preferences — not game state
└── logs/
    └── main.log                Rotated
```

Obtained via `app.getPath('userData')`. **Never hardcode a path.** Game state lives only in `saves/`; `settings.json` holds UI preferences and is not part of the save schema.

---

## 8. Rules for Changing This Tree

1. **Adding a top-level directory requires an ADR.** The tree encodes the architecture; changing it changes the architecture.
2. **Adding a directory under `src/sim/` or `src/renderer/` requires updating this file in the same commit** (`AI_RULES.md` §5.1).
3. **Never create `utils/`, `helpers/`, `common/`, or `misc/`.** These become dumping grounds where cohesion goes to die. Name the directory for what it does; if you cannot, the code belongs somewhere that already exists.
4. **Never add a barrel `index.ts` that re-exports a whole directory** (`CODE_STYLE.md` §1.2). The one permitted `index.ts` files are `src/sim/systems/index.ts` (the ordered tick list) and `src/persistence/migrations/index.ts` (the ordered chain) — both are *ordered data*, not re-exports.
5. **Generated files are never committed** and always carry a `GENERATED — do not edit` header.
