# Phase 01.7 — Entry Boundary

> **Delivers:** The renderer entry is constrained by the boundary linter, and a project-wide alias-resolution hole is closed.
> **Constraint:** Architectural enforcement only. No runtime behavior change, no public API change.

---

## The hole

`src/renderer/main.tsx` matched no boundary element, so the linter permitted it to import anything. Verified by adding `import { app } from 'electron'` and observing that no boundary rule reported.

Entry files are the classic gap in a layered architecture: they sit _above_ every layer, so patterns written for layers do not cover them.

---

## The fix

### 1. The entry gets its own folder

`src/renderer/entry/main.tsx`. Element patterns in `eslint-plugin-boundaries` are **folder** patterns — a bare file glob leaves the file `isUnknown`, which is the same silent-pass failure phase-00 hit three times. Giving the entry a folder makes it matchable.

### 2. Bootstrap gets a composition root

`src/renderer/bootstrap/start.tsx` exports `startApplication()`. All composition moved there from the entry.

### 3. Three rules

| Rule                                                                                | Effect                               |
| ----------------------------------------------------------------------------------- | ------------------------------------ |
| `boundaries/dependencies` — `{ from: 'entry', to: ['bootstrap'] }`                  | Every other layer denied by omission |
| `boundaries/external` — entry disallows `electron`, `pixi.js`, `react`, `react-dom` | No platform or rendering package     |
| `boundaries/entry-point` — bootstrap allows only `start.tsx`                        | **Bootstrap internals unreachable**  |

`boundaries/entry-point` needed two ordered rules (deny `*`, then allow `start.tsx`). Combining both keys in one rule lets the denial win and blocks the composition root too.

---

## The larger finding: aliases bypassed every layer check

While probing the new rules, `@devtools/flags` was **allowed** from the entry while the equivalent relative import `../../devtools/flags` was correctly blocked.

**Cause:** `import/resolver` was configured as `{ typescript: { alwaysTryTypes: true } }` with no `project`. It defaulted to the root `tsconfig.json` — a solution file with `files: []` and **no `paths`**. Aliased imports therefore resolved to `null`, were classified as external packages, and passed the blanket "externals are allowed" policy.

This was not specific to the entry. **Any** aliased import from **any** layer could bypass the boundary check.

It stayed invisible because the relative form of the same import _was_ blocked, so spot checks looked correct.

**Fix:** point the resolver at the four real tsconfigs.

```js
'import/resolver': {
  typescript: {
    alwaysTryTypes: true,
    project: ['tsconfig.renderer.json', 'tsconfig.main.json',
              'tsconfig.sim.json', 'tsconfig.tools.json'],
    noWarnOnMultipleProjects: true,
  },
},
```

No new violations surfaced — the codebase was already compliant. The check simply was not capable of proving it.

### Also: the cycle checker skipped `.tsx` tests

`.dependency-cruiser.cjs` excluded `\.test\.ts$`, which does not match `.test.tsx`. React component tests were analysed as production modules, producing a phantom `ui -> bootstrap` edge that no source file has. Fixed to `\.test\.tsx?$`.

---

## Verification

Every rule is proven by a deliberate violation. A boundary that has never been tested does not exist — all three prior boundary bugs failed _open_.

`tests/boundaries.test.ts` adds 14 cases:

| Probe                                                                    | Expected    |
| ------------------------------------------------------------------------ | ----------- |
| `electron`, `pixi.js`, `react` from entry                                | rejected    |
| `sim`, `ui`, `devtools`, `shared` layers from entry                      | rejected    |
| `@devtools/flags`, `@sim/world/world`, `@shared/constants` **via alias** | rejected    |
| bootstrap internals: `game-loop`, `snapshot-store`, `devtools-mount`     | rejected    |
| `bootstrap/start` — the composition root                                 | **allowed** |

The last is the positive control. Without it, a rule that blocked everything would satisfy every other case while making the application unbuildable.

---

## Dependency graph after

```
  entry       -> bootstrap
  bootstrap   -> devtools, shared, sim, ui
  ui          -> sim
  devtools    -> shared, sim
  main        -> shared
  preload     -> shared
  sim         -> shared
  shared      -> (nothing internal)
```

61 modules, 115 dependencies, 0 violations, 0 cycles. `shared` is a sink; `sim` depends only on `shared`; nothing depends on `devtools` except `bootstrap`.

---

## Behavior unchanged

| Check                              | Result                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Unit + integration                 | 167 passed                                                                        |
| E2E                                | 8 passed                                                                          |
| Production build excludes devtools | Still passing                                                                     |
| Live check                         | Status bar `00:02`, `40 ticks`, F3 overlay opens, `version` reports correct flags |
| Public APIs                        | Unchanged. `startApplication()` is new; nothing was removed or renamed.           |
