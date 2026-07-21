# Phase 01.5 — Developer Infrastructure

> **Delivers:** Long-lived development and debugging tooling. No gameplay.
> **Runnable at completion:** F3 debug overlay, F1 developer console, F4 world inspector, a profiler, a centralized logger, and feature flags — with the entire toolset absent from production builds.

---

## Objectives

1. Build tooling that stays useful for the lifetime of the project.
2. Keep every tool **extensible by registration**, so later phases add to it without editing it.
3. Keep developer infrastructure completely isolated from gameplay, enforced mechanically.
4. Make debug features compile _out_, not merely switch off.

---

## Deliverables

| #   | Deliverable            | Where                                                     |
| --- | ---------------------- | --------------------------------------------------------- |
| 1   | Debug overlay (F3)     | `src/devtools/ui/DebugOverlay.tsx`, `metrics/registry.ts` |
| 2   | Developer console (F1) | `src/devtools/console/`                                   |
| 3   | Runtime profiler       | `src/devtools/profiler/profiler.ts`                       |
| 4   | World inspector (F4)   | `src/devtools/inspector/`, `ui/Inspector.tsx`             |
| 5   | Asset hot reload       | `electron.vite.config.ts` (dev server watch)              |
| 6   | Logging system         | `src/devtools/logger/`                                    |
| 7   | Feature flags          | `src/devtools/flags.ts` + Vite `define`                   |
| 8   | Isolated architecture  | `eslint.config.js` boundary layer                         |

---

## Design Decisions

### Registration over stubs

`1.5.md` permits gameplay commands to return "Not implemented". They are **not registered at all** instead.

`AI_RULES.md` §1.6 bans placeholders, and a stub reporting a capability the build does not have is exactly that. The stated goal — _"the command infrastructure must be complete and extensible"_ — is satisfied by a working registry, proven by the twelve commands that do real work. `spawn`, `teleport`, and `money` register from their owning phase through the same public API, with no change to the console.

The same reasoning governs metrics: an unbuilt metric is absent rather than showing "Unavailable" forever. The overlay therefore only ever displays true information.

**Consequence:** `help` output grows as phases land. That is the intended signal.

### Flags are literals, not runtime values

Flags are injected by Vite `define` as literal booleans. `if (FEATURE_DEBUG)` becomes `if (false)` in a production build and Rollup drops the branch plus every module reachable only through it.

An earlier implementation computed flags from `import.meta.env` through a helper. It typechecked, linted, and behaved correctly — and shipped the entire console, overlay, profiler, and inspector to production, because a function call is not constant-foldable. Caught by inspecting the built artifact, not the source.

### Devtools is a boundary layer

`devtools` is a layer in the boundary linter. It may import `shared` and `sim`; **nothing may import it** except the renderer bootstrap that mounts it. Deliverable 8 is therefore a build failure rather than a convention.

---

## Acceptance Criteria

| #   | Criterion                                                 | Verified by                          |
| --- | --------------------------------------------------------- | ------------------------------------ |
| 1   | F3 toggles the debug overlay                              | E2E + screenshot                     |
| 2   | Hidden overlay schedules no work and calls no provider    | Unit — no interval when hidden       |
| 3   | Metrics render from the registry, not a hardcoded list    | Unit                                 |
| 4   | A broken metric provider cannot break the overlay         | Unit                                 |
| 5   | F1 toggles the developer console                          | E2E + screenshot                     |
| 6   | History (Up/Down), auto-complete (Tab), structured output | Unit ×12                             |
| 7   | Unknown commands suggest a near match                     | Unit + observed output               |
| 8   | A throwing command cannot break the console               | Unit                                 |
| 9   | Profiler records scopes created on first use              | Unit                                 |
| 10  | Profiler memory is bounded over a long run                | Unit — 10k samples                   |
| 11  | Logger honours levels, subsystems, timestamps, sinks      | Unit ×11                             |
| 12  | Log buffer is bounded                                     | Unit — 2000 records                  |
| 13  | Inspector supports a subject kind that does not exist yet | Unit                                 |
| 14  | Missing values report `Unavailable`, never throw          | Unit                                 |
| 15  | **Game systems cannot import devtools**                   | Deliberate violation → rejected      |
| 16  | **Production build contains no devtools code**            | Built-artifact inspection ×6 markers |
| 17  | `console.*` is banned outside the logger sink             | Lint                                 |

---

## Testing Checklist

### Automated

- [x] Console: tokenizing, dispatch, args, unknown commands, suggestions, throwing commands
- [x] Console: history walk, duplicate suppression, cursor reset
- [x] Console: unique completion, common-prefix completion, no argument completion
- [x] Registry: duplicate names, alias collisions, alias resolution, clean unregister
- [x] Logger: level filtering, silence, child subsystems, formatting, sink removal, bounded buffer
- [x] Profiler: durations, `measure` return value, recording on throw, stats, ordering, bounded memory
- [x] Metrics: empty start, sampling, ordering, duplicate rejection, provider isolation
- [x] Inspector: no-match, multi-provider, future subject kinds, throwing provider, ordering
- [x] Production bundle excludes devtools while retaining game UI

### Manual

- [x] F3 overlay renders live FPS / frame time / memory / tick / UPS / state
- [x] F1 console runs `help`, `version`, `time`, `pause`, `tick 40`, `resume`, `profiler`
- [x] Unknown command suggests a near match
- [x] F4 inspector renders and follows the pointer
- [ ] **Asset hot reload observed end to end** — needs a dev-server session with `npm run assets:watch`
- [ ] **File log sink** — deliberately not built; see Out of Scope

---

## Out of Scope

- **Gameplay commands** (`spawn`, `teleport`, `money`) — registered by their owning phases
- **Metrics needing systems that do not exist**: loaded chunks, visible tiles, dirty regions, camera position, mouse tile coordinates (phase-02); active entities (phase-04)
- **Save/load profiling** (phase-07)
- **Optional file logging** — the sink interface exists and the logger is sink-driven, but a file sink needs main-process I/O and an IPC channel. Building it now would mean designing the log-transport contract before there is anything to transport.

---

## Future Dependencies

| Deliverable        | Depended on by                                                       |
| ------------------ | -------------------------------------------------------------------- |
| Metric registry    | phase-02 (camera, chunks, tiles, dirty regions), phase-04 (entities) |
| Command registry   | phase-03 (`spawn`), phase-04 (`teleport`), phase-06 (`money`)        |
| Inspector registry | phase-02 (tile hover), phase-04 (entity click)                       |
| Profiler           | phase-02 (render timings), phase-07 (save/load timings)              |
| Logger             | every phase                                                          |
| Feature flags      | every phase that adds optional tooling                               |

---

## Notes

**Do not add a metric or command that reports "Unavailable" or "Not implemented."** Absence is the design. A tool that lies about what the build can do is worse than one that is visibly incomplete.

**Re-run `tests/devtools-excluded-from-production.test.ts` after any change to the flags, the Vite config, or how devtools is mounted.** It is the only check that inspects the built artifact; everything else passes happily while devtools ships to players.
