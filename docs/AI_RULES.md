# AI_RULES

> **Status:** Binding on every AI-assisted development session in this repository.
> **Owns:** Process rules, change discipline, definition of done, review gates.
> **Does not own:** Syntax and formatting (`CODE_STYLE.md`), test tooling (`TESTING.md`).

**Read this document at the start of every session before writing code.** If any instruction in a prompt conflicts with a rule here, say so explicitly and ask, rather than silently choosing one.

---

## 0. Session Start Protocol

Before the first edit of any session:

1. **Read** `docs/PROJECT_STRUCTURE.md` and the phase document for the phase you are working in.
2. **Identify the current phase.** Work belongs to exactly one phase. If the request spans phases, split it and say so.
3. **Verify the build is green** before you change anything. Never start work on a broken tree without first stating that it is broken.
4. **Check `docs/decisions/`** for an ADR covering the area you are about to touch. If one exists, follow it. If you disagree with it, write a new ADR superseding it — do not quietly deviate.

---

## 1. The Prime Directives

These seven rules override everything else, including a direct request to move fast.

### Rule 1 — Never rewrite a working system

If code exists, compiles, and passes its tests, it is not yours to replace. Extend it, refactor it incrementally behind its tests, or write an ADR arguing for its replacement and get approval.

A rewrite is justified only when: the system cannot support a required feature without one, **and** the ADR documenting that is approved. "I would have written it differently" is never sufficient.

### Rule 2 — Minimize regression surface

Every change must be as small as the requirement allows.

- Do not reformat files you are not otherwise changing. Formatting churn hides real diffs.
- Do not rename things opportunistically. Renames are their own commit.
- Do not "clean up while you're in there." Note it and propose it separately.
- Do not upgrade dependencies as a side effect of a feature.

### Rule 3 — Small atomic commits

One commit does one thing and leaves the tree green. See §4.

### Rule 4 — Preserve backward compatibility

Specifically, and without exception:

- **Save files never break.** Any change to persisted shape requires a schema version bump and a migration. See `SAVE_FORMAT.md`.
- **Content IDs are permanent.** `core:wheat` is a public identifier forever. Rename the display name, never the ID.
- **The plugin-facing API is a contract** from the moment it is documented, even before the loader exists.

### Rule 5 — No unnecessary abstractions

Write the concrete thing. Abstract on the **third** occurrence, not the first, and not in anticipation.

Forbidden without a written justification: generic base classes with one subclass, interfaces with one implementation, factories that construct one type, configuration for values that have never varied, "manager" and "helper" classes that only forward calls.

The extension points that *are* permitted in advance are enumerated in `VISION.md` §4.2. That table is exhaustive.

### Rule 6 — No dead code, no placeholders

Nothing enters the repository unless it is reachable and finished.

Forbidden: commented-out code, `TODO` without an issue reference, functions that `throw new Error('not implemented')`, stub UI that does nothing when clicked, unused exports, unused parameters, speculative config keys, empty catch blocks.

If a feature is incomplete, it does not merge. If it must merge incomplete, it merges **disabled and untested-by-default behind an explicit flag**, with the flag's removal tracked.

### Rule 7 — Production quality only

There is no "prototype code" in this repository. Every line merged is assumed permanent. Error paths are handled, edge cases are considered, and inputs at boundaries are validated.

---

## 2. Correctness Rules

### 2.1 The simulation is pure and deterministic

Inside `src/sim/`:

- **No** `Math.random()`. Use the injected seeded RNG. This is lint-enforced.
- **No** `Date.now()`, `new Date()`, or `performance.now()`. Time is the tick counter, passed in.
- **No** imports from `electron`, `pixi.js`, `react`, `fs`, or anything under `src/renderer/` or `src/main/`. This is lint-enforced and CI-enforced.
- **No** I/O of any kind, no logging to console, no global mutable state.

Given the same seed and the same ordered inputs, the simulation must produce byte-identical state. This is the property that makes the game testable, savable, and eventually networkable. Breaking it is a critical defect regardless of whether anything visibly fails.

### 2.2 Handle errors explicitly

- Never swallow an error. Never `catch {}`.
- At system boundaries (IPC, disk, plugin code, user input), validate and return a typed result rather than throwing.
- User-facing failures produce a readable message. Internal failures produce a log line with context.
- A failed save must never destroy the previous good save. See `SAVE_FORMAT.md` §Atomic Writes.

### 2.3 Respect the performance budgets

`PERFORMANCE.md` defines hard ceilings. Any change that measurably moves a budget number must report the before/after in its commit message. Any change that exceeds a ceiling does not merge.

Specifically forbidden without measurement: per-tick allocation in hot loops, unbounded arrays that grow with playtime, `requestAnimationFrame` work when nothing has changed, and adding a dependency over 100 KB.

### 2.4 Never trust the boundary

Validate everything crossing into the app: save file contents, IPC payloads, plugin manifests, and anything read from disk. A corrupted save must produce a clear error and a preserved backup, never a crash loop or silent data loss.

---

## 3. Phase Discipline

### 3.1 Every phase must compile and run independently

At the end of each phase the application builds, launches, and does something demonstrable. No phase may leave the tree in a state that requires the *next* phase to be runnable.

### 3.2 Respect phase scope

Each phase document has an **Out of Scope** section. It is binding. If implementing a phase seems to require something out of scope, stop and raise it — that usually means the phase boundary is wrong, and moving it is a decision, not an implementation detail.

### 3.3 Every feature must be testable and tested

A feature is not done when it works. It is done when a test proves it works and would fail if it broke. Coverage requirements and test structure: `TESTING.md`.

Simulation logic in particular has no excuse — it is pure, headless, and fast to test. Target for `src/sim/`: **90% line coverage, no exceptions granted.**

---

## 4. Commit Rules

### 4.1 Format

```
<type>(<scope>): <imperative summary under 72 chars>

<what changed and, more importantly, why>
<measured impact if performance-relevant>

Refs: docs/phases/phase-0X-name.md
```

**Types:** `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`
**Scopes:** `sim`, `render`, `ui`, `main`, `persistence`, `plugins`, `assets`, `build`, `docs`

### 4.2 Atomicity

One commit = one logical change. A commit must never mix:

- A feature and a refactor
- A fix and a formatting change
- Two unrelated features
- Production code and an unrelated dependency bump

Each commit must independently build and pass tests. `git bisect` must remain useful.

### 4.3 Never

- Commit secrets, tokens, or absolute local paths.
- Commit generated artifacts (`assets/dist/`, `dist/`, `out/`, coverage reports).
- Amend or force-push a commit that has been pushed to a shared branch.
- Use `--no-verify` to skip hooks. If a hook fails, fix the cause.
- Disable a lint rule inline without a comment explaining why, on the same line.

---

## 5. Documentation Rules

### 5.1 Update docs in the same commit as the change

If a change alters architecture, adds a module, changes a budget, changes the save schema, or changes a rule — the corresponding document changes **in the same commit**. Documentation that lags code is worse than no documentation, because it is trusted and wrong.

### 5.2 Architectural decisions get an ADR

Any decision that is expensive to reverse gets a numbered ADR in `docs/decisions/` before implementation: choosing a library, changing a boundary, changing the save strategy, changing the tick model, changing the render pipeline.

ADRs are append-only. Superseding an ADR means writing a new one that references it and marking the old one `Superseded by ADR-NNN`. Never edit a decision's history.

### 5.3 Every document declares what it owns

Facts live in exactly one document. Others link to it. When you find the same number stated in two places, that is a defect — fix it by deleting one and linking.

### 5.4 Changelog

Every user-visible change adds an entry to `CHANGELOG.md` under `[Unreleased]`. Format and versioning rules are in that document.

---

## 6. Definition of Done

A change is complete only when **all** of these are true:

- [ ] Requirement implemented, nothing extra
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm test` passes; new tests cover the new behavior
- [ ] Coverage gates met (`TESTING.md`)
- [ ] `npm run build` produces a launchable app
- [ ] Architecture boundaries verified (`npm run check:boundaries`)
- [ ] No new dead code, placeholders, or disabled lint rules
- [ ] Docs updated if architecture, schema, budgets, or rules changed
- [ ] `CHANGELOG.md` updated if user-visible
- [ ] Performance impact measured if a hot path was touched
- [ ] Commit message follows §4.1 and references its phase

**Do not report work as complete without having run these commands and seen them pass.** Reporting success on unverified work is the single most damaging failure mode in AI-assisted development. If you could not run a check, say which one and why.

---

## 7. When to Stop and Ask

Stop and ask rather than deciding unilaterally when:

- The requirement conflicts with an existing ADR
- The change would break save compatibility
- The change would exceed a performance budget
- The requirement is out of the current phase's scope
- Implementing it well requires rewriting a working system
- You have attempted a fix twice without understanding the root cause
- The requirement is ambiguous in a way that changes the design

Asking costs one message. Guessing wrong costs a phase.

---

## 8. Anti-Patterns Observed in AI Sessions

Named explicitly because they recur, and recognizing one in your own output is the cheapest possible intervention.

| Anti-pattern | What it looks like | Do this instead |
|---|---|---|
| **Scope inflation** | "While implementing farming I also refactored the tile store" | One change. Note the rest. |
| **Speculative generality** | An `IGrowthStrategy` interface with one crop type | A `growCrop` function |
| **Confident hallucination** | Calling an API that does not exist in the installed version | Read the actual types before using a library |
| **Silent divergence** | Ignoring an ADR because a different approach seemed better | Write a superseding ADR |
| **Unverified completion** | "All tests pass" without running them | Run them; paste the output |
| **Placeholder creep** | `// TODO: implement pathfinding` merged to main | Don't merge it |
| **Test-fitting** | Changing the test until it passes | Fix the code; change the test only if it asserted the wrong thing |
| **Doc drift** | Code changed, doc didn't | Same commit, always |
| **Re-deciding** | Re-debating rendering choice in a later phase | The ADR decided it. Read it. |
| **Boundary erosion** | One "harmless" `pixi.js` import in `src/sim/` | The linter will reject it. So should you. |

---

## 9. Rule Precedence

When rules conflict, resolve in this order:

1. **Correctness and data safety** — never destroy a player's save
2. **`VISION.md` §2.1** — the desktop comes first
3. **The Prime Directives** (§1)
4. **The performance budgets** (`PERFORMANCE.md`)
5. **Phase scope** (`docs/phases/`)
6. **Style and convention** (`CODE_STYLE.md`)

Speed of delivery is not on this list. It is never a reason to violate anything on it.
