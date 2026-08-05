# ADR-018: Developer Tooling and Debug Architecture

**Status:** Accepted
**Date:** 2026-08-01
**Phase:** 07.8 (Developer Tools) — decided before implementation
**Bound by (not re-litigated):** ADR-001 (render-on-demand); ADR-003 §3 (process boundaries; the renderer is untrusted); ADR-005 §2 (snapshot slices are the only sim→view channel); ADR-007 §1 (presentation never enters the simulation); ADR-008 (events have a producer and a consumer); ADR-010 §6 (every mutation is a command, with no privileged write path); ADR-017 §1 (the animation lease).
**Supersedes:** nothing. Formalises rules phase-01.5 followed by convention and never wrote down.

> **Filed as `docs/decisions/`, not `docs/adr/`.** The brief asked for
> `docs/adr/ADR-018-developer-tooling.md`; every ADR in this project from 001
> onward lives in `docs/decisions/`, and `ADR-012` freezes that set by path.
> Creating a second ADR directory would split the record in two, so the
> convention wins and the number and topic are unchanged.

---

## Context

Phase-07.8 will build a real developer toolkit: a world inspector, an entity
inspector, event and command monitors, pathfinding and chunk visualisation, a
performance panel, time controls, spawn tools, recording, and a screenshot mode.

Some of that already exists — an F1 console, an F3 overlay, a metrics registry,
a profiler, an inspector — built in phase-01.5 under rules that were **followed
but never written down**. Phase-07.8 will roughly quadruple the surface, add
tools that _write_ to the world for the first time (spawn, reset, remove), and
add tools that read simulation internals no view has ever seen (open and closed
pathfinding sets, the command queue, event payloads).

That is the moment to write the rules down, because three of them are the kind
that erode silently:

1. **A debug tool that mutates state directly is indistinguishable from a
   feature**, and the first one that does it establishes a second write path
   into the simulation that nothing tests and nothing enforces.
2. **A debug renderer that draws every frame** reintroduces exactly the idle
   cost ADR-001 exists to refuse — and it does it in a build the developer is
   staring at, so it looks like the tool is working.
3. **Debug tooling that becomes an event producer** makes the event graph
   different in development from production, which is the worst possible place
   for a difference: the build used to diagnose bugs stops reproducing them.

This ADR is deliberately written **before** the phase rather than after it, for
the reason ADR-001 gives about the dirty gate: retrofit a constraint and it
decays, because by then every call site assumes it can just do the thing.

---

## Decision

### 1. Debug tools are not gameplay systems

Developer tooling is **diagnostic instrumentation**, not a feature of the game.
It has no design goals, no player, and no place in `GAME_DESIGN.md`. It may not
introduce a mechanic, a resource, a rule, or a piece of content — and a tool
that would be useful to a player is a feature request, not a debug tool.

The practical test: **if removing it changes what the game is, it was never a
debug tool.**

### 2. Debug tools never modify simulation state directly

No tool may write to a store, a grid, a container, a wallet, or an entity. Not
through a reference, not through a helper, not "just for a reset button".

This is the rule most likely to be broken by a well-meaning shortcut, because
the tooling frequently _has_ the reference — the inspector is already holding
the worker it is describing.

### 3. Every gameplay mutation goes through the command dispatcher

Spawn, remove, reset, grant, and anything else that changes the world submits a
**command through the ordinary player source**, is validated like any other, and
may be rejected like any other (ADR-010 §6).

The precedent already exists and is the model: the console's `money` command
submits `grantCoins` through `submitCommand` rather than touching the wallet, and
its comment says why — _"no privileged write path"_. Every phase-07.8 spawn tool
follows it.

Three properties fall out for free, and they are the reason this is a rule
rather than a preference: a debug action is **replayable** (it is in the command
stream), **rejectable** (an illegal spawn fails like an illegal placement), and
**indistinguishable from a player action** to everything downstream — which is
what makes a bug reproduced with debug tools a real reproduction.

### 4. Debug overlays live entirely in presentation

All tooling is renderer-side. `src/devtools` may import `shared` and read
`sim` **types and snapshots**; nothing in `src/sim`, `src/persistence`, or
`src/main` may import `src/devtools`, and the boundary linter enforces it rather
than the reader.

A debug view is a view: it reads projected state and draws. It holds no
authoritative data, so destroying and rebuilding it is lossless — the same
property that lets collapsed mode destroy the whole scene (ADR-003 §4).

### 5. Panels communicate through typed APIs only

A panel obtains data through a **declared, typed accessor** — the metrics
registry, a snapshot slice, or an explicitly-passed reader. Never through a
global, never by reaching into a module's internals, never by a string-keyed
lookup into live state.

This is what makes tooling survive refactors: a panel that read
`world.workers` directly would break on every store change and would tempt the
next author to keep the store shape frozen for the debugger's sake.

### 6. Debug code is removable from production builds

Not disabled — **removed**. No dead branch, no shipped-but-unreachable panel, no
string constants for tools a player can never open.

This is already asserted against a real artifact by
`tests/devtools-excluded-from-production.test.ts`, which builds and greps the
bundle rather than reading the source. Phase-07.8 extends its marker list; it
does not weaken it.

### 7. `FEATURE_DEBUG` is the single compile-time gate

One flag, injected by Vite as a **literal**, so `if (FEATURE_DEBUG)` becomes
`if (false)` and Rollup drops the branch and everything reachable only through
it.

Sub-flags may refine what a debug build contains — `FEATURE_PROFILER`,
`FEATURE_CONSOLE`, `FEATURE_INSPECTOR` exist today — but **every one of them is
`false` whenever `FEATURE_DEBUG` is `false`**, and none may re-enable tooling in
a production build. There is one master switch, and it is compile-time.

A runtime boolean is forbidden. It would ship every byte of the tooling to
players and merely hide it.

> **Implementation note, phase-07.8i.** `FEATURE_DEBUG` is now _declared_ in
> `src/shared/build-flags.ts` and re-exported by `devtools/flags.ts`. The
> decision above is unchanged — one master switch, still a compile-time literal
> injected by Vite, still one declaration. What changed is who may read it:
> `render` may import only `shared`, `sim` and `render`, so a debug tool that
> draws into the SCENE had no literal to fold against and its hook survived
> into the release bundle (557 bytes, measured). The sub-flags stay in
> `devtools/flags.ts`, where only devtools needs them.

### 8. Debug rendering never affects the simulation, and never breaks render-on-demand

Two obligations, and the second is the one that bites:

- Debug drawing reads snapshots and real time. Nothing it computes re-enters the
  simulation, and it may not consume `world.rng` — the rule ADR-017 §5 states
  for decorative randomness applies unchanged to a cost heatmap.
- **A debug overlay that is closed costs nothing, and an open one takes an
  animation lease like anything else that moves** (ADR-017 §1). A panel that
  redraws every frame regardless is the same defect as an effect that never
  releases: a permanent frame cost that looks like normal operation.

Live graphs are the obvious trap here. A 60-second history that repaints at
60 Hz while nothing changes is a debug tool that makes the thing it measures
worse, and its own readings untrustworthy.

### 9. Debug metrics are read-only snapshots

A metric is a **pull**: a function the registry calls to produce a value at the
moment a panel asks. It may not cache into simulation state, may not mutate
anything to compute itself, and may not be a live reference a panel can write
through.

Observation must not perturb the observed. A metric with a side effect makes the
debug build behave differently from the production one, which is the class of
problem tooling exists to remove.

### 10. DevTools may subscribe to events, never produce them

Tooling is an **event consumer only**. An event monitor subscribes; it does not
publish, re-publish, replay, or synthesise.

ADR-008 requires every event to have a real producer and a real consumer.
Tooling can legitimately be that consumer — the composition root already
subscribes to `cropHarvested` for effects. But a debug-produced event would make
the event graph differ between builds, so a bug that depends on event ordering
would stop reproducing in the only build equipped to diagnose it.

**Recording is subscription, not production** (07.8 §12): it observes the stream
and writes JSON. Replaying a recording is out of scope for 07.8; when it
arrives, it replays through the **command dispatcher** under rule 3, never by
re-emitting events.

---

## Alternatives rejected

**A. Let debug tools mutate directly, for convenience.** Rejected: it creates a
second write path into the simulation with no validation, no replay
representation, and no test. The first `reset world` button that clears stores
directly is also the first bug report nobody can reproduce.

**B. A runtime debug flag, so testers can toggle tooling in a release build.**
Rejected: it ships the entire toolkit to players and makes rule 6 unachievable.
The need it serves — diagnosing a player's problem — is better met by a
debug build, which this project can already produce.

**C. Let panels read `World` directly, since they are read-only anyway.**
Rejected: read-only access still couples every panel to the store's internal
shape, and the coupling is invisible until a refactor breaks six panels at once.
Typed accessors cost one indirection.

**D. Give debug rendering an exemption from render-on-demand,** on the grounds
that a developer with a panel open is not a player. Rejected: the panel most
worth having is the performance panel, and exempting it means it measures a
frame loop it is itself keeping alive. The lease discipline is what makes its
numbers mean anything.

**E. Skip the ADR and follow phase-01.5's conventions.** Rejected — this is the
alternative that was actually in play. Those conventions are real and were
followed, but they exist only as comments in files a new tool need not touch,
and 07.8 quadruples the surface while adding the first tools that write.

---

## Consequences

- **Spawn tools are more work than a direct mutation, and that is the point.**
  Each needs a command, validation, and registration — and gets replay,
  rejection, and testability in exchange.
- **Some tools will be impossible to build honestly**, and must then not be
  built. A panel wanting data no snapshot projects has found either a missing
  projection or a bad idea; it may not reach around the boundary to get it.
- **Live graphs must be change-driven**, not frame-driven. This constrains their
  design and is the correct constraint.
- **The production-exclusion test grows with every tool.** Its marker list is
  maintenance, and it is the only thing standing between rule 6 and a slow leak
  of debug strings into release bundles.
- **`src/devtools` gains a boundary rule** in the linter config, so rule 4 fails
  a build rather than a review.
- A debug action appearing in the command stream means **a recording made with
  debug tools contains them** — deliberate, and exactly what makes such a
  recording a faithful reproduction.

---

## Compatibility

- **No save-format impact.** Tooling never reads or writes a save document, and
  no field here reaches `SAVE_FORMAT.md`. A world touched by debug commands
  saves like any other, because the commands were ordinary commands.
- **No simulation impact.** Determinism is unaffected: tooling consumes no RNG,
  produces no events, and mutates nothing. A seed plus a command stream
  reproduces identically whether or not a debug build recorded it.
- **No production-bundle impact**, by rule 6 and 7, asserted against the built
  artifact.
- **Existing tooling already complies.** The console dispatches `grantCoins`
  through the player source, metrics are pull-based accessors, and the overlay
  is renderer-side. This ADR names what phase-01.5 already did; it does not
  require a migration.
- **ADR-017's lease discipline extends unchanged** to debug rendering. No new
  mechanism is introduced for it.

---

## Future extensions

Permitted under these rules, and explicitly out of scope for 07.8:

- **Command-stream replay**, replaying through the dispatcher (rule 3) rather
  than re-emitting events (rule 10). The recording format 07.8 exports is the
  input.
- **A remote/detached devtools window**, communicating over the typed API of
  rule 5 — the reason that rule says "typed APIs" rather than "props".
- **Plugin-contributed panels** in v0.2, which is why rule 4's boundary is
  enforced by the linter rather than trusted: plugin code runs in the renderer
  (ADR-003 §6), and a plugin panel is untrusted by construction.
- **Automated regression capture** — a recording taken on failure and attached
  to a report. Read-only observation, so nothing here blocks it.

Any extension that needs a debug tool to write directly, produce an event, or
survive into a production build is not an extension of this ADR. It is a
successor ADR, and it should have to argue for itself.
