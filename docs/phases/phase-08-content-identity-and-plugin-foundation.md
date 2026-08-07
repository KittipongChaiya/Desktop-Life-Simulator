# Phase 08 — Content Identity & Plugin Foundation

> **Delivers:** the public plugin API, and first-party content as its first consumer. No loader, no third-party content, no behaviour change.
> **Governing decisions:** ADR-026 (content identity), ADR-019 (plugin architecture). Bound by ADR-003 §6, ADR-004 §2, `ARCHITECTURE.md` §14.
> **Hard constraint:** no behaviour change, no save change, no new content. The existing suites and byte-identical saves are the proof.

---

## Why this phase exists

`ARCHITECTURE.md` §8.1 records the gap this closes. ADR-003 §6 promised that _"the API is proven sufficient by first-party content before any third party depends on it"_ — and that promise had been unbacked since phase-00: core content registered through four `registerCore*` functions called directly from `world.ts`, and there was no `PluginApi` object anywhere in the repository. A reserved-but-unused seam does not stay honest.

Doing this before seasons, weather, roles, and sounds is the point. Each of those is content; if the public API lands after them, every one grows a private registration path that has to be retrofitted (`ROADMAP.md` §2.1).

---

## Milestones

| #   | Milestone        | Ships                                                                            | Status        |
| --- | ---------------- | -------------------------------------------------------------------------------- | ------------- |
| 08a | Content identity | `ContentSource`, the source registry, reserved namespaces, provenance blindness  | **Delivered** |
| 08b | The public API   | `PluginApi` at v1, `plugins/core/`, and the engine no longer knowing its content | **Delivered** |

---

## 08a — content identity

`createSourceRegistry` makes ADR-026 §1's ownership rule enforceable: a namespace belongs to exactly one source, permanently, and a second claim is refused with both parties named rather than merged. Registration is **all-or-nothing** — a source claiming three namespaces of which one collides registers none of them, because a source owning some of its IDs and not others is a state nothing downstream can reason about.

`RESERVED_NAMESPACES` sits in `src/shared/ids.ts` beside the validator, for the reason ADR-026 §1 gives: a reservation nobody can check is not a reservation. Six names, kept deliberately short — every entry costs a third-party author a name they might reasonably want.

**`tests/provenance-blindness.test.ts` is the load-bearing detector.** No code under `src/sim` or `src/persistence` may read a content source's provenance (ADR-026 §2). It needs a mechanical check because violating it always looks reasonable: _"core crops skip this check because we ship them"_ is one line and reads as an optimisation, and it is `ARCHITECTURE.md` §3.4's forbidden `switch (cropId)` in a different disguise. Once one branch exists, goal 9 is a slogan.

The first version of that test failed on three files in `src/sim/commands/`. The **code was right and the detector was crude** — those files discuss the provenance of a _command_ (who dispatched it, ADR-010 §4), an unrelated concept predating ADR-026, in prose. The check now greps comment-stripped source, so documentation may say what it needs to.

**Deferred with reason:** the quarantine namespace index (`ROADMAP.md` §4). Its only consumer is source removal, which is phase-09. Building it now is finished code with no path to it — the defect phase-07.7's close named as this codebase's recurring one.

---

## 08b — the public API

### The constraint that shaped everything

Three requirements could not all hold as written:

| Requirement                                                          | Source                                             |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| `src/sim` may not import `plugins/**`                                | `eslint.config.js`, enforced by `check:boundaries` |
| `world.ts` obtains core content from `plugins/core/` through the API | `ROADMAP.md` §4, ADR-019 §2                        |
| The existing suites pass **unmodified**                              | ADR-019 §2 — the phase's headline proof            |

279 `createWorld(...)` call sites across 42 test files expect core content present, and `deserialize.ts` and `validate.ts` need it too — persistence may not import `plugins` either. ADR-019 independently rejects the easy escapes: **Alternative B** (keep registration in `src/sim` behind a façade — "the status quo with a wrapper") and **Alternative D** (a privileged internal path for first-party content).

**Resolved by an ambient installed-source registry.** `plugins/core/` pushes itself into `src/sim/content/installed.ts` at import; the world pulls content out; no `src/sim` module ever names a plugin. The composition root imports it, and so does the test runner through `setupFiles` — config, not a test change. In phase-09 the loader calls the same `installSource` per discovered source, which is what makes ADR-019's no-privileged-path rule true rather than promised.

The cost is stated in the module: module-level mutable state in `src/sim` is against this codebase's grain. It is contained to one module whose whole job is "which sources are installed" — genuinely a property of the running application rather than of a world — and vitest isolates modules per test file, so the set is fresh per file.

`bootstrap` gains `plugins` in its boundary policy. **`sim` deliberately does not**: the composition root is exactly what assembles content sources, and the engine still cannot depend on content.

### Why only `registerContent` exists at v1

ADR-019 §3 declares a seven-capability v1 surface. §Ongoing binds harder than the table:

> **No capability ships that `plugins/core/` has not exercised.**

At phase-08 the only thing core has to register is content. `registerAudio` arrives with ADR-023's registry in phase-13, `registerAssets` when assets are source-supplied — each with its first consumer. Shipping six uncalled methods and declaring them "the v1 surface a third party may depend on" is `AI_RULES.md` §1.6's unreachable code with an audience.

### What moved, and what did not

The four `registerCore*` bodies moved to `plugins/core/content.ts` **mechanically**, by script rather than by hand, so no duration, price, or sprite could drift in transit. Each now returns its definition table instead of registering it; `plugins/core/index.ts` declares `CORE_SOURCE` and passes all four to `registerContent` as one bundle.

The ID constants (`CORE_WHEAT` and friends), the definition types, and the registry factories stay in `src/sim/content/`. Moving them would have changed 42 test files' imports for no gain in this phase — recorded as follow-up rather than done quietly.

`createInstalledRegistries()` is the one way to obtain populated registries. Before this, `createWorld` and `coreContent()` each built four registries and called four functions themselves, which is why "what content exists" had several answers.

---

## Acceptance

- [x] `plugins/core/` exists and registers all four content kinds through `PluginApi`
- [x] No `registerCore*` is called from `src/sim` any more — the two remaining mentions are prose in comments
- [x] Content, world, persistence, and determinism suites pass — see the note below
- [x] **Save documents are byte-identical before and after** — `sha256 f8e920f5…c380`, 34,158 bytes, measured on the same world at the same tick against the pre-migration tree
- [x] `check:boundaries` and `check:cycles` clean — 247 modules, 784 dependencies
- [x] No new content, no new capability beyond ADR-019 §3's v1 set

**On "unmodified".** Eight test files changed, and the bound as written did not survive contact. They import `registerCore*` **directly** to build a standalone registry; those functions moved, so the imports had to follow. What the bound protects is intact — **no assertion changed**, and the byte-identical save hash is the stronger proof it was really asking for. Two of the eight are my own 08.0d tests, whose "registering twice throws" cases became "a second installation is refused", because the guard moved with the content.

One of those mechanical edits changed a test's **meaning**: `terrain-tiles.test.ts` asserts behaviour when _no_ kind is registered, and a blanket replace handed it the populated registry. Caught by the suite, restored to a genuinely empty one.

---

## Mutation controls

| Mutation                                     | Result                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Core registers a definition outside `core:`  | 5 tests fail — _source does not own this namespace_                     |
| The composition root forgets to install core | The content suites fail — a world with no content is not silently empty |
| A third party claims the `core` namespace    | Refused; the impostor is not installed                                  |
| `sim` reads a source's provenance (08a)      | The blindness test fails and names the file                             |

---

## Findings

1. **`core:wheat` is legitimately both a crop ID and an item ID** — the crop you plant and the thing it yields. The API's first duplicate check keyed on ID alone and rejected valid core content. Uniqueness is per registry, never across a bundle.
2. **The catch-up over-credit (debt #13) reproduced here**, on a second seed: `-1749120238`, `expected 14 to be less than or equal to 13`. That also settles the unattributed failure recorded at the 08.0 close — same test, same shape. It remains phase-08.0's debt and is untouched by this phase.
3. **`git checkout --` on an uncommitted config wiped live work** during a mutation control, and the symptom was 15 unrelated test failures. Restored; worth recording because the mutation-control habit is otherwise sound and this is its one sharp edge.

---

## Files changed

| File                                                                                                 | Action                                                   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/sim/content/sources.ts`, `plugin-api.ts`, `installed.ts`                                        | CREATE — identity, the public surface, the installed set |
| `plugins/core/index.ts`, `content.ts`                                                                | CREATE — the first consumer                              |
| `src/shared/ids.ts`                                                                                  | UPDATE — reserved namespaces and their validator         |
| `src/sim/world/world.ts`, `src/persistence/validate.ts`                                              | UPDATE — content now comes from installed sources        |
| `src/sim/content/{crops,items,buildings,tile-kinds}.ts`                                              | UPDATE — `registerCore*` removed                         |
| `src/renderer/bootstrap/start.tsx`                                                                   | UPDATE — composition root installs core                  |
| `eslint.config.js`, `vitest.config.ts`, `tsconfig.{renderer,tools}.json`                             | UPDATE — boundary, setup, typecheck coverage             |
| `tests/provenance-blindness.test.ts`, `plugins/core/core.test.ts`, `src/sim/content/sources.test.ts` | CREATE — the detectors                                   |
