# ADR-003: Electron Shell, Process Layout, and Layered Architecture

|                   |                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Status**        | Accepted                                                                                                |
| **Date**          | 2026-07-21                                                                                              |
| **Deciders**      | Project owner, lead architect                                                                           |
| **Supersedes**    | —                                                                                                       |
| **Superseded by** | ADR-014 — the window **z-order clause only** (always-on-top → always-on-bottom); everything else stands |

---

## Context

The product is a Windows desktop overlay docked to the bottom of the screen, always visible, running all day beside the player's real work (`VISION.md` §2.1). It needs:

- A borderless, transparent, always-on-top window pinned above the taskbar, with click-through in its transparent regions, correct behavior across multiple monitors and DPI changes, and a tray icon.
- A simulation that keeps running while the player works in another application.
- Local file I/O for saves.
- A UI stack productive enough to build a dozen panels without inventing a widget toolkit.
- Native-code cost as close to zero as possible, since `TECH_STACK.md` §7.2 bans native modules.

Two structural questions follow from choosing any web-based shell, and they are the real content of this ADR:

1. **Where does the simulation run** — main process, renderer, or a worker?
2. **How are layers separated** so that the simulation stays pure, testable, and eventually portable?

---

## Decision

### 1. Electron as the desktop shell

Electron 33+ with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and — critically — `backgroundThrottling: false`.

Chosen for the maturity of its Windows overlay surface. `BrowserWindow` exposes transparency, frameless mode, always-on-top with level control, `setIgnoreMouseEvents` with `forward: true` for per-region click-through, `skipTaskbar`, and a `screen` module with `workArea` geometry and display-change events. These are the exact primitives the overlay needs, they are well documented, and they work today without native glue.

### 2. The simulation runs in the renderer process

The tick loop, all systems, and the authoritative world state live in the renderer, alongside the renderer and UI.

**Why not the main process:** the renderer draws every frame from world state. Main-process simulation would mean serializing world state across IPC 20 times a second, which is both a throughput cost and an architectural lie — you would immediately build a renderer-side mirror and end up with two copies of the truth.

**Why not a Web Worker (yet):** it is the theoretically cleaner answer, and it remains the documented escape hatch. But it forces a structured-clone boundary between sim and render from day one, complicating debugging for a v0.1 tick that is expected to cost well under a millisecond. The architecture is built so this migration is possible without touching game logic: `src/sim` already imports nothing but `shared`, communicates through explicit intents and snapshots, and has no DOM access at compile time (`TECH_STACK.md` §3.1).

**Migration trigger (stated in advance so a future session doesn't have to argue it):** move the simulation to a worker when a p99 tick exceeds 3 ms, or when tick execution measurably delays frame presentation. Both are tracked in `PERFORMANCE.md`.

**The mandatory mitigation:** Chromium throttles background renderer timers to ~1 Hz. For a game whose _normal_ state is "running behind other windows," that would silently stall the simulation. `backgroundThrottling: false` is therefore not optional, and phase-01 includes an E2E test asserting the tick continues while the window is occluded. Offline progress (ADR-002 §6) is the safety net, not the mechanism.

### 3. Process responsibilities

| Process      | Owns                                                                                                                       | Never does                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **main**     | Window lifecycle, overlay geometry, always-on-top, click-through, tray, single-instance lock, all disk I/O, IPC validation | Game logic. Rendering.                         |
| **preload**  | A narrow, typed `contextBridge` surface                                                                                    | Business logic. Exposing `ipcRenderer`.        |
| **renderer** | Simulation, rendering, UI                                                                                                  | Direct disk access. Direct `electron` imports. |

The renderer is treated as untrusted by the main process. Every IPC payload is validated on receipt (`AI_RULES.md` §2.4). This is defensive today and _literally correct_ from v0.2, when plugin code runs in the renderer.

### 4. Layered architecture inside the renderer

```
   ┌──────────────────────────────────────────────────┐
   │  app (React)          render (PixiJS)            │   views — disposable
   │      │                     │                     │
   │      │  intents            │  snapshots          │
   │      ▼                     ▼                     │
   ├──────────────────────────────────────────────────┤
   │                    sim                           │   the truth — pure
   │        world · systems · content · rng           │
   └──────────────────────────────────────────────────┘
                          │
                    shared (types, constants, contracts)
```

**One rule governs everything:** `src/sim` is a headless, deterministic TypeScript library that has no idea it is inside a game client. It imports only `shared`. It runs under `vitest` with no DOM, no Electron, and no Pixi.

Both views are _disposable_: destroying and rebuilding the renderer or the React tree loses nothing, because neither holds authoritative state. This is what makes ADR-001's collapsed-mode teardown possible, and it is what will make a worker migration or a future headless server possible.

Enforcement is mechanical, not cultural — `eslint-plugin-boundaries` plus a separate `tsconfig` with neither DOM nor Node libs (`CODE_STYLE.md` §8, `TECH_STACK.md` §3.1). The full import matrix lives in `CODE_STYLE.md` §8.1.

### 5. Data flow: intents down, snapshots up

Views never mutate the world.

```
User clicks a tile
  → UI dispatches an Intent  { type: 'plant', tile, seed }
  → Intent queued
  → Next tick: sim validates and applies it, returns Result
  → Sim produces an immutable snapshot when state changes
  → Render layer diffs the snapshot, marks the scene dirty (ADR-001)
  → UI subscribes to snapshot slices at a throttled rate (ADR-005)
```

Intents being queued and applied _on a tick boundary_ — never mid-tick — is what preserves determinism (ADR-007). It also means every player action is already in the shape a replay or a network layer would need.

### 6. A `plugins/` architecture is reserved now, implemented in v0.2

`VISION.md` §4 commits to mod support. Retrofitting extensibility into a core that assumes it owns all content is a rewrite, so v0.1 pays the small, bounded cost of being _shaped_ for plugins without building a loader.

**What v0.1 builds:**

- **Namespaced content IDs.** Every crop, item, building, and tile type is `namespace:name` — `core:wheat`. Permanent identifiers (`AI_RULES.md` §1.4).
- **Content registries.** All content is registered through a typed registry API (`registerCrop`, `registerItem`, …) rather than being hardcoded in switch statements or imported directly by systems. First-party content registers through the _same_ API a plugin will use.
- **A typed event bus** in the simulation with documented hook points (`onTickStart`, `onCropHarvested`, `onItemSold`, …). v0.1 core uses it for its own decoupling, so the hooks are exercised and real rather than speculative.
- **Namespaced save partitioning** with preservation of data from absent plugins (ADR-002 §5).
- **A top-level `plugins/` directory** containing `core/` — first-party content — plus the manifest schema and API documentation.

**What v0.1 explicitly does not build:** dynamic loading, sandboxing, a permission model, dependency resolution, a plugin settings UI, or hot reload. Those are v0.2 (`PLAN.md`).

The critical design point: **`plugins/core/` is registered through the public plugin API but statically imported.** The API is therefore proven sufficient by first-party content before any third party depends on it, and adding the loader in v0.2 changes _how_ content arrives — not the shape of the content system. That is what makes this cheap now instead of a rewrite later.

This is a deliberate, bounded exception to `AI_RULES.md` §1.5 (no unnecessary abstractions), authorized by the extension-point table in `VISION.md` §4.2.

### 7. Build tooling

`electron-vite` for development and bundling — it handles three entry points with different targets, renderer HMR, and main-process restart. `electron-builder` for the Windows NSIS installer and portable build.

---

## Alternatives Considered

### A. Tauri 2 (Rust + WebView2)

The strongest alternative, and the one that best serves the idle-cost goal.

- **For:** roughly 40–70 MB idle RSS versus Electron's 120–180 MB — a substantial win for an all-day background app. Smaller installer. No bundled Chromium.
- **Against:** Windows overlay semantics (transparency, click-through, always-on-top layering, per-monitor DPI) require more native plumbing and are less well-trodden than Electron's. Adds Rust to a stack whose contributors are AI sessions working from TypeScript documentation. WebView2 is a system dependency whose version varies across machines, which matters for a renderer with GPU requirements (ADR-001).
- **Rejected because:** the delivery risk concentrates in phase-01 — the one phase that must not fail, since the entire product thesis rests on the overlay being livable. Electron's maturity buys certainty exactly where certainty is most valuable.
- **Exit criteria, stated in advance:** if `PERFORMANCE.md`'s memory ceiling proves unreachable on Electron after honest optimization, revisit. The layered architecture in §4 confines a shell migration to `src/main`, `src/preload`, and the renderer's bootstrap — `src/sim` and `src/persistence` port unchanged. This is the primary reason the boundary is enforced so strictly.

### B. Native Windows (C# / WinUI 3 or C++ / Win32)

- **For:** the best possible overlay integration and the smallest footprint by a wide margin.
- **Rejected because:** it contradicts the TypeScript requirement in the project brief, discards the web rendering and UI ecosystem, and is dramatically slower to build and to extend across the roadmap.

### C. Simulation in the main process

- **Rejected because:** §2 — it forces 20 Hz IPC of world state and produces two copies of the truth.

### D. Simulation in a Web Worker from day one

- **Deferred, not rejected.** Correct in principle; premature for a sub-millisecond tick. The architecture preserves the option and §2 states the trigger.

### E. A monolithic renderer with no sim/view separation

- **Rejected because:** it forfeits headless testing, deterministic replay, ADR-001's collapsed-mode teardown, and any future worker or server split. The separation is the single highest-leverage decision in this document.

---

## Tradeoffs Accepted

| We accept                                 | To gain                                  | Mitigation                                                                          |
| ----------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Electron's memory baseline                | Overlay maturity, delivery certainty     | Strict budgets in `PERFORMANCE.md`; ADR-001 §2 teardown; Tauri exit criteria stated |
| ~80–120 MB installer                      | Bundled, version-stable runtime          | Acceptable for a desktop game                                                       |
| Three-process complexity                  | Security isolation, correct architecture | `electron-vite` absorbs most of the build cost                                      |
| IPC ceremony for disk access              | Renderer never touches the filesystem    | Small, typed, enumerated surface                                                    |
| Sim shares a thread with render + UI      | Simplicity, no clone boundary            | Budgeted and measured; worker trigger pre-committed                                 |
| Plugin-shaped code before a loader exists | v0.2 mod support without a core rewrite  | Bounded to registries, IDs, events, and save namespacing                            |

---

## Consequences

### Immediate

- Phase-00 establishes the three `tsconfig` files, path aliases, and the boundary linter **before** any game code — the boundary is unenforceable if introduced after violations exist.
- Phase-01 delivers overlay behavior alone, including the `backgroundThrottling` occlusion test.
- Content registries and namespaced IDs are used from the first crop defined in phase-03. Retrofitting IDs after content exists means breaking permanent identifiers.

### Ongoing

- No `electron` import outside `src/main` and `src/preload`. No `node:` import inside `src/sim`. Lint-enforced.
- Every new IPC channel is added to the typed contract in `shared` and validated on receipt.
- Every new content type gets a registry, not a hardcoded list.
- Every player action is an Intent applied on a tick boundary — never a direct mutation from a click handler.

### Validation

- `npm run check:boundaries` fails the build on any layer violation.
- A test suite imports every module under `src/sim` in a plain Node environment with no DOM; failure means the boundary broke.
- Phase-01 E2E: the tick continues advancing while the window is fully occluded by another application.

### Revisit if

- Memory ceiling unreachable → alternative A.
- p99 tick exceeds 3 ms → alternative D.
- Windows-only stops being acceptable → re-evaluate the shell (`VISION.md` §5.1 defers this to v0.3 at the earliest).
