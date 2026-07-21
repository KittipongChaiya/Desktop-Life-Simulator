# CODE_STYLE

> **Status:** Enforced by ESLint, Prettier, and `tsc`. Where a rule can be automated, it is — this document explains the *why* so future sessions do not fight the tooling.
> **Owns:** TypeScript rules, naming, comments, imports, module boundaries in code.
> **Does not own:** The folder tree (`PROJECT_STRUCTURE.md`), process rules (`AI_RULES.md`), test style (`TESTING.md`).

---

## 1. TypeScript Configuration

### 1.1 Strictness is non-negotiable

`tsconfig.json` enables the full strict family. These are not defaults to be relaxed when something is inconvenient:

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,      // arr[i] is T | undefined — critical for tile grids
  "exactOptionalPropertyTypes": true,     // `{ a?: string }` ≠ `{ a: string | undefined }`
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "noImplicitReturns": true,
  "isolatedModules": true,
  "verbatimModuleSyntax": true,
  "erasableSyntaxOnly": true
}
```

`noUncheckedIndexedAccess` deserves special mention: this codebase indexes tile arrays constantly, and it is the rule that turns "silent `undefined` propagating into the simulation" into a compile error.

### 1.2 Banned constructs

| Banned | Why | Instead |
|---|---|---|
| `any` | Erases the type system exactly where it matters | `unknown` + narrowing |
| `as` assertions on unvalidated data | Lies to the compiler about runtime shape | A parse/validate function returning a typed result |
| Non-null `!` | Asserts an invariant the compiler can't see and you can't test | Explicit check with a real error |
| `@ts-ignore` | Hides the problem | `@ts-expect-error` with a reason comment, or fix it |
| `enum` | Emits runtime code, breaks `erasableSyntaxOnly`, has surprising semantics | `as const` object + derived union type |
| `namespace` | Legacy module system | ES modules |
| Class inheritance beyond one level | Deep hierarchies are the abstraction trap `AI_RULES.md` §1.5 forbids | Composition, plain functions |
| Default exports | Break rename refactors and make imports inconsistent | Named exports only |
| Barrel files re-exporting everything | Destroy tree-shaking, create import cycles | Import from the defining module |

### 1.3 The `as const` enum pattern

```ts
export const CropStage = {
  Seed: 'seed',
  Sprout: 'sprout',
  Growing: 'growing',
  Mature: 'mature',
} as const;

export type CropStage = (typeof CropStage)[keyof typeof CropStage];
```

Erasable, JSON-safe (important for saves — see `SAVE_FORMAT.md`), and narrows correctly in switches.

### 1.4 Branded IDs

Entity identifiers are branded so a `WorkerId` can never be passed where a `TileId` is expected. This class of bug is otherwise invisible and very common in entity systems.

```ts
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type EntityId = Brand<number, 'EntityId'>;
export type WorkerId = Brand<EntityId, 'Worker'>;
export type TileIndex = Brand<number, 'TileIndex'>;
export type ContentId = Brand<string, 'ContentId'>;   // e.g. "core:wheat"
```

### 1.5 Result types over exceptions at boundaries

Inside a module, throw freely. At a boundary — IPC, disk, plugin, user input, save parsing — return a discriminated result. Callers cannot forget to handle it, and it survives process boundaries.

```ts
export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

---

## 2. Immutability

### 2.1 Default to readonly

All type declarations use `readonly` properties and `readonly T[]` arrays unless the field is deliberately mutable simulation state.

```ts
export interface CropDefinition {
  readonly id: ContentId;
  readonly growthTicks: number;
  readonly yields: readonly ItemStack[];
}
```

### 2.2 The deliberate exception: simulation hot state

Strict immutability in a 20 Hz simulation loop means allocating a new object per entity per tick. At the entity counts this project targets, that is a garbage-collection problem, not a style question.

**Therefore:** inside `src/sim/systems/`, mutation of the world's own entity stores is permitted and expected. Everywhere else — content definitions, UI state, config, save payloads, IPC messages, anything crossing a module boundary — is immutable.

This is a real exception, and it is bounded by exactly one directory. Do not extend it. Do not use it to justify mutation in the UI layer.

```ts
// OK — inside src/sim/systems/growth.ts, mutating owned world state
export function growthSystem(world: World): void {
  for (const crop of world.crops.values()) {
    if (crop.stage !== CropStage.Mature) crop.growth += 1;
  }
}

// NOT OK — anywhere else
function addCoins(wallet: Wallet, n: number) { wallet.coins += n; }        // no
function addCoins(wallet: Wallet, n: number) { return { ...wallet, coins: wallet.coins + n }; } // yes
```

---

## 3. Naming

| Kind | Convention | Example |
|---|---|---|
| Files (code) | `kebab-case.ts` | `worker-assignment.ts` |
| Files (React components) | `PascalCase.tsx` | `InventoryPanel.tsx` |
| Directories | `kebab-case` | `src/sim/systems/` |
| Types, interfaces, components | `PascalCase` | `CropDefinition` |
| Variables, functions | `camelCase` | `harvestCrop` |
| Constants (module-level, fixed) | `UPPER_SNAKE_CASE` | `TICKS_PER_SECOND` |
| React hooks | `useCamelCase` | `useWorldSnapshot` |
| Booleans | `is` / `has` / `can` / `should` prefix | `isMature`, `canAfford` |
| Systems | `<noun>System` | `growthSystem` |
| Content IDs | `namespace:kebab-case` | `core:wheat` |
| Test files | `<subject>.test.ts` | `growth.test.ts` |

### 3.1 No abbreviations

`worker`, not `wkr`. `inventory`, not `inv`. `position`, not `pos`. The exceptions are universal and short: `id`, `ok`, `x`, `y`, `dt`, `i` (loop index only), `rng`.

### 3.2 No type-suffixed names

`Interface`, `Type`, `Impl`, `Base`, and `Abstract` are not part of names. `CropDefinition`, not `ICropDefinition`.

### 3.3 Name for the domain, not the pattern

`WorkerAssignment`, not `WorkerManager`. `priceTable`, not `priceHelper`. If the only honest name for a class is "Manager" or "Helper", it does not have a coherent responsibility and should be split or inlined.

---

## 4. Functions

- **Under 50 lines.** Over that, it is doing more than one thing.
- **Under 4 levels of nesting.** Use early returns — guard clauses first, happy path unindented at the bottom.
- **Under 4 positional parameters.** Beyond that, take a single options object.
- **Explicit return types on all exported functions.** Inference is fine internally; exported signatures are contracts and must be written down.
- **No boolean parameters at call sites.** `harvest(tile, true)` is unreadable; use an options object or two functions.

```ts
// Preferred shape: guards up top, happy path flat
export function plantSeed(world: World, tile: TileIndex, seed: ContentId): Result<void> {
  const state = world.tiles[tile];
  if (state === undefined) return err(AppError.tileOutOfBounds(tile));
  if (state.kind !== TileKind.Tilled) return err(AppError.tileNotTilled(tile));
  if (!world.inventory.has(seed, 1)) return err(AppError.missingItem(seed));

  world.inventory.remove(seed, 1);
  world.crops.set(tile, createCrop(seed, world.tick));
  return ok(undefined);
}
```

---

## 5. Magic Numbers

Every meaningful number is a named constant in the module that owns it, or in `src/shared/constants.ts` if it is cross-cutting.

```ts
// src/shared/constants.ts
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;   // 50
export const MAX_CATCHUP_TICKS = 5;
export const AUTOSAVE_INTERVAL_TICKS = TICKS_PER_SECOND * 60;
```

Exempt: `0`, `1`, `-1`, and `2` in unambiguously arithmetic contexts.

Balance numbers (growth times, prices, yields) do **not** live in code as constants — they live in content definition data. See `GAME_DESIGN.md`.

---

## 6. Comments

### 6.1 Comment the why, never the what

```ts
// Bad — restates the code
// increment growth by one
crop.growth += 1;

// Good — explains a non-obvious decision
// Growth accrues in ticks rather than wall-clock ms so that offline catch-up
// (SAVE_FORMAT.md §Offline Progress) produces identical results to live play.
crop.growth += 1;
```

### 6.2 Required comments

- **Non-obvious invariants:** "Callers must hold the tile lock" / "Must run after `movementSystem`"
- **Deliberate deviations:** why a lint rule is disabled, why an odd approach was chosen
- **Performance-motivated ugliness:** if code is unidiomatic for speed, say so and cite the measurement
- **ADR references** where code implements a documented decision: `// See ADR-007 (Simulation Tick)`

### 6.3 Forbidden comments

Commented-out code · `TODO` without an issue reference · changelog comments (`// modified by X on Y` — that is git's job) · section-divider ASCII art · redundant JSDoc that restates the signature

### 6.4 JSDoc

Required on exported functions in `src/sim/`, `src/persistence/`, and any plugin-facing API. Optional elsewhere. Document behavior, units, and failure modes — not types, which TypeScript already states.

```ts
/**
 * Advances every crop by one tick.
 *
 * Must run before `harvestSystem` within the same tick so a crop maturing this
 * tick is harvestable this tick. Deterministic: no RNG, no wall-clock reads.
 */
export function growthSystem(world: World): void { /* ... */ }
```

---

## 7. Imports

### 7.1 Ordering

Enforced by `eslint-plugin-import`. Groups separated by a blank line:

1. Node builtins (`node:fs`)
2. External packages (`pixi.js`, `react`)
3. Internal aliases (`@shared/…`, `@sim/…`)
4. Relative (`./…`)
5. Type-only imports last within each group

### 7.2 Path aliases

Deep relative paths (`../../../shared/types`) are banned. Use aliases, configured identically in `tsconfig.json` and the Vite config:

```
@shared/*       → src/shared/*
@sim/*          → src/sim/*
@render/*       → src/renderer/render/*
@ui/*           → src/renderer/app/*
@persistence/*  → src/persistence/*
```

### 7.3 Type-only imports are explicit

`verbatimModuleSyntax` requires it, and it keeps runtime imports honest:

```ts
import type { World } from '@sim/world/world';
import { createWorld } from '@sim/world/world';
```

### 7.4 No import cycles

Enforced in CI. A cycle means the module boundary is wrong; extract the shared piece rather than adding a lazy import to break it.

---

## 8. Architecture Boundaries in Code

The layering below is **mechanically enforced** by `eslint-plugin-boundaries` and verified in CI by `npm run check:boundaries`. A violation fails the build. Rationale: `ARCHITECTURE.md`; the enforcement exists because this is the invariant most likely to erode one convenient import at a time.

```
        main  ──────────────► shared
          │                     ▲
          │ (IPC only)          │
          ▼                     │
       preload ────────────────►│
          │                     │
          ▼                     │
  ┌── renderer ────────────────►│
  │     ├── app (React/UI) ─────┤
  │     └── render (PixiJS) ────┤
  │            │                │
  │            ▼                │
  └────────► sim ──────────────►┘
               ▲
   persistence ┘  (reads/writes sim state; sim never imports persistence)
```

### 8.1 The rules

| Layer | May import | May **never** import |
|---|---|---|
| `src/shared` | nothing internal | everything else |
| `src/sim` | `shared` | `electron`, `pixi.js`, `react`, `node:*`, `main`, `renderer`, `persistence` |
| `src/persistence` | `shared`, `sim` (types + factories) | `pixi.js`, `react`, `renderer` |
| `src/renderer/render` | `shared`, `sim` (read-only), `pixi.js` | `react`, `electron`, `main` |
| `src/renderer/app` | `shared`, `sim` (read-only), `react` | `pixi.js`, `electron`, `main` |
| `src/main` | `shared`, `persistence`, `electron`, `node:*` | `sim` systems, `pixi.js`, `react`, `renderer` |
| `src/preload` | `shared` | everything else |

### 8.2 The two rules that matter most

1. **`src/sim` imports nothing but `shared`.** It is a headless library that happens to be a game. If it can't run under `vitest` with no DOM, the boundary is broken.
2. **React never mutates the world, and never runs on the tick.** UI reads immutable snapshots (`ARCHITECTURE.md` §Data Flow) and dispatches intents. A React component that calls a simulation system directly is a defect, not a shortcut.

---

## 9. React Conventions

- **Function components only.** No classes.
- **One component per file**, named the same as the file.
- **Props types are named `<Component>Props`** and declared immediately above the component.
- **No business logic in components.** Components render props and dispatch intents. Derivation lives in selectors or the sim.
- **No `useEffect` for derived state.** Derive during render or use a selector.
- **Never subscribe a component to the raw world.** Subscribe to a snapshot slice; see `ARCHITECTURE.md` §UI Data Flow. A component re-rendering at 20 Hz is a budget violation (`PERFORMANCE.md`).
- **Keys are stable entity IDs**, never array indices.

---

## 10. PixiJS Conventions

- **Display objects are created and destroyed only by the render layer.** The simulation has no idea Pixi exists.
- **Always `destroy()` explicitly.** Pixi holds GPU resources that GC will not reclaim. Every `addChild` has a matching teardown path. Leaks here are the most likely source of a memory-budget failure.
- **Textures come from the atlas loader**, never constructed inline from a path at runtime. See `ASSETS.md`.
- **Never allocate in the render loop.** No `new Point()` per frame; reuse scratch objects.
- **Layer membership is explicit** and defined in one place (`ARCHITECTURE.md` §Render Layers), not by `addChild` call order scattered across files.
- **Respect render-on-demand.** Any code that starts a continuous animation must also stop it. See ADR-001 §Mitigations.

---

## 11. Formatting

Prettier owns it. Do not argue with it, do not hand-format around it, do not add `prettier-ignore` without a reason comment.

```jsonc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

`endOfLine: "lf"` with `.gitattributes` normalization — this is a Windows-primary project and inconsistent line endings would otherwise produce phantom diffs.

---

## 12. File Size

| Threshold | Meaning |
|---|---|
| ~200 lines | Comfortable |
| 400 lines | Look for a split |
| 800 lines | **Hard limit** — CI warns; split before merging |

Many small, cohesive files over few large ones. Split by responsibility, not by arbitrary line count: if a file is 700 lines and every function serves one clear purpose, leave it and note why.
