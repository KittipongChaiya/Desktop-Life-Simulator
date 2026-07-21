# TECH_STACK

> **Status:** Authoritative list of every dependency and why it is here.
> **Owns:** Technology choices, versions, dependency policy.
> **Does not own:** *Why* the major choices were made — that is `docs/decisions/` (ADR-001, 003, 005, 006).

**Version policy:** every version below is a **floor**, expressed as "verify and pin at phase-00." Exact versions are pinned in `package.json` with a lockfile committed. Do not upgrade a major version as a side effect of feature work (`AI_RULES.md` §1.2); upgrades are their own commit with their own testing.

---

## 1. The Stack at a Glance

| Layer | Technology | Decision record |
|---|---|---|
| Desktop shell | Electron | ADR-003 |
| Language | TypeScript (strict) | — |
| World renderer | PixiJS (WebGL/WebGPU) | ADR-001 |
| UI layer | React | ADR-005 |
| Build / dev server | electron-vite (Vite + Rollup) | ADR-003 |
| Packaging | electron-builder | ADR-003 |
| Testing | Vitest + Playwright | `TESTING.md` |
| Asset pipeline | AssetPack + Aseprite | ADR-006 |
| Persistence | JSON + versioned migrations | ADR-002 |
| State bridge | Custom snapshot store | ADR-004, ADR-005 |

**Deliberately absent:** no state management library (Redux/Zustand/Jotai), no ORM, no database, no CSS framework, no animation library, no ECS library, no i18n framework, no telemetry SDK. Each is justified in §6.

---

## 2. Runtime

### 2.1 Electron

**Floor:** Electron 33+ (Chromium 130+, Node 20 LTS). Verify latest stable at phase-00 and pin.

Provides the three things this project cannot get elsewhere without native code:

- **Overlay window semantics** — `transparent`, `frame: false`, `alwaysOnTop` with level control, `skipTaskbar`, `setIgnoreMouseEvents` for click-through regions.
- **Screen geometry** — `screen.getPrimaryDisplay().workArea` for correct docking above the taskbar, plus multi-monitor and DPI-change events.
- **A Node process** for atomic file I/O, tray integration, and single-instance locking.

**Required configuration** (enforced at phase-01, verified by an E2E test):

```ts
{
  webPreferences: {
    contextIsolation: true,        // security: renderer cannot touch Node
    nodeIntegration: false,        // security: no require() in renderer
    sandbox: true,
    backgroundThrottling: false,   // CRITICAL: the sim must keep ticking when occluded
    preload: /* typed contextBridge surface */,
  }
}
```

`backgroundThrottling: false` is load-bearing. Chromium throttles timers in backgrounded renderers to 1 Hz, which for an idle game running in the background — the *normal* case for this product — would silently stall the simulation. The offline-progress path (`SAVE_FORMAT.md`) is the safety net, not the primary mechanism.

### 2.2 Node.js

Node 20 LTS or newer, as bundled with Electron. The `node:` prefix is required on all builtin imports (`CODE_STYLE.md` §7.1).

### 2.3 Package manager

**npm** with a committed `package-lock.json`. Chosen over pnpm/yarn for zero-setup compatibility with Electron tooling and CI. Not a decision worth revisiting unless install time becomes a real problem.

---

## 3. Language and Type System

### 3.1 TypeScript

**Floor:** TypeScript 5.6+.

Configuration and banned constructs: `CODE_STYLE.md` §1. Notable requirements from newer versions: `erasableSyntaxOnly` (bans `enum` and parameter properties), `verbatimModuleSyntax`, and `noUncheckedIndexedAccess`.

Three `tsconfig` files, because the three Electron processes have genuinely different global environments:

| File | Target | Lib |
|---|---|---|
| `tsconfig.main.json` | `src/main`, `src/preload` | Node types, no DOM |
| `tsconfig.renderer.json` | `src/renderer` | DOM, no Node types |
| `tsconfig.sim.json` | `src/sim`, `src/shared`, `src/persistence` | **Neither** — no DOM, no Node |

The third is the interesting one: `src/sim` is compiled with neither DOM nor Node globals available. This makes the purity rule from `AI_RULES.md` §2.1 a *compile error* rather than a code-review comment. `document`, `window`, `fs`, and `process` simply do not exist there.

---

## 4. Rendering and UI

### 4.1 PixiJS — world rendering

**Floor:** PixiJS 8+. Decision and mitigations: **ADR-001**.

v8 is required specifically for its WebGPU renderer with automatic WebGL2 fallback, the async `Application.init()` initialization, and its improved batching. Chosen as primary renderer for the long-term entity, particle, and weather load described in `VISION.md` §4.

**Binding constraints from ADR-001:**

- Render-on-demand is mandatory — the ticker stops when nothing is animating.
- All textures come from generated atlases (`ASSETS.md`), never loose files at runtime.
- Explicit `destroy()` on every display object (`CODE_STYLE.md` §10).

**Canvas 2D is the documented fallback only** — used if a machine fails to initialize both WebGPU and WebGL2. It is not the default and not a parallel implementation of the full renderer; see ADR-001 §Fallback Scope for exactly how much it covers.

### 4.2 React — panels, HUD, menus

**Floor:** React 18+ (19 preferred; verify at phase-00). Decision: **ADR-005**.

React renders the inventory, shop, worker list, settings, and HUD. It does **not** render the world, does not participate in the simulation tick, and does not mutate world state. It consumes immutable snapshots at a throttled rate (`ARCHITECTURE.md` §UI Data Flow).

### 4.3 Styling

**Plain CSS Modules.** No Tailwind, no CSS-in-JS.

The UI surface is small and fixed (a handful of panels in a 220px-tall overlay), so a utility framework's payload and build cost buy nothing. CSS-in-JS adds runtime style recalculation in a process with a strict CPU budget. CSS Modules give scoping with zero runtime.

---

## 5. Tooling

### 5.1 electron-vite

**Floor:** electron-vite 2+.

Handles the awkward part of Electron builds — three separate entry points (main, preload, renderer) with different targets — plus HMR for the renderer and automatic main-process restart. Replaces roughly 200 lines of hand-written Vite/Rollup configuration.

### 5.2 electron-builder

**Floor:** electron-builder 25+.

Produces the Windows NSIS installer and a portable build. Configured for `win/x64` only in v0.1, consistent with the Windows-first non-goal in `VISION.md` §5.1.

### 5.3 Testing

| Tool | Scope |
|---|---|
| **Vitest** | Unit and integration tests. Shares Vite config, so aliases and TS setup work with no duplication. Native ESM, fast watch mode. |
| **@vitest/coverage-v8** | Coverage gates (`TESTING.md` §Coverage) |
| **Playwright** (`_electron` API) | End-to-end tests that launch the real packaged app and assert on real overlay behavior |
| **fast-check** | Property-based tests for the simulation — determinism, save round-trips, migration chains |

`fast-check` earns its place: "serialize → deserialize → identical state" and "same seed → same outcome" are properties, not examples, and property tests find the edge cases that hand-written examples miss.

### 5.4 Quality gates

| Tool | Enforces |
|---|---|
| **ESLint** (flat config) + `typescript-eslint` | `CODE_STYLE.md` |
| **eslint-plugin-boundaries** | Layer rules (`CODE_STYLE.md` §8) — **this is the one that protects the architecture** |
| **eslint-plugin-import** | Import order, no cycles |
| **Prettier** | Formatting |
| **dependency-cruiser** | Cycle detection and a visual dependency graph in CI |
| **Husky + lint-staged** | Pre-commit typecheck, lint, format on staged files |

### 5.5 Assets

**AssetPack** (`@assetpack/core`) for atlas generation and asset manifests; **Aseprite** as the authoring tool for pixel art. Full pipeline: **ADR-006** and `ASSETS.md`.

---

## 6. Deliberate Omissions

Each of these is a thing a reasonable developer would expect to see. Documented so no future session adds one reflexively.

| Not used | Why |
|---|---|
| **Redux / Zustand / Jotai** | The world *is* the state, and it lives in `src/sim` with a custom snapshot bridge (ADR-005). A general-purpose store would either duplicate world state or force sim state into a UI-shaped container. Both are worse. |
| **An ECS library** (bitECS, miniplex) | ADR-004. v0.1's entity count does not justify the constraints, and the chosen data-oriented layout upgrades to one without a rewrite if v0.3+ demands it. |
| **A database** (SQLite, LevelDB) | ADR-002. Saves are small, whole-file, and written atomically. A database adds a native dependency, a migration system we'd have to learn, and rebuild pain across Electron versions — for a file that fits comfortably in memory. |
| **A physics engine** | There is no physics. Movement is grid-based pathing. |
| **An animation library** (GSAP, Framer Motion) | Pixi has a ticker; CSS transitions cover the UI. Adding a third animation authority would fragment render-on-demand control. |
| **Tailwind / CSS-in-JS** | §4.3. |
| **An i18n framework** | English-only in v0.1. All user-facing strings are centralized in one module from day one so a framework can be introduced later without a text hunt. |
| **Telemetry / analytics / crash reporting** | The game runs on the player's desktop all day. Shipping a network client in v0.1 is a privacy decision, not a technical one, and it is not being made casually. Revisit with an ADR. |
| **An auto-updater** | Deliberately deferred to v0.2. An updater that can restart the app is a way to lose player data; it ships only after save integrity is proven (phase-07). |

---

## 7. Dependency Policy

### 7.1 Adding a dependency

A new runtime dependency requires **all** of:

1. A stated reason why it cannot be reasonably written in under ~200 lines
2. Bundle size checked and reported in the PR — anything over 100 KB needs explicit justification (`AI_RULES.md` §2.3)
3. Maintenance check: released within the last 12 months, no known unpatched advisories
4. License compatibility: MIT, Apache-2.0, BSD, or ISC. **Copyleft licenses are rejected.**
5. Confirmation it does not pull in a native module (see §7.2)

Dev dependencies are held to 3, 4, and 5 only.

### 7.2 Native modules are effectively banned

Native Node modules must be rebuilt per Electron version, break CI on version bumps, complicate packaging, and are the most common source of "works on my machine" in Electron projects. v0.1 ships **zero** native dependencies.

Introducing one requires an ADR demonstrating no pure-JS alternative exists.

### 7.3 Security posture

- `npm audit` runs in CI; high and critical advisories fail the build.
- `contextIsolation: true` and `nodeIntegration: false` are permanent (§2.1) — never relaxed to make something convenient work.
- The preload script exposes a **narrow, explicitly enumerated, typed** API surface. Never expose `ipcRenderer` directly.
- All IPC payloads are validated on receipt in the main process (`AI_RULES.md` §2.4). The renderer is treated as untrusted, which becomes literally true once plugins load in v0.2.
- A strict Content-Security-Policy is set on the renderer; no remote code is ever loaded.

---

## 8. Where Each Choice Is Argued

This document lists *what*. The reasoning, alternatives considered, and tradeoffs accepted live in:

| Decision | ADR |
|---|---|
| PixiJS over Canvas 2D | `decisions/ADR-001-rendering.md` |
| JSON saves with migrations | `decisions/ADR-002-save-system.md` |
| Electron, process layout, build tooling | `decisions/ADR-003-architecture.md` |
| Data-oriented entities over ECS | `decisions/ADR-004-entity-model.md` |
| React for UI, snapshot bridge | `decisions/ADR-005-ui-framework.md` |
| AssetPack asset pipeline | `decisions/ADR-006-asset-pipeline.md` |
| 20 Hz fixed tick | `decisions/ADR-007-simulation-tick.md` |
