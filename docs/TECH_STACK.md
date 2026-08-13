# TECH_STACK

> **Status:** Authoritative list of every dependency and why it is here.
> **Owns:** Technology choices, versions, dependency policy.
> **Does not own:** _Why_ the major choices were made — that is `docs/decisions/` (ADR-001, 003, 005, 006).

**Version policy:** exact versions are pinned in `package.json` with a lockfile committed. Do not upgrade a major version as a side effect of feature work (`AI_RULES.md` §1.2); upgrades are their own commit with their own testing.

**Versions were verified and pinned in phase-00.** §9 records what was found, including two upstream constraints that force us _off_ the latest release of TypeScript and Vite. Read §9 before upgrading anything.

---

## 1. The Stack at a Glance

| Layer              | Technology                    | Decision record  |
| ------------------ | ----------------------------- | ---------------- |
| Desktop shell      | Electron                      | ADR-003          |
| Language           | TypeScript (strict)           | —                |
| World renderer     | PixiJS (WebGL/WebGPU)         | ADR-001          |
| UI layer           | React                         | ADR-005          |
| Build / dev server | electron-vite (Vite + Rollup) | ADR-003          |
| Packaging          | electron-builder              | ADR-003          |
| Update delivery    | electron-updater              | ADR-025, ADR-028 |
| Testing            | Vitest + Playwright           | `TESTING.md`     |
| Asset pipeline     | AssetPack + Aseprite          | ADR-006          |
| Persistence        | JSON + versioned migrations   | ADR-002          |
| State bridge       | Custom snapshot store         | ADR-004, ADR-005 |

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

`backgroundThrottling: false` is load-bearing. Chromium throttles timers in backgrounded renderers to 1 Hz, which for an idle game running in the background — the _normal_ case for this product — would silently stall the simulation. The offline-progress path (`SAVE_FORMAT.md`) is the safety net, not the primary mechanism.

### 2.2 Node.js

Node 20 LTS or newer, as bundled with Electron. The `node:` prefix is required on all builtin imports (`CODE_STYLE.md` §7.1).

### 2.3 Package manager

**npm** with a committed `package-lock.json`. Chosen over pnpm/yarn for zero-setup compatibility with Electron tooling and CI. Not a decision worth revisiting unless install time becomes a real problem.

---

## 3. Language and Type System

### 3.1 TypeScript

**Pinned: 5.9.3.** Not the latest — see §9.1. Do not upgrade without reading it.

Configuration and banned constructs: `CODE_STYLE.md` §1. Notable requirements from newer versions: `erasableSyntaxOnly` (bans `enum` and parameter properties), `verbatimModuleSyntax`, and `noUncheckedIndexedAccess`.

Three `tsconfig` files, because the three Electron processes have genuinely different global environments:

| File                     | Target                                     | Lib                           |
| ------------------------ | ------------------------------------------ | ----------------------------- |
| `tsconfig.main.json`     | `src/main`, `src/preload`                  | Node types, no DOM            |
| `tsconfig.renderer.json` | `src/renderer`                             | DOM, no Node types            |
| `tsconfig.sim.json`      | `src/sim`, `src/shared`, `src/persistence` | **Neither** — no DOM, no Node |

The third is the interesting one: `src/sim` is compiled with neither DOM nor Node globals available. This makes the purity rule from `AI_RULES.md` §2.1 a _compile error_ rather than a code-review comment. `document`, `window`, `fs`, and `process` simply do not exist there.

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

| Tool                             | Scope                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Vitest**                       | Unit and integration tests. Shares Vite config, so aliases and TS setup work with no duplication. Native ESM, fast watch mode. |
| **@vitest/coverage-v8**          | Coverage gates (`TESTING.md` §Coverage)                                                                                        |
| **Playwright** (`_electron` API) | End-to-end tests that launch the real packaged app and assert on real overlay behavior                                         |
| **fast-check**                   | Property-based tests for the simulation — determinism, save round-trips, migration chains                                      |

`fast-check` earns its place: "serialize → deserialize → identical state" and "same seed → same outcome" are properties, not examples, and property tests find the edge cases that hand-written examples miss.

### 5.4 Quality gates

| Tool                                           | Enforces                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **ESLint** (flat config) + `typescript-eslint` | `CODE_STYLE.md`                                                                                                                            |
| **eslint-plugin-boundaries**                   | Layer rules (`CODE_STYLE.md` §8) — **this is the one that protects the architecture**. Config has three non-obvious requirements; see §9.3 |
| **eslint-plugin-import-x**                     | Import order, no cycles. The maintained fork — see §9.2                                                                                    |
| **Prettier**                                   | Formatting                                                                                                                                 |
| **dependency-cruiser**                         | Cycle detection and a visual dependency graph in CI                                                                                        |
| **Husky + lint-staged**                        | Pre-commit typecheck, lint, format on staged files                                                                                         |

### 5.5 Assets

**AssetPack** (`@assetpack/core`) for atlas generation and asset manifests; **Aseprite** as the authoring tool for pixel art. Full pipeline: **ADR-006** and `ASSETS.md`.

### 5.6 electron-updater

**Floor:** electron-updater 6.8+. Adopted in phase-15 under ADR-025 §7, which made the choice conditional rather than assumed: _"a library that cannot deliver §2's schema-bounded rollback, §4's interruption recovery, and §5's restart discipline is not adopted, and the gaps are implemented rather than the guarantees relaxed."_

**It is adopted for what it is good at, and it does not decide anything.** Update delivery splits into two halves, and the library owns one of them:

| Half                                                                                              | Owner              | Why                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Transport — reach the feed, compare versions, download, verify SHA-512, hand off to the installer | `electron-updater` | Real work over a network with real edge cases, and the SHA-512 check is what ADR-028 §2 keeps fatal now that signing is deferred          |
| Policy — may this build be applied at all, and may the player be told right now                   | this project       | `update-policy.ts`, `rollback-guard.ts`, `update-announcer.ts`; every one of them was written and proven before the library was installed |

The measurement against §7's three guarantees is recorded in §7.4, including where it does **not** deliver.

Its defaults are actively overridden. `src/main/updater-config.ts` holds them as data with no import of the library at all, so the settings carrying ADR-025 §2 and §5 are unit-testable without a host — the same reason `save-store.ts` takes a directory rather than calling `app.getPath`.

---

## 6. Deliberate Omissions

Each of these is a thing a reasonable developer would expect to see. Documented so no future session adds one reflexively.

| Not used                                       | Why                                                                                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Redux / Zustand / Jotai**                    | The world _is_ the state, and it lives in `src/sim` with a custom snapshot bridge (ADR-005). A general-purpose store would either duplicate world state or force sim state into a UI-shaped container. Both are worse.            |
| **An ECS library** (bitECS, miniplex)          | ADR-004. v0.1's entity count does not justify the constraints, and the chosen data-oriented layout upgrades to one without a rewrite if v0.3+ demands it.                                                                         |
| **A database** (SQLite, LevelDB)               | ADR-002. Saves are small, whole-file, and written atomically. A database adds a native dependency, a migration system we'd have to learn, and rebuild pain across Electron versions — for a file that fits comfortably in memory. |
| **A physics engine**                           | There is no physics. Movement is grid-based pathing.                                                                                                                                                                              |
| **An animation library** (GSAP, Framer Motion) | Pixi has a ticker; CSS transitions cover the UI. Adding a third animation authority would fragment render-on-demand control.                                                                                                      |
| **Tailwind / CSS-in-JS**                       | §4.3.                                                                                                                                                                                                                             |
| **An i18n framework**                          | English-only in v0.1. All user-facing strings are centralized in one module from day one so a framework can be introduced later without a text hunt.                                                                              |
| **Telemetry / analytics / crash reporting**    | The game runs on the player's desktop all day. Shipping a network client in v0.1 is a privacy decision, not a technical one, and it is not being made casually. Revisit with an ADR.                                              |
| **An auto-updater**                            | Deliberately deferred to v0.2. An updater that can restart the app is a way to lose player data; it ships only after save integrity is proven (phase-07).                                                                         |

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

- `npm audit --omit=dev --audit-level=high` runs in CI and fails the build.

  **This line was false from phase-00 until phase-15.** It claimed _"`npm audit` runs in CI; high and critical advisories fail the build"_, and there was no audit step in `ci.yml` at all — a documented gate with nothing behind it, which is the exact failure phase-08.0 was created to fix for coverage. It was found by adopting `electron-updater`, which briefly pulled a high advisory into the **shipped** tree with nothing objecting.

  Scoped to production dependencies deliberately. That is the tree the policy protects and the only one that reaches a player. The dev tree currently carries high advisories in the asset pipeline — `@assetpack/core` via `minimatch`, `gpu-tex-enc` via `sharp` — whose fixes are breaking changes; they are **not** gated, and saying so is better than a gate that silently excludes them.

- `contextIsolation: true` and `nodeIntegration: false` are permanent (§2.1) — never relaxed to make something convenient work.
- The preload script exposes a **narrow, explicitly enumerated, typed** API surface. Never expose `ipcRenderer` directly.
- All IPC payloads are validated on receipt in the main process (`AI_RULES.md` §2.4). The renderer is treated as untrusted, which becomes literally true once plugins load in v0.2.
- A strict Content-Security-Policy is set on the renderer; no remote code is ever loaded.

---

### 7.4 Dependency record: `electron-updater` (phase-15)

The first dependency added since phase-00, and the first to be run through §7.1 as a checklist rather than a principle.

#### §7.1, answered

| #   | Requirement                                        | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cannot reasonably be written in ~200 lines         | **Confirmed.** The differential-download, feed-provider, and staged-handoff paths alone are several thousand lines, and the parts that matter are the ones a reimplementation would get subtly wrong: SHA-512 verification before handoff, resumable transfers, and the Windows elevation dance. Writing it would also mean owning it.                                                                                                                                                                                                                                           |
| 2   | Bundle size, >100 KB needs justification           | **~937 KB of runtime JavaScript** across the package and its eight transitive dependencies (`js-yaml` 329, `semver` 132, `fs-extra` 82, `builder-util-runtime` 75, `lodash.isequal` 52, `lodash.escaperegexp` 8, `lazy-val` 1, `tiny-typed-emitter` 1, and ~257 for `electron-updater` itself). Well over the threshold, and justified: **it is main-process only.** `externalizeDepsPlugin` keeps it out of the renderer bundle entirely, so none of it reaches the frame budget ADR-018 §6 protects, and the criterion-4 byte-counting that shaped `start.tsx` does not apply. |
| 3   | Released within 12 months, no unpatched advisories | **6.8.9, published 2026-07-24.** Advisories: see below — this check _failed on first install_ and was fixed, not waived.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | License MIT, Apache-2.0, BSD, or ISC               | **MIT.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5   | No native module                                   | **Confirmed.** No `.node` binaries and no `binding.gyp` anywhere in the package or `builder-util-runtime`; every transitive dependency is pure JS. §7.2's ban holds — v0.2 still ships zero native dependencies.                                                                                                                                                                                                                                                                                                                                                                 |

#### Check 3 failed first, and how

Installing `electron-updater@6.8.9` resolved `js-yaml@4.3.0`, which carries **GHSA-5p4m-2wfm-xmqj** (high; quadratic CPU consumption in `!!omap` resolution). `js-yaml` was already in the repository's dev tree at that version, so nothing changed on disk — what changed is that adopting a **runtime** dependency promoted it into the shipped tree, where §7.3's policy applies.

Fixed by resolution rather than by exception: `js-yaml@4.3.1` is outside the advisory range and satisfies `electron-updater`'s own `^4.1.0`, so the lockfile moved and nothing was overridden or pinned against its declared range. Production tree audits clean at **0 vulnerabilities**.

The useful part is that nothing would have caught it. §7.3 promised an audit gate that did not exist, so this is the advisory that bought the gate.

#### The ADR-025 §7 measurement

§7 forbids adopting a library that cannot deliver three guarantees. It delivers one and a half.

| ADR-025 guarantee                                         | Delivered?                                                                                                                                                                                                                                                                                                               | What fills the gap                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5 restart discipline — never download or restart unasked | **Yes, but only when configured against its defaults.** `autoDownload` and `autoInstallOnAppQuit` both default to `true`, which is the silent background updater §Alternatives A rejected.                                                                                                                               | `updater-config.ts` holds the overrides as tested data; `update-announcer.ts` owns _when_ the player may be asked.                                                                              |
| §2 schema-bounded rollback                                | **No, and it cannot.** The library has no concept of a save, let alone a `schemaVersion`. `allowDowngrade: false` prevents an automatic downgrade but says nothing about whether a _forward_ build can read the save on disk — which is the case §Context is actually about.                                             | `rollback-guard.ts` and `update-policy.ts`, both written and proven before the library was installed.                                                                                           |
| §4 interruption recovery                                  | **Not established.** On Windows the library verifies the download and then hands off to the NSIS installer, which performs the replacement. That is not the retain → swap → commit sequence `install-store.ts` proves, and "an interrupted update leaves a launchable application" has **not** been demonstrated for it. | Open. `install-store.ts` remains the specification and the yardstick; whether it becomes the implementation depends on measuring the NSIS path against it, which needs a packaged installation. |

This is exactly the shape §7 anticipated — _"the gaps are implemented rather than the guarantees relaxed"_ — and it is why the release source was built as an injected parameter three boundaries before the library existed. The policy is not the library's to hold.

**Also not delivered: the feed cannot carry the fields the policy needs.** `OfferedRelease` requires `schemaVersion` (§2) and `halted` (§6); electron-builder's generated `latest.yml` carries neither, and there is no supported way to add them. That is an open design question, not a defect in the library.

---

## 8. Where Each Choice Is Argued

This document lists _what_. The reasoning, alternatives considered, and tradeoffs accepted live in:

| Decision                                | ADR                                    |
| --------------------------------------- | -------------------------------------- |
| PixiJS over Canvas 2D                   | `decisions/ADR-001-rendering.md`       |
| JSON saves with migrations              | `decisions/ADR-002-save-system.md`     |
| Electron, process layout, build tooling | `decisions/ADR-003-architecture.md`    |
| Data-oriented entities over ECS         | `decisions/ADR-004-entity-model.md`    |
| React for UI, snapshot bridge           | `decisions/ADR-005-ui-framework.md`    |
| AssetPack asset pipeline                | `decisions/ADR-006-asset-pipeline.md`  |
| 20 Hz fixed tick                        | `decisions/ADR-007-simulation-tick.md` |

---

## 9. Phase-00 Version Findings

Recorded because each of these looks like an accident and will otherwise be "fixed" by a future session, breaking the build or — worse — silently disabling the architecture checks.

### 9.1 TypeScript is pinned BELOW latest, deliberately

At phase-00, `typescript@latest` was **7.0.2** (the native compiler rewrite). We pin **5.9.3**.

**Reason:** `typescript-eslint@8.65.0` declares `typescript: ">=4.8.4 <6.1.0"`. TypeScript 7 is outside that range, so installing it disables `typescript-eslint` — and with it the boundary linter, which is the mechanism protecting the entire architecture (`ARCHITECTURE.md` §10). The failure mode is not a build break; it is checks that stop running.

5.9.3 satisfies everything `CODE_STYLE.md` §1.1 requires, including `erasableSyntaxOnly` (added in 5.8).

**Before upgrading:** confirm `typescript-eslint`'s peer range covers the target, then re-run the phase-00 deliberate-violation tests (§9.4). Do not upgrade TypeScript to satisfy a "you're behind" prompt.

### 9.2 `eslint-plugin-import` → `eslint-plugin-import-x`

`eslint-plugin-import@2.32.0` supports ESLint `^8 || ^9`. We are on ESLint 10, so install fails with `ERESOLVE`.

We use **`eslint-plugin-import-x@4.17.1`**, the actively maintained fork, which declares `eslint: "^8.57.0 || ^9.0.0 || ^10.0.0"`. Rule names change from `import/*` to `import-x/*`.

**Exception:** `eslint-plugin-boundaries` reads the resolver from the **`import/resolver`** settings key, not `import-x/resolver`. Both keys appear in `eslint.config.js` and that is not a mistake.

### 9.3 eslint-plugin-boundaries: three things that silently disable it

All three were found by writing deliberate violations and observing that **nothing was reported**. Each fails open — the check passes and the architecture is unguarded.

1. **Element patterns must be folder patterns.** `pattern: 'src/sim'` works; `pattern: 'src/sim/**/*'` leaves every file `isUnknown: true` and no rule ever fires.
2. **A TypeScript resolver is required.** Without `'import/resolver': { typescript: … }`, extensionless relative imports don't resolve and every _internal_ layer violation passes silently.
3. **External package bans need the deprecated `boundaries/external` rule.** In 7.1.0 the replacement `boundaries/dependencies` handles internal layers correctly but ignores `to.module.origin: "external"` denials entirely. We use `dependencies` for layers and `external` for package bans, and accept the deprecation warning. Re-test on every upgrade.

Diagnose with `ESLINT_PLUGIN_BOUNDARIES_DEBUG=1`; `isUnknown: true` on a file that should belong to a layer means detection is broken.

### 9.4 The regression test for all of the above

Because every failure here is silent, `tests/boundaries.test.ts` asserts that known-bad source is **rejected**. It is the only proof the architecture is enforced rather than merely configured.

**After any upgrade to TypeScript, ESLint, `typescript-eslint`, or `eslint-plugin-boundaries`, run it.** A green `npm run lint` proves nothing on its own — that is exactly what a disabled linter looks like.

### 9.5 Other pins

| Package       | Latest at phase-00 | Pinned     | Reason                                                      |
| ------------- | ------------------ | ---------- | ----------------------------------------------------------- |
| `vite`        | 8.1.5              | **7.3.6**  | `electron-vite@5` peer allows `^5 \|\| ^6 \|\| ^7`          |
| `lint-staged` | 17.1.0             | **16.4.0** | 17 requires Node ≥22.22.1; toolchain is 22.21.0             |
| `@eslint/js`  | 10.0.1             | 10.0.1     | Required explicitly by flat config; not bundled with ESLint |
